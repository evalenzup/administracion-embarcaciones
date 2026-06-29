"""
SIAE — Modelos para Gestión de Solicitudes de Servicios de Terceros.
Lleva el control del ciclo de vida, folios, archivos adjuntos y tiempos de cada etapa.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class ServiceRequest(Base):
    """Solicitud de servicio a proveedores con seguimiento de folios y estados."""
    __tablename__ = "service_requests"

    id = Column(Integer, primary_key=True, index=True)
    internal_folio = Column(String(50), unique=True, nullable=False, index=True)
    provider_name = Column(String(200), nullable=True)
    description = Column(Text, nullable=False)
    status = Column(String(50), nullable=False, default="solicitado")  # solicitado, aprobado_hacienda, en_proceso_pago, pagado, cancelado
    
    episa_folio = Column(String(100), nullable=False)
    authorization_folio = Column(String(100), nullable=True)
    budget_amount = Column(Float, nullable=False)
    
    # Rutas físicas a archivos
    budget_file = Column(String(300), nullable=True)             # Presupuesto PDF
    authorization_email_file = Column(String(300), nullable=True) # Captura del correo de hacienda
    invoice_xml_file = Column(String(300), nullable=True)         # Factura XML
    invoice_pdf_file = Column(String(300), nullable=True)         # Factura PDF
    conformity_letter_file = Column(String(300), nullable=True)   # Carta de conformidad firmada
    payment_receipt_file = Column(String(300), nullable=True)     # Comprobante de pago
    
    provider_id = Column(Integer, ForeignKey("providers.id", ondelete="SET NULL"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    provider = relationship("Provider", back_populates="services")
    created_by = relationship("User", lazy="selectin", foreign_keys=[created_by_id])
    history = relationship("ServiceStageHistory", back_populates="service_request", cascade="all, delete-orphan", order_by="ServiceStageHistory.entered_at.asc()")
    observations = relationship("ServiceObservation", back_populates="service_request", cascade="all, delete-orphan", order_by="ServiceObservation.created_at.asc()")

    def __repr__(self):
        return f"<ServiceRequest {self.internal_folio} - {self.provider_name} - {self.status}>"


class ServiceStageHistory(Base):
    """Historial de cambios de etapa para medición de tiempos transcurridos."""
    __tablename__ = "service_stage_histories"

    id = Column(Integer, primary_key=True, index=True)
    service_request_id = Column(Integer, ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    stage = Column(String(50), nullable=False)
    entered_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    notes = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relaciones
    service_request = relationship("ServiceRequest", back_populates="history")
    user = relationship("User", lazy="selectin")

    def __repr__(self):
        return f"<ServiceStageHistory Request {self.service_request_id} -> {self.stage}>"


class ServiceObservation(Base):
    """Comentarios, incidencias y notas libres en la bitácora de una solicitud."""
    __tablename__ = "service_observations"

    id = Column(Integer, primary_key=True, index=True)
    service_request_id = Column(Integer, ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    notes = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relaciones
    service_request = relationship("ServiceRequest", back_populates="observations")
    user = relationship("User", lazy="selectin")

    def __repr__(self):
        return f"<ServiceObservation Request {self.service_request_id} - User {self.user_id}>"
