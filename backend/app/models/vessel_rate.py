"""
SIAE — Modelo VesselRate (Tarifa de Embarcación).
Define las tarifas oficiales anuales por embarcación y tipo de cliente/proyecto.
"""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class VesselRateClientType(str, enum.Enum):
    """Tipos de cliente/proyecto para la aplicación de tarifas."""
    NACIONAL_INSTITUCION = "nacional_institucion"  # Institución nacional mexicana
    NACIONAL_EMPRESA = "nacional_empresa"          # Empresa nacional mexicana
    EXTRANJERO = "extranjero"                      # Institución/empresa extranjera
    CICESE_INTERNO = "cicese_interno"              # Proyecto interno CICESE
    CICESE_INTERNO_BAHIA = "cicese_interno_bahia"  # Proyecto interno CICESE en modalidad Bahía
    SECIHTI = "secihti"                            # Proyecto SECIHTI (ex-CONAHCyT)
    CICESE_AUTOGENERADO = "cicese_autogenerado"    # Proyectos autogenerados manejados por CICESE
    EXTERNO_NACIONAL = "externo_nacional"          # Instituciones externas mexicanas
    GENERAL = "general"                            # Público en general / tarifa base / movilizaciones


class VesselRate(Base):
    """Tarifas oficiales registradas en el sistema."""

    __tablename__ = "vessel_rates"

    id = Column(Integer, primary_key=True, index=True)
    vessel_id = Column(Integer, ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True)
    
    concept = Column(String(200), nullable=False) # ej: "Día de buque", "Renta de embarcación", "Día de movilización"
    client_type = Column(SAEnum(VesselRateClientType), nullable=False, default=VesselRateClientType.GENERAL)
    rate_amount = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False, default="MXN") # MXN o USD
    year = Column(Integer, nullable=False, default=2025)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    vessel = relationship("Vessel", backref="rates", lazy="selectin")

    def __repr__(self):
        return f"<VesselRate {self.concept} - {self.rate_amount} {self.currency} ({self.client_type.value})>"
