"""
SIAE — Modelos para Estaciones Meteorológicas Automáticas (EMA) del SMN/CONAGUA.
"""
from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class EmaStation(Base):
    """Estación Meteorológica Automática (EMA) del SMN/CONAGUA."""

    __tablename__ = "ema_stations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    state = Column(String(100), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    altitude = Column(Float, nullable=True)
    installation_date = Column(String(50), nullable=True)
    smn_name = Column(String(200), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    measurements = relationship("EmaMeasurement", back_populates="station", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<EmaStation {self.name} ({self.state})>"


class EmaMeasurement(Base):
    """Medición meteorológica registrada por una EMA."""

    __tablename__ = "ema_measurements"

    id = Column(Integer, primary_key=True)
    station_id = Column(Integer, ForeignKey("ema_stations.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    
    temperature = Column(Float, nullable=True)
    precipitation = Column(Float, nullable=True)
    humidity = Column(Float, nullable=True)
    pressure = Column(Float, nullable=True)
    solar_radiation = Column(Float, nullable=True)
    wind_direction = Column(Float, nullable=True)
    wind_speed = Column(Float, nullable=True)
    gust_direction = Column(Float, nullable=True)
    gust_speed = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    station = relationship("EmaStation", back_populates="measurements")

    __table_args__ = (
        Index("ix_ema_measurements_station_ts", "station_id", "timestamp", unique=True),
    )

    def __repr__(self):
        return f"<EmaMeasurement {self.station_id} @ {self.timestamp}>"
