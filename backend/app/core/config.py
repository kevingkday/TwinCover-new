import os
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "TwinCover"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"

    # Database
    DATABASE_URL: str = "sqlite:///./twincover.db"

    # Security
    SECRET_KEY: str = "twincover-production-secret-key-super-secure-change-in-prod-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Google OAuth
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None

    # External AI & Extraction Services (100% Local Sovereign Node)
    # Consolidated onto single multimodal model (qwen2.5vl:7b) to prevent VRAM model-swapping on 16GB RTX 5080
    EXTRACTOR_URL: str = "http://127.0.0.1:5005/process"
    EXTRACTOR_TOKEN: str = "micronode-secret-key"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    LLM_MODEL: str = "qwen2.5vl:7b"
    VISION_MODEL: str = "qwen2.5vl:7b"
    EMBED_MODEL: str = "nomic-embed-text"

    # Local Audio Transcription (faster-whisper)
    WHISPER_MODEL: str = "large-v3-turbo"
    WHISPER_DEVICE: str = "auto"
    WHISPER_COMPUTE_TYPE: str = "int8"

    # Cloudflare Zero Trust Access (Service Token for remote/tunneled Ollama & Extractor)
    CF_ACCESS_CLIENT_ID: Optional[str] = None
    CF_ACCESS_CLIENT_SECRET: Optional[str] = None

    # ChromaDB & Upload Storage
    CHROMA_PERSIST_DIRECTORY: str = "./chroma_data"
    UPLOAD_DIR: str = "./uploads"
    EVIDENCE_VAULT_DIR: str = "./uploads/evidence_vault"

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "*"
    ]

    model_config = SettingsConfigDict(
        env_file=(
            os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env")),
            ".env",
        ),
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()

# Ensure directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.EVIDENCE_VAULT_DIR, exist_ok=True)
os.makedirs(settings.CHROMA_PERSIST_DIRECTORY, exist_ok=True)
