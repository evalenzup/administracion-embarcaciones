"""
SIAE — Modelo PettyCashReimbursement (Reposiciones de Fondo Fijo).
Agrupa un conjunto de facturas para solicitar su reposición a contabilidad.
"""

import enum
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Enum as SAEnum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class ReimbursementStatus(str, enum.Enum):
    """Estados del proceso de reposición de fondo fijo."""
    EN_PROCESO = "en_proceso"     # Paquete creado, listo para revisión
    APROBADO = "aprobado"       # Aprobado por el responsable o contabilidad
    PAGADO = "pagado"           # Fondos repuestos en efectivo / transferidos al fondo chica


class PettyCashReimbursement(Base):
    """Reposición de fondo fijo consolidada."""

    __tablename__ = "petty_cash_reimbursements"

    id = Column(Integer, primary_key=True, index=True)
    folio = Column(String(50), unique=True, nullable=False, index=True) # ej. RFF-2026-001
    total_amount = Column(Float, nullable=False, default=0.0)
    invoice_count = Column(Integer, nullable=False, default=0)
    status = Column(SAEnum(ReimbursementStatus), nullable=False, default=ReimbursementStatus.EN_PROCESO)
    scan_filename = Column(String(300), nullable=True) # PDF escaneado con firmas de recibido
    
    submitted_date = Column(DateTime(timezone=True), nullable=True)
    approved_date = Column(DateTime(timezone=True), nullable=True)
    paid_date = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    created_by = relationship("User", lazy="selectin", foreign_keys=[created_by_id])
    invoices = relationship("PettyCashInvoice", back_populates="reimbursement", lazy="selectin")

    def __repr__(self):
        return f"<PettyCashReimbursement {self.folio} - Total: {self.total_amount} ({self.status.value})>"
