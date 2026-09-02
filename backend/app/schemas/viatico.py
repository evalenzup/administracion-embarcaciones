"""
SIAE — Schemas Pydantic para Viáticos.
"""

from datetime import date, datetime
from pydantic import BaseModel, Field
from app.schemas.account import AccountResponse
from app.schemas.financial_category import FinancialCategoryResponse
from app.schemas.project import ProjectResponse
from app.schemas.gasto_reserva_comprobar import UserBasic
from app.schemas.personnel import PersonnelResponse


# ── SCHEMAS DE FACTURA DE VIÁTICO ──
class ViaticoFacturaBase(BaseModel):
    emisor_rfc: str = Field(..., max_length=20)
    emisor_nombre: str = Field(..., max_length=200)
    receptor_rfc: str | None = Field(None, max_length=20)
    receptor_nombre: str | None = Field(None, max_length=200)
    subtotal: float
    iva: float = 0.0
    total: float
    moneda: str = "MXN"
    description: str | None = None
    category_id: int | None = None


class ViaticoFacturaCreate(ViaticoFacturaBase):
    uuid: str | None = None
    folio: str | None = None
    serie: str | None = None
    fecha_emision: datetime | None = None
    is_manual: int | None = 0


class ViaticoFacturaResponse(ViaticoFacturaBase):
    id: int
    viatico_id: int
    uuid: str | None
    folio: str | None
    serie: str | None
    fecha_emision: datetime | None
    xml_filename: str | None
    pdf_filename: str | None
    is_manual: int | None
    registered_by_id: int | None
    created_at: datetime
    updated_at: datetime
    sat_status: str | None = None
    sat_verified_at: datetime | None = None
    category: FinancialCategoryResponse | None = None
    registered_by: UserBasic | None = None

    class Config:
        from_attributes = True


# ── SCHEMAS DE VIÁTICO PRINCIPAL ──
class ViaticoBase(BaseModel):
    folio_comision: str = Field(..., max_length=100)
    fecha_inicio: date
    fecha_fin: date
    destino: str = Field(..., max_length=200)
    justificacion: str
    observaciones: str | None = None
    fecha_solicitud: date | None = None
    monto_solicitado: float
    monto_viaticos: float = 0.0
    monto_pasaje_aereo: float = 0.0
    monto_hospedaje_paquete: float = 0.0
    monto_arrendamiento_vehiculos: float = 0.0
    monto_pasaje_terrestre: float = 0.0
    monto_gasolina: float = 0.0
    personal_id: int | None = None
    account_id: int | None = None
    project_id: int | None = None
    project_name: str | None = None
    asistente_id: int | None = None
    solicitud_pdf_path: str | None = None
    
    # Archivos
    reporte_pdf_path: str | None = None

    # Firmas de solicitud
    firma_solicitante_nombre: str | None = None
    firma_solicitante_fecha: datetime | None = None
    firma_solicitante_hash: str | None = None
    
    firma_jefe_nombre: str | None = None
    firma_jefe_fecha: datetime | None = None
    firma_jefe_hash: str | None = None
    
    firma_revisor_nombre: str | None = None
    firma_revisor_fecha: datetime | None = None
    firma_revisor_hash: str | None = None
    
    firma_tesoreria_nombre: str | None = None
    firma_tesoreria_fecha: datetime | None = None
    firma_tesoreria_hash: str | None = None
    
    firma_responsable_nombre: str | None = None
    firma_responsable_fecha: datetime | None = None
    firma_responsable_hash: str | None = None

    # Firmas de comprobación EPISA
    firma_comp_solicitante_nombre: str | None = None
    firma_comp_solicitante_fecha: datetime | None = None
    firma_comp_solicitante_hash: str | None = None

    firma_comp_revisor_nombre: str | None = None
    firma_comp_revisor_fecha: datetime | None = None
    firma_comp_revisor_hash: str | None = None

    firma_comp_tesoreria_nombre: str | None = None
    firma_comp_tesoreria_fecha: datetime | None = None
    firma_comp_tesoreria_hash: str | None = None

    firma_comp_contabilidad_nombre: str | None = None
    firma_comp_contabilidad_fecha: datetime | None = None
    firma_comp_contabilidad_hash: str | None = None


