from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False, default="")
    agency_name = Column(String(255), nullable=False, default="TwinCover Commercial Advisors")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    clients = relationship("Client", back_populates="user", cascade="all, delete-orphan")
    letter_templates = relationship("LetterTemplate", back_populates="user")
    submissions = relationship(
        "Submission",
        back_populates="broker",
        foreign_keys="Submission.broker_id",
        cascade="all, delete-orphan"
    )


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    account_number = Column(String(100), nullable=False, index=True)
    primary_contact = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="clients")
    policies = relationship("Policy", back_populates="client", cascade="all, delete-orphan")
    generated_letters = relationship("GeneratedLetter", back_populates="client", cascade="all, delete-orphan")
    submissions = relationship("Submission", back_populates="client", cascade="all, delete-orphan")


class Policy(Base):
    __tablename__ = "policies"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False, default=0)
    document_type = Column(String(50), nullable=False, default="policy")  # policy, binder, certificate, endorsement, quote, other
    classification_confidence = Column(String(50), nullable=True)
    classification_engine = Column(String(100), nullable=True)
    raw_text = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="uploaded")  # uploaded, extracted, verified
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    client = relationship("Client", back_populates="policies")
    extracted_fields = relationship("ExtractedFields", back_populates="policy", uselist=False, cascade="all, delete-orphan")
    generated_letters = relationship("GeneratedLetter", back_populates="policy")


class ExtractedFields(Base):
    __tablename__ = "extracted_fields"

    id = Column(Integer, primary_key=True, index=True)
    policy_id = Column(Integer, ForeignKey("policies.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    insured_name = Column(String(255), nullable=True)
    policy_number = Column(String(100), nullable=True)
    insurer = Column(String(255), nullable=True)
    effective_date = Column(String(50), nullable=True)
    expiry_date = Column(String(50), nullable=True)
    cgl_limit = Column(String(100), nullable=True)
    property_limit = Column(String(100), nullable=True)
    cyber_limit = Column(String(100), nullable=True)
    cyber_deductible = Column(String(100), nullable=True)
    total_premium = Column(String(100), nullable=True)
    coverages = Column(Text, nullable=True)
    raw_json = Column(Text, nullable=True)
    verified = Column(Boolean, default=False, nullable=False)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    verified_by_user_id = Column(Integer, nullable=True)

    policy = relationship("Policy", back_populates="extracted_fields")


class LetterTemplate(Base):
    __tablename__ = "letter_templates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=False, default="Renewal")
    content = Column(Text, nullable=False)
    template_type = Column(String(50), nullable=False, default="markdown")
    file_path = Column(String(500), nullable=True)
    original_filename = Column(String(255), nullable=True)
    is_system = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="letter_templates")
    generated_letters = relationship("GeneratedLetter", back_populates="template")


class GeneratedLetter(Base):
    __tablename__ = "generated_letters"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    policy_id = Column(Integer, ForeignKey("policies.id", ondelete="SET NULL"), nullable=True, index=True)
    template_id = Column(Integer, ForeignKey("letter_templates.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    client = relationship("Client", back_populates="generated_letters")
    policy = relationship("Policy", back_populates="generated_letters")
    template = relationship("LetterTemplate", back_populates="generated_letters")


# ==============================================================================
# Phase 1: Pre-Bind "Field-to-Underwriter" Producer Copilot Entities
# ==============================================================================

class Submission(Base):
    """
    Deal & Submission Pipeline (`submissions`).
    Tracks pre-bind commercial insurance deals across stages:
    field_capture -> drafted -> submitted -> underwriter_review -> quote_received -> subjectivities -> bound
    """
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    broker_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False, index=True)
    specialty_line = Column(
        String(100),
        nullable=False,
        default="general_commercial",
        index=True
    )  # construction, cyber_ai, marine, environmental, general_commercial
    status = Column(
        String(50),
        nullable=False,
        default="field_capture",
        index=True
    )  # field_capture, drafted, submitted, underwriter_review, quote_received, subjectivities, bound
    structured_risk_profile = Column(Text, nullable=True)  # JSON array of source-cited underwriting fields
    underwriter_narrative = Column(Text, nullable=True)    # Markdown pre-bind submission narrative
    missing_info_checklist = Column(Text, nullable=True)   # JSON array of missing underwriting items
    client_followup_draft = Column(Text, nullable=True)    # Ready-to-send client follow-up email/text
    verified_at = Column(DateTime(timezone=True), nullable=True)
    verified_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    client = relationship("Client", back_populates="submissions")
    broker = relationship("User", back_populates="submissions", foreign_keys=[broker_id])
    verifier = relationship("User", foreign_keys=[verified_by])
    evidence_artifacts = relationship(
        "EvidenceArtifact",
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="EvidenceArtifact.captured_at.asc()"
    )
    market_placements = relationship(
        "MarketPlacement",
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="MarketPlacement.updated_at.desc()"
    )
    jobs = relationship(
        "SubmissionJob",
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="SubmissionJob.created_at.desc()"
    )


class EvidenceArtifact(Base):
    """
    Immutable E&O Raw Evidence Vault (`evidence_artifacts`).
    Stores original uploaded site photos, voice recordings, expiring policy PDFs,
    SOVs/loss runs, and quick-paste text notes immutably (never overwritten or deleted after AI extraction).
    """
    __tablename__ = "evidence_artifacts"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    broker_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    artifact_type = Column(
        String(50),
        nullable=False,
        index=True
    )  # photo, audio, pdf, spreadsheet, text_note
    file_path = Column(String(500), nullable=False)
    raw_text_or_transcript = Column(Text, nullable=True)  # JSON with timestamps / page numbers / vision observations
    captured_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    metadata_json = Column(Text, nullable=True)  # JSON with original_filename, file_size, sha256_hash, is_immutable: true

    submission = relationship("Submission", back_populates="evidence_artifacts")


class MarketPlacement(Base):
    """
    Carrier Placement Matrix (`market_placements`).
    Tracks target insurers/MGAs per pre-bind submission.
    """
    __tablename__ = "market_placements"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    broker_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    carrier_name = Column(String(255), nullable=False)
    target_line = Column(String(100), nullable=False)
    status = Column(
        String(50),
        nullable=False,
        default="drafted"
    )  # drafted, submitted, underwriter_review, quote_received, declined, subjectivities, bound
    quoted_premium = Column(String(100), nullable=True)
    quote_summary_json = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    submission = relationship("Submission", back_populates="market_placements")


class SubmissionJob(Base):
    """
    SQLite-backed Asynchronous Background Job Queue (`submission_jobs`).
    Allows multi-photo + voice memo + PDF captures to return an instant 'Processing Capture'
    receipt while background extraction runs and updates status for polling via GET /api/jobs/{job_id}.
    """
    __tablename__ = "submission_jobs"

    id = Column(String(64), primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    broker_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    job_type = Column(String(50), nullable=False, default="capture_ingestion")
    status = Column(String(50), nullable=False, default="queued", index=True)  # queued, processing, completed, failed
    progress = Column(Integer, nullable=False, default=0)
    current_step = Column(String(255), nullable=False, default="Processing Capture")
    payload_json = Column(Text, nullable=True)
    result_json = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    submission = relationship("Submission", back_populates="jobs")
