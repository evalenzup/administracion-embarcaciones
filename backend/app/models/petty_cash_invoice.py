"""
SIAE — Modelo PettyCashInvoice (Facturas y Gastos de Fondo Fijo).
Soporta carga de XMLs timbrados y gastos manuales pendientes de comprobante.
"""

import enum
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Boolean, Enum as SAEnum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class InvoiceStatus(str, enum.Enum):
    """Estados del proceso de facturas del fondo fijo."""
    PENDIENTE = "pendiente"           # Registrada en el sistema, no asociada a ninguna reposición
    EN_REPOSICION = "en_reposicion"   # Asociada a una reposición en proceso o aprobada
    REPUESTA = "repuesta"             # Asociada a una reposición ya pagada (dinero devuelto)


class PettyCashInvoice(Base):
    """Factura o gasto registrado en el fondo fijo."""

    __tablename__ = "petty_cash_invoices"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(100), unique=True, nullable=True, index=True) # UUID fiscal (puede ser NULL para manuales)
    folio = Column(String(50), nullable=True)
    serie = Column(String(50), nullable=True)
    
    # Emisor (Proveedor)
    emisor_rfc = Column(String(20), nullable=False, index=True)
    emisor_nombre = Column(String(200), nullable=False)
    emisor_regimen_fiscal = Column(String(20), nullable=True)
    
    # Receptor (CICESE)
    receptor_rfc = Column(String(20), nullable=True) # Opcional para manuales
    receptor_nombre = Column(String(200), nullable=True) # Opcional para manuales
    receptor_regimen_fiscal = Column(String(20), nullable=True)
    receptor_cp = Column(String(10), nullable=True)
    
    # Montos y Moneda
    subtotal = Column(Float, nullable=False)
    iva = Column(Float, nullable=False, default=0.0)
    total = Column(Float, nullable=False)
    moneda = Column(String(10), nullable=False, default="MXN")
    
    # Atributos CFDI SAT
    metodo_pago = Column(String(10), nullable=True)      # PUE, etc.
    forma_pago = Column(String(10), nullable=True)       # 01 (Efectivo), 03 (Transferencia), etc.
    uso_cfdi = Column(String(10), nullable=True)         # G03, etc.
    fecha_emision = Column(DateTime(timezone=True), nullable=True)
    fecha_timbrado = Column(DateTime(timezone=True), nullable=True)
    
    # Validación del SAT
    sat_status = Column(String(50), nullable=True)
    sat_verified_at = Column(DateTime(timezone=True), nullable=True)
    
    # Ubicación física de los archivos (opcionales para manuales)
    xml_filename = Column(String(300), nullable=True)
    pdf_filename = Column(String(300), nullable=True)
    
    # Indicador de gasto manual sin XML inicial
    is_manual = Column(Boolean, default=False, nullable=False)
    
    # Clasificación local general
    category_id = Column(Integer, ForeignKey("financial_categories.id", ondelete="RESTRICT"), nullable=False)
    description = Column(Text, nullable=True)            # Descripción breve del gasto
    
    # Estado del ciclo de vida
    status = Column(SAEnum(InvoiceStatus), nullable=False, default=InvoiceStatus.PENDIENTE)
    reimbursement_id = Column(Integer, ForeignKey("petty_cash_reimbursements.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Trazabilidad de carga
    provider_id = Column(Integer, ForeignKey("providers.id", ondelete="SET NULL"), nullable=True)
    registered_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    category = relationship("FinancialCategory", lazy="selectin")
    reimbursement = relationship("PettyCashReimbursement", back_populates="invoices", lazy="select")
    registered_by = relationship("User", lazy="selectin", foreign_keys=[registered_by_id])
    provider = relationship("Provider", back_populates="petty_cash_invoices")

    def __repr__(self):
        return f"<PettyCashInvoice {self.uuid or 'MANUAL-' + str(self.id)} - Total: {self.total} ({self.status.value})>"
