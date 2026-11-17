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
from fastapi.responses import FileResponse, Response
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
from app.services.export_service import export_service
from app.services.job_queue import job_queue
from app.services.quote_diff_engine import quote_diff_engine

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


@router.post("/quick-walkin", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
async def quick_walkin_capture(
    payload: Dict[str, Any],
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    1-Tap Mobile Quick Walk-In Endpoint:
    Creates (or reuses) a Commercial Client account + Pre-Bind Submission in a single call
    so a producer walking into a prospect (e.g. Pazyryk Rugs) on their phone can start
    snapping photos and recording voice memos immediately without tab-hopping.
    """
    business_name = str(payload.get("business_name") or "").strip()
    if not business_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Business name is required."
        )

    website_url = str(payload.get("website_url") or "").strip()
    contact_name = str(payload.get("contact_name") or "").strip() or None
    spec_line = str(payload.get("specialty_line") or "general_commercial").strip()
    if spec_line not in VALID_SPECIALTIES:
        spec_line = "general_commercial"
    initial_note = str(payload.get("initial_note") or "").strip()

    # Reuse existing client if exact name exists for this broker, otherwise auto-create
    client_obj = (
        db.query(Client)
        .filter(Client.user_id == current_user.id, Client.name.ilike(business_name))
        .first()
    )
    if not client_obj:
        acct_prefix = "".join(c for c in business_name.upper() if c.isalnum())[:3] or "COM"
        acct_num = f"{acct_prefix}-{uuid.uuid4().hex[:5].upper()}"
        notes_text = "Mobile Quick Walk-In capture."
        if website_url:
            notes_text += f" Website: {website_url}"
        client_obj = Client(
            user_id=current_user.id,
            name=business_name,
            account_number=acct_num,
            primary_contact=contact_name,
            notes=notes_text,
            status="active",
        )
        db.add(client_obj)
        db.commit()
        db.refresh(client_obj)

    sub_title = str(payload.get("title") or f"{business_name} — Commercial P&C Walk-In Quote").strip()
    sub = Submission(
        client_id=client_obj.id,
        broker_id=current_user.id,
        title=sub_title,
        specialty_line=spec_line,
        status="field_capture",
        structured_risk_profile="[]",
        missing_info_checklist="[]",
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    # Pre-populate the specialty-line checklist right away so the phone screen shows all 7 COPE items immediately
    from app.services.multimodal_extractor import SPECIALTY_LINE_TEMPLATES
    spec_tmpl = SPECIALTY_LINE_TEMPLATES.get(spec_line, SPECIALTY_LINE_TEMPLATES["general_commercial"])
    initial_checklist = [
        {
            "id": item["id"],
            "item": item["item"],
            "severity": item["severity"],
            "specialty_line": spec_line,
            "resolved": False,
            "status": "missing",
            "evidence_summary": None,
            "photo_prompt": item.get("photo_prompt"),
            "reason": item["reason"],
        }
        for item in spec_tmpl["checklist"]
    ]
    sub.missing_info_checklist = json.dumps(initial_checklist)
    db.commit()
    db.refresh(sub)

    combined_note = "\n".join(
        part for part in [
            f"Prospect Website: {website_url}" if website_url else "",
            f"Primary Contact: {contact_name}" if contact_name else "",
            initial_note,
        ] if part
    ).strip()

    if combined_note:
        vault_dir = os.path.join(settings.EVIDENCE_VAULT_DIR, f"sub_{sub.id}")
        os.makedirs(vault_dir, exist_ok=True)
        note_bytes = combined_note.encode("utf-8")
        immutable_path = os.path.join(vault_dir, f"immutable_{uuid.uuid4().hex[:8]}_walkin_context.txt")
        with open(immutable_path, "wb") as f:
            f.write(note_bytes)
        meta = {
            "original_filename": "walkin_context.txt",
            "file_size": len(note_bytes),
            "sha256_hash": hashlib.sha256(note_bytes).hexdigest(),
            "is_immutable": True,
            "raw_note_text": combined_note,
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


# ==============================================================================
# Phase 2: Outbound Carrier Submission Packet, Cover Email & Quote Diffing
# ==============================================================================

@router.get("/{submission_id}/export")
def export_submission_packet(
    submission_id: int,
    format: str = Query("pdf", pattern="^(docx|pdf)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a Triage-AI & Human Underwriter Submission Packet (.docx or .pdf).
    Enforces E&O Sign-Off Gate: blocks export (403 Forbidden) unless `submission.verified_at` is set.
    """
    sub = (
        db.query(Submission)
        .filter(Submission.id == submission_id, Submission.broker_id == current_user.id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")

    if sub.verified_at is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="E&O Sign-Off Gate: Producer verification (verified_at) is required before exporting an outbound Carrier Submission Packet."
        )

    client_obj = db.query(Client).filter(Client.id == sub.client_id).first()
    artifacts = (
        db.query(EvidenceArtifact)
        .filter(EvidenceArtifact.submission_id == sub.id)
        .order_by(EvidenceArtifact.id.asc())
        .all()
    )

    file_bytes = export_service.export_submission_packet(
        submission=sub,
        client_obj=client_obj,
        broker_user=current_user,
        artifacts=artifacts,
        fmt=format,
    )

    safe_title = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in sub.title)[:50]
    if format.lower() == "docx":
        return Response(
            content=file_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}_Submission_Packet.docx"'}
        )
    return Response(
        content=file_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}_Submission_Packet.pdf"'}
    )


