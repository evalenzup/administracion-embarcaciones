"""
SIAE — Modelo VesselRequest (Solicitud de Embarcación).
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class RequestStatus(str, enum.Enum):
    """Estados de la solicitud de embarcación."""
    PENDIENTE = "pendiente"
    APROBADA = "aprobada"
    RECHAZADA = "rechazada"
    CANCELADA = "cancelada"


class VesselRequest(Base):
    """Solicitud de reserva de embarcación para investigación."""

    __tablename__ = "vessel_requests"

    id = Column(Integer, primary_key=True, index=True)
    applicant_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    vessel_id = Column(Integer, ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)

    project_name = Column(String(300), nullable=False)
    scientific_leader = Column(String(200), nullable=False)
    cruise_responsible = Column(String(200), nullable=True)
    objective = Column(Text, nullable=True)
    study_area = Column(Text, nullable=True)

    # Fechas
    departure_date = Column(DateTime, nullable=False)
    return_date = Column(DateTime, nullable=False)

    # Cantidad de personas
    scientists_count = Column(Integer, nullable=True, default=0)
    crew_count = Column(Integer, nullable=True, default=0)

    # Estado
    status = Column(SAEnum(RequestStatus), nullable=False, default=RequestStatus.PENDIENTE)

    # Aprobación / Rechazo
    approved_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approval_date = Column(DateTime, nullable=True)
    admin_notes = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    applicant = relationship("User", foreign_keys=[applicant_id], backref="vessel_requests", lazy="selectin")
    approved_by = relationship("User", foreign_keys=[approved_by_id], lazy="selectin")
    vessel = relationship("Vessel", backref="vessel_requests", lazy="selectin")
    project = relationship("Project", back_populates="vessel_requests", lazy="selectin")

    def __repr__(self):
        return f"<VesselRequest {self.project_name} ({self.status.value})>"
