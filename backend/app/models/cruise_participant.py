"""
SIAE — Modelo de asignación Participante → Crucero.

Tabla asociativa que une un ParticipantProfile con un CruisePlan,
especificando el rol que desempeña en ese crucero en particular.

Los datos personales (nombre, foto, documento) viven en ParticipantProfile
y se reutilizan en todos los cruceros en que participe la persona.
"""

from sqlalchemy import (
    Column, Integer, Boolean, DateTime, ForeignKey,
    Enum as SAEnum, Text, String,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class ParticipantRole(str, enum.Enum):
    """Rol del participante dentro del crucero."""
    INVESTIGADOR_PRINCIPAL = "investigador_principal"
    COINVESTIGADOR         = "coinvestigador"
    TECNICO                = "tecnico"
    ESTUDIANTE             = "estudiante"
    CAPITAN                = "capitan"
    PRIMER_OFICIAL         = "primer_oficial"
    MARINERO               = "marinero"
    JEFE_MAQUINAS          = "jefe_maquinas"
    MEDICO                 = "medico"
    OTRO                   = "otro"


class CruiseParticipant(Base):
    """Asignación de un participante a un crucero con su rol específico."""

    __tablename__ = "cruise_participants"

    id             = Column(Integer, primary_key=True, index=True)
    cruise_id      = Column(Integer, ForeignKey("cruise_plans.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    participant_id = Column(Integer, ForeignKey("participant_profiles.id", ondelete="CASCADE"),
                            nullable=False, index=True)

    # Rol específico en ESTE crucero (puede variar entre cruceros)
    role_in_cruise            = Column(SAEnum(ParticipantRole), nullable=False,
                                       default=ParticipantRole.INVESTIGADOR_PRINCIPAL)
    is_principal_investigator = Column(Boolean, default=False, nullable=False)
    is_cruise_leader          = Column(Boolean, default=False, nullable=False)

    # Notas específicas de esta participación (ej: "encargado de CTDs")
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(),
                        onupdate=func.now())

    # ── Relaciones ─────────────────────────────────────────────
    cruise      = relationship("CruisePlan", back_populates="participants",
                               lazy="selectin")
    participant = relationship("ParticipantProfile", back_populates="cruise_assignments",
                               lazy="selectin")

    @property
    def full_name(self) -> str:
        return self.participant.full_name if self.participant else "—"

    def __repr__(self):
        return f"<CruiseParticipant participant_id={self.participant_id} cruise_id={self.cruise_id}>"
