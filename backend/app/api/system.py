from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text, desc

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.entities import User, Client, Policy, ExtractedFields, LetterTemplate, GeneratedLetter
from app.schemas.schemas import SystemHealthResponse, ServiceStatus
from app.services.extractor_client import extractor_client
from app.services.ollama_client import ollama_client
from app.services.rag_service import rag_service

router = APIRouter(prefix="/system", tags=["System Health & Architecture"])


@router.get("/health", response_model=SystemHealthResponse)
async def get_system_health(db: Session = Depends(get_db)):
    """Check connectivity to all core services: DB, Extractor, Ollama, ChromaDB."""
    # 1. DB Health
    db_ok = False
    db_msg = "Database connected"
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        db_msg = f"DB Error: {str(e)}"

    # 2. Extractor Microservice Health
    ext_ok, ext_msg = await extractor_client.check_health()

    # 3. Ollama LLM Health
    ollama_ok, ollama_msg = await ollama_client.check_health()

    # 4. ChromaDB Health
    chroma_ok = False
    chroma_msg = "ChromaDB ready"
    try:
        _ = rag_service.client.heartbeat()
        chroma_ok = True
    except Exception as e:
        chroma_msg = f"Chroma Error: {str(e)}"

    all_op = db_ok and chroma_ok

    return SystemHealthResponse(
        app_version=settings.VERSION,
        database=ServiceStatus(
            name="SQLite / D1 Database",
            url=settings.DATABASE_URL,
            is_online=db_ok,
            status_message=db_msg
        ),
        extractor_microservice=ServiceStatus(
            name="Document Extractor Microservice",
            url=settings.EXTRACTOR_URL,
            is_online=ext_ok,
            status_message=ext_msg
        ),
        ollama_llm=ServiceStatus(
            name=f"Local LLM ({settings.LLM_MODEL})",
            url=settings.OLLAMA_BASE_URL,
            is_online=ollama_ok,
            status_message=ollama_msg
        ),
        chroma_vector_db=ServiceStatus(
            name="ChromaDB Vector Store (Persistent)",
            url=settings.CHROMA_PERSIST_DIRECTORY,
            is_online=chroma_ok,
            status_message=chroma_msg
        ),
        all_operational=all_op
    )


@router.get("/admin/overview", response_model=Dict[str, Any])
def get_admin_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Admin & Demo Engagement Overview:
    Aggregated platform analytics, registered brokers, client accounts, policy uploads, and database table stats.
    """
    total_brokers = db.query(User).count()
    total_clients = db.query(Client).count()
    total_policies = db.query(Policy).count()
    total_verified = db.query(Policy).filter(Policy.status == "verified").count()
    total_letters = db.query(GeneratedLetter).count()
    total_templates = db.query(LetterTemplate).count()

    # Query all brokers and their activity
    users = db.query(User).order_by(User.created_at.desc()).all()
    broker_list = []
    for u in users:
        client_ids = [c.id for c in u.clients]
        client_count = len(client_ids)
        
        policy_count = 0
        if client_ids:
            policy_count = db.query(Policy).filter(Policy.client_id.in_(client_ids)).count()
            
        letter_count = 0
        if client_ids:
            letter_count = db.query(GeneratedLetter).filter(GeneratedLetter.client_id.in_(client_ids)).count()
            
        broker_list.append({
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name or "Commercial Broker",
            "agency_name": u.agency_name or "Independent Brokerage",
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "client_count": client_count,
            "policy_count": policy_count,
            "letter_count": letter_count,
        })

    # Recent policy uploads (across all brokers)
    recent_policies_query = (
        db.query(Policy, Client, User)
        .join(Client, Policy.client_id == Client.id)
        .join(User, Client.user_id == User.id)
        .order_by(Policy.uploaded_at.desc())
        .limit(20)
        .all()
    )
    recent_policies = []
    for pol, cli, usr in recent_policies_query:
        recent_policies.append({
            "id": pol.id,
            "filename": pol.filename,
            "file_size": pol.file_size,
            "status": pol.status,
            "uploaded_at": pol.uploaded_at.isoformat() if pol.uploaded_at else None,
            "client_name": cli.name,
            "client_id": cli.id,
            "broker_name": usr.full_name,
            "broker_email": usr.email,
            "broker_agency": usr.agency_name
        })

    # Recent letters generated
    recent_letters_query = (
        db.query(GeneratedLetter, Client, User)
        .join(Client, GeneratedLetter.client_id == Client.id)
        .join(User, Client.user_id == User.id)
        .order_by(GeneratedLetter.created_at.desc())
        .limit(20)
        .all()
    )
    recent_letters = []
    for ltr, cli, usr in recent_letters_query:
        recent_letters.append({
            "id": ltr.id,
            "title": ltr.title,
            "created_at": ltr.created_at.isoformat() if ltr.created_at else None,
            "client_name": cli.name,
            "broker_name": usr.full_name,
            "broker_agency": usr.agency_name
        })

    return {
        "metrics": {
            "total_brokers": total_brokers,
            "total_clients": total_clients,
            "total_policies": total_policies,
            "total_verified_policies": total_verified,
            "total_letters_generated": total_letters,
            "total_templates": total_templates,
        },
        "database_stats": {
            "users_table": total_brokers,
            "clients_table": total_clients,
            "policies_table": total_policies,
            "extracted_fields_table": db.query(ExtractedFields).count(),
            "letter_templates_table": total_templates,
            "generated_letters_table": total_letters,
            "database_engine": "SQLite / Local DB (twincover.db)"
        },
        "brokers": broker_list,
        "recent_policies": recent_policies,
        "recent_letters": recent_letters
    }
