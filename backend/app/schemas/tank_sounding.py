"""
SIAE — Schemas Pydantic para TankSounding y TankSoundingItem.
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from app.models.tank_sounding import SoundingType
from app.schemas.vessel_tank import VesselTankResponse


# ── Items de Sondeo ───────────────────────────────────────────

class TankSoundingItemCreate(BaseModel):
    tank_id: int
    sounding_cm: Optional[float] = None
    fill_percentage: float = Field(..., ge=0, le=100)
    density_applied: Optional[float] = None  # Si es null, toma la design_density del tanque
    notes: Optional[str] = None


class TankSoundingItemResponse(BaseModel):
    id: int
    sounding_id: int
    tank_id: int
    sounding_cm: Optional[float] = None
    fill_percentage: float
    volume_m3: float
    density_applied: float
    weight_tons: float
    zg_m: float
    mom_z: float
    is_slack: bool
    fsm_applied: float
    notes: Optional[str] = None
    tank: Optional[VesselTankResponse] = None

    model_config = {"from_attributes": True}


# ── Schemas de Cabecera de Sondeo ─────────────────────────────

class TankSoundingCreate(BaseModel):
    vessel_id: Optional[int] = None
    cruise_id: Optional[int] = None
    sounding_datetime: Optional[datetime] = None
    sounding_type: SoundingType = SoundingType.RUTINA_DIARIA
    draft_fwd_m: Optional[float] = None
    draft_aft_m: Optional[float] = None
    notes: Optional[str] = None
    is_official: bool = False
    items: List[TankSoundingItemCreate] = []


class TankSoundingUpdate(BaseModel):
    sounding_datetime: Optional[datetime] = None
    sounding_type: Optional[SoundingType] = None
    draft_fwd_m: Optional[float] = None
    draft_aft_m: Optional[float] = None
    notes: Optional[str] = None
    is_official: Optional[bool] = None
    items: Optional[List[TankSoundingItemCreate]] = None


class TankSoundingUserMin(BaseModel):
    id: int
    full_name: str
    email: Optional[str] = None

    model_config = {"from_attributes": True}


class TankSoundingVesselMin(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class TankSoundingResponse(BaseModel):
    id: int
    vessel_id: int
    cruise_id: Optional[int] = None
    performed_by_id: Optional[int] = None
    sounding_datetime: datetime
    sounding_type: SoundingType

    draft_fwd_m: Optional[float] = None
    draft_aft_m: Optional[float] = None
    trim_m: Optional[float] = None

    total_fuel_m3: float
    total_fuel_tons: float
    total_fresh_water_m3: float
    total_fresh_water_tons: float
    total_ballast_m3: float
    total_ballast_tons: float
    total_liquids_tons: float
    total_liquids_mom_z: float
    total_fsm_moments: float

    notes: Optional[str] = None
    is_official: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    performed_by: Optional[TankSoundingUserMin] = None
    vessel: Optional[TankSoundingVesselMin] = None
    items: List[TankSoundingItemResponse] = []

    model_config = {"from_attributes": True}
