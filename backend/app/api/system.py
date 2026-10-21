from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.config import settings
from app.core.database import get_db
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
