"""Highlighting, annotations, and extraction endpoints."""

from fastapi import APIRouter

router = APIRouter()


@router.post("/{document_id}/annotations")
async def create_annotation(document_id: str):
    """Add a highlight, note, or bookmark to a document."""
    return {"status": "not_implemented"}


@router.delete("/{document_id}/annotations/{annotation_id}")
async def delete_annotation(document_id: str, annotation_id: str):
    """Remove an annotation."""
    return {"status": "not_implemented"}


@router.post("/{document_id}/extract")
async def extract_highlights(document_id: str):
    """Extract highlights to study guide, column notes, or vocabulary list."""
    return {"status": "not_implemented"}


@router.get("/{document_id}/export")
async def export_document(document_id: str):
    """Export document with annotations to PDF, DOCX, or TXT."""
    return {"status": "not_implemented"}
