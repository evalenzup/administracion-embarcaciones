"""
SIAE — Router de Embarcaciones.
CRUD completo con auditoría y filtros.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.vessel import Vessel, VesselType, VesselStatus
from app.models.vessel_crew import VesselCrew
from app.models.personnel import Personnel
from app.schemas.vessel import VesselCreate, VesselUpdate, VesselResponse, VesselList, VesselBasic
from app.schemas.vessel_crew import VesselCrewCreate, VesselCrewResponse
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/vessels", tags=["Embarcaciones"])


@router.get("", response_model=VesselList)
async def list_vessels(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: str = Query(None),
    vessel_type: VesselType = Query(None),
    status: VesselStatus = Query(None),
    is_active: bool = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "view")),
):
    """Listar embarcaciones con paginación y filtros."""
    query = db.query(Vessel)

    if search:
        query = query.filter(
            (Vessel.name.ilike(f"%{search}%")) |
            (Vessel.registration_number.ilike(f"%{search}%")) |
            (Vessel.home_port.ilike(f"%{search}%"))
        )

    if vessel_type:
        query = query.filter(Vessel.vessel_type == vessel_type)

    if status:
        query = query.filter(Vessel.status == status)

    if is_active is not None:
        query = query.filter(Vessel.is_active == is_active)

    total = query.count()
    items = query.order_by(Vessel.name).offset(skip).limit(limit).all()

    return VesselList(total=total, items=items)


@router.get("/options", response_model=list[VesselBasic])
async def vessel_options(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "view")),
):
    """Listar embarcaciones activas para selects (sin paginación)."""
    items = db.query(Vessel).filter(Vessel.is_active == True).order_by(Vessel.name).all()
    return items


@router.get("/{vessel_id}", response_model=VesselResponse)
async def get_vessel(
    vessel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "view")),
):
    """Obtener una embarcación por ID."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")
    return vessel


@router.post("", response_model=VesselResponse, status_code=201)
async def create_vessel(
    data: VesselCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "create")),
):
    """Crear una nueva embarcación."""
    # Verificar unicidad
    if db.query(Vessel).filter(Vessel.name == data.name).first():
        raise HTTPException(status_code=400, detail="Ya existe una embarcación con ese nombre")

    if data.registration_number:
        if db.query(Vessel).filter(Vessel.registration_number == data.registration_number).first():
            raise HTTPException(status_code=400, detail="El número de registro ya existe")

    vessel = Vessel(**data.model_dump())
    db.add(vessel)
    db.commit()
    db.refresh(vessel)

    # Auditoría
    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="create",
        module="vessels",
        entity_type="Vessel",
        entity_id=vessel.id,
        description=f"Creó embarcación '{vessel.name}'",
        ip_address=request.client.host if request.client else None,
    )

    return vessel


@router.put("/{vessel_id}", response_model=VesselResponse)
async def update_vessel(
    vessel_id: int,
    data: VesselUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "edit")),
):
    """Actualizar una embarcación existente."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    # Verificar unicidad si se cambia nombre
    update_data = data.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] != vessel.name:
        existing = db.query(Vessel).filter(Vessel.name == update_data["name"]).first()
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe una embarcación con ese nombre")

    if "registration_number" in update_data and update_data["registration_number"] != vessel.registration_number:
        existing = db.query(Vessel).filter(
            Vessel.registration_number == update_data["registration_number"]
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="El número de registro ya existe")

    # Registrar cambios para auditoría
    changes = {}
    for key, value in update_data.items():
        old_value = getattr(vessel, key)
        if old_value != value:
            changes[key] = {"antes": str(old_value), "después": str(value)}
        setattr(vessel, key, value)

    db.commit()
    db.refresh(vessel)

    if changes:
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="update",
            module="vessels",
            entity_type="Vessel",
            entity_id=vessel.id,
            description=f"Actualizó embarcación '{vessel.name}'",
            details=changes,
            ip_address=request.client.host if request.client else None,
        )

    return vessel


@router.delete("/{vessel_id}")
async def delete_vessel(
    vessel_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "delete")),
):
    """Eliminar una embarcación."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    vessel_name = vessel.name
    db.delete(vessel)
    db.commit()

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="delete",
        module="vessels",
        entity_type="Vessel",
        entity_id=vessel_id,
        description=f"Eliminó embarcación '{vessel_name}'",
        ip_address=request.client.host if request.client else None,
    )

    return {"message": f"Embarcación '{vessel_name}' eliminada correctamente"}


# ── Tripulación Base ──────────────────────────────────────────

@router.get("/{vessel_id}/crew", response_model=list[VesselCrewResponse])
async def list_vessel_crew(
    vessel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "view")),
):
    """Listar la tripulación base asignada a una embarcación."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    return (
        db.query(VesselCrew)
        .filter(VesselCrew.vessel_id == vessel_id, VesselCrew.is_active == True)
        .order_by(VesselCrew.role)
        .all()
    )


@router.post("/{vessel_id}/crew", response_model=VesselCrewResponse, status_code=201)
async def add_vessel_crew(
    vessel_id: int,
    data: VesselCrewCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "edit")),
):
    """Agregar un miembro de personal a la tripulación base de una embarcación."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    personnel = db.query(Personnel).filter(Personnel.id == data.personnel_id).first()
    if not personnel:
        raise HTTPException(status_code=404, detail="Personal no encontrado")

    # Evitar duplicados
    existing = db.query(VesselCrew).filter(
        VesselCrew.vessel_id == vessel_id,
        VesselCrew.personnel_id == data.personnel_id,
        VesselCrew.is_active == True,
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"'{personnel.full_name}' ya está asignado a esta embarcación"
        )

    crew = VesselCrew(vessel_id=vessel_id, **data.model_dump())
    db.add(crew)
    db.commit()
    db.refresh(crew)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="create", module="vessels", entity_type="VesselCrew",
        entity_id=crew.id,
        description=f"Asignó '{personnel.full_name}' como tripulación base de '{vessel.name}'",
        ip_address=request.client.host if request.client else None,
    )
    return crew


@router.delete("/{vessel_id}/crew/{crew_id}")
async def remove_vessel_crew(
    vessel_id: int,
    crew_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "edit")),
):
    """Quitar un miembro de la tripulación base de una embarcación."""
    crew = db.query(VesselCrew).filter(
        VesselCrew.id == crew_id,
        VesselCrew.vessel_id == vessel_id,
    ).first()
    if not crew:
        raise HTTPException(status_code=404, detail="Miembro de tripulación no encontrado")

    name = crew.personnel.full_name if crew.personnel else "—"
    vessel_name = crew.vessel.name if crew.vessel else "—"
    db.delete(crew)
    db.commit()

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="delete", module="vessels", entity_type="VesselCrew",
        entity_id=crew_id,
        description=f"Quitó a '{name}' de la tripulación base de '{vessel_name}'",
        ip_address=request.client.host if request.client else None,
    )
    return {"message": f"'{name}' removido de la tripulación base"}

