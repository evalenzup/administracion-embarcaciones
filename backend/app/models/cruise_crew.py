"""
SIAE — Modelo de asignación Tripulación → Crucero.
"""
from sqlalchemy import (
    Column, Integer, DateTime, ForeignKey,
    Enum as SAEnum, Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
from app.models.vessel_crew import CrewRole


class CruiseCrew(Base):
    """Asignación de un miembro del Personal DEO a un crucero como tripulante."""

    __tablename__ = "cruise_crew"

    id           = Column(Integer, primary_key=True, index=True)
    cruise_id    = Column(Integer, ForeignKey("cruise_plans.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    personnel_id = Column(Integer, ForeignKey("personnel.id", ondelete="CASCADE"),
                          nullable=False, index=True)

    role  = Column(SAEnum(CrewRole), nullable=False, default=CrewRole.MARINERO)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(),
                        onupdate=func.now())

    # ── Relaciones ─────────────────────────────────────────────
    cruise    = relationship("CruisePlan", back_populates="crew",
                             lazy="selectin")
    personnel = relationship("Personnel", backref="cruise_assignments",
                             lazy="selectin")

    @property
    def full_name(self) -> str:
        return self.personnel.full_name if self.personnel else "—"

    def __repr__(self):
        return f"<CruiseCrew personnel_id={self.personnel_id} cruise_id={self.cruise_id}>"
