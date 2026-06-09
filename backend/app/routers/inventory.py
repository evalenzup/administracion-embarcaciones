"""
SIAE — Router de Inventario.
CRUD de ítems + movimientos de entrada/salida.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.vessel import Vessel
from app.models.inventory import InventoryItem, InventoryMovement
from app.schemas.inventory import (
    InventoryItemCreate, InventoryItemUpdate, InventoryItemResponse, InventoryItemList,
    MovementCreate, MovementResponse, MovementList,
)
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/inventory", tags=["Inventario"])


@router.get("", response_model=InventoryItemList)
async def list_items(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=1000),
    vessel_id: int = Query(None),
    category: str = Query(None),
    stock_status: str = Query(None, description="ok, bajo, agotado"),
    search: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("inventory", "view")),
):
    query = db.query(InventoryItem).filter(InventoryItem.is_active == True)
    if vessel_id:
        query = query.filter(InventoryItem.vessel_id == vessel_id)
    if category:
        query = query.filter(InventoryItem.category == category)
    if search:
        query = query.filter(
            (InventoryItem.name.ilike(f"%{search}%")) |
            (InventoryItem.part_number.ilike(f"%{search}%")) |
            (InventoryItem.linked_system.ilike(f"%{search}%"))
        )

    all_items = query.order_by(InventoryItem.name).all()
    if stock_status:
        all_items = [i for i in all_items if i.stock_status == stock_status]

    total = len(all_items)
    items = all_items[skip:skip + limit]
    return InventoryItemList(total=total, items=items)


@router.get("/summary")
async def inventory_summary(
    vessel_id: int = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("inventory", "view")),
):
    """Resumen de stock para dashboard."""
    query = db.query(InventoryItem).filter(InventoryItem.is_active == True)
    if vessel_id:
        query = query.filter(InventoryItem.vessel_id == vessel_id)
    items = query.all()
    return {
        "total": len(items),
        "ok": sum(1 for i in items if i.stock_status == "ok"),
        "bajo": sum(1 for i in items if i.stock_status == "bajo"),
        "agotado": sum(1 for i in items if i.stock_status == "agotado"),
        "valor_total": round(sum(i.total_value or 0 for i in items), 2),
    }


@router.get("/{item_id}", response_model=InventoryItemResponse)
async def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("inventory", "view")),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    return item


@router.post("", response_model=InventoryItemResponse, status_code=201)
async def create_item(
    data: InventoryItemCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("inventory", "create")),
):
    if not db.query(Vessel).filter(Vessel.id == data.vessel_id).first():
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    item = InventoryItem(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)

    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="create", module="inventory", entity_type="InventoryItem",
               entity_id=item.id, description=f"Creó ítem '{item.name}'",
               ip_address=request.client.host if request.client else None)
    return item


@router.put("/{item_id}", response_model=InventoryItemResponse)
async def update_item(
    item_id: int,
    data: InventoryItemUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("inventory", "edit")),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)

    db.commit()
    db.refresh(item)
    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="update", module="inventory", entity_type="InventoryItem",
               entity_id=item.id, description=f"Actualizó ítem '{item.name}'",
               ip_address=request.client.host if request.client else None)
    return item


@router.delete("/{item_id}")
async def delete_item(
    item_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("inventory", "delete")),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    name = item.name
    db.delete(item)
    db.commit()
    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="delete", module="inventory", entity_type="InventoryItem",
               entity_id=item_id, description=f"Eliminó ítem '{name}'",
               ip_address=request.client.host if request.client else None)
    return {"message": f"Ítem '{name}' eliminado"}


# ── Movimientos ────────────────────────────────────────────────

@router.post("/{item_id}/movements", response_model=MovementResponse, status_code=201)
async def register_movement(
    item_id: int,
    data: MovementCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("inventory", "edit")),
):
    """Registrar una entrada, salida o ajuste de stock."""
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")

    qty_before = item.quantity

    if data.movement_type == "entrada":
        item.quantity = round(item.quantity + data.quantity, 4)
    elif data.movement_type == "salida":
        if data.quantity > item.quantity:
            raise HTTPException(status_code=400, detail=f"Stock insuficiente. Disponible: {item.quantity}")
        item.quantity = round(item.quantity - data.quantity, 4)
    else:  # ajuste
        item.quantity = data.quantity

    qty_after = item.quantity

    movement = InventoryMovement(
        item_id=item_id,
        user_id=current_user.id,
        movement_type=data.movement_type,
        quantity=data.quantity,
        quantity_before=qty_before,
        quantity_after=qty_after,
        reason=data.reason,
        reference=data.reference,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)

    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="update", module="inventory", entity_type="InventoryMovement",
               entity_id=movement.id,
               description=f"{data.movement_type.capitalize()} de {data.quantity} {item.unit.value} de '{item.name}'",
               ip_address=request.client.host if request.client else None)
    return movement


@router.get("/{item_id}/movements", response_model=MovementList)
async def list_movements(
    item_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("inventory", "view")),
):
    if not db.query(InventoryItem).filter(InventoryItem.id == item_id).first():
        raise HTTPException(status_code=404, detail="Ítem no encontrado")

    query = db.query(InventoryMovement).filter(InventoryMovement.item_id == item_id)
    total = query.count()
    items = query.order_by(InventoryMovement.created_at.desc()).offset(skip).limit(limit).all()
    return MovementList(total=total, items=items)
