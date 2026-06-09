"""
SIAE — Modelo Vessel (Embarcación).
Define las embarcaciones administradas por el sistema.
"""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, Enum as SAEnum
from sqlalchemy.sql import func
from app.database import Base
import enum


class VesselType(str, enum.Enum):
    """Tipos de embarcación."""
    BARCO = "barco"
    YATE = "yate"
    PANGA = "panga"
    LANCHA = "lancha"
    OTRO = "otro"


class VesselStatus(str, enum.Enum):
    """Estado operativo de la embarcación."""
    ACTIVO = "activo"
    EN_MANTENIMIENTO = "en_mantenimiento"
    FUERA_DE_SERVICIO = "fuera_de_servicio"
    EN_CRUCERO = "en_crucero"


class Vessel(Base):
    """Embarcación registrada en el sistema."""

    __tablename__ = "vessels"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    registration_number = Column(String(50), unique=True, nullable=True)
    vessel_type = Column(SAEnum(VesselType), nullable=False, default=VesselType.BARCO)
    status = Column(SAEnum(VesselStatus), nullable=False, default=VesselStatus.ACTIVO)

    # Características físicas
    length_m = Column(Float, nullable=True)  # Eslora (metros)
    beam_m = Column(Float, nullable=True)    # Manga (metros)
    draft_m = Column(Float, nullable=True)   # Calado (metros)
    gross_tonnage = Column(Float, nullable=True)  # Tonelaje bruto
    year_built = Column(Integer, nullable=True)
    hull_material = Column(String(50), nullable=True)

    # Propulsión
    engine_type = Column(String(100), nullable=True)
    engine_power_hp = Column(Float, nullable=True)
    max_speed_knots = Column(Float, nullable=True) # Velocidad máxima en nudos
    fuel_type = Column(String(50), nullable=True)
    fuel_capacity_l = Column(Float, nullable=True)

    # Capacidad
    max_crew = Column(Integer, nullable=True)
    max_passengers = Column(Integer, nullable=True)

    # Ubicación y puerto
    home_port = Column(String(100), nullable=True)
    current_location = Column(String(200), nullable=True)

    # Información adicional
    description = Column(Text, nullable=True)
    photo_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Vessel {self.name} ({self.vessel_type.value})>"
