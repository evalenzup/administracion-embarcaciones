"""
SIAE — Schemas Pydantic para Vessel (Embarcación).
"""

from datetime import datetime
from pydantic import BaseModel, Field
from app.models.vessel import VesselType, VesselStatus


class VesselCreate(BaseModel):
    """Crear una nueva embarcación."""
    name: str = Field(..., min_length=2, max_length=100)
    registration_number: str | None = Field(None, max_length=50)
    vessel_type: VesselType = VesselType.BARCO
    status: VesselStatus = VesselStatus.ACTIVO

    # Características físicas
    length_m: float | None = None
    beam_m: float | None = None
    draft_m: float | None = None
    gross_tonnage: float | None = None
    year_built: int | None = None
    hull_material: str | None = Field(None, max_length=50)

    # Propulsión
    engine_type: str | None = Field(None, max_length=100)
    engine_power_hp: float | None = None
    max_speed_knots: float | None = None
    fuel_type: str | None = Field(None, max_length=50)
    fuel_capacity_l: float | None = None

    # Capacidad
    max_crew: int | None = None
    max_passengers: int | None = None

    # Ubicación
    home_port: str | None = Field(None, max_length=100)
    current_location: str | None = Field(None, max_length=200)

    # Otros
    description: str | None = None
    photo_url: str | None = Field(None, max_length=500)


class VesselUpdate(BaseModel):
    """Actualizar una embarcación existente."""
    name: str | None = Field(None, min_length=2, max_length=100)
    registration_number: str | None = Field(None, max_length=50)
    vessel_type: VesselType | None = None
    status: VesselStatus | None = None
    length_m: float | None = None
    beam_m: float | None = None
    draft_m: float | None = None
    gross_tonnage: float | None = None
    year_built: int | None = None
    hull_material: str | None = None
    engine_type: str | None = None
    engine_power_hp: float | None = None
    max_speed_knots: float | None = None
    fuel_type: str | None = None
    fuel_capacity_l: float | None = None
    max_crew: int | None = None
    max_passengers: int | None = None
    home_port: str | None = None
    current_location: str | None = None
    description: str | None = None
    photo_url: str | None = None
    is_active: bool | None = None


class VesselResponse(BaseModel):
    """Respuesta de embarcación."""
    id: int
    name: str
    registration_number: str | None = None
    vessel_type: VesselType
    status: VesselStatus
    length_m: float | None = None
    beam_m: float | None = None
    draft_m: float | None = None
    gross_tonnage: float | None = None
    year_built: int | None = None
    hull_material: str | None = None
    engine_type: str | None = None
    engine_power_hp: float | None = None
    max_speed_knots: float | None = None
    fuel_type: str | None = None
    fuel_capacity_l: float | None = None
    max_crew: int | None = None
    max_passengers: int | None = None
    home_port: str | None = None
    current_location: str | None = None
    description: str | None = None
    photo_url: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VesselBasic(BaseModel):
    """Respuesta básica de embarcación (para selects y listas reducidas)."""
    id: int
    name: str
    vessel_type: VesselType
    status: VesselStatus
    max_speed_knots: float | None = None
    max_crew: int | None = None
    max_passengers: int | None = None

    model_config = {"from_attributes": True}


class VesselList(BaseModel):
    """Lista paginada de embarcaciones."""
    total: int
    items: list[VesselResponse]
