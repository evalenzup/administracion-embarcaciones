"""
SIAE — Schemas Pydantic para asignaciones de Tripulación → Crucero.
"""
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.vessel_crew import CrewRole


class PersonnelEmbed(BaseModel):
    id: int
    first_name: str
    last_name: str
    full_name: str
    email: str | None = None
    phone: str | None = None
    photo_url: str | None = None
    nationality: str | None = None
    model_config = {"from_attributes": True}


class CruiseCrewCreate(BaseModel):
    personnel_id: int
    role: CrewRole
    notes: str | None = None


class CruiseCrewUpdate(BaseModel):
    role: CrewRole | None = None
    notes: str | None = None


class CruiseCrewResponse(BaseModel):
    id: int
    cruise_id: int
    personnel_id: int
    role: CrewRole
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
    personnel: PersonnelEmbed
    model_config = {"from_attributes": True}
