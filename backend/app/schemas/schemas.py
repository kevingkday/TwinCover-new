import json
from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator


# ==========================================
# Auth & User Schemas
# ==========================================

class UserBase(BaseModel):
    email: EmailStr
    full_name: str = ""
    agency_name: str = "TwinCover Commercial Advisors"


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    agency_name: Optional[str] = Field(None, min_length=1, max_length=255)

    @field_validator("full_name", "agency_name")
    @classmethod
    def strip_non_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Value cannot be blank")
        return cleaned


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str
    agency_name: Optional[str] = None


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

class CoverageItem(BaseModel):
    name: str
    limit: Optional[str] = None
    deductible: Optional[str] = None
    notes: Optional[str] = None


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
    coverages: Optional[List[CoverageItem]] = None

    @field_validator("coverages", mode="before")
    @classmethod
    def parse_coverages(cls, v):
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                return []
        return v


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
# Policy & Document Classification Schemas
# ==========================================

class DocumentClassificationResponse(BaseModel):
    filename: str
    document_type: str
    document_type_label: str
    confidence: float
    probabilities: Dict[str, float]
    is_insurance_document: float
    has_coverage_schedule: float
    total_pages: int = 1
    summary_reason: str
    engine: str


class PolicyResponse(BaseModel):
    id: int
    client_id: int
    filename: str
    file_size: int
    document_type: str = "policy"
    classification_confidence: Optional[str] = None
    classification_engine: Optional[str] = None
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
    template_type: str = "markdown"
    original_filename: Optional[str] = None


class LetterTemplateCreate(LetterTemplateBase):
    pass


class LetterTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    content: Optional[str] = None
    template_type: Optional[str] = None
    original_filename: Optional[str] = None


class LetterTemplateResponse(LetterTemplateBase):
    id: int
    user_id: Optional[int] = None
    is_system: bool = False
    template_type: str = "markdown"
    original_filename: Optional[str] = None
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
    template_id: Optional[int] = None
    policy_id: Optional[int] = None


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
    jev_classifier: Optional[ServiceStatus] = None
    extractor_microservice: ServiceStatus
    ollama_llm: ServiceStatus
    whisper_transcription: Optional[ServiceStatus] = None
    chroma_vector_db: ServiceStatus
    all_operational: bool


# ==========================================
# Phase 1: Pre-Bind Producer Copilot Schemas
# ==========================================

class SourceCitation(BaseModel):
    artifact_id: str
    artifact_type: str  # photo, audio, pdf, spreadsheet, text_note
    reference: str      # e.g., "site_photo_02.jpg", "00:42 - 00:58", "Page 1"
    excerpt: str


class CitedUnderwritingField(BaseModel):
    field_key: str
    label: str
    value: Optional[str] = None
    confidence: float = 0.90
    category: str = "Underwriting Profile"
    citations: List[SourceCitation] = []


class MissingInfoItem(BaseModel):
    id: str
    item: str
    severity: str = "required"  # required, recommended
    specialty_line: str = "general_commercial"
    resolved: bool = False
    status: str = "missing"  # missing, partial, complete
    evidence_summary: Optional[str] = None
    photo_prompt: Optional[str] = None
    reason: Optional[str] = None


class EvidenceArtifactResponse(BaseModel):
    id: int
    artifact_key: str = ""
    submission_id: int
    client_id: int
    broker_id: int
    artifact_type: str
    file_path: str
    raw_text_or_transcript: Optional[Any] = None
    captured_at: datetime
    metadata_json: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("raw_text_or_transcript", mode="before")
    @classmethod
    def parse_raw_transcript(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return {"text": v}
        return v

    @field_validator("metadata_json", mode="before")
    @classmethod
    def parse_metadata_json(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return {}
        return v or {}


class MarketPlacementCreate(BaseModel):
    carrier_name: str
    target_line: str
    status: str = "drafted"
    quoted_premium: Optional[str] = None
    quote_summary_json: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None


class MarketPlacementUpdate(BaseModel):
    carrier_name: Optional[str] = None
    target_line: Optional[str] = None
    status: Optional[str] = None
    quoted_premium: Optional[str] = None
    quote_summary_json: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None


class MarketPlacementResponse(BaseModel):
    id: int
    submission_id: int
    client_id: int
    broker_id: int
    carrier_name: str
    target_line: str
    status: str
    quoted_premium: Optional[str] = None
    quote_summary_json: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("quote_summary_json", mode="before")
    @classmethod
    def parse_quote_summary(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return {}
        return v or {}


class SubmissionCreate(BaseModel):
    client_id: int
    title: str
    specialty_line: str = "general_commercial"
    status: str = "field_capture"
    initial_note: Optional[str] = None


class SubmissionUpdate(BaseModel):
    title: Optional[str] = None
    specialty_line: Optional[str] = None
    status: Optional[str] = None
    structured_risk_profile: Optional[List[CitedUnderwritingField]] = None
    underwriter_narrative: Optional[str] = None
    missing_info_checklist: Optional[List[MissingInfoItem]] = None
    client_followup_draft: Optional[str] = None
    verified: Optional[bool] = None


class SubmissionJobResponse(BaseModel):
    id: str
    submission_id: int
    client_id: int
    broker_id: int
    job_type: str
    status: str
    progress: int
    current_step: str
    receipt: str = "Processing Capture"
    payload_json: Optional[Dict[str, Any]] = None
    result_json: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("payload_json", "result_json", mode="before")
    @classmethod
    def parse_job_json(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return {}
        return v


class SubmissionResponse(BaseModel):
    id: int
    client_id: int
    broker_id: int
    client_name: Optional[str] = None
    title: str
    specialty_line: str
    status: str
    structured_risk_profile: List[CitedUnderwritingField] = []
    underwriter_narrative: Optional[str] = None
    missing_info_checklist: List[MissingInfoItem] = []
    client_followup_draft: Optional[str] = None
    verified_at: Optional[datetime] = None
    verified_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    artifact_count: int = 0
    placement_count: int = 0
    evidence_artifacts: List[EvidenceArtifactResponse] = []
    market_placements: List[MarketPlacementResponse] = []
    latest_job: Optional[SubmissionJobResponse] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("structured_risk_profile", mode="before")
    @classmethod
    def parse_risk_profile(cls, v):
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                return []
        return v or []

    @field_validator("missing_info_checklist", mode="before")
    @classmethod
    def parse_checklist(cls, v):
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                return []
        return v or []
