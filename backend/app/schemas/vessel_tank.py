"""
SIAE — Schemas Pydantic para VesselTank (Tanques de Embarcación).
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from app.models.vessel_tank import TankFluidType


class VesselTankBase(BaseModel):
    vessel_id: int
    order_index: int = 0
    tank_code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=150)
    fluid_type: TankFluidType
    capacity_m3: float = Field(..., gt=0)
    design_density: float = Field(..., gt=0)
    max_weight_tons: float = Field(..., gt=0)
    zg_m: float
    fsm_inertia_i: float = Field(0.0, ge=0)
    xg_m: Optional[float] = None
    yg_m: Optional[float] = None
    max_sounding_cm: Optional[float] = None
    sounding_pipe_location: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True


class VesselTankCreate(VesselTankBase):
    pass


class VesselTankUpdate(BaseModel):
    order_index: Optional[int] = None
    tank_code: Optional[str] = None
    name: Optional[str] = None
    fluid_type: Optional[TankFluidType] = None
    capacity_m3: Optional[float] = None
    design_density: Optional[float] = None
    max_weight_tons: Optional[float] = None
    zg_m: Optional[float] = None
    fsm_inertia_i: Optional[float] = None
    xg_m: Optional[float] = None
    yg_m: Optional[float] = None
    max_sounding_cm: Optional[float] = None
    sounding_pipe_location: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class VesselTankResponse(VesselTankBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
