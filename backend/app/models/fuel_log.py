"""
SIAE — Modelo FuelLog (Registro de Carga de Combustible).
Historial de cargas de combustible por embarcación.
"""

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class FuelLog(Base):
    """Registro de carga de combustible para una embarcación."""

    __tablename__ = "fuel_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Relaciones principales
    vessel_id = Column(Integer, ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True)
    cruise_id = Column(Integer, ForeignKey("cruise_plans.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Datos de la carga
    load_date = Column(Date, nullable=False, index=True)
    load_time = Column(String(10), nullable=True)          # HH:MM formato local
    fuel_type = Column(String(50), nullable=False)          # Diesel, Gasolina, etc.
    liters = Column(Float, nullable=False)                  # Litros cargados

    # Niveles de tanque (opcionales)
    level_before_pct = Column(Float, nullable=True)        # Nivel antes de carga (0–100 %)
    level_after_pct = Column(Float, nullable=True)         # Nivel después de carga (0–100 %)

    # Datos económicos (opcionales)
    supplier = Column(String(200), nullable=True)          # Proveedor / Estación
    unit_cost = Column(Float, nullable=True)               # Costo por litro (MXN)
    total_cost = Column(Float, nullable=True)              # Costo total (MXN)

    # Notas
    notes = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    vessel = relationship("Vessel", backref="fuel_logs", lazy="selectin")
    cruise = relationship("CruisePlan", backref="fuel_logs", lazy="selectin")
    registered_by = relationship("User", backref="fuel_logs", lazy="selectin")

    def __repr__(self):
        return f"<FuelLog vessel_id={self.vessel_id} date={self.load_date} liters={self.liters}>"
