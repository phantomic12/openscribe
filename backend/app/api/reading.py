"""TTS playback and reading state endpoints."""

import base64
import json
import subprocess
import tempfile
import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_session
from app.models.models import Document, ReadingState

router = APIRouter()


class ReadingStateUpdate(BaseModel):
    current_page: int = 0
    current_word_index: int = 0
    voice: str = "en-US-JennyNeural"
    speed: float = 1.0
    chunk_size: str = "sentence"
    mode: str = "read"


class TTSPreviewRequest(BaseModel):
    text: str
    voice: str = "en-US-JennyNeural"
    speed: float = 1.0


def _get_default_reading_state(document_id: str) -> dict:
    return {
        "document_id": document_id,
        "current_page": 0,
        "current_word_index": 0,
        "voice": "en-US-JennyNeural",
        "speed": 1.0,
        "chunk_size": "sentence",
        "mode": "read",
    }


@router.get("/{document_id}/state")
async def get_reading_state(
    document_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get saved reading position and preferences."""
    result = await session.execute(
        select(ReadingState).where(ReadingState.document_id == document_id)
    )
    state = result.scalar_one_or_none()

    if not state:
        return _get_default_reading_state(document_id)

    return {
        "document_id": state.document_id,
        "current_page": state.current_page,
        "current_word_index": state.current_word_index,
        "voice": state.voice,
        "speed": state.speed,
        "chunk_size": state.chunk_size,
        "mode": state.mode,
    }


@router.put("/{document_id}/state")
async def save_reading_state(
    document_id: str,
    body: ReadingStateUpdate,
    session: AsyncSession = Depends(get_session),
):
    """Save reading position and preferences."""
    # Verify document exists
    result = await session.execute(
        select(Document).where(Document.id == document_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Document not found")

    result = await session.execute(
        select(ReadingState).where(ReadingState.document_id == document_id)
    )
    state = result.scalar_one_or_none()

    if state:
        state.current_page = body.current_page
        state.current_word_index = body.current_word_index
        state.voice = body.voice
        state.speed = body.speed
        state.chunk_size = body.chunk_size
        state.mode = body.mode
    else:
        state = ReadingState(
            document_id=document_id,
            current_page=body.current_page,
            current_word_index=body.current_word_index,
            voice=body.voice,
            speed=body.speed,
            chunk_size=body.chunk_size,
            mode=body.mode,
        )
        session.add(state)

    await session.commit()

    return {
        "document_id": state.document_id,
        "current_page": state.current_page,
        "current_word_index": state.current_word_index,
        "voice": state.voice,
        "speed": state.speed,
        "chunk_size": state.chunk_size,
        "mode": state.mode,
    }


@router.post("/tts/preview")
async def preview_tts(body: TTSPreviewRequest):
    """Generate a TTS audio preview for a text snippet using edge-tts."""
    if not body.text.strip():
        raise HTTPException(400, "Text must not be empty")

    speed_str = _edge_tts_rate(body.speed)

    try:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name

        cmd = [
            "edge-tts",
            "--voice", body.voice,
            "--text", body.text,
            "--rate", speed_str,
            "--write-media", tmp_path,
        ]
        subprocess.run(cmd, capture_output=True, text=True, timeout=30)

        if os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 0:
            with open(tmp_path, "rb") as f:
                audio_bytes = f.read()
            os.unlink(tmp_path)
            return {
                "audio_base64": base64.b64encode(audio_bytes).decode("utf-8"),
                "format": "mp3",
                "voice": body.voice,
                "speed": body.speed,
            }
        else:
            # edge-tts not available — return stub
            return _tts_stub(body)

    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        return _tts_stub(body)


def _edge_tts_rate(speed: float) -> str:
    """Convert speed multiplier to edge-tts rate string."""
    if speed <= 0:
        speed = 1.0
    delta = int((speed - 1.0) * 100)
    if delta >= 0:
        return f"+{delta}%"
    return f"{delta}%"


def _tts_stub(body: TTSPreviewRequest) -> dict:
    """Return a stub response when TTS is unavailable."""
    # Generate a tiny silent/empty response
    return {
        "audio_base64": "",
        "format": "mp3",
        "voice": body.voice,
        "speed": body.speed,
        "note": "edge-tts not available — install with: pip install edge-tts",
    }