class ViaticoCreate(ViaticoBase):
    pass


class ViaticoUpdate(BaseModel):
    folio_comision: str | None = Field(None, max_length=100)
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    destino: str | None = Field(None, max_length=200)
    justificacion: str | None = None
    observaciones: str | None = None
    monto_solicitado: float | None = None
    monto_viaticos: float | None = None
    monto_pasaje_aereo: float | None = None
    monto_hospedaje_paquete: float | None = None
    monto_arrendamiento_vehiculos: float | None = None
    monto_pasaje_terrestre: float | None = None
    monto_gasolina: float | None = None
    monto_comprobado: float | None = None
    monto_devuelto: float | None = None
    monto_saldo_favor: float | None = None
    status: str | None = None
    account_id: int | None = None
    project_id: int | None = None
    project_name: str | None = None
    comprobante_devolucion_path: str | None = None
    reporte_pdf_path: str | None = None
    personal_id: int | None = None
    fecha_solicitud: date | None = None
    asistente_id: int | None = None
    solicitud_pdf_path: str | None = None
    comprobacion_pdf_path: str | None = None
    
    # Firmas
    firma_solicitante_nombre: str | None = None
    firma_solicitante_fecha: datetime | None = None
    firma_solicitante_hash: str | None = None
    
    firma_jefe_nombre: str | None = None
    firma_jefe_fecha: datetime | None = None
    firma_jefe_hash: str | None = None
    
    firma_revisor_nombre: str | None = None
    firma_revisor_fecha: datetime | None = None
    firma_revisor_hash: str | None = None
    
    firma_tesoreria_nombre: str | None = None
    firma_tesoreria_fecha: datetime | None = None
    firma_tesoreria_hash: str | None = None
    
    firma_responsable_nombre: str | None = None
    firma_responsable_fecha: datetime | None = None
    firma_responsable_hash: str | None = None

    # Firmas de comprobación EPISA
    firma_comp_solicitante_nombre: str | None = None
    firma_comp_solicitante_fecha: datetime | None = None
    firma_comp_solicitante_hash: str | None = None

    firma_comp_revisor_nombre: str | None = None
    firma_comp_revisor_fecha: datetime | None = None
    firma_comp_revisor_hash: str | None = None

    firma_comp_tesoreria_nombre: str | None = None
    firma_comp_tesoreria_fecha: datetime | None = None
    firma_comp_tesoreria_hash: str | None = None

    firma_comp_contabilidad_nombre: str | None = None
    firma_comp_contabilidad_fecha: datetime | None = None
    firma_comp_contabilidad_hash: str | None = None


class ViaticoResponse(ViaticoBase):
    id: int
    personal_id: int | None = None
    fecha_solicitud: date | None = None
    monto_comprobado: float = 0.0
    monto_devuelto: float = 0.0
    monto_saldo_favor: float = 0.0
    status: str
    solicitud_pdf_path: str | None = None
    comprobacion_pdf_path: str | None = None
    comprobante_devolucion_path: str | None = None
    reporte_pdf_path: str | None = None
    created_at: datetime
    updated_at: datetime
    
    # Relaciones
    personal: PersonnelResponse | None = None
    asistente: UserBasic | None = None
    account: AccountResponse | None = None
    project: ProjectResponse | None = None
    facturas: list[ViaticoFacturaResponse] = []
    
    # Bot / UI grouping helper fields
    is_mine: bool = False
    is_asistente: bool = False

    class Config:
        from_attributes = True


class ViaticoList(BaseModel):
    total: int
    items: list[ViaticoResponse]


class ViaticoStatsResponse(BaseModel):
    total_count: int
    by_status: dict[str, int]
