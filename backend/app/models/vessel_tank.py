"""
SIAE — Modelo VesselTank (Tanques de Embarcación).
Catálogo e inventario hidrostático de tanques por buque (combustible, agua, lastre, etc.).
"""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class TankFluidType(str, enum.Enum):
    """Tipos de fluidos en tanques navales."""
    COMBUSTIBLE = "COMBUSTIBLE"
    AGUA_DULCE = "AGUA_DULCE"
    AGUA_LASTRE = "AGUA_LASTRE"
    AGUAS_NEGRAS = "AGUAS_NEGRAS"
    ACEITE = "ACEITE"
    OTRO = "OTRO"


class VesselTank(Base):
    """Tanque perteneciente a una embarcación con sus datos hidrostáticos."""

    __tablename__ = "vessel_tanks"

    id = Column(Integer, primary_key=True, index=True)
    vessel_id = Column(Integer, ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True)

    order_index = Column(Integer, default=0, nullable=False)
    tank_code = Column(String(50), nullable=False)          # ej. 'DF1', 'TK4_BR', 'DF5_BR'
    name = Column(String(150), nullable=False)               # ej. 'Doble Fdo. No.1 -comb.-'
    fluid_type = Column(SAEnum(TankFluidType), nullable=False, default=TankFluidType.COMBUSTIBLE)

    # Parámetros hidrostáticos y de capacidad
    capacity_m3 = Column(Float, nullable=False)             # Volumen máximo 100% (m³)
    design_density = Column(Float, nullable=False)          # Densidad nominal (ton/m³), ej 0.85, 1.00, 1.03
    max_weight_tons = Column(Float, nullable=False)         # Peso al 100% (ton)
    zg_m = Column(Float, nullable=False)                    # Centro de gravedad vertical desde Línea Base (m)
    fsm_inertia_i = Column(Float, nullable=False, default=0.0)  # Momento de inercia superficie libre (m⁴)

    # Coordenadas y límites adicionales
    xg_m = Column(Float, nullable=True)                     # Centro de gravedad longitudinal (m desde referencia)
    yg_m = Column(Float, nullable=True)                     # Centro de gravedad transversal (m: -Babor / +Estribor)
    max_sounding_cm = Column(Float, nullable=True)          # Altura máxima de sonda (cm)
    sounding_pipe_location = Column(String(100), nullable=True) # Ubicación de la boca de sondeo

    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    vessel = relationship("Vessel", back_populates="tanks")
    sounding_items = relationship("TankSoundingItem", back_populates="tank", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<VesselTank {self.tank_code} - {self.name} ({self.fluid_type.value})>"
