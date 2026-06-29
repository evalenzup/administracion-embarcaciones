"""
SIAE — Schemas Pydantic para Cruceros.
"""
from datetime import date, datetime
from pydantic import BaseModel, Field
from app.models.cruise import CruiseStatus
from app.schemas.cruise_crew import CruiseCrewResponse
from app.schemas.port import PortResponse
from app.schemas.project import ProjectResponse


class WaypointCreate(BaseModel):
    order_index: int = 0
    name: str | None = Field(None, max_length=200)
    latitude: float
    longitude: float
    description: str | None = Field(None, max_length=300)
    waypoint_type: str | None = Field(None, max_length=50)
    arrival_date: date | None = None
    departure_date: date | None = None
    speed_knots: float | None = None
    activity: str | None = None
    duration_hours: float | None = None


class CruiseWaypointSampleBase(BaseModel):
    variable_name: str = Field(..., max_length=150)
    sampling_order: int = 1
    responsible_name: str | None = Field(None, max_length=150)
    volume_needed: str | None = Field(None, max_length=50)
    depth_surface: bool = False
    depth_mid_water: bool = False
    depth_bottom: bool = False
    depth_custom: str | None = Field(None, max_length=100)
    notes: str | None = None


class CruiseWaypointSampleCreate(CruiseWaypointSampleBase):
    pass


class CruiseWaypointSampleUpdate(BaseModel):
    variable_name: str | None = None
    sampling_order: int | None = None
    responsible_name: str | None = None
    volume_needed: str | None = None
    depth_surface: bool | None = None
    depth_mid_water: bool | None = None
    depth_bottom: bool | None = None
    depth_custom: str | None = None
    notes: str | None = None


class CruiseWaypointSampleResponse(CruiseWaypointSampleBase):
    id: int
    waypoint_id: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class WaypointResponse(BaseModel):
    id: int
    cruise_id: int
    order_index: int
    name: str | None = None
    latitude: float
    longitude: float
    description: str | None = None
    waypoint_type: str | None = None
    arrival_date: date | None = None
    departure_date: date | None = None
    speed_knots: float | None = None
    activity: str | None = None
    duration_hours: float | None = None
    samples: list[CruiseWaypointSampleResponse] = []
    model_config = {"from_attributes": True}


class VesselBasicCruise(BaseModel):
    id: int
    name: str
    max_speed_knots: float | None = None
    max_crew: int | None = None
    max_passengers: int | None = None
    model_config = {"from_attributes": True}

class UserBasicCruise(BaseModel):
    id: int; full_name: str
    model_config = {"from_attributes": True}


class CruisePlanCreate(BaseModel):
    vessel_id: int
    captain_id: int | None = None
    cruise_number: str | None = Field(None, max_length=100)
    name: str = Field(..., min_length=2, max_length=200)
    objective: str | None = None
    status: CruiseStatus = CruiseStatus.PLANIFICADO
    departure_date: datetime | None = None
    return_date: datetime | None = None
    departure_port: str | None = Field(None, max_length=200)
    return_port: str | None = Field(None, max_length=200)
    departure_port_id: int | None = None
    return_port_id: int | None = None
    planned_nm: float | None = None
    actual_nm: float | None = None
    fuel_consumed: float | None = None
    crew_count: int | None = None
    scientists_count: int | None = None
    project_id: int | None = None
    project_name: str | None = Field(None, max_length=300)
    study_area: str | None = None
    disciplines: str | None = None
    funding_source: str | None = Field(None, max_length=300)
    cruise_responsible: str | None = Field(None, max_length=200)
    notes: str | None = None
    waypoints: list[WaypointCreate] = []


