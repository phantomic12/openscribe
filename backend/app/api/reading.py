"""TTS playback and reading state endpoints."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/{document_id}/state")
async def get_reading_state(document_id: str):
    """Get saved reading position and preferences."""
    return {"status": "not_implemented", "document_id": document_id}


@router.put("/{document_id}/state")
async def save_reading_state(document_id: str):
    """Save reading position and preferences."""
    return {"status": "not_implemented"}


@router.post("/tts/preview")
async def preview_tts():
    """Generate a TTS audio preview for a text snippet."""
    return {"status": "not_implemented"}
