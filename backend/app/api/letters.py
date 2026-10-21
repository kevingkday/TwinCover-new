import io
import os
import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from docx import Document as DocxReader
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.entities import User, Client, Policy, ExtractedFields, LetterTemplate, GeneratedLetter
from app.schemas.schemas import (
    LetterTemplateCreate,
    LetterTemplateUpdate,
    LetterTemplateResponse,
    GenerateLetterRequest,
    GeneratedLetterResponse,
    ExportDocxRequest
)
from app.services.ollama_client import ollama_client
from app.services.export_service import export_service

router = APIRouter(prefix="/letters", tags=["Letter Generation & Templates"])


@router.get("/templates", response_model=List[LetterTemplateResponse])
def list_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List system renewal templates and broker's custom templates."""
    templates = db.query(LetterTemplate).filter(
        or_(LetterTemplate.user_id == current_user.id, LetterTemplate.is_system == True)
    ).order_by(LetterTemplate.is_system.desc(), LetterTemplate.name.asc()).all()
    return templates


@router.post("/templates", response_model=LetterTemplateResponse, status_code=status.HTTP_201_CREATED)
def create_template(
    template_in: LetterTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new custom renewal letter template."""
    template = LetterTemplate(
        user_id=current_user.id,
        name=template_in.name,
        description=template_in.description,
        category=template_in.category or "Renewal",
        content=template_in.content,
        template_type="markdown",
        is_system=False
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.post("/templates/upload-docx", response_model=LetterTemplateResponse, status_code=status.HTTP_201_CREATED)
async def upload_docx_template(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: Optional[str] = Form(None),
    category: Optional[str] = Form("Broker Letterhead"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload a custom Word (.docx) letterhead template with merge fields."""
    if not file.filename.lower().endswith(".docx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Word (.docx) documents are supported."
        )

    # Ensure uploads/templates directory exists
    templates_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "templates"))
    os.makedirs(templates_dir, exist_ok=True)

    # Generate safe unique filename
    clean_base = re_clean_filename(os.path.splitext(file.filename)[0])
    unique_filename = f"{uuid.uuid4().hex[:8]}_{clean_base}.docx"
    save_path = os.path.join(templates_dir, unique_filename)

    file_bytes = await file.read()
    with open(save_path, "wb") as f:
        f.write(file_bytes)

    # Extract plain text content from .docx for search & markdown preview
    extracted_text = ""
    try:
        doc = DocxReader(save_path)
        extracted_text = "\n\n".join([p.text for p in doc.paragraphs if p.text.strip()])
    except Exception:
        extracted_text = f"Word Letterhead Template: {file.filename}"

    template = LetterTemplate(
        user_id=current_user.id,
        name=name,
        description=description or f"Custom broker Word template uploaded from {file.filename}",
        category=category or "Broker Letterhead",
        content=extracted_text or f"# {name}\nCustom Word Letterhead Template",
        template_type="docx",
        file_path=save_path,
        original_filename=file.filename,
        is_system=False
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.get("/templates/{template_id}/download-docx")
def download_docx_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Download the original Word (.docx) template file for editing."""
    template = db.query(LetterTemplate).filter(
        LetterTemplate.id == template_id,
        or_(LetterTemplate.user_id == current_user.id, LetterTemplate.is_system == True)
    ).first()

    if not template or template.template_type != "docx" or not template.file_path or not os.path.exists(template.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Word template file not found on server")

    with open(template.file_path, "rb") as f:
        file_bytes = f.read()

    download_name = template.original_filename or f"{re_clean_filename(template.name)}.docx"
    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'}
    )


@router.put("/templates/{template_id}", response_model=LetterTemplateResponse)
def update_template(
    template_id: int,
    template_in: LetterTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a custom letter template."""
    template = db.query(LetterTemplate).filter(
        LetterTemplate.id == template_id,
        LetterTemplate.user_id == current_user.id
    ).first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found or cannot edit system template")

    update_data = template_in.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(template, k, v)

    db.commit()
    db.refresh(template)
    return template


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a custom letter template."""
    template = db.query(LetterTemplate).filter(
        LetterTemplate.id == template_id,
        LetterTemplate.user_id == current_user.id,
        LetterTemplate.is_system == False
    ).first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found or is protected system template")

    # If it was an uploaded docx file, safely remove it from storage
    if template.template_type == "docx" and template.file_path and os.path.exists(template.file_path):
        try:
            if "sample_templates" not in template.file_path:
                os.remove(template.file_path)
        except Exception:
            pass

    db.delete(template)
    db.commit()
    return None


@router.post("/generate", response_model=dict)
async def generate_letter(
    request: GenerateLetterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate a formal commercial renewal letter:
    - Merges verified fields into template
    - Applies local LLM synthesis or token interpolation
    - Returns drafted markdown
    """
    client = db.query(Client).filter(Client.id == request.client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    policy = db.query(Policy).filter(Policy.id == request.policy_id, Policy.client_id == client.id).first()
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")

    template = db.query(LetterTemplate).filter(
        LetterTemplate.id == request.template_id,
        or_(LetterTemplate.user_id == current_user.id, LetterTemplate.is_system == True)
    ).first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    # Retrieve extracted fields
    fields = policy.extracted_fields
    fields_dict = {
        "insured_name": (fields.insured_name if fields else None) or client.name,
        "policy_number": fields.policy_number if fields else "PENDING",
        "insurer": fields.insurer if fields else "Underwriter",
        "effective_date": fields.effective_date if fields else "Pending",
        "expiry_date": fields.expiry_date if fields else "Pending",
        "cgl_limit": fields.cgl_limit if fields else "$5,000,000",
        "property_limit": fields.property_limit if fields else "$10,000,000",
        "cyber_limit": fields.cyber_limit if fields else "$2,000,000",
        "cyber_deductible": fields.cyber_deductible if fields else "$50,000",
        "total_premium": fields.total_premium if fields else "$42,850",
        "coverages": fields.coverages if fields else "[]",
    }

    broker_info = {
        "full_name": current_user.full_name or "Commercial Insurance Executive",
        "agency_name": current_user.agency_name or "TwinCover Commercial Advisory Group",
        "email": current_user.email,
        "current_date": datetime.now().strftime("%B %d, %Y")
    }

    draft = await ollama_client.generate_letter(
        template_content=template.content,
        fields=fields_dict,
        broker_info=broker_info,
        custom_instructions=request.custom_instructions,
        use_llm_polish=request.use_llm_polish
    )

    letter_title = f"{template.name} - {client.name} ({fields_dict['policy_number']})"

    return {
        "title": letter_title,
        "content": draft,
        "client_id": client.id,
        "policy_id": policy.id,
        "template_id": template.id,
        "template_name": template.name
    }


@router.post("/save", response_model=GeneratedLetterResponse, status_code=status.HTTP_201_CREATED)
def save_generated_letter(
    letter_in: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Save drafted letter to client record history."""
    client_id = letter_in.get("client_id")
    client = db.query(Client).filter(Client.id == client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    letter = GeneratedLetter(
        client_id=client_id,
        policy_id=letter_in.get("policy_id"),
        template_id=letter_in.get("template_id"),
        title=letter_in.get("title") or "Commercial Renewal Summary",
        content=letter_in.get("content", "")
    )
    db.add(letter)
    db.commit()
    db.refresh(letter)
    return letter


@router.get("/history/{client_id}", response_model=List[GeneratedLetterResponse])
def get_letter_history(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all saved letters generated for this client."""
    client = db.query(Client).filter(Client.id == client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    letters = db.query(GeneratedLetter).filter(
        GeneratedLetter.client_id == client_id
    ).order_by(GeneratedLetter.created_at.desc()).all()
    return letters


@router.post("/export/docx")
def export_letter_docx(
    request: ExportDocxRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate and download executive formatted .docx letter."""
    # Check if a custom Word (.docx) letterhead template was selected
    if request.template_id:
        template = db.query(LetterTemplate).filter(
            LetterTemplate.id == request.template_id,
            or_(LetterTemplate.user_id == current_user.id, LetterTemplate.is_system == True)
        ).first()

        if template and template.template_type == "docx" and template.file_path and os.path.exists(template.file_path):
            fields_dict = {
                "insured_name": request.client_name or "Valued Client",
                "policy_number": request.policy_number or "PENDING",
                "insurer": "Underwriting Carrier",
                "effective_date": "Pending",
                "expiry_date": "Pending",
                "cgl_limit": "$5,000,000",
                "property_limit": "$10,000,000",
                "cyber_limit": "$2,000,000",
                "cyber_deductible": "$50,000",
                "total_premium": "$0.00",
                "coverages": "[]"
            }

            if request.policy_id:
                policy = db.query(Policy).filter(Policy.id == request.policy_id).first()
                if policy and policy.extracted_fields:
                    ef = policy.extracted_fields
                    fields_dict.update({
                        "insured_name": ef.insured_name or fields_dict["insured_name"],
                        "policy_number": ef.policy_number or fields_dict["policy_number"],
                        "insurer": ef.insurer or fields_dict["insurer"],
                        "effective_date": ef.effective_date or fields_dict["effective_date"],
                        "expiry_date": ef.expiry_date or fields_dict["expiry_date"],
                        "cgl_limit": ef.cgl_limit or fields_dict["cgl_limit"],
                        "property_limit": ef.property_limit or fields_dict["property_limit"],
                        "cyber_limit": ef.cyber_limit or fields_dict["cyber_limit"],
                        "cyber_deductible": ef.cyber_deductible or fields_dict["cyber_deductible"],
                        "total_premium": ef.total_premium or fields_dict["total_premium"],
                        "coverages": ef.coverages or fields_dict["coverages"],
                    })

            broker_info = {
                "full_name": current_user.full_name or "Commercial Insurance Executive",
                "agency_name": current_user.agency_name or "TwinCover Commercial Advisory Group",
                "email": current_user.email,
                "current_date": datetime.now().strftime("%B %d, %Y")
            }

            docx_bytes = export_service.render_docx_template(
                template_path=template.file_path,
                fields=fields_dict,
                broker_info=broker_info
            )
            clean_filename = f"{re_clean_filename(request.title)}.docx"
            return StreamingResponse(
                io.BytesIO(docx_bytes),
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": f'attachment; filename="{clean_filename}"'}
            )

    docx_bytes = export_service.export_to_docx(
        title=request.title,
        content=request.content,
        client_name=request.client_name,
        policy_number=request.policy_number
    )

    clean_filename = f"{re_clean_filename(request.title)}.docx"
    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{clean_filename}"'}
    )


@router.post("/export/pdf")
def export_letter_pdf(
    request: ExportDocxRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate and download executive print-ready .pdf letter."""
    pdf_bytes = export_service.export_to_pdf(
        title=request.title,
        content=request.content,
        client_name=request.client_name,
        policy_number=request.policy_number
    )

    clean_filename = f"{re_clean_filename(request.title)}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{clean_filename}"'}
    )


def re_clean_filename(name: str) -> str:
    import re
    return re.sub(r'[^a-zA-Z0-9_\-\.]', '_', name)[:50]