class CruisePlanUpdate(BaseModel):
    captain_id: int | None = None
    cruise_number: str | None = Field(None, max_length=100)
    name: str | None = Field(None, min_length=2, max_length=200)
    objective: str | None = None
    status: CruiseStatus | None = None
    departure_date: datetime | None = None
    return_date: datetime | None = None
    departure_port: str | None = None
    return_port: str | None = None
    departure_port_id: int | None = None
    return_port_id: int | None = None
    planned_nm: float | None = None
    actual_nm: float | None = None
    fuel_consumed: float | None = None
    crew_count: int | None = None
    scientists_count: int | None = None
    project_id: int | None = None
    project_name: str | None = Field(None, max_length=300)
    study_area: str | None = None
    disciplines: str | None = None
    funding_source: str | None = Field(None, max_length=300)
    cruise_responsible: str | None = Field(None, max_length=200)
    notes: str | None = None
    trip_report: str | None = None


class CruiseEquipmentChecklistBase(BaseModel):
    investigator_name: str = Field(..., max_length=150)
    item_name: str = Field(..., max_length=200)
    quantity: float = 1.0
    is_boarded: bool = False
    notes: str | None = None


class CruiseEquipmentChecklistCreate(CruiseEquipmentChecklistBase):
    pass


class CruiseEquipmentChecklistUpdate(BaseModel):
    investigator_name: str | None = None
    item_name: str | None = None
    quantity: float | None = None
    is_boarded: bool | None = None
    notes: str | None = None


class CruiseEquipmentChecklistResponse(CruiseEquipmentChecklistBase):
    id: int
    cruise_id: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class CruiseLogisticsDischargeBase(BaseModel):
    port_name: str = Field(..., max_length=200)
    discharge_date: datetime | None = None
    responsible_land_person: str | None = Field(None, max_length=150)
    destination_lab: str | None = Field(None, max_length=200)
    notes: str | None = None


class CruiseLogisticsDischargeCreate(CruiseLogisticsDischargeBase):
    pass


class CruiseLogisticsDischargeUpdate(BaseModel):
    port_name: str | None = None
    discharge_date: datetime | None = None
    responsible_land_person: str | None = None
    destination_lab: str | None = None
    notes: str | None = None


class CruiseLogisticsDischargeResponse(CruiseLogisticsDischargeBase):
    id: int
    cruise_id: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class CruiseBillingBasicResponse(BaseModel):
    id: int
    status: str
    total: float
    currency: str
    receipt_filename: str | None = None
    vessel_order_filename: str | None = None
    signed_vessel_order_filename: str | None = None
    model_config = {"from_attributes": True}


class CruisePlanResponse(BaseModel):
    id: int
    vessel_id: int
    captain_id: int | None = None
    vessel_request_id: int | None = None
    created_by_id: int | None = None
    scientific_leader: str | None = None
    cruise_number: str | None = None
    name: str
    objective: str | None = None
    status: CruiseStatus
    departure_date: datetime | None = None
    return_date: datetime | None = None
    departure_port: str | None = None
    return_port: str | None = None
    departure_port_id: int | None = None
    return_port_id: int | None = None
    departure_port_ref: PortResponse | None = None
    return_port_ref: PortResponse | None = None
    planned_nm: float | None = None
    actual_nm: float | None = None
    fuel_consumed: float | None = None
    crew_count: int | None = None
    scientists_count: int | None = None
    project_id: int | None = None
    project_name: str | None = None
    project: ProjectResponse | None = None
    study_area: str | None = None
    disciplines: str | None = None
    funding_source: str | None = None
    cruise_responsible: str | None = None
    notes: str | None = None
    duration_days: int | None = None
    vessel: VesselBasicCruise
    captain: UserBasicCruise | None = None
    waypoints: list[WaypointResponse] = []
    checklist: list[CruiseEquipmentChecklistResponse] = []
    discharges: list[CruiseLogisticsDischargeResponse] = []
    crew: list[CruiseCrewResponse] = []
    participants_count: int = 0
    # Track GPX real
    actual_track: list | None = None
    actual_track_filename: str | None = None
    actual_track_uploaded_at: datetime | None = None
    # Reporte de salida
    trip_report: str | None = None
    billing: CruiseBillingBasicResponse | None = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class CruisePlanList(BaseModel):
    total: int
    items: list[CruisePlanResponse]
