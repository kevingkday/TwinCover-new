import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.entities import (
    Client,
    EvidenceArtifact,
    MarketPlacement,
    Submission,
    SubmissionJob,
    User,
)
from app.schemas.schemas import (
    EvidenceArtifactResponse,
    MarketPlacementCreate,
    MarketPlacementResponse,
    MarketPlacementUpdate,
    SubmissionCreate,
    SubmissionJobResponse,
    SubmissionResponse,
    SubmissionUpdate,
)
from app.services.job_queue import job_queue

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/submissions", tags=["Pre-Bind Field-to-Underwriter Copilot"])

VALID_STAGES = {
    "field_capture",
    "drafted",
    "submitted",
    "underwriter_review",
    "quote_received",
    "subjectivities",
    "bound",
}

VALID_SPECIALTIES = {
    "construction",
    "cyber_ai",
    "marine",
    "environmental",
    "general_commercial",
}


def detect_artifact_type(filename: str, content_type: Optional[str] = None) -> str:
    """Determine `artifact_type` ('photo', 'audio', 'pdf', 'spreadsheet', 'text_note') from extension or MIME."""
    ext = os.path.splitext(filename or "")[1].lower()
    ct = (content_type or "").lower()

    if ext in {".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".gif"} or ct.startswith("image/"):
        return "photo"
    if ext in {".webm", ".m4a", ".mp3", ".wav", ".ogg", ".flac", ".aac"} or ct.startswith("audio/"):
        return "audio"
    if ext == ".pdf" or ct == "application/pdf":
        return "pdf"
    if ext in {".xlsx", ".xls", ".csv", ".tsv"} or "spreadsheet" in ct or "csv" in ct:
        return "spreadsheet"
    return "text_note"


def serialize_submission(sub: Submission, db: Session) -> Dict[str, Any]:
    """Serialize a Submission ORM model with full artifacts, placements, and latest job."""
    client_obj = db.query(Client).filter(Client.id == sub.client_id).first()
    artifacts = (
        db.query(EvidenceArtifact)
        .filter(EvidenceArtifact.submission_id == sub.id)
        .order_by(EvidenceArtifact.id.asc())
        .all()
    )
    placements = (
        db.query(MarketPlacement)
        .filter(MarketPlacement.submission_id == sub.id)
        .order_by(MarketPlacement.updated_at.desc())
        .all()
    )
    latest_job = (
        db.query(SubmissionJob)
        .filter(SubmissionJob.submission_id == sub.id)
        .order_by(SubmissionJob.created_at.desc())
        .first()
    )

    serialized_artifacts = []
    for art in artifacts:
        serialized_artifacts.append({
            "id": art.id,
            "artifact_key": f"art_{art.id}",
            "submission_id": art.submission_id,
            "client_id": art.client_id,
            "broker_id": art.broker_id,
            "artifact_type": art.artifact_type,
            "file_path": art.file_path,
            "raw_text_or_transcript": art.raw_text_or_transcript,
            "captured_at": art.captured_at,
            "metadata_json": art.metadata_json,
        })

    return {
        "id": sub.id,
        "client_id": sub.client_id,
        "broker_id": sub.broker_id,
        "client_name": client_obj.name if client_obj else "Commercial Account",
        "title": sub.title,
        "specialty_line": sub.specialty_line,
        "status": sub.status,
        "structured_risk_profile": sub.structured_risk_profile,
        "underwriter_narrative": sub.underwriter_narrative,
        "missing_info_checklist": sub.missing_info_checklist,
        "client_followup_draft": sub.client_followup_draft,
        "verified_at": sub.verified_at,
        "verified_by": sub.verified_by,
        "created_at": sub.created_at,
        "updated_at": sub.updated_at,
        "artifact_count": len(artifacts),
        "placement_count": len(placements),
        "evidence_artifacts": serialized_artifacts,
        "market_placements": placements,
        "latest_job": latest_job,
    }


@router.get("/", response_model=List[SubmissionResponse])
def list_submissions(
    client_id: Optional[int] = Query(None),
    specialty_line: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List pre-bind submissions for the authenticated broker."""
    query = db.query(Submission).filter(Submission.broker_id == current_user.id)
    if client_id is not None:
        query = query.filter(Submission.client_id == client_id)
    if specialty_line:
        query = query.filter(Submission.specialty_line == specialty_line)
    if status_filter:
        query = query.filter(Submission.status == status_filter)

    subs = query.order_by(Submission.updated_at.desc()).all()
    return [serialize_submission(s, db) for s in subs]


@router.post("/", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_submission(
    payload: SubmissionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new pre-bind commercial submission deal."""
    client_obj = (
        db.query(Client)
        .filter(Client.id == payload.client_id, Client.user_id == current_user.id)
        .first()
    )
    if not client_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client account not found for this broker."
        )

    spec_line = payload.specialty_line if payload.specialty_line in VALID_SPECIALTIES else "general_commercial"
    sub_status = payload.status if payload.status in VALID_STAGES else "field_capture"

    sub = Submission(
        client_id=client_obj.id,
        broker_id=current_user.id,
        title=payload.title.strip(),
        specialty_line=spec_line,
        status=sub_status,
        structured_risk_profile="[]",
        missing_info_checklist="[]",
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    # If an initial field note was provided at creation, store it immutably in the Evidence Vault
    if payload.initial_note and payload.initial_note.strip():
        vault_dir = os.path.join(settings.EVIDENCE_VAULT_DIR, f"sub_{sub.id}")
        os.makedirs(vault_dir, exist_ok=True)
        note_bytes = payload.initial_note.strip().encode("utf-8")
        sha256_hex = hashlib.sha256(note_bytes).hexdigest()
        immutable_path = os.path.join(vault_dir, f"immutable_{uuid.uuid4().hex[:8]}_initial_field_note.txt")
        with open(immutable_path, "wb") as f:
            f.write(note_bytes)

        meta = {
            "original_filename": "initial_field_note.txt",
            "file_size": len(note_bytes),
            "sha256_hash": sha256_hex,
            "is_immutable": True,
            "raw_note_text": payload.initial_note.strip(),
        }
        art = EvidenceArtifact(
            submission_id=sub.id,
            client_id=client_obj.id,
            broker_id=current_user.id,
            artifact_type="text_note",
            file_path=immutable_path,
            metadata_json=json.dumps(meta),
        )
        db.add(art)
        db.commit()
        db.refresh(art)

        job = job_queue.create_job(
            db=db,
            submission_id=sub.id,
            client_id=client_obj.id,
            broker_id=current_user.id,
            job_type="capture_ingestion",
            artifact_ids=[art.id],
        )
        session_factory = sessionmaker(autocommit=False, autoflush=False, bind=db.get_bind())
        background_tasks.add_task(job_queue.execute_job, job.id, session_factory)

    return serialize_submission(sub, db)


@router.get("/{submission_id}", response_model=SubmissionResponse)
def get_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get full details of a pre-bind submission including source-cited fields and immutable evidence artifacts."""
    sub = (
        db.query(Submission)
        .filter(Submission.id == submission_id, Submission.broker_id == current_user.id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    return serialize_submission(sub, db)


@router.put("/{submission_id}", response_model=SubmissionResponse)
def update_submission(
    submission_id: int,
    payload: SubmissionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update submission status, verified source-cited fields, underwriter narrative, checklist, or producer sign-off."""
    sub = (
        db.query(Submission)
        .filter(Submission.id == submission_id, Submission.broker_id == current_user.id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")

    if payload.title is not None:
        sub.title = payload.title.strip()
    if payload.specialty_line is not None and payload.specialty_line in VALID_SPECIALTIES:
        sub.specialty_line = payload.specialty_line
    if payload.status is not None and payload.status in VALID_STAGES:
        sub.status = payload.status
    if payload.structured_risk_profile is not None:
        sub.structured_risk_profile = json.dumps(
            [f.model_dump() for f in payload.structured_risk_profile]
        )
    if payload.underwriter_narrative is not None:
        sub.underwriter_narrative = payload.underwriter_narrative
    if payload.missing_info_checklist is not None:
        sub.missing_info_checklist = json.dumps(
            [c.model_dump() for c in payload.missing_info_checklist]
        )
    if payload.client_followup_draft is not None:
        sub.client_followup_draft = payload.client_followup_draft

    if payload.verified is True:
        sub.verified_at = datetime.now(timezone.utc)
        sub.verified_by = current_user.id
        if sub.status == "field_capture":
            sub.status = "drafted"
    elif payload.verified is False:
        sub.verified_at = None
        sub.verified_by = None

    db.commit()
    db.refresh(sub)
    return serialize_submission(sub, db)


@router.post(
    "/{submission_id}/capture",
    response_model=SubmissionJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def capture_field_evidence(
    submission_id: int,
    background_tasks: BackgroundTasks,
    files: Optional[List[UploadFile]] = File(None),
    text_note: Optional[str] = Form(None),
    note_title: Optional[str] = Form(None),
    run_sync: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Ingest multi-photo site captures, voice memos (.webm, .m4a, .mp3, .wav), PDFs, spreadsheets,
    and/or quick-paste producer notes into the Immutable E&O Raw Evidence Vault (`evidence_artifacts`),
    then enqueue an asynchronous background extraction job returning an instant `"Processing Capture"` receipt.
    """
    sub = (
        db.query(Submission)
        .filter(Submission.id == submission_id, Submission.broker_id == current_user.id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")

    vault_dir = os.path.join(settings.EVIDENCE_VAULT_DIR, f"sub_{sub.id}")
    os.makedirs(vault_dir, exist_ok=True)

    created_artifact_ids: List[int] = []

    # 1. Persist uploaded binary files immutably to disk with SHA-256 E&O verification hash
    if files:
        for upload in files:
            if not upload.filename:
                continue
            raw_bytes = await upload.read()
            if not raw_bytes:
                continue
            sha256_hex = hashlib.sha256(raw_bytes).hexdigest()
            art_type = detect_artifact_type(upload.filename, upload.content_type)
            safe_filename = os.path.basename(upload.filename).replace(" ", "_")
            unique_prefix = f"immutable_{uuid.uuid4().hex[:10]}_{safe_filename}"
            immutable_path = os.path.join(vault_dir, unique_prefix)

            # Write once to Immutable Evidence Vault (never overwritten)
            with open(immutable_path, "wb") as f:
                f.write(raw_bytes)

            meta = {
                "original_filename": upload.filename,
                "content_type": upload.content_type or "application/octet-stream",
                "file_size": len(raw_bytes),
                "sha256_hash": sha256_hex,
                "is_immutable": True,
                "captured_by_user_id": current_user.id,
            }
            art = EvidenceArtifact(
                submission_id=sub.id,
                client_id=sub.client_id,
                broker_id=current_user.id,
                artifact_type=art_type,
                file_path=immutable_path,
                metadata_json=json.dumps(meta),
            )
            db.add(art)
            db.commit()
            db.refresh(art)
            created_artifact_ids.append(art.id)

    # 2. Persist quick-paste text note immutably if provided
    if text_note and text_note.strip():
        note_bytes = text_note.strip().encode("utf-8")
        sha256_hex = hashlib.sha256(note_bytes).hexdigest()
        display_title = (note_title or "producer_field_note.txt").strip()
        if not display_title.endswith(".txt"):
            display_title = f"{display_title}.txt"
        safe_title = os.path.basename(display_title).replace(" ", "_")
        immutable_path = os.path.join(vault_dir, f"immutable_{uuid.uuid4().hex[:10]}_{safe_title}")

        with open(immutable_path, "wb") as f:
            f.write(note_bytes)

        meta = {
            "original_filename": display_title,
            "content_type": "text/plain",
            "file_size": len(note_bytes),
            "sha256_hash": sha256_hex,
            "is_immutable": True,
            "raw_note_text": text_note.strip(),
            "captured_by_user_id": current_user.id,
        }
        art = EvidenceArtifact(
            submission_id=sub.id,
            client_id=sub.client_id,
            broker_id=current_user.id,
            artifact_type="text_note",
            file_path=immutable_path,
            metadata_json=json.dumps(meta),
        )
        db.add(art)
        db.commit()
        db.refresh(art)
        created_artifact_ids.append(art.id)

    if not created_artifact_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide at least one file (photo, audio, PDF, spreadsheet) or a field text note."
        )

    # 3. Enqueue async background job and return instant "Processing Capture" receipt
    job = job_queue.create_job(
        db=db,
        submission_id=sub.id,
        client_id=sub.client_id,
        broker_id=current_user.id,
        job_type="capture_ingestion",
        artifact_ids=created_artifact_ids,
    )

    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=db.get_bind())
    if run_sync:
        await job_queue.execute_job(job.id, session_factory=session_factory)
        db.refresh(job)
    else:
        background_tasks.add_task(job_queue.execute_job, job.id, session_factory)

    return job


@router.post(
    "/{submission_id}/extract",
    response_model=SubmissionJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_submission_extraction(
    submission_id: int,
    background_tasks: BackgroundTasks,
    run_sync: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Re-run the Source-Cited Multimodal Extraction Engine across all `evidence_artifacts` on a submission.
    """
    sub = (
        db.query(Submission)
        .filter(Submission.id == submission_id, Submission.broker_id == current_user.id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")

    artifacts = db.query(EvidenceArtifact).filter(EvidenceArtifact.submission_id == sub.id).all()
    job = job_queue.create_job(
        db=db,
        submission_id=sub.id,
        client_id=sub.client_id,
        broker_id=current_user.id,
        job_type="multimodal_extraction",
        artifact_ids=[a.id for a in artifacts],
    )

    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=db.get_bind())
    if run_sync:
        await job_queue.execute_job(job.id, session_factory=session_factory)
        db.refresh(job)
    else:
        background_tasks.add_task(job_queue.execute_job, job.id, session_factory)

    return job


@router.get("/artifacts/{artifact_id}/download")
def download_evidence_artifact(
    artifact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download or view an original raw file from the Immutable E&O Raw Evidence Vault."""
    art = (
        db.query(EvidenceArtifact)
        .filter(EvidenceArtifact.id == artifact_id, EvidenceArtifact.broker_id == current_user.id)
        .first()
    )
    if not art or not os.path.exists(art.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Raw evidence file not found.")

    meta = {}
    if art.metadata_json:
        try:
            meta = json.loads(art.metadata_json)
        except Exception:
            meta = {}
    orig_name = meta.get("original_filename") or os.path.basename(art.file_path)
    return FileResponse(path=art.file_path, filename=orig_name)


# ==============================================================================
# Market Placements Endpoints (`market_placements`)
# ==============================================================================

@router.post(
    "/{submission_id}/placements",
    response_model=MarketPlacementResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_market_placement(
    submission_id: int,
    payload: MarketPlacementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a target insurer/MGA to the submission's Carrier Placement Matrix."""
    sub = (
        db.query(Submission)
        .filter(Submission.id == submission_id, Submission.broker_id == current_user.id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")

    placement = MarketPlacement(
        submission_id=sub.id,
        client_id=sub.client_id,
        broker_id=current_user.id,
        carrier_name=payload.carrier_name.strip(),
        target_line=payload.target_line.strip(),
        status=payload.status or "drafted",
        quoted_premium=payload.quoted_premium,
        quote_summary_json=json.dumps(payload.quote_summary_json or {}),
        notes=payload.notes,
    )
    db.add(placement)
    db.commit()
    db.refresh(placement)
    return placement


@router.put(
    "/{submission_id}/placements/{placement_id}",
    response_model=MarketPlacementResponse,
)
def update_market_placement(
    submission_id: int,
    placement_id: int,
    payload: MarketPlacementUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update carrier placement status, quoted premium, or quote summary."""
    placement = (
        db.query(MarketPlacement)
        .filter(
            MarketPlacement.id == placement_id,
            MarketPlacement.submission_id == submission_id,
            MarketPlacement.broker_id == current_user.id,
        )
        .first()
    )
    if not placement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Market placement not found.")

    if payload.carrier_name is not None:
        placement.carrier_name = payload.carrier_name.strip()
    if payload.target_line is not None:
        placement.target_line = payload.target_line.strip()
    if payload.status is not None:
        placement.status = payload.status
    if payload.quoted_premium is not None:
        placement.quoted_premium = payload.quoted_premium
    if payload.quote_summary_json is not None:
        placement.quote_summary_json = json.dumps(payload.quote_summary_json)
    if payload.notes is not None:
        placement.notes = payload.notes

    db.commit()
    db.refresh(placement)
    return placement


@router.delete(
    "/{submission_id}/placements/{placement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_market_placement(
    submission_id: int,
    placement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a carrier row from the placement matrix."""
    placement = (
        db.query(MarketPlacement)
        .filter(
            MarketPlacement.id == placement_id,
            MarketPlacement.submission_id == submission_id,
            MarketPlacement.broker_id == current_user.id,
        )
        .first()
    )
    if not placement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Market placement not found.")
    db.delete(placement)
    db.commit()
    return None
