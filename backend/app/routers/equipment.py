"""
SIAE — Router de Equipos.
CRUD de equipos/sistemas con soporte para subir manuales.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from sqlalchemy.orm import Session
import os
import shutil
import uuid

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.vessel import Vessel
from app.models.equipment import Equipment, EquipmentCategory, EquipmentStatus, EquipmentRoutine, EquipmentRoutinePart
from app.schemas.equipment import (
    EquipmentCreate, EquipmentUpdate, EquipmentResponse, EquipmentList,
    EquipmentRoutineCreate, EquipmentRoutineUpdate, EquipmentRoutineResponse
)
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/equipment", tags=["Equipos"])


@router.get("", response_model=EquipmentList)
async def list_equipment(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    vessel_id: int = Query(None),
    category: EquipmentCategory = Query(None),
    status: EquipmentStatus = Query(None),
    search: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("equipment", "view")),
):
    """Listar equipos con filtros."""
    query = db.query(Equipment)

    if vessel_id:
        query = query.filter(Equipment.vessel_id == vessel_id)
    if category:
        query = query.filter(Equipment.category == category)
    if status:
        query = query.filter(Equipment.status == status)
    if search:
        query = query.filter(
            (Equipment.name.ilike(f"%{search}%")) |
            (Equipment.brand.ilike(f"%{search}%")) |
            (Equipment.model.ilike(f"%{search}%")) |
            (Equipment.serial_number.ilike(f"%{search}%"))
        )

    total = query.count()
    items = query.order_by(Equipment.name).offset(skip).limit(limit).all()

    return EquipmentList(total=total, items=items)


@router.get("/options")
async def get_equipment_options(
    vessel_id: int = Query(None),
    db: Session = Depends(get_db),
):
    """Obtener lista simplificada de equipos para selectores."""
    query = db.query(Equipment)
    if vessel_id:
        query = query.filter(Equipment.vessel_id == vessel_id)
    
    equipments = query.order_by(Equipment.name).all()
    return [{"id": eq.id, "name": eq.name, "category": eq.category.value, "vessel_id": eq.vessel_id} for eq in equipments]


@router.get("/summary")
async def equipment_summary(
    vessel_id: int = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("equipment", "view")),
):
    """Resumen de equipos por estado."""
    query = db.query(Equipment)
    if vessel_id:
        query = query.filter(Equipment.vessel_id == vessel_id)

    eqs = query.all()
    summary = {"operativo": 0, "mantenimiento": 0, "reparacion": 0, "fuera_servicio": 0, "total": len(eqs)}
    for eq in eqs:
        if eq.status.value in summary:
            summary[eq.status.value] += 1

    return summary


@router.get("/{equipment_id}", response_model=EquipmentResponse)
async def get_equipment(
    equipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("equipment", "view")),
):
    """Obtener un equipo por ID."""
    eq = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    return eq


@router.post("", response_model=EquipmentResponse, status_code=201)
async def create_equipment(
    data: EquipmentCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("equipment", "create")),
):
    """Crear un nuevo equipo."""
    vessel = db.query(Vessel).filter(Vessel.id == data.vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    eq = Equipment(**data.model_dump())
    db.add(eq)
    db.commit()
    db.refresh(eq)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="create", module="equipment", entity_type="Equipment",
        entity_id=eq.id,
        description=f"Creó equipo '{eq.name}' para {vessel.name}",
        ip_address=request.client.host if request.client else None,
    )
    return eq


@router.put("/{equipment_id}", response_model=EquipmentResponse)
async def update_equipment(
    equipment_id: int,
    data: EquipmentUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("equipment", "edit")),
):
    """Actualizar un equipo."""
    eq = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")

    update_data = data.model_dump(exclude_unset=True)
    changes = {}
    for key, value in update_data.items():
        old = getattr(eq, key)
        if old != value:
            changes[key] = {"antes": str(old), "después": str(value)}
        setattr(eq, key, value)

    db.commit()
    db.refresh(eq)

    if changes:
        log_action(
            db=db, user_id=current_user.id, username=current_user.username,
            action="update", module="equipment", entity_type="Equipment",
            entity_id=eq.id,
            description=f"Actualizó equipo '{eq.name}'",
            details=changes,
            ip_address=request.client.host if request.client else None,
        )

    return eq


@router.post("/{equipment_id}/upload", response_model=EquipmentResponse)
async def upload_equipment_manual(
    equipment_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("equipment", "edit")),
):
    """Subir un manual para el equipo."""
    eq = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")

    upload_dir = "uploads/equipment_manuals"
    os.makedirs(upload_dir, exist_ok=True)

    ext = file.filename.split(".")[-1] if "." in file.filename else ""
    unique_filename = f"{equipment_id}_{uuid.uuid4().hex[:8]}.{ext}"
    file_location = os.path.join(upload_dir, unique_filename)

    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    if eq.manual_file_path and os.path.exists(eq.manual_file_path.lstrip("/")):
        try:
            os.remove(eq.manual_file_path.lstrip("/"))
        except Exception:
            pass

    eq.manual_file_name = file.filename
    eq.manual_file_path = f"/uploads/equipment_manuals/{unique_filename}"

    db.commit()
    db.refresh(eq)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="update", module="equipment", entity_type="Equipment",
        entity_id=eq.id,
        description=f"Subió manual '{file.filename}' para '{eq.name}'",
        ip_address=request.client.host if request.client else None,
    )

    return eq


@router.delete("/{equipment_id}")
async def delete_equipment(
    equipment_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("equipment", "delete")),
):
    """Eliminar un equipo."""
    eq = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")

    name = eq.name
    db.delete(eq)
    db.commit()

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="delete", module="equipment", entity_type="Equipment",
        entity_id=equipment_id,
        description=f"Eliminó equipo '{name}'",
        ip_address=request.client.host if request.client else None,
    )

    return {"message": f"Equipo '{name}' eliminado correctamente"}


# ── RUTINAS DE MANTENIMIENTO ──────────────────────────────────────────────────

@router.get("/{equipment_id}/routines", response_model=list[EquipmentRoutineResponse])
async def list_equipment_routines(
    equipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("equipment", "view")),
):
    """Obtener todas las rutinas de un equipo."""
    routines = db.query(EquipmentRoutine).filter(EquipmentRoutine.equipment_id == equipment_id).all()
    return routines


@router.post("/{equipment_id}/routines", response_model=EquipmentRoutineResponse, status_code=201)
async def create_equipment_routine(
    equipment_id: int,
    data: EquipmentRoutineCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("equipment", "edit")),
):
    """Crear una nueva rutina para un equipo."""
    eq = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")

    routine = EquipmentRoutine(**data.model_dump(exclude={"parts"}), equipment_id=equipment_id)
    db.add(routine)
    db.commit()
    db.refresh(routine)

    if data.parts:
        for p in data.parts:
            part = EquipmentRoutinePart(
                routine_id=routine.id,
                inventory_item_id=p.inventory_item_id,
                quantity_required=p.quantity_required
            )
            db.add(part)
        db.commit()
        db.refresh(routine)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="create", module="equipment", entity_type="EquipmentRoutine",
        entity_id=routine.id,
        description=f"Creó rutina '{routine.name}' para equipo '{eq.name}'",
        ip_address=request.client.host if request.client else None,
    )
    return routine


@router.put("/routines/{routine_id}", response_model=EquipmentRoutineResponse)
async def update_equipment_routine(
    routine_id: int,
    data: EquipmentRoutineUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("equipment", "edit")),
):
    """Actualizar una rutina."""
    routine = db.query(EquipmentRoutine).filter(EquipmentRoutine.id == routine_id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Rutina no encontrada")

    update_data = data.model_dump(exclude_unset=True, exclude={"parts"})
    for key, value in update_data.items():
        setattr(routine, key, value)
        
    if data.parts is not None:
        db.query(EquipmentRoutinePart).filter(EquipmentRoutinePart.routine_id == routine_id).delete()
        for p in data.parts:
            part = EquipmentRoutinePart(
                routine_id=routine.id,
                inventory_item_id=p.inventory_item_id,
                quantity_required=p.quantity_required
            )
            db.add(part)

    db.commit()
    db.refresh(routine)
    return routine


@router.delete("/routines/{routine_id}")
async def delete_equipment_routine(
    routine_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("equipment", "edit")),
):
    """Eliminar una rutina."""
    routine = db.query(EquipmentRoutine).filter(EquipmentRoutine.id == routine_id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Rutina no encontrada")

    db.delete(routine)
    db.commit()
    return {"message": "Rutina eliminada correctamente"}
