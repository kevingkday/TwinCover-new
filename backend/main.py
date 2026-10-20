import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.init_db import init_db
from app.api.auth import router as auth_router
from app.api.clients import router as clients_router
from app.api.policies import router as policies_router
from app.api.letters import router as letters_router
from app.api.rag import router as rag_router
from app.api.system import router as system_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("twincover")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle events."""
    logger.info("Initializing TwinCover backend & database schema...")
    init_db()
    logger.info("TwinCover backend ready.")
    yield
    logger.info("TwinCover backend shutting down.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Vertical software for commercial insurance brokers: Policy ingestion, field verification, RAG Q&A, and client letter generation.",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(clients_router, prefix=settings.API_V1_STR)
app.include_router(policies_router, prefix=settings.API_V1_STR)
app.include_router(letters_router, prefix=settings.API_V1_STR)
app.include_router(rag_router, prefix=settings.API_V1_STR)
app.include_router(system_router, prefix=settings.API_V1_STR)


@app.get("/")
def root():
    return {
        "service": "TwinCover API",
        "version": settings.VERSION,
        "status": "online",
        "docs_url": "/docs"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
