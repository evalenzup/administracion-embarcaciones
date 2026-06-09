"""
SIAE — Router de Catálogo de Tarifas (VesselRates).
Endpoints para listar y gestionar tarifas por embarcación.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.vessel import Vessel
from app.models.vessel_rate import VesselRate
from app.schemas.vessel_rate import (
    VesselRateCreate, VesselRateUpdate,
    VesselRateResponse, VesselRateList
)
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/vessel-rates", tags=["Tarifas"])


@router.get("", response_model=VesselRateList)
async def list_vessel_rates(
    vessel_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("billing", "view")),
):
    """Listar tarifas con filtros de embarcación y año."""
    query = db.query(VesselRate)

    if vessel_id is not None:
        query = query.filter(VesselRate.vessel_id == vessel_id)
    if year is not None:
        query = query.filter(VesselRate.year == year)
    if is_active is not None:
        query = query.filter(VesselRate.is_active == is_active)

    total = query.count()
    items = query.order_by(VesselRate.vessel_id, VesselRate.client_type, VesselRate.id).all()

    return VesselRateList(total=total, items=items)


@router.post("", response_model=VesselRateResponse, status_code=201)
async def create_vessel_rate(
    data: VesselRateCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("billing", "edit")),
):
    """Crear una nueva tarifa de embarcación (Admin/Gestor)."""
    # Verificar que existe la embarcación
    vessel = db.query(Vessel).filter(Vessel.id == data.vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    rate = VesselRate(**data.model_dump())
    db.add(rate)
    db.commit()
    db.refresh(rate)

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="create",
        module="billing",
        entity_type="VesselRate",
        entity_id=rate.id,
        description=f"Creó tarifa: {rate.concept} - {rate.rate_amount} {rate.currency} para '{vessel.name}'",
        ip_address=request.client.host if request.client else None,
    )

    return rate


@router.put("/{rate_id}", response_model=VesselRateResponse)
async def update_vessel_rate(
    rate_id: int,
    data: VesselRateUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("billing", "edit")),
):
    """Actualizar una tarifa existente."""
    rate = db.query(VesselRate).filter(VesselRate.id == rate_id).first()
    if not rate:
        raise HTTPException(status_code=404, detail="Tarifa no encontrada")

    update_data = data.model_dump(exclude_unset=True)
    changes = {}

    for key, value in update_data.items():
        old_val = getattr(rate, key)
        if old_val != value:
            changes[key] = {"antes": str(old_val), "después": str(value)}
            setattr(rate, key, value)

    db.commit()
    db.refresh(rate)

    if changes:
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="update",
            module="billing",
            entity_type="VesselRate",
            entity_id=rate_id,
            description=f"Actualizó tarifa #{rate_id}",
            details=changes,
            ip_address=request.client.host if request.client else None,
        )

    return rate


@router.delete("/{rate_id}")
async def delete_vessel_rate(
    rate_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("billing", "delete")),
):
    """Eliminar una tarifa de la base de datos."""
    rate = db.query(VesselRate).filter(VesselRate.id == rate_id).first()
    if not rate:
        raise HTTPException(status_code=404, detail="Tarifa no encontrada")

    db.delete(rate)
    db.commit()

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="delete",
        module="billing",
        entity_type="VesselRate",
        entity_id=rate_id,
        description=f"Eliminó tarifa #{rate_id} ({rate.concept})",
        ip_address=request.client.host if request.client else None,
    )

    return {"message": "Tarifa eliminada correctamente"}
