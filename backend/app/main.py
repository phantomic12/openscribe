"""OpenScribe — Self-hosted literacy platform."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import documents, reading, study, writing
from app.models.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="OpenScribe",
    version="0.1.0",
    description="Self-hosted literacy platform — reading, study, and writing tools.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(reading.router, prefix="/api/reading", tags=["reading"])
app.include_router(study.router, prefix="/api/study", tags=["study"])
app.include_router(writing.router, prefix="/api/writing", tags=["writing"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
