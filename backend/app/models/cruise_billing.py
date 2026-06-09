"""
SIAE — Modelo CruiseBilling (Facturación / Cobro de Crucero).
Almacena la información de cobro calculada y registrada para cada crucero.
"""

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, ForeignKey, Enum as SAEnum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship, backref
from app.database import Base
from app.models.vessel_rate import VesselRateClientType
import enum


class BillingStatus(str, enum.Enum):
    """Estados del cobro/facturación."""
    POR_COBRAR = "por_cobrar"     # Cobro pendiente de pago por el proyecto/institución
    COBRADO = "cobrado"           # Pago recibido por administración
    TRANSFERIDO = "transferido"   # Monto transferido a la cuenta oficial del DEO


class CruiseBilling(Base):
    """Detalle de facturación y cobro por crucero."""

    __tablename__ = "cruise_billings"

    id = Column(Integer, primary_key=True, index=True)
    cruise_id = Column(Integer, ForeignKey("cruise_plans.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    
    # Datos del cliente / pagador
    client_type = Column(SAEnum(VesselRateClientType), nullable=False)
    billing_entity = Column(String(300), nullable=True) # Proyecto solicitante / Razón Social / Institución
    billing_contact = Column(String(200), nullable=True) # Responsable / Investigador

    # Configuración monetaria
    currency = Column(String(10), nullable=False, default="MXN") # MXN o USD
    exchange_rate = Column(Float, nullable=True, default=1.0) # Tipo de cambio en MXN (si currency es USD)

    # Detalle del cálculo (embarcaciones mayores, ej: BOAH)
    days_navigated = Column(Float, nullable=True, default=0.0)
    rate_per_day = Column(Float, nullable=True, default=0.0)
    days_mobilization = Column(Float, nullable=True, default=0.0)
    rate_mobilization = Column(Float, nullable=True, default=0.0)

    # Detalle del cálculo (embarcaciones menores, ej: Rigel / Antares)
    vessel_rent_cost = Column(Float, nullable=True, default=0.0) # Renta fija de la embarcación
    vehicle_rent_cost = Column(Float, nullable=True, default=0.0) # Renta de unidad vehicular
    fuel_liters = Column(Float, nullable=True, default=0.0)
    fuel_price_per_liter = Column(Float, nullable=True, default=0.0)
    fuel_cost = Column(Float, nullable=True, default=0.0) # fuel_liters * fuel_price_per_liter
    
    # Detalle combustible unidad de vehículo
    vehicle_fuel_liters = Column(Float, nullable=True, default=0.0)
    vehicle_fuel_price_per_liter = Column(Float, nullable=True, default=0.0)
    vehicle_fuel_cost = Column(Float, nullable=True, default=0.0) # vehicle_fuel_liters * vehicle_fuel_price_per_liter

    # Otros conceptos / Ajustes
    other_costs = Column(Float, nullable=True, default=0.0)
    other_costs_description = Column(String(300), nullable=True)

    # Totales del cobro
    subtotal = Column(Float, nullable=False, default=0.0)
    discount = Column(Float, nullable=False, default=0.0)
    tax_pct = Column(Float, nullable=False, default=0.0) # ej: 16% = 16.0, 0% = 0.0
    tax_amount = Column(Float, nullable=False, default=0.0) # subtotal * (tax_pct/100)
    total = Column(Float, nullable=False, default=0.0) # subtotal - discount + tax_amount

    # Estado y trazabilidad del pago
    status = Column(SAEnum(BillingStatus), nullable=False, default=BillingStatus.POR_COBRAR)
    payment_reference = Column(String(200), nullable=True) # Folio, transferencia bancaria
    payment_date = Column(Date, nullable=True)
    transfer_date = Column(Date, nullable=True)

    # Recibo escaneado subido
    receipt_filename = Column(String(300), nullable=True)
    receipt_uploaded_at = Column(DateTime, nullable=True)

    # Orden de embarcación
    vessel_order_filename = Column(String(300), nullable=True)
    vessel_order_uploaded_at = Column(DateTime, nullable=True)

    # Orden de embarcación firmada
    signed_vessel_order_filename = Column(String(300), nullable=True)
    signed_vessel_order_uploaded_at = Column(DateTime, nullable=True)

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    # Vinculación 1-1 dinámica hacia CruisePlan
    cruise = relationship(
        "CruisePlan", 
        backref=backref("billing", uselist=False, cascade="all, delete-orphan", lazy="selectin"), 
        lazy="selectin"
    )

    def __repr__(self):
        return f"<CruiseBilling for Cruise {self.cruise_id} - Total: {self.total} {self.currency} ({self.status.value})>"
