"""
SIAE — Modelo Document (Documentación de embarcaciones).
Documentos con control de vigencia (semáforo).
"""

from sqlalchemy import Column, Integer, String, Date, DateTime, Text, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum
from datetime import date


class DocumentCategory(str, enum.Enum):
    """Categorías de documentos."""
    CERTIFICADO = "certificado"
    PLANO = "plano"
    PERMISO = "permiso"
    POLIZA = "poliza"
    LICENCIA = "licencia"
    INSPECCION = "inspeccion"
    MANUAL = "manual"
    OTRO = "otro"


class Document(Base):
    """Documento asociado a una embarcación."""

    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    vessel_id = Column(Integer, ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    category = Column(SAEnum(DocumentCategory), nullable=False, default=DocumentCategory.OTRO)
    document_number = Column(String(100), nullable=True)
    issuing_authority = Column(String(200), nullable=True)  # Autoridad emisora
    description = Column(Text, nullable=True)

    # Control de vigencia
    issue_date = Column(Date, nullable=True)     # Fecha de emisión
    expiry_date = Column(Date, nullable=True)    # Fecha de vencimiento
    is_permanent = Column(Boolean, default=False)  # Sin vencimiento

    # Archivo
    file_name = Column(String(300), nullable=True)
    file_path = Column(String(500), nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    file_type = Column(String(50), nullable=True)

    # Estado
    is_active = Column(Boolean, default=True, nullable=False)
    notes = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relación
    vessel = relationship("Vessel", backref="documents", lazy="selectin")

    @property
    def vigency_status(self) -> str:
        """
        Semáforo de vigencia:
        - 'vigente' (verde): más de 30 días para vencer o permanente
        - 'por_vencer' (amarillo): 30 días o menos para vencer
        - 'vencido' (rojo): fecha de vencimiento pasada
        - 'sin_vigencia': no tiene fecha de vencimiento
        """
        if self.is_permanent:
            return "vigente"
        if not self.expiry_date:
            return "sin_vigencia"

        today = date.today()
        if self.expiry_date < today:
            return "vencido"
        days_remaining = (self.expiry_date - today).days
        if days_remaining <= 30:
            return "por_vencer"
        return "vigente"

    @property
    def days_to_expiry(self) -> int | None:
        """Días restantes para vencer. None si es permanente o sin vigencia."""
        if self.is_permanent or not self.expiry_date:
            return None
        return (self.expiry_date - date.today()).days

    def __repr__(self):
        return f"<Document {self.title} ({self.category.value})>"
