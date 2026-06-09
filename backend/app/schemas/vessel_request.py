"""
SIAE — Schemas Pydantic para Solicitudes de Embarcación (VesselRequest).
"""

from datetime import datetime
from pydantic import BaseModel, Field
from app.models.vessel_request import RequestStatus


class VesselRequestBase(BaseModel):
    vessel_id: int
    project_name: str = Field(..., min_length=2, max_length=300)
    scientific_leader: str = Field(..., min_length=2, max_length=200)
    objective: str | None = None
    study_area: str | None = None
    departure_date: datetime
    return_date: datetime
    scientists_count: int | None = 0
    crew_count: int | None = 0


class VesselRequestCreate(VesselRequestBase):
    pass


class VesselRequestUpdate(BaseModel):
    vessel_id: int | None = None
    project_name: str | None = Field(None, min_length=2, max_length=300)
    scientific_leader: str | None = Field(None, min_length=2, max_length=200)
    objective: str | None = None
    study_area: str | None = None
    departure_date: datetime | None = None
    return_date: datetime | None = None
    scientists_count: int | None = None
    crew_count: int | None = None


class VesselRequestReview(BaseModel):
    status: RequestStatus
    admin_notes: str | None = None


class UserBasicInRequest(BaseModel):
    id: int
    username: str
    full_name: str

    model_config = {"from_attributes": True}


class VesselBasicInRequest(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class VesselRequestResponse(VesselRequestBase):
    id: int
    applicant_id: int
    status: RequestStatus
    approved_by_id: int | None = None
    approval_date: datetime | None = None
    admin_notes: str | None = None
    created_at: datetime
    updated_at: datetime

    applicant: UserBasicInRequest | None = None
    approved_by: UserBasicInRequest | None = None
    vessel: VesselBasicInRequest | None = None

    model_config = {"from_attributes": True}


class VesselRequestList(BaseModel):
    total: int
    items: list[VesselRequestResponse]
