"""
SIAE — Schemas Pydantic para Inventario.
"""
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.inventory import InventoryCategory, InventoryUnit


class InventoryItemCreate(BaseModel):
    vessel_id: int
    maintenance_category_id: int | None = None
    equipment_id: int | None = None
    name: str = Field(..., min_length=2, max_length=200)
    part_number: str | None = Field(None, max_length=100)
    category: InventoryCategory = InventoryCategory.CONSUMIBLE
    unit: InventoryUnit = InventoryUnit.PIEZA
    description: str | None = None
    quantity: float = 0
    min_quantity: float = 0
    max_quantity: float | None = None
    location: str | None = Field(None, max_length=200)
    unit_cost: float | None = None
    linked_system: str | None = Field(None, max_length=200)
    notes: str | None = None


class InventoryItemUpdate(BaseModel):
    vessel_id: int | None = None
    maintenance_category_id: int | None = None
    equipment_id: int | None = None
    name: str | None = Field(None, min_length=2, max_length=200)
    part_number: str | None = None
    category: InventoryCategory | None = None
    unit: InventoryUnit | None = None
    description: str | None = None
    min_quantity: float | None = None
    max_quantity: float | None = None
    location: str | None = None
    unit_cost: float | None = None
    linked_system: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class VesselBasicInv(BaseModel):
    id: int; name: str
    model_config = {"from_attributes": True}

class CatBasicInv(BaseModel):
    id: int; name: str
    model_config = {"from_attributes": True}

class EqBasicInv(BaseModel):
    id: int; name: str
    model_config = {"from_attributes": True}


class InventoryItemResponse(BaseModel):
    id: int
    vessel_id: int
    maintenance_category_id: int | None = None
    equipment_id: int | None = None
    name: str
    part_number: str | None = None
    category: InventoryCategory
    unit: InventoryUnit
    description: str | None = None
    quantity: float
    min_quantity: float
    max_quantity: float | None = None
    location: str | None = None
    unit_cost: float | None = None
    linked_system: str | None = None
    is_active: bool
    notes: str | None = None
    stock_status: str
    total_value: float | None = None
    vessel: VesselBasicInv
    maintenance_category: CatBasicInv | None = None
    equipment: EqBasicInv | None = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class InventoryItemList(BaseModel):
    total: int
    items: list[InventoryItemResponse]


class MovementCreate(BaseModel):
    """Crear un movimiento de inventario (entrada/salida/ajuste)."""
    movement_type: str = Field(..., pattern="^(entrada|salida|ajuste)$")
    quantity: float = Field(..., gt=0)
    reason: str | None = Field(None, max_length=300)
    reference: str | None = Field(None, max_length=100)


class UserBasicInv(BaseModel):
    id: int; full_name: str
    model_config = {"from_attributes": True}

class ItemBasicInv(BaseModel):
    id: int; name: str; unit: InventoryUnit
    model_config = {"from_attributes": True}

class MovementResponse(BaseModel):
    id: int
    item_id: int
    movement_type: str
    quantity: float
    quantity_before: float
    quantity_after: float
    reason: str | None = None
    reference: str | None = None
    created_at: datetime
    item: ItemBasicInv
    user: UserBasicInv | None = None
    model_config = {"from_attributes": True}

class MovementList(BaseModel):
    total: int
    items: list[MovementResponse]
