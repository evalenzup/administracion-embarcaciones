"""
SIAE — Schemas Pydantic para PettyCashReimbursement (Reposiciones de Fondo Fijo).
"""

from datetime import datetime
from pydantic import BaseModel, Field
from app.models.petty_cash_reimbursement import ReimbursementStatus
from app.schemas.petty_cash_invoice import PettyCashInvoiceResponse, UserBasicResponse


class ReimbursementCreate(BaseModel):
    """Crear una solicitud de reposición."""
    invoice_ids: list[int] = Field(..., min_length=1)
    notes: str | None = Field(None, max_length=500)


class ReimbursementUpdate(BaseModel):
    """Actualizar datos o notas de la reposición."""
    notes: str | None = Field(None, max_length=500)


class ReimbursementStatusUpdate(BaseModel):
    """Cambiar el estado de la reposición."""
    status: ReimbursementStatus


class ReimbursementResponse(BaseModel):
    """Respuesta detallada de reposición."""
    id: int
    folio: str
    total_amount: float
    invoice_count: int
    status: ReimbursementStatus
    scan_filename: str | None
    submitted_date: datetime | None
    approved_date: datetime | None
    paid_date: datetime | None
    notes: str | None
    created_by_id: int | None
    created_by: UserBasicResponse | None = None
    created_at: datetime
    updated_at: datetime
    invoices: list[PettyCashInvoiceResponse] = []

    model_config = {"from_attributes": True}


class ReimbursementList(BaseModel):
    """Lista de reposiciones."""
    total: int
    items: list[ReimbursementResponse]
