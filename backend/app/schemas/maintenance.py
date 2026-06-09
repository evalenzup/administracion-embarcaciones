"""
SIAE — Schemas Pydantic para Mantenimiento.
"""

from datetime import date, datetime
from pydantic import BaseModel, Field
from app.models.maintenance import MaintenancePriority, MaintenanceStatus, MaintenanceType


# ── Categorías ─────────────────────────────────────────────────

class MaintenanceCategoryCreate(BaseModel):
    """Crear una categoría de mantenimiento."""
    name: str = Field(..., min_length=2, max_length=100)
    description: str | None = Field(None, max_length=300)
    icon: str | None = Field(None, max_length=50)
    color: str | None = Field(None, max_length=20)


class MaintenanceCategoryUpdate(BaseModel):
    """Actualizar una categoría."""
    name: str | None = Field(None, min_length=2, max_length=100)
    description: str | None = None
    icon: str | None = None
    color: str | None = None
    is_active: bool | None = None


class MaintenanceCategoryResponse(BaseModel):
    """Respuesta de categoría."""
    id: int
    name: str
    description: str | None = None
    icon: str | None = None
    color: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MaintenanceCategoryList(BaseModel):
    """Lista de categorías."""
    total: int
    items: list[MaintenanceCategoryResponse]


# ── Registros de mantenimiento ─────────────────────────────────

class VesselBasicInMaint(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class CategoryBasicInMaint(BaseModel):
    id: int
    name: str
    color: str | None = None
    model_config = {"from_attributes": True}


class UserBasicInMaint(BaseModel):
    id: int
    full_name: str
    model_config = {"from_attributes": True}


class MaintenanceRecordCreate(BaseModel):
    """Crear un registro de mantenimiento."""
    vessel_id: int
    category_id: int | None = None
    equipment_id: int | None = None
    routine_id: int | None = None
    assigned_to: int | None = None
    title: str = Field(..., min_length=2, max_length=200)
    description: str | None = None
    maintenance_type: MaintenanceType = MaintenanceType.CORRECTIVO
    priority: MaintenancePriority = MaintenancePriority.MEDIA
    status: MaintenanceStatus = MaintenanceStatus.PENDIENTE
    scheduled_date: date | None = None
    started_date: date | None = None
    completed_date: date | None = None
    estimated_cost: float | None = None
    actual_cost: float | None = None
    system_component: str | None = Field(None, max_length=200)
    work_performed: str | None = None
    parts_used: str | None = None
    hours_worked: float | None = None
    notes: str | None = None


class MaintenanceRecordUpdate(BaseModel):
    """Actualizar un registro de mantenimiento."""
    category_id: int | None = None
    equipment_id: int | None = None
    routine_id: int | None = None
    assigned_to: int | None = None
    title: str | None = Field(None, min_length=2, max_length=200)
    description: str | None = None
    maintenance_type: MaintenanceType | None = None
    priority: MaintenancePriority | None = None
    status: MaintenanceStatus | None = None
    scheduled_date: date | None = None
    started_date: date | None = None
    completed_date: date | None = None
    estimated_cost: float | None = None
    actual_cost: float | None = None
    system_component: str | None = None
    work_performed: str | None = None
    parts_used: str | None = None
    hours_worked: float | None = None
    notes: str | None = None


class EqBasicInMaint(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class RoutineBasicInMaint(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class MaintenanceRecordResponse(BaseModel):
    """Respuesta de registro de mantenimiento."""
    id: int
    vessel_id: int
    category_id: int | None = None
    equipment_id: int | None = None
    routine_id: int | None = None
    assigned_to: int | None = None
    title: str
    description: str | None = None
    maintenance_type: MaintenanceType
    priority: MaintenancePriority
    status: MaintenanceStatus
    scheduled_date: date | None = None
    started_date: date | None = None
    completed_date: date | None = None
    estimated_cost: float | None = None
    actual_cost: float | None = None
    system_component: str | None = None
    work_performed: str | None = None
    parts_used: str | None = None
    hours_worked: float | None = None
    notes: str | None = None
    vessel: VesselBasicInMaint
    category: CategoryBasicInMaint | None = None
    equipment: EqBasicInMaint | None = None
    routine: RoutineBasicInMaint | None = None
    assigned_user: UserBasicInMaint | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MaintenanceRecordList(BaseModel):
    """Lista paginada de registros de mantenimiento."""
    total: int
    items: list[MaintenanceRecordResponse]
