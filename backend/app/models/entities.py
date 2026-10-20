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


class Policy(Base):
    __tablename__ = "policies"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False, default=0)
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
