"""
SIAE — Schemas Pydantic para PettyCashInvoice (Facturas y Gastos de Fondo Fijo).
Soporta cargas XML y registros manuales sin XML.
"""

from datetime import datetime
from pydantic import BaseModel, Field
from app.models.petty_cash_invoice import InvoiceStatus
from app.schemas.financial_category import FinancialCategoryResponse


class PettyCashInvoiceBase(BaseModel):
    uuid: str | None = Field(None, max_length=100)
    folio: str | None = Field(None, max_length=50)
    serie: str | None = Field(None, max_length=50)
    
    emisor_rfc: str = Field(..., max_length=20)
    emisor_nombre: str = Field(..., max_length=200)
    emisor_regimen_fiscal: str | None = Field(None, max_length=20)
    
    receptor_rfc: str | None = Field(None, max_length=20)
    receptor_nombre: str | None = Field(None, max_length=200)
    receptor_regimen_fiscal: str | None = Field(None, max_length=20)
    receptor_cp: str | None = Field(None, max_length=10)
    
    subtotal: float = Field(..., ge=0.0)
    iva: float = Field(default=0.0, ge=0.0)
    total: float = Field(..., ge=0.0)
    moneda: str = Field(default="MXN", max_length=10)
    
    metodo_pago: str | None = Field(None, max_length=10)
    forma_pago: str | None = Field(None, max_length=10)
    uso_cfdi: str | None = Field(None, max_length=10)
    fecha_emision: datetime | None = None
    fecha_timbrado: datetime | None = None


class PettyCashInvoiceCreate(PettyCashInvoiceBase):
    """Crear un registro de factura amparada por XML."""
    xml_filename: str | None = Field(None, max_length=300)
    pdf_filename: str | None = Field(None, max_length=300)
    category_id: int
    description: str | None = None
    is_manual: bool = False


class PettyCashInvoiceManualCreate(BaseModel):
    """Registrar un gasto manualmente sin XML inicial."""
    fecha_emision: datetime
    emisor_nombre: str = Field(..., min_length=2, max_length=200)
    emisor_rfc: str = Field(..., min_length=12, max_length=13)
    total: float = Field(..., gt=0.0)
    subtotal: float | None = Field(None, ge=0.0)
    iva: float | None = Field(None, ge=0.0)
    category_id: int
    description: str = Field(..., min_length=3)


class PettyCashInvoiceUpdate(BaseModel):
    """Actualizar la clasificación de una factura."""
    category_id: int | None = None
    description: str | None = None


class XMLValidationResult(PettyCashInvoiceBase):
    """Resultado del parseo y validación de XML."""
    is_valid: bool
    errors: list[str] = []


class UserBasicResponse(BaseModel):
    """Información simplificada de usuario."""
    id: int
    username: str
    full_name: str

    model_config = {"from_attributes": True}


class PettyCashInvoiceResponse(PettyCashInvoiceBase):
    """Respuesta detallada de factura o gasto."""
    id: int
    xml_filename: str | None
    pdf_filename: str | None
    is_manual: bool
    category_id: int
    category: FinancialCategoryResponse | None = None
    description: str | None
    status: InvoiceStatus
    reimbursement_id: int | None
    registered_by_id: int | None
    registered_by: UserBasicResponse | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PettyCashInvoiceList(BaseModel):
    """Lista de facturas con filtros."""
    total: int
    items: list[PettyCashInvoiceResponse]
