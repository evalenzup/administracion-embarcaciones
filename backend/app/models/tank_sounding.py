"""
SIAE — Modelos TankSounding y TankSoundingItem.
Registro y control de sondeos de tanques realizados por el personal de máquinas.
"""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class SoundingType(str, enum.Enum):
    """Tipos de eventos para sondeos de tanques."""
    RUTINA_DIARIA = "RUTINA_DIARIA"
    PRE_ZARPE = "PRE_ZARPE"
    POST_ARRIBO = "POST_ARRIBO"
    OPERACION_CRUCERO = "OPERACION_CRUCERO"
    TRANSFERENCIA_INTERNA = "TRANSFERENCIA_INTERNA"
    OTRO = "OTRO"


class TankSounding(Base):
    """Cabecera de una ronda de sondeo de tanques efectuada en una embarcación."""

    __tablename__ = "tank_soundings"

    id = Column(Integer, primary_key=True, index=True)
    vessel_id = Column(Integer, ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True)
    cruise_id = Column(Integer, ForeignKey("cruise_plans.id", ondelete="SET NULL"), nullable=True, index=True)
    performed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    sounding_datetime = Column(DateTime(timezone=True), nullable=False, default=func.now(), index=True)
    sounding_type = Column(SAEnum(SoundingType), nullable=False, default=SoundingType.RUTINA_DIARIA)

    # Calados observados durante el sondeo
    draft_fwd_m = Column(Float, nullable=True)             # Calado proa (m)
    draft_aft_m = Column(Float, nullable=True)             # Calado popa (m)
    trim_m = Column(Float, nullable=True)                  # Asiento (draft_aft - draft_fwd en m)

    # Totales calculados automáticamente
    total_fuel_m3 = Column(Float, default=0.0, nullable=False)
    total_fuel_tons = Column(Float, default=0.0, nullable=False)
    total_fresh_water_m3 = Column(Float, default=0.0, nullable=False)
    total_fresh_water_tons = Column(Float, default=0.0, nullable=False)
    total_ballast_m3 = Column(Float, default=0.0, nullable=False)
    total_ballast_tons = Column(Float, default=0.0, nullable=False)

    total_liquids_tons = Column(Float, default=0.0, nullable=False)     # Suma total de pesos de líquidos
    total_liquids_mom_z = Column(Float, default=0.0, nullable=False)    # Suma de momentos verticales (ton*m)
    total_fsm_moments = Column(Float, default=0.0, nullable=False)      # Suma de momentos de superficie libre Σ(i * e)

    notes = Column(Text, nullable=True)
    is_official = Column(Boolean, default=False, nullable=False)        # Marca si es el sondeo de referencia para despacho

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    vessel = relationship("Vessel", back_populates="soundings")
    cruise = relationship("CruisePlan", backref="tank_soundings")
    performed_by = relationship("User", backref="registered_soundings")
    items = relationship("TankSoundingItem", back_populates="sounding", cascade="all, delete-orphan", order_by="TankSoundingItem.id")
    stability_conditions = relationship("StabilityCondition", back_populates="sounding")

    def __repr__(self):
        return f"<TankSounding id={self.id} vessel_id={self.vessel_id} date={self.sounding_datetime} type={self.sounding_type.value}>"


class TankSoundingItem(Base):
    """Detalle de sondeo de un tanque individual dentro de una ronda de sondeo."""

    __tablename__ = "tank_sounding_items"

    id = Column(Integer, primary_key=True, index=True)
    sounding_id = Column(Integer, ForeignKey("tank_soundings.id", ondelete="CASCADE"), nullable=False, index=True)
    tank_id = Column(Integer, ForeignKey("vessel_tanks.id", ondelete="CASCADE"), nullable=False, index=True)

    # Medición y llenado
    sounding_cm = Column(Float, nullable=True)              # Altura leída en la sonda (cm)
    fill_percentage = Column(Float, nullable=False)         # Porcentaje de llenado (0 a 100 %)

    # Magnitudes calculadas
    volume_m3 = Column(Float, nullable=False)               # Volumen calculado en m³
    density_applied = Column(Float, nullable=False)         # Densidad usada en ton/m³
    weight_tons = Column(Float, nullable=False)             # Peso en toneladas métricas
    zg_m = Column(Float, nullable=False)                    # Centro de gravedad vertical del líquido (m)
    mom_z = Column(Float, nullable=False)                   # Momento vertical = weight_tons * zg_m (ton*m)

    # Superficie libre
    is_slack = Column(Boolean, default=False, nullable=False) # True si 0% < fill_percentage < 98%
    fsm_applied = Column(Float, default=0.0, nullable=False)  # Momento superficie libre = i * e * (F/Cap) o i * e

    notes = Column(String(200), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    sounding = relationship("TankSounding", back_populates="items")
    tank = relationship("VesselTank", back_populates="sounding_items")

    def __repr__(self):
        return f"<TankSoundingItem tank_id={self.tank_id} fill={self.fill_percentage}% weight={self.weight_tons}t>"
