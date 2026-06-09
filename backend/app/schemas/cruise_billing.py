"""
SIAE — Schemas Pydantic para CruiseBilling (Facturación / Cobros).
"""

from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field
from app.models.vessel_rate import VesselRateClientType
from app.models.cruise_billing import BillingStatus


# ── Schemas anidados simples ──────────────────────────────────

class VesselMin(BaseModel):
    id: int
    name: str
    vessel_type: str
    model_config = {"from_attributes": True}


class CruiseMin(BaseModel):
    id: int
    name: str
    cruise_number: Optional[str] = None
    departure_date: Optional[datetime] = None
    return_date: Optional[datetime] = None
    status: str
    vessel_id: int
    vessel: Optional[VesselMin] = None
    model_config = {"from_attributes": True}


# ── Base ──────────────────────────────────────────────────────

class CruiseBillingBase(BaseModel):
    cruise_id: int
    client_type: VesselRateClientType
    billing_entity: Optional[str] = Field(None, max_length=300)
    billing_contact: Optional[str] = Field(None, max_length=200)
    currency: str = Field("MXN", min_length=3, max_length=10)
    exchange_rate: Optional[float] = Field(1.0, ge=0)

    # Detalle BOAH
    days_navigated: Optional[float] = Field(0.0, ge=0)
    rate_per_day: Optional[float] = Field(0.0, ge=0)
    days_mobilization: Optional[float] = Field(0.0, ge=0)
    rate_mobilization: Optional[float] = Field(0.0, ge=0)

    # Detalle Menores
    vessel_rent_cost: Optional[float] = Field(0.0, ge=0)
    vehicle_rent_cost: Optional[float] = Field(0.0, ge=0)
    fuel_liters: Optional[float] = Field(0.0, ge=0)
    fuel_price_per_liter: Optional[float] = Field(0.0, ge=0)
    fuel_cost: Optional[float] = Field(0.0, ge=0)
    
    vehicle_fuel_liters: Optional[float] = Field(0.0, ge=0)
    vehicle_fuel_price_per_liter: Optional[float] = Field(0.0, ge=0)
    vehicle_fuel_cost: Optional[float] = Field(0.0, ge=0)

    # Ajustes
    other_costs: Optional[float] = Field(0.0, ge=0)
    other_costs_description: Optional[str] = Field(None, max_length=300)
    discount: Optional[float] = Field(0.0, ge=0)
    tax_pct: Optional[float] = Field(0.0, ge=0, le=100)

    # Estado
    status: BillingStatus = BillingStatus.POR_COBRAR
    payment_reference: Optional[str] = Field(None, max_length=200)
    payment_date: Optional[date] = None
    transfer_date: Optional[date] = None
    notes: Optional[str] = None


# ── Create ────────────────────────────────────────────────────

class CruiseBillingCreate(CruiseBillingBase):
    pass


# ── Update ────────────────────────────────────────────────────

class CruiseBillingUpdate(BaseModel):
    client_type: Optional[VesselRateClientType] = None
    billing_entity: Optional[str] = Field(None, max_length=300)
    billing_contact: Optional[str] = Field(None, max_length=200)
    currency: Optional[str] = Field(None, min_length=3, max_length=10)
    exchange_rate: Optional[float] = Field(None, ge=0)

    # Detalle BOAH
    days_navigated: Optional[float] = Field(None, ge=0)
    rate_per_day: Optional[float] = Field(None, ge=0)
    days_mobilization: Optional[float] = Field(None, ge=0)
    rate_mobilization: Optional[float] = Field(None, ge=0)

    # Detalle Menores
    vessel_rent_cost: Optional[float] = Field(None, ge=0)
    vehicle_rent_cost: Optional[float] = Field(None, ge=0)
    fuel_liters: Optional[float] = Field(None, ge=0)
    fuel_price_per_liter: Optional[float] = Field(None, ge=0)
    fuel_cost: Optional[float] = Field(None, ge=0)
    
    vehicle_fuel_liters: Optional[float] = Field(None, ge=0)
    vehicle_fuel_price_per_liter: Optional[float] = Field(None, ge=0)
    vehicle_fuel_cost: Optional[float] = Field(None, ge=0)

    # Ajustes
    other_costs: Optional[float] = Field(None, ge=0)
    other_costs_description: Optional[str] = Field(None, max_length=300)
    discount: Optional[float] = Field(None, ge=0)
    tax_pct: Optional[float] = Field(None, ge=0, le=100)

    # Estado
    status: Optional[BillingStatus] = None
    payment_reference: Optional[str] = Field(None, max_length=200)
    payment_date: Optional[date] = None
    transfer_date: Optional[date] = None
    notes: Optional[str] = None


# ── Response ──────────────────────────────────────────────────

class CruiseBillingResponse(BaseModel):
    id: int
    cruise_id: int
    client_type: VesselRateClientType
    billing_entity: Optional[str] = None
    billing_contact: Optional[str] = None
    currency: str
    exchange_rate: Optional[float] = None

    # Detalle BOAH
    days_navigated: Optional[float] = None
    rate_per_day: Optional[float] = None
    days_mobilization: Optional[float] = None
    rate_mobilization: Optional[float] = None

    # Detalle Menores
    vessel_rent_cost: Optional[float] = None
    vehicle_rent_cost: Optional[float] = None
    fuel_liters: Optional[float] = None
    fuel_price_per_liter: Optional[float] = None
    fuel_cost: Optional[float] = None
    
    vehicle_fuel_liters: Optional[float] = None
    vehicle_fuel_price_per_liter: Optional[float] = None
    vehicle_fuel_cost: Optional[float] = None

    # Ajustes
    other_costs: Optional[float] = None
    other_costs_description: Optional[str] = None
    subtotal: float
    discount: float
    tax_pct: float
    tax_amount: float
    total: float

    # Estado
    status: BillingStatus
    payment_reference: Optional[str] = None
    payment_date: Optional[date] = None
    transfer_date: Optional[date] = None
    receipt_filename: Optional[str] = None
    receipt_uploaded_at: Optional[datetime] = None
    vessel_order_filename: Optional[str] = None
    vessel_order_uploaded_at: Optional[datetime] = None
    signed_vessel_order_filename: Optional[str] = None
    signed_vessel_order_uploaded_at: Optional[datetime] = None
    notes: Optional[str] = None

    created_at: datetime
    updated_at: datetime

    # Relación
    cruise: Optional[CruiseMin] = None

    model_config = {"from_attributes": True}


# ── List ──────────────────────────────────────────────────────

class CruiseBillingList(BaseModel):
    total: int
    items: list[CruiseBillingResponse]


# ── Stats ─────────────────────────────────────────────────────

class CruiseBillingSummary(BaseModel):
    total_by_status: dict[str, float] # status: sum_total
    total_by_currency: dict[str, float] # currency: sum_total
    count_by_status: dict[str, int]


class CruiseBillingStats(BaseModel):
    summary: CruiseBillingSummary
    monthly_billing: list[dict] # {month: str, total_mxn: float, total_usd: float}
