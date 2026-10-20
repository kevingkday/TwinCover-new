import os
from typing import List
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

    # External AI & Extraction Services
    EXTRACTOR_URL: str = "http://localhost:5005/process"
    EXTRACTOR_TOKEN: str = "micronode-secret-key"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    LLM_MODEL: str = "qwen2.5:7b-instruct"
    EMBED_MODEL: str = "nomic-embed-text"

    # ChromaDB & Upload Storage
    CHROMA_PERSIST_DIRECTORY: str = "./chroma_data"
    UPLOAD_DIR: str = "./uploads"

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "*"
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()

# Ensure directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.CHROMA_PERSIST_DIRECTORY, exist_ok=True)
