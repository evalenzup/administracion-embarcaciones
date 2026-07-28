"""
SIAE — Modelos de predicción de mareas (red mareográfica CICESE).
Fuente: https://redmar.cicese.mx/nmar/PREDCONMAR/{AÑO}/{CODIGO}{AÑO}.TXT
"""

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class TideStation(Base):
    """Estación mareográfica de la red CICESE (ej. ENS = Ensenada)."""

    __tablename__ = "tide_stations"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    # Años ya ingeridos, separados por coma (ej. "2026,2027")
    ingested_years = Column(String(100), default="", nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    predictions = relationship("TidePrediction", back_populates="station", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<TideStation {self.code} {self.name}>"


class TidePrediction(Base):
    """Altura de marea predicha (metros sobre Bajamar Media Inferior, UTC)."""

    __tablename__ = "tide_predictions"

    id = Column(Integer, primary_key=True)
    station_id = Column(Integer, ForeignKey("tide_stations.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    height_m = Column(Float, nullable=False)

    station = relationship("TideStation", back_populates="predictions")

    __table_args__ = (
        Index("ix_tide_predictions_station_ts", "station_id", "timestamp", unique=True),
    )
