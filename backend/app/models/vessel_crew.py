"""
SIAE — Modelo VesselCrew (Tripulación Base de Embarcación).

Define qué personal del DEO está asignado como tripulación fija
de cada embarcación. Al crear un crucero para esa embarcación,
esta tripulación se auto-popula en los participantes del crucero.
"""

from sqlalchemy import (
    Column, Integer, Boolean, DateTime, ForeignKey,
    Enum as SAEnum,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class CrewRole(str, enum.Enum):
    """Rol de tripulación dentro de la embarcación."""
    CAPITAN        = "capitan"
    PRIMER_OFICIAL = "primer_oficial"
    MARINERO       = "marinero"
    JEFE_MAQUINAS  = "jefe_maquinas"
    MEDICO         = "medico"


class VesselCrew(Base):
    """Tripulación base asignada permanentemente a una embarcación."""

    __tablename__ = "vessel_crew"

    id = Column(Integer, primary_key=True, index=True)
    vessel_id = Column(
        Integer,
        ForeignKey("vessels.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    personnel_id = Column(
        Integer,
        ForeignKey("personnel.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(SAEnum(CrewRole), nullable=False, default=CrewRole.MARINERO)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(),
                        onupdate=func.now())

    # Relaciones
    vessel = relationship("Vessel", backref="crew_assignments", lazy="selectin")
    personnel = relationship("Personnel", backref="vessel_assignments", lazy="selectin")

    @property
    def full_name(self) -> str:
        return self.personnel.full_name if self.personnel else "—"

    def __repr__(self):
        return f"<VesselCrew vessel_id={self.vessel_id} personnel_id={self.personnel_id} role={self.role.value}>"
