import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session, sessionmaker

from app.core.database import SessionLocal
from app.models.entities import Submission, EvidenceArtifact, SubmissionJob, Client, MarketPlacement
from app.services.multimodal_extractor import multimodal_extractor
from app.services.quote_diff_engine import quote_diff_engine

logger = logging.getLogger(__name__)


class SubmissionJobQueue:
    """
    SQLite-backed Asynchronous Background Job Queue (`submission_jobs`).
    Replaces synchronous 120-second blocking HTTP calls during multi-photo + voice + PDF
    ingestion with an instant `"Processing Capture"` receipt and live polling via `GET /api/jobs/{job_id}`.
    """

    def create_job(
        self,
        db: Session,
        submission_id: int,
        client_id: int,
        broker_id: int,
        job_type: str = "capture_ingestion",
        artifact_ids: Optional[List[int]] = None,
        extra_payload: Optional[Dict[str, Any]] = None,
    ) -> SubmissionJob:
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        payload = {
            "artifact_ids": artifact_ids or [],
            "queued_at": datetime.now(timezone.utc).isoformat()
        }
        if extra_payload:
            payload.update(extra_payload)
        job = SubmissionJob(
            id=job_id,
            submission_id=submission_id,
            client_id=client_id,
            broker_id=broker_id,
            job_type=job_type,
            status="queued",
            progress=5,
            current_step="Processing Capture",
            payload_json=json.dumps(payload),
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        return job

    async def execute_job(
        self,
        job_id: str,
        session_factory: Optional[sessionmaker] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Execute a queued `SubmissionJob`:
        1. Process any unextracted `EvidenceArtifact` rows (voice transcription via faster-whisper,
           photo vision via qwen2.5vl:7b, PDF parsing via local sovereign engine).
        2. Run `multimodal_extractor.synthesize_submission` across all submission artifacts to build
           the source-cited `structured_risk_profile`, `underwriter_narrative`, `missing_info_checklist`,
           and `client_followup_draft`.
        3. Update job status & progress in `submission_jobs`.
        """
        factory = session_factory or SessionLocal
        db: Session = factory()
        try:
            job = db.query(SubmissionJob).filter(SubmissionJob.id == job_id).first()
            if not job:
                logger.warning(f"SubmissionJob {job_id} not found.")
                return None

            job.status = "processing"
            job.progress = 15
            job.current_step = "Inspecting Immutable Evidence Vault artifacts..."
            db.commit()

            submission = db.query(Submission).filter(Submission.id == job.submission_id).first()
            if not submission:
                job.status = "failed"
                job.error_message = f"Submission {job.submission_id} not found"
                job.current_step = "Failed"
                db.commit()
                return None

            client_obj = db.query(Client).filter(Client.id == submission.client_id).first()
            client_name = client_obj.name if client_obj else "Commercial Client"
            client_contact = (client_obj.primary_contact if client_obj and client_obj.primary_contact else "Management")

            # Branch: Inbound Carrier Quote PDF Ingestion
            if job.job_type == "quote_ingestion":
                payload = json.loads(job.payload_json or "{}")
                placement_id = payload.get("placement_id")
                art_ids = payload.get("artifact_ids") or []
                artifact = (
                    db.query(EvidenceArtifact).filter(EvidenceArtifact.id == art_ids[0]).first()
                    if art_ids
                    else None
                )
                placement = (
                    db.query(MarketPlacement).filter(MarketPlacement.id == placement_id).first()
                    if placement_id
                    else None
                )
                if not artifact or not placement:
                    job.status = "failed"
                    job.error_message = "Quote artifact or MarketPlacement not found."
                    job.current_step = "Failed"
                    db.commit()
                    return None

                meta = json.loads(artifact.metadata_json or "{}")
                orig_name = meta.get("original_filename") or os.path.basename(artifact.file_path)
                job.current_step = f"Extracting quote terms & silent exclusions from {orig_name} (qwen2.5vl:7b)..."
                job.progress = 55
                db.commit()

                with open(artifact.file_path, "rb") as f:
                    pdf_bytes = f.read()

                quote_summary = await quote_diff_engine.extract_quote_from_pdf(
                    pdf_bytes=pdf_bytes,
                    filename=orig_name,
                    specialty_line=submission.specialty_line,
                    carrier_hint=placement.carrier_name,
                )
                artifact.raw_text_or_transcript = json.dumps(quote_summary)

                placement.status = "quote_received"
                if quote_summary.get("quoted_premium") and quote_summary["quoted_premium"] != "Pending":
                    placement.quoted_premium = quote_summary["quoted_premium"]
                placement.quote_summary_json = json.dumps(quote_summary)
                if quote_summary.get("notes"):
                    placement.notes = quote_summary["notes"]

                if submission.status in ("field_capture", "drafted", "submitted", "underwriter_review"):
                    submission.status = "quote_received"

                result_summary = {
                    "submission_id": submission.id,
                    "placement_id": placement.id,
                    "carrier_name": placement.carrier_name,
                    "quoted_premium": placement.quoted_premium,
                    "exclusions_found": len(quote_summary.get("exclusions_and_endorsements") or []),
                    "subjectivities_found": len(quote_summary.get("binding_subjectivities") or []),
                }
                job.status = "completed"
                job.progress = 100
                job.current_step = "Completed"
                job.result_json = json.dumps(result_summary)
                job.completed_at = datetime.now(timezone.utc)
                db.commit()
                return result_summary

            artifacts = (
                db.query(EvidenceArtifact)
                .filter(EvidenceArtifact.submission_id == submission.id)
                .order_by(EvidenceArtifact.id.asc())
                .all()
            )

            total_arts = len(artifacts)
            for idx, art in enumerate(artifacts):
                # Check if artifact already has extracted segments/transcript
                already_processed = False
                if art.raw_text_or_transcript:
                    try:
                        parsed_raw = json.loads(art.raw_text_or_transcript)
                        if isinstance(parsed_raw, dict) and (parsed_raw.get("segments") or parsed_raw.get("text")):
                            already_processed = True
                    except Exception:
                        pass

                meta = {}
                if art.metadata_json:
                    try:
                        meta = json.loads(art.metadata_json)
                    except Exception:
                        meta = {}
                orig_name = meta.get("original_filename") or os.path.basename(art.file_path or f"artifact_{art.id}")

                if not already_processed:
                    step_label = (
                        f"Transcribing audio {orig_name} (faster-whisper)..."
                        if art.artifact_type == "audio"
                        else f"Analyzing site photo {orig_name} (qwen2.5vl:7b)..."
                        if art.artifact_type == "photo"
                        else f"Extracting document {orig_name}..."
                    )
                    job.current_step = step_label
                    job.progress = min(60, 20 + int(((idx + 1) / max(1, total_arts)) * 40))
                    db.commit()

                    extracted_raw = await multimodal_extractor.process_single_artifact(
                        artifact_type=art.artifact_type,
                        file_path=art.file_path,
                        original_filename=orig_name,
                        specialty_line=submission.specialty_line,
                        raw_note_text=meta.get("raw_note_text")
                    )
                    art.raw_text_or_transcript = json.dumps(extracted_raw)
                    db.commit()

            # Step 2: Synthesize source-cited risk profile, narrative, checklist, and follow-up
            job.current_step = "Synthesizing source-cited risk profile & underwriter narrative (qwen2.5vl:7b)..."
            job.progress = 75
            db.commit()

            synthesis = await multimodal_extractor.synthesize_submission(
                submission=submission,
                artifacts=artifacts,
                client_name=client_name,
                client_contact=client_contact
            )

            submission.structured_risk_profile = json.dumps(synthesis["structured_risk_profile"])
            submission.underwriter_narrative = synthesis["underwriter_narrative"]
            submission.missing_info_checklist = json.dumps(synthesis["missing_info_checklist"])
            submission.client_followup_draft = synthesis["client_followup_draft"]
            if submission.status == "field_capture" and len(synthesis["structured_risk_profile"]) > 0:
                submission.status = "drafted"

            result_summary = {
                "submission_id": submission.id,
                "artifacts_processed": total_arts,
                "fields_extracted": len(synthesis["structured_risk_profile"]),
                "citations_linked": sum(len(f.get("citations", [])) for f in synthesis["structured_risk_profile"]),
                "unresolved_checklist_items": sum(1 for c in synthesis["missing_info_checklist"] if not c.get("resolved")),
                "submission_status": submission.status,
            }

            job.status = "completed"
            job.progress = 100
            job.current_step = "Completed"
            job.result_json = json.dumps(result_summary)
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
            return result_summary

        except Exception as exc:
            logger.error(f"Background job {job_id} failed: {exc}", exc_info=True)
            try:
                job = db.query(SubmissionJob).filter(SubmissionJob.id == job_id).first()
                if job:
                    job.status = "failed"
                    job.current_step = "Failed"
                    job.error_message = str(exc)
                    db.commit()
            except Exception:
                pass
            return None
        finally:
            db.close()

    def schedule_background_job(
        self,
        job_id: str,
        session_factory: Optional[sessionmaker] = None
    ) -> None:
        """Schedule async execution on the running event loop without blocking the HTTP response."""
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.execute_job(job_id, session_factory=session_factory))
        except RuntimeError:
            asyncio.run(self.execute_job(job_id, session_factory=session_factory))


job_queue = SubmissionJobQueue()
