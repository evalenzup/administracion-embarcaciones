"""
SIAE — Router de Estabilidad Naval y Pesos en Cubiertas.
Endpoints para evaluación en tiempo real, simulación hidrostática, verificación de Criterios OMI y registro de condiciones oficiales.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from app.dependencies import get_db, get_current_user
from app.models.user import User
from app.models.vessel import Vessel
from app.models.stability_condition import StabilityCondition
from app.schemas.stability import (
    StabilityEvaluationRequest,
    StabilityConditionResponse,
)
from app.services.stability_service import StabilityService
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1", tags=["Estabilidad Naval"])


@router.post("/vessels/{vessel_id}/stability/evaluate", response_model=StabilityConditionResponse)
async def evaluate_stability_condition(
    vessel_id: int,
    req: StabilityEvaluationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Simulación y cálculo de estabilidad en tiempo real.
    No persiste en base de datos. Permite probar distribuciones de carga y sondeos antes de oficializar.
    """
    res = StabilityService.evaluate_condition(db=db, vessel_id=vessel_id, req=req)
    return res


@router.post("/vessels/{vessel_id}/stability/conditions", response_model=StabilityConditionResponse, status_code=status.HTTP_201_CREATED)
async def create_stability_condition(
    vessel_id: int,
    req: StabilityEvaluationRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Guarda y oficializa una condición de carga y estabilidad para el buque o crucero.
    """
    condition = StabilityService.save_condition(
        db=db,
        vessel_id=vessel_id,
        req=req,
        user_id=current_user.id
    )

    log_action(
        db,
        current_user.id,
        "create",
        "stability_conditions",
        condition.id,
        f"Condición de estabilidad '{condition.condition_name}' registrada en buque #{vessel_id}. Estado: {condition.status_level.value} (Margen: {condition.stability_margin_m:.3f}m)",
        request
    )

    # Devolver con deck_limits computados
    deck_check = StabilityService.check_deck_limits(
        eval_type=condition.evaluation_type,
        cargo_items=req.cargo_items,
        main_deck_height=float(condition.vessel.main_deck_height_m or 4.95),
        upper_deck_height=float(condition.vessel.upper_deck_height_m or 7.04)
    )
    
    resp_data = StabilityConditionResponse.model_validate(condition)
    resp_data.deck_limits = deck_check
    return resp_data


@router.get("/vessels/{vessel_id}/stability/conditions", response_model=List[StabilityConditionResponse])
async def list_vessel_stability_conditions(
    vessel_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista las evaluaciones de estabilidad históricas para una embarcación."""
    conditions = db.query(StabilityCondition).filter(
        StabilityCondition.vessel_id == vessel_id
    ).order_by(StabilityCondition.created_at.desc()).offset(skip).limit(limit).all()

    return conditions


@router.get("/stability/conditions/{condition_id}", response_model=StabilityConditionResponse)
async def get_stability_condition_detail(
    condition_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Obtiene el desglose completo de una condición de estabilidad guardada."""
    cond = db.query(StabilityCondition).filter(StabilityCondition.id == condition_id).first()
    if not cond:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condición de estabilidad no encontrada")
    return cond


@router.delete("/stability/conditions/{condition_id}", status_code=status.HTTP_200_OK)
async def delete_stability_condition(
    condition_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Elimina un registro de condición de estabilidad."""
    cond = db.query(StabilityCondition).filter(StabilityCondition.id == condition_id).first()
    if not cond:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condición de estabilidad no encontrada")

    db.delete(cond)
    db.commit()
    log_action(db, current_user.id, "delete", "stability_conditions", condition_id, f"Condición de estabilidad #{condition_id} eliminada", request)
    return {"message": "Condición de estabilidad eliminada correctamente"}


@router.get("/cruises/{cruise_id}/stability", response_model=List[StabilityConditionResponse])
async def get_cruise_stability_conditions(
    cruise_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Obtiene las condiciones de estabilidad asociadas a un crucero específico."""
    conditions = db.query(StabilityCondition).filter(
        StabilityCondition.cruise_id == cruise_id
    ).order_by(StabilityCondition.created_at.desc()).all()
    return conditions
