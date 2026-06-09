"""
SIAE — Modelos de Bitácoras.
Tipos de bitácora + entradas con soporte de horómetros.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, ForeignKey, Enum as SAEnum, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class LogbookType(str, enum.Enum):
    """Tipo de bitácora."""
    CAPITAN = "capitan"
    CUBIERTA = "cubierta"
    MAQUINAS = "maquinas"
    AUDITORIA = "auditoria"   # Bitácora de sistema (acciones de usuarios)

class LogbookEventType(Base):
    """Tipos de eventos configurables para las bitácoras."""
    __tablename__ = "logbook_event_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    color = Column(String(20), nullable=True)  # ej: #FF0000 o "error"
    icon = Column(String(50), nullable=True)   # ej: AnchorOutlined

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_active = Column(Boolean, default=True)


class LogbookEntry(Base):
    """Entrada de bitácora."""

    __tablename__ = "logbook_entries"

    id = Column(Integer, primary_key=True, index=True)
    vessel_id = Column(Integer, ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    event_type_id = Column(Integer, ForeignKey("logbook_event_types.id", ondelete="SET NULL"), nullable=True)

    logbook_type = Column(SAEnum(LogbookType), nullable=False, index=True)
    entry_date = Column(Date, nullable=False, index=True)
    entry_time = Column(String(10), nullable=True)  # HH:MM formato local

    # Contenido principal
    title = Column(String(300), nullable=True)
    content = Column(Text, nullable=False)

    # Campos específicos de horómetros
    engine_hours = Column(Float, nullable=True)        # Horas totales motor
    engine_hours_delta = Column(Float, nullable=True)  # Horas del período
    component_name = Column(String(200), nullable=True)  # ej: "Motor Principal", "Generador"

    # Posición / navegación (para bitácora de cubierta/capitán)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_name = Column(String(200), nullable=True)
    weather_conditions = Column(String(200), nullable=True)
    sea_state = Column(String(100), nullable=True)

    # Firmado
    is_signed = Column(Boolean, default=False)
    signed_by = Column(String(100), nullable=True)

    cruise_id = Column(Integer, ForeignKey("cruise_plans.id", ondelete="SET NULL"), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    vessel = relationship("Vessel", backref="logbook_entries", lazy="selectin")
    user = relationship("User", backref="logbook_entries", lazy="selectin")
    event_type = relationship("LogbookEventType", lazy="selectin")
    cruise = relationship("CruisePlan", backref="logbook_entries", lazy="selectin")

    def __repr__(self):
        return f"<LogbookEntry {self.logbook_type.value} {self.entry_date}>"
