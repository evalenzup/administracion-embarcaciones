"""
SIAE — Schemas Pydantic para VesselRate (Catálogo de Tarifas).
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from app.models.vessel_rate import VesselRateClientType


class VesselMin(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class VesselRateBase(BaseModel):
    vessel_id: int
    concept: str = Field(..., min_length=2, max_length=200)
    client_type: VesselRateClientType
    rate_amount: float = Field(..., ge=0)
    currency: str = Field("MXN", min_length=3, max_length=10)
    year: int = Field(2025, ge=2000)
    is_active: bool = True


class VesselRateCreate(VesselRateBase):
    pass


class VesselRateUpdate(BaseModel):
    concept: Optional[str] = Field(None, min_length=2, max_length=200)
    client_type: Optional[VesselRateClientType] = None
    rate_amount: Optional[float] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=10)
    year: Optional[int] = Field(None, ge=2000)
    is_active: Optional[bool] = None


class VesselRateResponse(VesselRateBase):
    id: int
    created_at: datetime
    updated_at: datetime
    vessel: Optional[VesselMin] = None

    model_config = {"from_attributes": True}


class VesselRateList(BaseModel):
    total: int
    items: list[VesselRateResponse]