@router.post("/{submission_id}/cover-email")
def generate_underwriter_cover_email(
    submission_id: int,
    payload: Optional[Dict[str, Any]] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Draft a carrier-specific submission cover email tailored to a selected row in `market_placements`.
    """
    sub = (
        db.query(Submission)
        .filter(Submission.id == submission_id, Submission.broker_id == current_user.id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")

    client_obj = db.query(Client).filter(Client.id == sub.client_id).first()
    client_name = client_obj.name if client_obj else "Commercial Insured"

    placement_id = (payload or {}).get("placement_id")
    placement = None
    if placement_id:
        placement = (
            db.query(MarketPlacement)
            .filter(MarketPlacement.id == placement_id, MarketPlacement.submission_id == sub.id)
            .first()
        )
    carrier_name = placement.carrier_name if placement else ((payload or {}).get("carrier_name") or "Underwriting Team")
    target_line = placement.target_line if placement else str(sub.specialty_line).replace("_", " ").title()

    risk_profile = []
    if sub.structured_risk_profile:
        try:
            risk_profile = json.loads(sub.structured_risk_profile)
        except Exception:
            risk_profile = []

    highlights = "\n".join(
        [f"• {f.get('label')}: {f.get('value')}" for f in risk_profile[:4]]
    ) or "• Full verified risk schedule attached in the formal Submission Packet."

    agency = current_user.agency_name or "Ocean Falls Insurance Services"
    broker = current_user.full_name or "Commercial Producer"

    subject = f"New Commercial Submission: {client_name} — {target_line} ({sub.title})"
    body = (
        f"Hello {carrier_name} Underwriting Team,\n\n"
        f"Please find attached our verified commercial underwriting submission packet for {client_name} "
        f"seeking {target_line} terms.\n\n"
        f"Key Verified Risk Highlights:\n"
        f"{highlights}\n\n"
        f"All physical site observations, voice walkthrough disclosures, and schedules have been cross-referenced "
        f"in the attached Submission Packet (with full E&O source provenance).\n\n"
        f"Please let us know if you require any additional loss control details to release a firm binding quote.\n\n"
        f"Best regards,\n"
        f"{broker}\n"
        f"{agency}\n"
        f"{current_user.email}"
    )

    return {
        "submission_id": sub.id,
        "placement_id": placement.id if placement else None,
        "carrier_name": carrier_name,
        "target_line": target_line,
        "verified": sub.verified_at is not None,
        "subject": subject,
        "body": body,
    }


@router.post(
    "/{submission_id}/placements/{placement_id}/quote",
    response_model=SubmissionJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_carrier_quote_pdf(
    submission_id: int,
    placement_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    run_sync: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a carrier quote PDF for a specific `MarketPlacement`.
    Archives the quote PDF immutably in `evidence_artifacts` (`artifact_type='quote_pdf'`)
    and enqueues an async `quote_ingestion` job using `qwen2.5vl:7b`.
    """
    sub = (
        db.query(Submission)
        .filter(Submission.id == submission_id, Submission.broker_id == current_user.id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")

    placement = (
        db.query(MarketPlacement)
        .filter(
            MarketPlacement.id == placement_id,
            MarketPlacement.submission_id == sub.id,
            MarketPlacement.broker_id == current_user.id,
        )
        .first()
    )
    if not placement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Market placement not found.")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded quote PDF is empty.")

    vault_dir = os.path.join(settings.EVIDENCE_VAULT_DIR, f"sub_{sub.id}")
    os.makedirs(vault_dir, exist_ok=True)
    safe_name = os.path.basename(file.filename or "carrier_quote.pdf").replace(" ", "_")
    immutable_path = os.path.join(vault_dir, f"immutable_{uuid.uuid4().hex[:10]}_{safe_name}")
    with open(immutable_path, "wb") as f:
        f.write(raw_bytes)

    sha256_hex = hashlib.sha256(raw_bytes).hexdigest()
    meta = {
        "original_filename": file.filename or "carrier_quote.pdf",
        "content_type": file.content_type or "application/pdf",
        "file_size": len(raw_bytes),
        "sha256_hash": sha256_hex,
        "is_immutable": True,
        "placement_id": placement.id,
        "carrier_name": placement.carrier_name,
    }
    art = EvidenceArtifact(
        submission_id=sub.id,
        client_id=sub.client_id,
        broker_id=current_user.id,
        artifact_type="quote_pdf",
        file_path=immutable_path,
        metadata_json=json.dumps(meta),
    )
    db.add(art)
    db.commit()
    db.refresh(art)

    job = job_queue.create_job(
        db=db,
        submission_id=sub.id,
        client_id=sub.client_id,
        broker_id=current_user.id,
        job_type="quote_ingestion",
        artifact_ids=[art.id],
        extra_payload={"placement_id": placement.id},
    )

    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=db.get_bind())
    if run_sync:
        await job_queue.execute_job(job.id, session_factory=session_factory)
        db.refresh(job)
    else:
        background_tasks.add_task(job_queue.execute_job, job.id, session_factory)

    return job


@router.post("/{submission_id}/compare-quotes")
def compare_submission_quotes(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Automated Quote Diffing Engine (`quote_vs_expiring` & `quote_vs_quote`):
    Returns structured diff flags (`higher_deductible`, `narrowed_limit`, `new_exclusion`, `subjectivity_required`)
    with severity (`high`, `medium`, `info`).
    """
    sub = (
        db.query(Submission)
        .filter(Submission.id == submission_id, Submission.broker_id == current_user.id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")

    placements = (
        db.query(MarketPlacement)
        .filter(MarketPlacement.submission_id == sub.id)
        .order_by(MarketPlacement.updated_at.desc())
        .all()
    )
    return quote_diff_engine.compare_quotes(sub, placements)


@router.get("/{submission_id}/quote-comparison/export")
def export_quote_comparison_proposal(
    submission_id: int,
    format: str = Query("pdf", pattern="^(docx|pdf)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a Client Quote Comparison Proposal (.docx or .pdf) for the insured."""
    sub = (
        db.query(Submission)
        .filter(Submission.id == submission_id, Submission.broker_id == current_user.id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")

    client_obj = db.query(Client).filter(Client.id == sub.client_id).first()
    placements = (
        db.query(MarketPlacement)
        .filter(MarketPlacement.submission_id == sub.id)
        .order_by(MarketPlacement.updated_at.desc())
        .all()
    )
    comparison = quote_diff_engine.compare_quotes(sub, placements)
    file_bytes = export_service.export_quote_comparison_proposal(
        submission=sub,
        client_obj=client_obj,
        comparison_result=comparison,
        fmt=format,
    )

    safe_title = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in sub.title)[:45]
    if format.lower() == "docx":
        return Response(
            content=file_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}_Quote_Comparison.docx"'}
        )
    return Response(
        content=file_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}_Quote_Comparison.pdf"'}
    )
