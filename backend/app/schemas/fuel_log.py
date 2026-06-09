"""
SIAE — Schemas Pydantic para FuelLog (Registro de Carga de Combustible).
"""

from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field


# ── Schemas anidados simples ──────────────────────────────────

class VesselMin(BaseModel):
    id: int
    name: str
    fuel_type: Optional[str] = None
    fuel_capacity_l: Optional[float] = None
    model_config = {"from_attributes": True}


class CruiseMin(BaseModel):
    id: int
    folio: Optional[str] = None
    title: str
    model_config = {"from_attributes": True}


class UserMin(BaseModel):
    id: int
    full_name: str
    username: str
    model_config = {"from_attributes": True}


# ── Base ──────────────────────────────────────────────────────

class FuelLogBase(BaseModel):
    vessel_id: int
    cruise_id: Optional[int] = None
    load_date: date
    load_time: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    fuel_type: str = Field(..., min_length=2, max_length=50)
    liters: float = Field(..., gt=0)
    level_before_pct: Optional[float] = Field(None, ge=0, le=100)
    level_after_pct: Optional[float] = Field(None, ge=0, le=100)
    supplier: Optional[str] = Field(None, max_length=200)
    unit_cost: Optional[float] = Field(None, ge=0)
    total_cost: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


# ── Create ────────────────────────────────────────────────────

class FuelLogCreate(FuelLogBase):
    pass


# ── Update ────────────────────────────────────────────────────

class FuelLogUpdate(BaseModel):
    cruise_id: Optional[int] = None
    load_date: Optional[date] = None
    load_time: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    fuel_type: Optional[str] = Field(None, min_length=2, max_length=50)
    liters: Optional[float] = Field(None, gt=0)
    level_before_pct: Optional[float] = Field(None, ge=0, le=100)
    level_after_pct: Optional[float] = Field(None, ge=0, le=100)
    supplier: Optional[str] = Field(None, max_length=200)
    unit_cost: Optional[float] = Field(None, ge=0)
    total_cost: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


# ── Response ──────────────────────────────────────────────────

class FuelLogResponse(BaseModel):
    id: int
    vessel_id: int
    cruise_id: Optional[int] = None
    user_id: Optional[int] = None
    load_date: date
    load_time: Optional[str] = None
    fuel_type: str
    liters: float
    level_before_pct: Optional[float] = None
    level_after_pct: Optional[float] = None
    supplier: Optional[str] = None
    unit_cost: Optional[float] = None
    total_cost: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # Relaciones
    vessel: Optional[VesselMin] = None
    cruise: Optional[CruiseMin] = None
    registered_by: Optional[UserMin] = None

    model_config = {"from_attributes": True}


# ── List ──────────────────────────────────────────────────────

class FuelLogList(BaseModel):
    total: int
    items: list[FuelLogResponse]


# ── Stats ─────────────────────────────────────────────────────

class FuelLogMonthStat(BaseModel):
    """Consumo agrupado por mes para gráfica."""
    year: int
    month: int
    vessel_id: int
    vessel_name: str
    total_liters: float
    total_cost: Optional[float] = None
    loads_count: int


class FuelLogStats(BaseModel):
    """Resumen general para las tarjetas de la página."""
    total_liters_month: float
    total_cost_month: Optional[float] = None
    loads_count_month: int
    last_load_date: Optional[date] = None
    monthly_series: list[FuelLogMonthStat]
