"""
SIAE — Schemas Pydantic para VesselCrew (Tripulación Base).
"""

from datetime import datetime
from pydantic import BaseModel
from app.models.vessel_crew import CrewRole


class VesselCrewCreate(BaseModel):
    """Asignar un miembro de personal a la tripulación base de una embarcación."""
    personnel_id: int
    role: CrewRole = CrewRole.MARINERO


class VesselCrewUpdate(BaseModel):
    """Actualizar el rol de un miembro de la tripulación base."""
    role: CrewRole | None = None
    is_active: bool | None = None


class PersonnelBasicInfo(BaseModel):
    """Información básica del personal para la respuesta de tripulación."""
    id: int
    first_name: str
    last_name: str
    full_name: str
    role: str
    phone: str | None = None
    email: str | None = None

    model_config = {"from_attributes": True}


class VesselCrewResponse(BaseModel):
    """Respuesta de un miembro de la tripulación base."""
    id: int
    vessel_id: int
    personnel_id: int
    role: CrewRole
    is_active: bool
    created_at: datetime
    personnel: PersonnelBasicInfo | None = None

    model_config = {"from_attributes": True}
