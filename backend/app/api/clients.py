import random
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.entities import User, Client, Policy, ExtractedFields
from app.schemas.schemas import ClientCreate, ClientUpdate, ClientResponse

router = APIRouter(prefix="/clients", tags=["Clients"])


@router.get("/", response_model=List[ClientResponse])
def list_clients(
    q: Optional[str] = Query(None, description="Search by name, account number or contact"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all commercial clients for the current broker with search and policy statistics."""
    query = db.query(Client).filter(Client.user_id == current_user.id)

    if q:
        search_filter = f"%{q}%"
        query = query.filter(
            or_(
                Client.name.ilike(search_filter),
                Client.account_number.ilike(search_filter),
                Client.primary_contact.ilike(search_filter),
                Client.email.ilike(search_filter)
            )
        )

    clients = query.order_by(Client.created_at.desc()).all()
    results = []

    for client in clients:
        policies = db.query(Policy).filter(Policy.client_id == client.id).all()
        policy_count = len(policies)
        verified_count = sum(1 for p in policies if p.extracted_fields and p.extracted_fields.verified)

        resp = ClientResponse(
            id=client.id,
            user_id=client.user_id,
            name=client.name,
            account_number=client.account_number,
            primary_contact=client.primary_contact,
            email=client.email,
            phone=client.phone,
            notes=client.notes,
            status=client.status,
            created_at=client.created_at,
            updated_at=client.updated_at,
            policy_count=policy_count,
            verified_policy_count=verified_count
        )
        results.append(resp)

    return results


@router.post("/", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
def create_client(
    client_in: ClientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new commercial client record."""
    # Auto-generate account number if not provided
    account_num = client_in.account_number
    if not account_num:
        rand_suffix = random.randint(10000, 99999)
        prefix = "".join([w[0].upper() for w in client_in.name.split()[:3]]) or "CL"
        account_num = f"{prefix}-{rand_suffix}"

    client = Client(
        user_id=current_user.id,
        name=client_in.name,
        account_number=account_num,
        primary_contact=client_in.primary_contact,
        email=client_in.email,
        phone=client_in.phone,
        notes=client_in.notes,
        status=client_in.status or "active"
    )
    db.add(client)
    db.commit()
    db.refresh(client)

    return ClientResponse(
        id=client.id,
        user_id=client.user_id,
        name=client.name,
        account_number=client.account_number,
        primary_contact=client.primary_contact,
        email=client.email,
        phone=client.phone,
        notes=client.notes,
        status=client.status,
        created_at=client.created_at,
        updated_at=client.updated_at,
        policy_count=0,
        verified_policy_count=0
    )


@router.get("/{client_id}", response_model=ClientResponse)
def get_client(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get client profile and details."""
    client = db.query(Client).filter(Client.id == client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    policies = db.query(Policy).filter(Policy.client_id == client.id).all()
    policy_count = len(policies)
    verified_count = sum(1 for p in policies if p.extracted_fields and p.extracted_fields.verified)

    return ClientResponse(
        id=client.id,
        user_id=client.user_id,
        name=client.name,
        account_number=client.account_number,
        primary_contact=client.primary_contact,
        email=client.email,
        phone=client.phone,
        notes=client.notes,
        status=client.status,
        created_at=client.created_at,
        updated_at=client.updated_at,
        policy_count=policy_count,
        verified_policy_count=verified_count
    )


@router.put("/{client_id}", response_model=ClientResponse)
def update_client(
    client_id: int,
    client_in: ClientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update commercial client information."""
    client = db.query(Client).filter(Client.id == client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    update_data = client_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(client, field, value)

    db.commit()
    db.refresh(client)

    policies = db.query(Policy).filter(Policy.client_id == client.id).all()
    policy_count = len(policies)
    verified_count = sum(1 for p in policies if p.extracted_fields and p.extracted_fields.verified)

    return ClientResponse(
        id=client.id,
        user_id=client.user_id,
        name=client.name,
        account_number=client.account_number,
        primary_contact=client.primary_contact,
        email=client.email,
        phone=client.phone,
        notes=client.notes,
        status=client.status,
        created_at=client.created_at,
        updated_at=client.updated_at,
        policy_count=policy_count,
        verified_policy_count=verified_count
    )


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete client and associated policies/vectors."""
    client = db.query(Client).filter(Client.id == client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    # Clean up Chroma collection for this client
    try:
        from app.services.rag_service import rag_service
        collection_name = f"client_{client.id}"
        rag_service.client.delete_collection(name=collection_name)
    except Exception:
        pass

    db.delete(client)
    db.commit()
    return None
