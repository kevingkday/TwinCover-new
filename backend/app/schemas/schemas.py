from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr, Field, ConfigDict


# ==========================================
# Auth & User Schemas
# ==========================================

class UserBase(BaseModel):
    email: EmailStr
    full_name: str = ""
    agency_name: str = "TwinCover Commercial Advisors"


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenData(BaseModel):
    email: Optional[str] = None
    user_id: Optional[int] = None


# ==========================================
# Client Schemas
# ==========================================

class ClientBase(BaseModel):
    name: str
    account_number: Optional[str] = None
    primary_contact: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    status: str = "active"


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    account_number: Optional[str] = None
    primary_contact: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class ClientResponse(ClientBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    policy_count: int = 0
    verified_policy_count: int = 0

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Extracted Fields Schemas
# ==========================================

class ExtractedFieldsBase(BaseModel):
    insured_name: Optional[str] = None
    policy_number: Optional[str] = None
    insurer: Optional[str] = None
    effective_date: Optional[str] = None
    expiry_date: Optional[str] = None
    cgl_limit: Optional[str] = None
    property_limit: Optional[str] = None
    cyber_limit: Optional[str] = None
    cyber_deductible: Optional[str] = None
    total_premium: Optional[str] = None


class ExtractedFieldsUpdate(ExtractedFieldsBase):
    verified: bool = True


class ExtractedFieldsResponse(ExtractedFieldsBase):
    id: int
    policy_id: int
    raw_json: Optional[str] = None
    verified: bool = False
    verified_at: Optional[datetime] = None
    verified_by_user_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Policy Schemas
# ==========================================

class PolicyResponse(BaseModel):
    id: int
    client_id: int
    filename: str
    file_size: int
    status: str
    uploaded_at: datetime
    extracted_fields: Optional[ExtractedFieldsResponse] = None

    model_config = ConfigDict(from_attributes=True)


class PolicyDetailResponse(PolicyResponse):
    raw_text: Optional[str] = None


# ==========================================
# Letter Template & Generation Schemas
# ==========================================

class LetterTemplateBase(BaseModel):
    name: str
    description: Optional[str] = None
    category: str = "Renewal"
    content: str


class LetterTemplateCreate(LetterTemplateBase):
    pass


class LetterTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    content: Optional[str] = None


class LetterTemplateResponse(LetterTemplateBase):
    id: int
    user_id: Optional[int] = None
    is_system: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GenerateLetterRequest(BaseModel):
    client_id: int
    policy_id: int
    template_id: int
    custom_instructions: Optional[str] = None
    use_llm_polish: bool = True


class GeneratedLetterResponse(BaseModel):
    id: int
    client_id: int
    policy_id: Optional[int] = None
    template_id: Optional[int] = None
    title: str
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExportDocxRequest(BaseModel):
    title: str
    content: str
    client_name: Optional[str] = None
    policy_number: Optional[str] = None


# ==========================================
# RAG Schemas
# ==========================================

class RagSourceChunk(BaseModel):
    policy_id: int
    filename: str
    section_title: Optional[str] = None
    chunk_index: int
    content: str
    score: Optional[float] = None


class RagQueryRequest(BaseModel):
    client_id: int
    query: str
    top_k: int = 4


class RagQueryResponse(BaseModel):
    query: str
    client_id: int
    answer: str
    sources: List[RagSourceChunk] = []
    model_used: str = "local"


# ==========================================
# System Health & Connectivity Schemas
# ==========================================

class ServiceStatus(BaseModel):
    name: str
    url: str
    is_online: bool
    status_message: str


class SystemHealthResponse(BaseModel):
    app_version: str
    database: ServiceStatus
    extractor_microservice: ServiceStatus
    ollama_llm: ServiceStatus
    chroma_vector_db: ServiceStatus
    all_operational: bool
