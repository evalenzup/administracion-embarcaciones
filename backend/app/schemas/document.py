"""
SIAE — Schemas Pydantic para Document (Documentación).
"""

from datetime import date, datetime
from pydantic import BaseModel, Field
from app.models.document import DocumentCategory


class DocumentCreate(BaseModel):
    """Crear un nuevo documento."""
    vessel_id: int
    title: str = Field(..., min_length=2, max_length=200)
    category: DocumentCategory = DocumentCategory.OTRO
    document_number: str | None = Field(None, max_length=100)
    issuing_authority: str | None = Field(None, max_length=200)
    description: str | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    is_permanent: bool = False
    notes: str | None = None


class DocumentUpdate(BaseModel):
    """Actualizar un documento existente."""
    title: str | None = Field(None, min_length=2, max_length=200)
    category: DocumentCategory | None = None
    document_number: str | None = None
    issuing_authority: str | None = None
    description: str | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    is_permanent: bool | None = None
    notes: str | None = None
    is_active: bool | None = None


class VesselBasicInDoc(BaseModel):
    """Embarcación básica para incluir en documentos."""
    id: int
    name: str
    model_config = {"from_attributes": True}


class DocumentResponse(BaseModel):
    """Respuesta de documento."""
    id: int
    vessel_id: int
    title: str
    category: DocumentCategory
    document_number: str | None = None
    issuing_authority: str | None = None
    description: str | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    is_permanent: bool
    file_name: str | None = None
    file_path: str | None = None
    file_size_bytes: int | None = None
    file_type: str | None = None
    is_active: bool
    notes: str | None = None
    vigency_status: str
    days_to_expiry: int | None = None
    vessel: VesselBasicInDoc
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentList(BaseModel):
    """Lista paginada de documentos."""
    total: int
    items: list[DocumentResponse]
