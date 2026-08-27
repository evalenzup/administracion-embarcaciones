"""
SIAE — Esquemas Pydantic para Telemetría de Embarcaciones.
"""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class VesselTelemetryBase(BaseModel):
    timestamp: datetime
    node: Optional[str] = None
    wind_dir: Optional[float] = None
    wind_speed: Optional[float] = None
    wind_dir_corr: Optional[float] = None
    wind_speed_corr: Optional[float] = None
    pressure: Optional[float] = None
    humidity: Optional[float] = None
    temp: Optional[float] = None
    dewpoint: Optional[float] = None
    precip_total: Optional[float] = None
    precip_int: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    gps_fix: Optional[bool] = None
    supply_v: Optional[float] = None
    status: Optional[str] = None


class VesselTelemetryCreate(VesselTelemetryBase):
    pass


class VesselTelemetryResponse(VesselTelemetryBase):
    id: int
    vessel_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class VesselTelemetryUploadResult(BaseModel):
    success: bool
    message: str
    records_received: int
    records_inserted: int


class VesselLatestTelemetry(BaseModel):
    vessel_id: int
    vessel_name: str
    vessel_type: str
    latest_telemetry: Optional[VesselTelemetryResponse] = None

    class Config:
        from_attributes = True
