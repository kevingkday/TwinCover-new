import os
import shutil
import json
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.entities import User, Client, Policy, ExtractedFields
from app.schemas.schemas import (
    PolicyResponse,
    PolicyDetailResponse,
    ExtractedFieldsResponse,
    ExtractedFieldsUpdate
)
from app.services.extractor_client import extractor_client
from app.services.ollama_client import ollama_client
from app.services.rag_service import rag_service

router = APIRouter(prefix="/policies", tags=["Policies"])


@router.post("/upload", response_model=PolicyResponse, status_code=status.HTTP_201_CREATED)
async def upload_policy(
    client_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Ingest a commercial policy PDF:
    1. Verify client ownership
    2. Extract structured Markdown via microservice / local engine
    3. Index chunks into client-isolated Chroma vector space
    4. Run Ollama extraction for structured fields
    5. Save unverified extracted fields to database
    """
    client = db.query(Client).filter(Client.id == client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF policy documents are supported")

    pdf_bytes = await file.read()
    file_size = len(pdf_bytes)

    # Save PDF to disk
    client_dir = os.path.join(settings.UPLOAD_DIR, f"client_{client_id}")
    os.makedirs(client_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"{timestamp}_{file.filename.replace(' ', '_')}"
    file_path = os.path.join(client_dir, safe_filename)

    with open(file_path, "wb") as f:
        f.write(pdf_bytes)

    # Step 1: Extract structured markdown
    extracted_markdown = await extractor_client.extract_markdown_from_pdf(pdf_bytes, file.filename)

    # Step 2: Create Policy record
    policy = Policy(
        client_id=client_id,
        filename=file.filename,
        file_path=file_path,
        file_size=file_size,
        raw_text=extracted_markdown,
        status="extracted"
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)

    # Step 3: Index sections into client-isolated Chroma collection
    try:
        await rag_service.index_policy(
            client_id=client_id,
            policy_id=policy.id,
            filename=file.filename,
            raw_text=extracted_markdown
        )
    except Exception as e:
        # Don't fail the whole upload if embedding index encounters an issue
        print(f"Warning: Chroma vector indexing error: {e}")

    # Step 4: Extract key fields via Ollama strictly from Declarations block
    extracted_data = await ollama_client.extract_policy_fields(extracted_markdown)

    # Step 5: Save ExtractedFields record (unverified by default)
    coverages_list = extracted_data.get("coverages") or []
    coverages_json = json.dumps(coverages_list) if isinstance(coverages_list, (list, dict)) else str(coverages_list)

    fields = ExtractedFields(
        policy_id=policy.id,
        insured_name=extracted_data.get("insured_name") or client.name,
        policy_number=extracted_data.get("policy_number"),
        insurer=extracted_data.get("insurer"),
        effective_date=extracted_data.get("effective_date"),
        expiry_date=extracted_data.get("expiry_date"),
        cgl_limit=extracted_data.get("cgl_limit"),
        property_limit=extracted_data.get("property_limit"),
        cyber_limit=extracted_data.get("cyber_limit"),
        cyber_deductible=extracted_data.get("cyber_deductible"),
        total_premium=extracted_data.get("total_premium"),
        coverages=coverages_json,
        raw_json=json.dumps(extracted_data),
        verified=False
    )
    db.add(fields)
    db.commit()
    db.refresh(fields)
    db.refresh(policy)

    return policy


@router.get("/client/{client_id}", response_model=List[PolicyResponse])
def get_client_policies(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all policies ingested for a specific client."""
    client = db.query(Client).filter(Client.id == client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    policies = db.query(Policy).filter(Policy.client_id == client_id).order_by(Policy.uploaded_at.desc()).all()
    return policies


@router.get("/{policy_id}", response_model=PolicyDetailResponse)
def get_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve policy details including full extracted markdown schedule."""
    policy = db.query(Policy).join(Client).filter(Policy.id == policy_id, Client.user_id == current_user.id).first()
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")
    return policy


@router.put("/{policy_id}/fields", response_model=ExtractedFieldsResponse)
def verify_and_update_fields(
    policy_id: int,
    fields_in: ExtractedFieldsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Broker verification endpoint:
    Save and confirm extracted values, marking the schedule as Verified.
    """
    policy = db.query(Policy).join(Client).filter(Policy.id == policy_id, Client.user_id == current_user.id).first()
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")

    fields = db.query(ExtractedFields).filter(ExtractedFields.policy_id == policy_id).first()
    if not fields:
        fields = ExtractedFields(policy_id=policy_id)
        db.add(fields)

    update_dict = fields_in.model_dump(exclude_unset=True)
    if "coverages" in update_dict and update_dict["coverages"] is not None:
        covs = update_dict["coverages"]
        if isinstance(covs, list):
            fields.coverages = json.dumps([c if isinstance(c, dict) else c.model_dump() for c in covs])
        else:
            fields.coverages = json.dumps(covs)
        del update_dict["coverages"]

    for k, v in update_dict.items():
        setattr(fields, k, v)

    if fields_in.verified:
        fields.verified = True
        fields.verified_at = datetime.now(timezone.utc)
        fields.verified_by_user_id = current_user.id
        policy.status = "verified"

    db.commit()
    db.refresh(fields)
    return fields


@router.get("/{policy_id}/download")
def download_policy_pdf(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Download the original policy PDF."""
    policy = db.query(Policy).join(Client).filter(Policy.id == policy_id, Client.user_id == current_user.id).first()
    if not policy or not os.path.exists(policy.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy PDF not found on disk")

    return FileResponse(
        path=policy.file_path,
        filename=policy.filename,
        media_type="application/pdf"
    )


@router.delete("/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a policy record and file."""
    policy = db.query(Policy).join(Client).filter(Policy.id == policy_id, Client.user_id == current_user.id).first()
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")

    if os.path.exists(policy.file_path):
        try:
            os.remove(policy.file_path)
        except Exception:
            pass

    db.delete(policy)
    db.commit()
    return None
