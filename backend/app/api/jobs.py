from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.entities import User, SubmissionJob
from app.schemas.schemas import SubmissionJobResponse

router = APIRouter(prefix="/jobs", tags=["Async Background Job Queue"])


@router.get("/{job_id}", response_model=SubmissionJobResponse)
def get_job_status(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Poll status of an asynchronous submission capture or multimodal extraction job (`GET /api/jobs/{job_id}`).
    """
    job = (
        db.query(SubmissionJob)
        .filter(SubmissionJob.id == job_id, SubmissionJob.broker_id == current_user.id)
        .first()
    )
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found."
        )
    return job


@router.get("/", response_model=List[SubmissionJobResponse])
def list_jobs(
    submission_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List recent background jobs for the authenticated broker (optionally filtered by submission_id)."""
    query = db.query(SubmissionJob).filter(SubmissionJob.broker_id == current_user.id)
    if submission_id is not None:
        query = query.filter(SubmissionJob.submission_id == submission_id)
    return query.order_by(SubmissionJob.created_at.desc()).limit(25).all()
