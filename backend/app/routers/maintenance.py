"""
SIAE — Router de Mantenimiento.
CRUD de categorías configurables y registros de mantenimiento.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.vessel import Vessel
from app.models.maintenance import MaintenanceCategory, MaintenanceRecord, MaintenanceStatus, MaintenancePriority, MaintenanceType
from app.schemas.maintenance import (
    MaintenanceCategoryCreate, MaintenanceCategoryUpdate, MaintenanceCategoryResponse, MaintenanceCategoryList,
    MaintenanceRecordCreate, MaintenanceRecordUpdate, MaintenanceRecordResponse, MaintenanceRecordList,
)
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/maintenance", tags=["Mantenimiento"])


# ── Categorías ─────────────────────────────────────────────────

@router.get("/categories", response_model=MaintenanceCategoryList)
async def list_categories(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("maintenance", "view")),
):
    """Listar categorías de mantenimiento."""
    query = db.query(MaintenanceCategory)
    if not include_inactive:
        query = query.filter(MaintenanceCategory.is_active == True)

    items = query.order_by(MaintenanceCategory.name).all()
    return MaintenanceCategoryList(total=len(items), items=items)


@router.post("/categories", response_model=MaintenanceCategoryResponse, status_code=201)
async def create_category(
    data: MaintenanceCategoryCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("maintenance", "create")),
):
    """Crear una categoría de mantenimiento."""
    if db.query(MaintenanceCategory).filter(MaintenanceCategory.name == data.name).first():
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")

    cat = MaintenanceCategory(**data.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="create", module="maintenance", entity_type="MaintenanceCategory",
        entity_id=cat.id, description=f"Creó categoría de mantenimiento '{cat.name}'",
        ip_address=request.client.host if request.client else None,
    )
    return cat


@router.put("/categories/{category_id}", response_model=MaintenanceCategoryResponse)
async def update_category(
    category_id: int,
    data: MaintenanceCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("maintenance", "edit")),
):
    """Actualizar una categoría."""
    cat = db.query(MaintenanceCategory).filter(MaintenanceCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(cat, key, value)

    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("maintenance", "delete")),
):
    """Eliminar una categoría (solo si no tiene registros)."""
    cat = db.query(MaintenanceCategory).filter(MaintenanceCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    records_count = db.query(MaintenanceRecord).filter(MaintenanceRecord.category_id == category_id).count()
    if records_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede eliminar: tiene {records_count} registros asociados. Desactívela en su lugar.",
        )

    db.delete(cat)
    db.commit()
    return {"message": f"Categoría '{cat.name}' eliminada"}


# ── Registros de mantenimiento ─────────────────────────────────

@router.get("", response_model=MaintenanceRecordList)
async def list_records(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    vessel_id: int = Query(None),
    category_id: int = Query(None),
    status: MaintenanceStatus = Query(None),
    priority: MaintenancePriority = Query(None),
    maintenance_type: MaintenanceType = Query(None),
    search: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("maintenance", "view")),
):
    """Listar registros de mantenimiento con filtros."""
    query = db.query(MaintenanceRecord)

    if vessel_id:
        query = query.filter(MaintenanceRecord.vessel_id == vessel_id)
    if category_id:
        query = query.filter(MaintenanceRecord.category_id == category_id)
    if status:
        query = query.filter(MaintenanceRecord.status == status)
    if priority:
        query = query.filter(MaintenanceRecord.priority == priority)
    if maintenance_type:
        query = query.filter(MaintenanceRecord.maintenance_type == maintenance_type)
    if search:
        query = query.filter(
            (MaintenanceRecord.title.ilike(f"%{search}%")) |
            (MaintenanceRecord.system_component.ilike(f"%{search}%"))
        )

    total = query.count()
    items = query.order_by(MaintenanceRecord.created_at.desc()).offset(skip).limit(limit).all()
    return MaintenanceRecordList(total=total, items=items)


@router.get("/summary")
async def maintenance_summary(
    vessel_id: int = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("maintenance", "view")),
):
    """Resumen de mantenimientos por estado (para dashboard)."""
    query = db.query(MaintenanceRecord)
    if vessel_id:
        query = query.filter(MaintenanceRecord.vessel_id == vessel_id)

    records = query.all()
    summary = {
        "pendiente": 0, "en_progreso": 0, "completado": 0, "cancelado": 0,
        "total": len(records),
        "criticos": sum(1 for r in records if r.priority == MaintenancePriority.CRITICA and r.status in [MaintenanceStatus.PENDIENTE, MaintenanceStatus.EN_PROGRESO]),
    }
    for r in records:
        summary[r.status.value] += 1
    return summary


@router.get("/{record_id}", response_model=MaintenanceRecordResponse)
async def get_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("maintenance", "view")),
):
    """Obtener un registro de mantenimiento."""
    record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Registro de mantenimiento no encontrado")
    return record


@router.post("", response_model=MaintenanceRecordResponse, status_code=201)
async def create_record(
    data: MaintenanceRecordCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("maintenance", "create")),
):
    """Crear un registro de mantenimiento."""
    vessel = db.query(Vessel).filter(Vessel.id == data.vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    if data.category_id:
        cat = db.query(MaintenanceCategory).filter(MaintenanceCategory.id == data.category_id).first()
        if not cat:
            raise HTTPException(status_code=404, detail="Categoría no encontrada")

    record = MaintenanceRecord(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="create", module="maintenance", entity_type="MaintenanceRecord",
        entity_id=record.id,
        description=f"Creó mantenimiento '{record.title}' para {vessel.name}",
        ip_address=request.client.host if request.client else None,
    )

    if record.status == MaintenanceStatus.COMPLETADO and record.routine_id:
        from app.models.equipment import EquipmentRoutine, Equipment
        from app.models.inventory import InventoryItem, InventoryMovement, InventoryCategory
        from datetime import datetime
        routine = db.query(EquipmentRoutine).filter(EquipmentRoutine.id == record.routine_id).first()
        if routine:
            eq = db.query(Equipment).filter(Equipment.id == routine.equipment_id).first()
            routine.last_performed_date = record.completed_date or datetime.utcnow().date()
            if eq:
                routine.last_performed_hours = eq.hour_meter
                
            for part in routine.parts:
                item = db.query(InventoryItem).filter(InventoryItem.id == part.inventory_item_id).first()
                if item:
                    if item.category == InventoryCategory.HERRAMIENTA:
                        continue
                    old_qty = item.quantity
                    new_qty = old_qty - part.quantity_required
                    item.quantity = new_qty
                    mov = InventoryMovement(
                        item_id=item.id,
                        user_id=current_user.id,
                        movement_type="salida",
                        quantity=part.quantity_required,
                        quantity_before=old_qty,
                        quantity_after=new_qty,
                        reason=f"Usado automáticamente en rutina: {routine.name}",
                        reference=f"Mantenimiento #{record.id}"
                    )
                    db.add(mov)
            db.commit()

    return record


@router.put("/{record_id}", response_model=MaintenanceRecordResponse)
async def update_record(
    record_id: int,
    data: MaintenanceRecordUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("maintenance", "edit")),
):
    """Actualizar un registro de mantenimiento."""
    record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    update_data = data.model_dump(exclude_unset=True)
    changes = {}
    for key, value in update_data.items():
        old = getattr(record, key)
        if old != value:
            changes[key] = {"antes": str(old), "después": str(value)}
        setattr(record, key, value)

    db.commit()
    db.refresh(record)

    if changes:
        log_action(
            db=db, user_id=current_user.id, username=current_user.username,
            action="update", module="maintenance", entity_type="MaintenanceRecord",
            entity_id=record.id,
            description=f"Actualizó mantenimiento '{record.title}'",
            details=changes,
            ip_address=request.client.host if request.client else None,
        )

    if "status" in changes and record.status == MaintenanceStatus.COMPLETADO and record.routine_id:
        from app.models.equipment import EquipmentRoutine, Equipment
        from app.models.inventory import InventoryItem, InventoryMovement, InventoryCategory
        from datetime import datetime
        routine = db.query(EquipmentRoutine).filter(EquipmentRoutine.id == record.routine_id).first()
        if routine:
            eq = db.query(Equipment).filter(Equipment.id == routine.equipment_id).first()
            routine.last_performed_date = record.completed_date or datetime.utcnow().date()
            if eq:
                routine.last_performed_hours = eq.hour_meter
                
            for part in routine.parts:
                item = db.query(InventoryItem).filter(InventoryItem.id == part.inventory_item_id).first()
                if item:
                    if item.category == InventoryCategory.HERRAMIENTA:
                        continue
                    old_qty = item.quantity
                    new_qty = old_qty - part.quantity_required
                    item.quantity = new_qty
                    mov = InventoryMovement(
                        item_id=item.id,
                        user_id=current_user.id,
                        movement_type="salida",
                        quantity=part.quantity_required,
                        quantity_before=old_qty,
                        quantity_after=new_qty,
                        reason=f"Usado automáticamente en rutina: {routine.name}",
                        reference=f"Mantenimiento #{record.id}"
                    )
                    db.add(mov)
            db.commit()

    return record


@router.delete("/{record_id}")
async def delete_record(
    record_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("maintenance", "delete")),
):
    """Eliminar un registro de mantenimiento."""
    record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    title = record.title
    db.delete(record)
    db.commit()

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="delete", module="maintenance", entity_type="MaintenanceRecord",
        entity_id=record_id,
        description=f"Eliminó mantenimiento '{title}'",
        ip_address=request.client.host if request.client else None,
    )
    return {"message": f"Registro '{title}' eliminado"}
