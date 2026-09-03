"""
SIAE — Schemas Pydantic para Gastos a Reserva de Comprobar (GRC).
"""

from datetime import date, datetime
from pydantic import BaseModel, Field
from app.schemas.account import AccountResponse
from app.schemas.financial_category import FinancialCategoryResponse
from app.schemas.project import ProjectResponse


class UserBasic(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    email: str | None = None

    class Config:
        from_attributes = True



# ── SCHEMAS DE FACTURA DE GRC ──
class GastoReservaComprobarFacturaBase(BaseModel):
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


class GastoReservaComprobarFacturaCreate(GastoReservaComprobarFacturaBase):
    uuid: str | None = None
    folio: str | None = None
    serie: str | None = None
    fecha_emision: datetime | None = None
    is_manual: int | None = 0


class GastoReservaComprobarFacturaResponse(GastoReservaComprobarFacturaBase):
    id: int
    gasto_id: int
    uuid: str | None
    folio: str | None
    serie: str | None
    fecha_emision: datetime | None
    xml_filename: str | None
    pdf_filename: str | None
    ticket_filename: str | None = None
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


# ── SCHEMAS DE PARTIDAS DE GRC ──
class GastoReservaComprobarItemBase(BaseModel):
    concepto: str
    partida: str
    cucop: str | None = None
    rubro_conacyt: str | None = None
    subtotal: float

class GastoReservaComprobarItemCreate(GastoReservaComprobarItemBase):
    pass

class GastoReservaComprobarItemResponse(GastoReservaComprobarItemBase):
    id: int
    gasto_id: int

    class Config:
        from_attributes = True


# ── SCHEMAS DE GRC PRINCIPAL ──
class GastoReservaComprobarBase(BaseModel):
    folio_episa: str = Field(..., max_length=100)
    fecha_pago_servicio: date | None = None
    justificacion: str
    observaciones: str | None = None
    monto_solicitado: float
    account_id: int | None = None
    category_id: int | None = None
    project_id: int | None = None
    project_name: str | None = None
    asistente_id: int | None = None
    solicitante_id: int | None = None
    items: list[GastoReservaComprobarItemCreate] = []
    solicitud_pdf_path: str | None = None
    comprobacion_pdf_path: str | None = None
    
    # Firmas
    firma_solicitante_nombre: str | None = None
    firma_solicitante_fecha: datetime | None = None
    firma_solicitante_hash: str | None = None
    
    firma_revisor_nombre: str | None = None
    firma_revisor_fecha: datetime | None = None
    firma_revisor_hash: str | None = None
    
    firma_jefe_nombre: str | None = None
    firma_jefe_fecha: datetime | None = None
    firma_jefe_hash: str | None = None
    
    firma_adquisiciones_nombre: str | None = None
    firma_adquisiciones_fecha: datetime | None = None
    firma_adquisiciones_hash: str | None = None
    
    firma_director_nombre: str | None = None
    firma_director_fecha: datetime | None = None
    firma_director_hash: str | None = None
    
    firma_tesoreria_nombre: str | None = None
    firma_tesoreria_fecha: datetime | None = None
    firma_tesoreria_hash: str | None = None
    
    firma_contabilidad_nombre: str | None = None
    firma_contabilidad_fecha: datetime | None = None
    firma_contabilidad_hash: str | None = None


class GastoReservaComprobarCreate(GastoReservaComprobarBase):
    pass


class GastoReservaComprobarUpdate(BaseModel):
    folio_episa: str | None = Field(None, max_length=100)
    fecha_pago_servicio: date | None = None
    justificacion: str | None = None
    observaciones: str | None = None
    monto_solicitado: float | None = None
    monto_comprobado: float | None = None
    monto_devuelto: float | None = None
    monto_saldo_favor: float | None = None
    status: str | None = None
    account_id: int | None = None
    category_id: int | None = None
    project_id: int | None = None
    project_name: str | None = None
    asistente_id: int | None = None
    solicitante_id: int | None = None
    comprobante_devolucion_path: str | None = None
    items: list[GastoReservaComprobarItemCreate] | None = None
    solicitud_pdf_path: str | None = None
    comprobacion_pdf_path: str | None = None
    
    # Firmas
    firma_solicitante_nombre: str | None = None
    firma_solicitante_fecha: datetime | None = None
    firma_solicitante_hash: str | None = None
    
    firma_revisor_nombre: str | None = None
    firma_revisor_fecha: datetime | None = None
    firma_revisor_hash: str | None = None
    
    firma_jefe_nombre: str | None = None
    firma_jefe_fecha: datetime | None = None
    firma_jefe_hash: str | None = None
    
    firma_adquisiciones_nombre: str | None = None
    firma_adquisiciones_fecha: datetime | None = None
    firma_adquisiciones_hash: str | None = None
    
    firma_director_nombre: str | None = None
    firma_director_fecha: datetime | None = None
    firma_director_hash: str | None = None
    
    firma_tesoreria_nombre: str | None = None
    firma_tesoreria_fecha: datetime | None = None
    firma_tesoreria_hash: str | None = None
    
    firma_contabilidad_nombre: str | None = None
    firma_contabilidad_fecha: datetime | None = None
    firma_contabilidad_hash: str | None = None


class GastoReservaComprobarResponse(GastoReservaComprobarBase):
    id: int
    solicitante_id: int | None
    fecha_solicitud: date
    monto_comprobado: float
    monto_devuelto: float
    monto_saldo_favor: float
    status: str
    solicitud_pdf_path: str | None
    comprobacion_pdf_path: str | None
    comprobante_devolucion_path: str | None
    
    # Signatures
    firma_solicitante_nombre: str | None
    firma_solicitante_fecha: datetime | None
    firma_revisor_nombre: str | None
    firma_revisor_fecha: datetime | None
    firma_jefe_nombre: str | None
    firma_jefe_fecha: datetime | None
    firma_adquisiciones_nombre: str | None
    firma_adquisiciones_fecha: datetime | None
    firma_director_nombre: str | None
    firma_director_fecha: datetime | None
    firma_tesoreria_nombre: str | None
    firma_tesoreria_fecha: datetime | None
    firma_contabilidad_nombre: str | None
    firma_contabilidad_fecha: datetime | None
    
    # Hashes de firmas
    firma_solicitante_hash: str | None = None
    firma_revisor_hash: str | None = None
    firma_jefe_hash: str | None = None
    firma_adquisiciones_hash: str | None = None
    firma_director_hash: str | None = None
    firma_tesoreria_hash: str | None = None
    firma_contabilidad_hash: str | None = None

    # Tiempos de proceso
    tiempo_revisor_horas: float | None
    tiempo_jefe_horas: float | None
    tiempo_director_horas: float | None
    tiempo_tesoreria_horas: float | None
    tiempo_contabilidad_horas: float | None
    tiempo_total_dias: float | None

    created_at: datetime
    updated_at: datetime
    
    # Relaciones
    solicitante: UserBasic | None = None
    asistente: UserBasic | None = None
    account: AccountResponse | None = None
    category: FinancialCategoryResponse | None = None
    project: ProjectResponse | None = None
    facturas: list[GastoReservaComprobarFacturaResponse] = []
    items: list[GastoReservaComprobarItemResponse] = []
    
    # Bot / UI grouping helper fields
    is_mine: bool = False
    is_asistente: bool = False

    class Config:
        from_attributes = True


class GastoReservaComprobarList(BaseModel):
    total: int
    items: list[GastoReservaComprobarResponse]


class GRCStatsResponse(BaseModel):
    total_count: int
    by_status: dict[str, int]
    avg_revisor_hours: float | None
    avg_jefe_hours: float | None
    avg_director_hours: float | None
    avg_tesoreria_hours: float | None
    avg_contabilidad_hours: float | None
    avg_total_days: float | None
