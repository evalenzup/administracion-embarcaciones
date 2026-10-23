"""
SIAE — Router de Tanques y Sondeos de Embarcaciones.
Endpoints para gestión del inventario de tanques e ingreso de sondeos por personal de máquinas.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from app.dependencies import get_db, get_current_user
from app.models.user import User
from app.models.vessel import Vessel
from app.models.vessel_tank import VesselTank
from app.models.tank_sounding import TankSounding, TankSoundingItem
from app.schemas.vessel_tank import VesselTankCreate, VesselTankUpdate, VesselTankResponse
from app.schemas.tank_sounding import (
    TankSoundingCreate,
    TankSoundingUpdate,
    TankSoundingResponse,
)
from app.services.tank_service import TankService
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1", tags=["Tanques y Sondeos"])


# ─────────────────────────────────────────────────────────────
# 1. Catálogo e Inventario de Tanques por Buque
# ─────────────────────────────────────────────────────────────

@router.get("/vessels/{vessel_id}/tanks", response_model=List[VesselTankResponse])
async def get_vessel_tanks(
    vessel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Obtiene el catálogo de tanques con sus parámetros hidrostáticos para un buque."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Embarcación no encontrada")

    tanks = db.query(VesselTank).filter(
        VesselTank.vessel_id == vessel_id,
        VesselTank.is_active.is_(True)
    ).order_by(VesselTank.order_index, VesselTank.id).all()
    return tanks


@router.post("/vessels/{vessel_id}/tanks", response_model=VesselTankResponse, status_code=status.HTTP_201_CREATED)
async def create_vessel_tank(
    vessel_id: int,
    tank_in: VesselTankCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Registra un nuevo tanque en el catálogo de la embarcación."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Embarcación no encontrada")

    data = tank_in.model_dump()
    data["vessel_id"] = vessel_id
    tank = VesselTank(**data)
    db.add(tank)
    db.commit()
    db.refresh(tank)

    log_action(db, current_user.id, "create", "vessel_tanks", tank.id, f"Tanque {tank.tank_code} creado en buque {vessel.name}", request)
    return tank


@router.put("/vessels/{vessel_id}/tanks/{tank_id}", response_model=VesselTankResponse)
async def update_vessel_tank(
    vessel_id: int,
    tank_id: int,
    tank_in: VesselTankUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Actualiza los parámetros hidrostáticos o datos de un tanque."""
    tank = db.query(VesselTank).filter(
        VesselTank.id == tank_id,
        VesselTank.vessel_id == vessel_id
    ).first()
    if not tank:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tanque no encontrado")

    update_data = tank_in.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(tank, field, val)

    if ("capacity_m3" in update_data or "design_density" in update_data) and "max_weight_tons" not in update_data:
        tank.max_weight_tons = round(tank.capacity_m3 * tank.design_density, 3)

    db.commit()
    db.refresh(tank)
    log_action(db, current_user.id, "update", "vessel_tanks", tank.id, f"Tanque {tank.tank_code} actualizado", request)
    return tank


@router.delete("/vessels/{vessel_id}/tanks/{tank_id}", status_code=status.HTTP_200_OK)
async def delete_vessel_tank(
    vessel_id: int,
    tank_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Desactiva un tanque del inventario."""
    tank = db.query(VesselTank).filter(
        VesselTank.id == tank_id,
        VesselTank.vessel_id == vessel_id
    ).first()
    if not tank:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tanque no encontrado")

    tank.is_active = False
    db.commit()
    log_action(db, current_user.id, "delete", "vessel_tanks", tank.id, f"Tanque {tank.tank_code} desactivado", request)
    return {"message": "Tanque desactivado correctamente"}


# ─────────────────────────────────────────────────────────────
# 2. Rondas de Sondeos de Máquinas
# ─────────────────────────────────────────────────────────────

@router.get("/vessels/{vessel_id}/soundings", response_model=List[TankSoundingResponse])
async def list_vessel_soundings(
    vessel_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Historial de rondas de sondeos registradas para una embarcación."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Embarcación no encontrada")

    soundings = db.query(TankSounding).filter(
        TankSounding.vessel_id == vessel_id
    ).order_by(
        TankSounding.is_official.desc(),
        TankSounding.sounding_datetime.desc()
    ).offset(skip).limit(limit).all()

    return soundings


@router.get("/vessels/{vessel_id}/soundings/latest", response_model=Optional[TankSoundingResponse])
async def get_latest_vessel_sounding(
    vessel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Obtiene el último sondeo oficial o más reciente de la embarcación."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Embarcación no encontrada")

    sounding = TankService.get_latest_sounding(db, vessel_id)
    return sounding


@router.get("/soundings/{sounding_id}", response_model=TankSoundingResponse)
async def get_sounding_detail(
    sounding_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Obtiene el detalle completo de una ronda de sondeo, incluyendo los 22 tanques."""
    sounding = db.query(TankSounding).filter(TankSounding.id == sounding_id).first()
    if not sounding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sondeo no encontrado")
    return sounding


@router.post("/vessels/{vessel_id}/soundings", response_model=TankSoundingResponse, status_code=status.HTTP_201_CREATED)
async def create_vessel_sounding(
    vessel_id: int,
    sounding_in: TankSoundingCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Registra una nueva ronda de sondeos por personal de máquinas.
    Calcula automáticamente volumen, peso y momento de superficie libre (FSM) para cada tanque.
    """
    sounding = TankService.create_sounding(
        db=db,
        vessel_id=vessel_id,
        sounding_in=sounding_in,
        user_id=current_user.id
    )

    log_action(
        db,
        current_user.id,
        "create",
        "tank_soundings",
        sounding.id,
        f"Sondeo de tanques ({sounding.sounding_type.value}) registrado en {sounding.vessel.name}: {sounding.total_fuel_tons}t comb, {sounding.total_fresh_water_tons}t agua, {sounding.total_ballast_tons}t lastre",
        request
    )

    return sounding


@router.post("/soundings/{sounding_id}/set-official", response_model=TankSoundingResponse)
async def set_sounding_as_official(
    sounding_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Establece este sondeo como el oficial vigente para despacho y cálculos de estabilidad."""
    sounding = db.query(TankSounding).filter(TankSounding.id == sounding_id).first()
    if not sounding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sondeo no encontrado")

    # Desmarcar los anteriores del mismo buque
    db.query(TankSounding).filter(
        TankSounding.vessel_id == sounding.vessel_id,
        TankSounding.is_official.is_(True)
    ).update({"is_official": False})

    sounding.is_official = True
    db.commit()
    db.refresh(sounding)

    log_action(db, current_user.id, "update", "tank_soundings", sounding.id, f"Sondeo #{sounding.id} marcado como OFICIAL PRE-ZARPE", request)
    return sounding


@router.delete("/soundings/{sounding_id}", status_code=status.HTTP_200_OK)
async def delete_sounding(
    sounding_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Elimina una ronda de sondeo de la base de datos."""
    sounding = db.query(TankSounding).filter(TankSounding.id == sounding_id).first()
    if not sounding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sondeo no encontrado")

    db.delete(sounding)
    db.commit()
    log_action(db, current_user.id, "delete", "tank_soundings", sounding_id, f"Sondeo #{sounding_id} eliminado", request)
    return {"message": "Sondeo eliminado correctamente"}
