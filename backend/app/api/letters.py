import io
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
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
        is_system=False
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


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
    current_user: User = Depends(get_current_user)
):
    """Generate and download executive formatted .docx letter."""
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
