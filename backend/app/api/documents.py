"""Document import, OCR, and management endpoints."""

from fastapi import APIRouter

router = APIRouter()


@router.post("/upload")
async def upload_document():
    """Upload a document for OCR processing."""
    return {"status": "not_implemented", "message": "Document upload endpoint — Phase 1"}


@router.get("/{document_id}")
async def get_document(document_id: str):
    """Get document metadata and pages."""
    return {"status": "not_implemented", "document_id": document_id}


@router.get("/{document_id}/pages/{page_index}")
async def get_page(document_id: str, page_index: int):
    """Get a specific page with OCR data, image, and annotations."""
    return {"status": "not_implemented", "document_id": document_id, "page": page_index}


@router.get("/")
async def list_documents():
    """List all documents in the library."""
    return {"status": "not_implemented", "documents": []}
