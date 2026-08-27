"""
SIAE — Modelo VesselTelemetry (Telemetría de Embarcaciones).
Almacena lecturas del sensor Gill MaxiMet GMX600 + GPS por minuto.
"""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class VesselTelemetry(Base):
    """Lectura de telemetría (meteorología y GPS) enviada por una embarcación."""

    __tablename__ = "vessel_telemetry"

    id = Column(Integer, primary_key=True, index=True)
    vessel_id = Column(Integer, ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)

    # Datos Meteorológicos (Gill MaxiMet)
    node = Column(String(50), nullable=True)
    wind_dir = Column(Float, nullable=True)            # DIR (viento relativo, grados)
    wind_speed = Column(Float, nullable=True)          # SPEED (viento relativo, m/s)
    wind_dir_corr = Column(Float, nullable=True)       # CDIR (viento corregido por compás, grados)
    wind_speed_corr = Column(Float, nullable=True)     # CSPEED (viento corregido, m/s)
    pressure = Column(Float, nullable=True)            # PRESS (presión barométrica, hPa)
    humidity = Column(Float, nullable=True)            # RH (humedad relativa, %)
    temp = Column(Float, nullable=True)                # TEMP (temperatura, °C)
    dewpoint = Column(Float, nullable=True)            # DEWPOINT (punto de rocío, °C)
    precip_total = Column(Float, nullable=True)        # PRECIPT (precipitación total acumulada, mm)
    precip_int = Column(Float, nullable=True)          # PRECIPI (intensidad de precipitación, mm)

    # Datos de Posición y Estado
    latitude = Column(Float, nullable=True)            # Latitud (grados decimales)
    longitude = Column(Float, nullable=True)           # Longitud (grados decimales)
    gps_fix = Column(Boolean, nullable=True)           # Habilitado si hay fix satelital
    supply_v = Column(Float, nullable=True)            # VOLT (voltaje del sistema/batería, V)
    status = Column(String(50), nullable=True)         # STATUS (código de error o diagnóstico)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relación
    vessel = relationship("Vessel", backref="telemetry_records")

    __table_args__ = (
        Index("ix_vessel_telemetry_vessel_ts", "vessel_id", "timestamp", unique=True),
    )

    def __repr__(self):
        return f"<VesselTelemetry Vessel {self.vessel_id} @ {self.timestamp}>"
