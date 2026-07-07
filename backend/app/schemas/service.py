"""
SIAE — Schemas Pydantic para Solicitudes de Servicios de Terceros.
"""

from datetime import datetime
from pydantic import BaseModel, Field
from app.schemas.provider import ProviderResponse


# ── HISTORIAL DE ETAPAS ──
class ServiceStageHistoryResponse(BaseModel):
    id: int
    stage: str
    entered_at: datetime
    notes: str | None = None
    user_id: int | None = None
    user_name: str | None = None

    model_config = {"from_attributes": True}


class ServiceStageHistoryUpdate(BaseModel):
    entered_at: datetime
    notes: str | None = None


# ── OBSERVACIONES DE LA BITÁCORA ──
class ServiceObservationResponse(BaseModel):
    id: int
    notes: str
    attachment_file: str | None = None
    created_at: datetime
    user_id: int | None = None
    user_name: str | None = None

    model_config = {"from_attributes": True}


class ServiceObservationCreate(BaseModel):
    notes: str = Field(..., min_length=2)
    created_at: datetime | None = None


# ── SOLICITUDES DE SERVICIOS ──
class ServiceRequestBase(BaseModel):
    provider_name: str | None = Field(None, max_length=200)
    provider_id: int | None = None
    description: str = Field(..., min_length=2)
    episa_folio: str = Field(..., min_length=1, max_length=100)
    budget_amount: float = Field(..., gt=0)


class ServiceRequestCreate(ServiceRequestBase):
    pass


class ServiceRequestUpdate(BaseModel):
    provider_name: str | None = Field(None, max_length=200)
    provider_id: int | None = None
    description: str | None = None
    episa_folio: str | None = None
    budget_amount: float | None = Field(None, gt=0)


class ServiceRequestResponse(ServiceRequestBase):
    id: int
    internal_folio: str
    status: str
    authorization_folio: str | None = None
    
    budget_file: str | None = None
    authorization_email_file: str | None = None
    invoice_xml_file: str | None = None
    invoice_pdf_file: str | None = None
    conformity_letter_file: str | None = None
    payment_receipt_file: str | None = None
    
    created_by_id: int | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime
    
    history: list[ServiceStageHistoryResponse] = []
    observations: list[ServiceObservationResponse] = []
    stage_durations: dict[str, str] = {}  # Calculado dinámicamente
    provider: ProviderResponse | None = None

    model_config = {"from_attributes": True}
