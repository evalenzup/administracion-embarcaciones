"""
SIAE — Schemas Pydantic para Bitácoras.
"""
from datetime import date, datetime
from pydantic import BaseModel, Field
from app.models.logbook import LogbookType


class LogbookEventTypeBase(BaseModel):
    name: str = Field(..., max_length=100)
    description: str | None = Field(None, max_length=255)
    color: str | None = Field(None, max_length=20)
    icon: str | None = Field(None, max_length=50)
    is_active: bool = True

class LogbookEventTypeCreate(LogbookEventTypeBase):
    pass

class LogbookEventTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None
    icon: str | None = None
    is_active: bool | None = None

class LogbookEventTypeResponse(LogbookEventTypeBase):
    id: int
    created_at: datetime
    model_config = {"from_attributes": True}

class LogbookEntryCreate(BaseModel):
    vessel_id: int
    logbook_type: LogbookType
    event_type_id: int | None = None
    cruise_id: int | None = None
    entry_date: date
    entry_time: str | None = Field(None, max_length=10)
    title: str | None = Field(None, max_length=300)
    content: str
    # Horómetros
    engine_hours: float | None = None
    engine_hours_delta: float | None = None
    component_name: str | None = Field(None, max_length=200)
    # Navegación
    latitude: float | None = None
    longitude: float | None = None
    location_name: str | None = Field(None, max_length=200)
    weather_conditions: str | None = Field(None, max_length=200)
    sea_state: str | None = Field(None, max_length=100)
    # Firma
    is_signed: bool = False
    signed_by: str | None = Field(None, max_length=100)


class LogbookEntryUpdate(BaseModel):
    event_type_id: int | None = None
    cruise_id: int | None = None
    entry_date: date | None = None
    entry_time: str | None = None
    title: str | None = None
    content: str | None = None
    engine_hours: float | None = None
    engine_hours_delta: float | None = None
    component_name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    location_name: str | None = None
    weather_conditions: str | None = None
    sea_state: str | None = None
    is_signed: bool | None = None
    signed_by: str | None = None


class VesselBasicLog(BaseModel):
    id: int; name: str
    model_config = {"from_attributes": True}

class UserBasicLog(BaseModel):
    id: int; full_name: str
    model_config = {"from_attributes": True}

class CruiseBasicLog(BaseModel):
    id: int
    name: str
    cruise_number: str | None = None
    model_config = {"from_attributes": True}


class LogbookEntryResponse(BaseModel):
    id: int
    vessel_id: int
    user_id: int | None = None
    cruise_id: int | None = None
    logbook_type: LogbookType
    entry_date: date
    entry_time: str | None = None
    title: str | None = None
    content: str
    engine_hours: float | None = None
    engine_hours_delta: float | None = None
    component_name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    location_name: str | None = None
    weather_conditions: str | None = None
    sea_state: str | None = None
    is_signed: bool
    signed_by: str | None = None
    event_type_id: int | None = None
    vessel: VesselBasicLog
    user: UserBasicLog | None = None
    event_type: LogbookEventTypeResponse | None = None
    cruise: CruiseBasicLog | None = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class LogbookEntryList(BaseModel):
    total: int
    items: list[LogbookEntryResponse]
