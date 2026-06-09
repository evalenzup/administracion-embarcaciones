"""
SIAE — Schemas Pydantic para Equipos.
"""

from datetime import datetime
from pydantic import BaseModel, Field
from app.models.equipment import EquipmentCategory, EquipmentStatus
from app.models.inventory import InventoryCategory


class EquipmentCreate(BaseModel):
    """Crear un nuevo equipo."""
    vessel_id: int
    name: str = Field(..., min_length=2, max_length=200)
    category: EquipmentCategory = EquipmentCategory.OTRO
    brand: str | None = None
    model: str | None = None
    serial_number: str | None = None
    year_installed: int | None = None
    location: str | None = None
    description: str | None = None
    characteristics: str | None = None
    status: EquipmentStatus = EquipmentStatus.OPERATIVO
    hour_meter: float = 0.0


class EquipmentUpdate(BaseModel):
    """Actualizar un equipo existente."""
    name: str | None = None
    category: EquipmentCategory | None = None
    brand: str | None = None
    model: str | None = None
    serial_number: str | None = None
    year_installed: int | None = None
    location: str | None = None
    description: str | None = None
    characteristics: str | None = None
    status: EquipmentStatus | None = None
    hour_meter: float | None = None


class VesselBasicInEq(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}

class InventoryItemBasic(BaseModel):
    id: int
    name: str
    category: InventoryCategory
    part_number: str | None = None
    unit: str
    quantity: float
    model_config = {"from_attributes": True}

class EquipmentRoutinePartBase(BaseModel):
    inventory_item_id: int
    quantity_required: float

class EquipmentRoutinePartCreate(EquipmentRoutinePartBase):
    pass

class EquipmentRoutinePartResponse(EquipmentRoutinePartBase):
    id: int
    routine_id: int
    inventory_item: InventoryItemBasic | None = None
    
    model_config = {"from_attributes": True}


class EquipmentRoutineBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    description: str | None = None
    interval_hours: float | None = None
    interval_months: int | None = None
    last_performed_hours: float | None = None
    last_performed_date: datetime | None = None

class EquipmentRoutineCreate(EquipmentRoutineBase):
    parts: list[EquipmentRoutinePartCreate] | None = None

class EquipmentRoutineUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    description: str | None = None
    interval_hours: float | None = None
    interval_months: int | None = None
    last_performed_hours: float | None = None
    last_performed_date: datetime | None = None
    parts: list[EquipmentRoutinePartCreate] | None = None

class EquipmentRoutineResponse(EquipmentRoutineBase):
    id: int
    equipment_id: int
    parts: list[EquipmentRoutinePartResponse] = []
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class EquipmentResponse(BaseModel):
    """Respuesta de equipo."""
    id: int
    vessel_id: int
    name: str
    category: EquipmentCategory
    brand: str | None = None
    model: str | None = None
    serial_number: str | None = None
    year_installed: int | None = None
    location: str | None = None
    description: str | None = None
    characteristics: str | None = None
    status: EquipmentStatus
    hour_meter: float
    manual_file_name: str | None = None
    manual_file_path: str | None = None
    
    routines: list[EquipmentRoutineResponse] | None = None
    vessel: VesselBasicInEq
    created_at: datetime
    updated_at: datetime
    
    model_config = {"from_attributes": True}


class EquipmentList(BaseModel):
    """Lista paginada de equipos."""
    total: int
    items: list[EquipmentResponse]
