from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.entities import User, Client
from app.schemas.schemas import RagQueryRequest, RagQueryResponse
from app.services.rag_service import rag_service

router = APIRouter(prefix="/rag", tags=["Client-Scoped RAG Intelligence"])


@router.post("/query", response_model=RagQueryResponse)
async def query_client_policies(
    req: RagQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Execute an ad-hoc question against the client's documents.
    Strictly isolated: Query ONLY searches the selected client's Chroma collection.
    Cross-client data retrieval is physically prevented.
    """
    client = db.query(Client).filter(Client.id == req.client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found or unauthorized access"
        )

    result = await rag_service.query(
        client_id=req.client_id,
        query_text=req.query,
        top_k=req.top_k or 4
    )

    return RagQueryResponse(
        query=result["query"],
        client_id=result["client_id"],
        answer=result["answer"],
        sources=result["sources"],
        model_used=result["model_used"]
    )
