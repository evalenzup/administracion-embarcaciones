"""
SIAE — Router de asignaciones para Personal a Bordo (Participantes Científicos y Tripulación).
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.cruise import CruisePlan
from app.models.cruise_participant import CruiseParticipant
from app.models.participant_profile import ParticipantProfile
from app.models.personnel import Personnel
from app.models.cruise_crew import CruiseCrew
from app.schemas.cruise_participant import (
    CruiseParticipantCreate,
    CruiseParticipantUpdate,
    CruiseParticipantResponse,
)
from app.schemas.cruise_crew import (
    CruiseCrewCreate,
    CruiseCrewUpdate,
    CruiseCrewResponse,
)
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/cruises", tags=["Personal a Bordo"])


def _get_cruise_or_404(cruise_id: int, db: Session) -> CruisePlan:
    cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
    if not cruise:
        raise HTTPException(status_code=404, detail="Plan de crucero no encontrado")
    return cruise


def _get_assignment_or_404(assignment_id: int, cruise_id: int, db: Session) -> CruiseParticipant:
    a = db.query(CruiseParticipant).filter(
        CruiseParticipant.id == assignment_id,
        CruiseParticipant.cruise_id == cruise_id,
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Participante no encontrado en este crucero")
    return a


# 🎛️ ── Endpoints para Participantes Científicos (Catálogo) ───────────────────

@router.get("/{cruise_id}/participants", response_model=list[CruiseParticipantResponse])
async def list_cruise_participants(
    cruise_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "view")),
):
    """Lista todos los participantes científicos asignados a un crucero."""
    _get_cruise_or_404(cruise_id, db)
    return (
        db.query(CruiseParticipant)
        .filter(CruiseParticipant.cruise_id == cruise_id)
        .order_by(CruiseParticipant.role_in_cruise)
        .all()
    )


@router.post("/{cruise_id}/participants", response_model=CruiseParticipantResponse, status_code=201)
async def add_participant_to_cruise(
    cruise_id: int,
    data: CruiseParticipantCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    """Asigna un participante científico del catálogo a un crucero."""
    _get_cruise_or_404(cruise_id, db)

    # Verificar que el perfil existe y está activo
    profile = db.query(ParticipantProfile).filter(
        ParticipantProfile.id == data.participant_id,
        ParticipantProfile.is_active == True,
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil de participante no encontrado")

    # Evitar duplicados en el mismo crucero
    existing = db.query(CruiseParticipant).filter(
        CruiseParticipant.cruise_id == cruise_id,
        CruiseParticipant.participant_id == data.participant_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409,
                            detail=f"'{profile.full_name}' ya está asignado a este crucero")

    if data.is_cruise_leader:
        # Desmarcar cualquier otro lider de crucero
        db.query(CruiseParticipant).filter(
            CruiseParticipant.cruise_id == cruise_id,
            CruiseParticipant.is_cruise_leader == True,
        ).update({"is_cruise_leader": False})
        
        # Sincronizar el campo scientific_leader
        cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
        if cruise:
            cruise.scientific_leader = profile.full_name

    assignment = CruiseParticipant(cruise_id=cruise_id, **data.model_dump())
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="create", module="cruises", entity_type="CruiseParticipant",
               entity_id=assignment.id,
               description=f"Asignó a '{profile.full_name}' al crucero {cruise_id}",
               ip_address=request.client.host if request.client else None)
    return assignment


@router.put("/{cruise_id}/participants/{assignment_id}", response_model=CruiseParticipantResponse)
async def update_cruise_participant(
    cruise_id: int,
    assignment_id: int,
    data: CruiseParticipantUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    """Actualiza el rol o notas de un participante científico en este crucero."""
    assignment = _get_assignment_or_404(assignment_id, cruise_id, db)
    was_leader = assignment.is_cruise_leader
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(assignment, key, value)
    
    if data.is_cruise_leader:
        # Desmarcar cualquier otro lider de crucero
        db.query(CruiseParticipant).filter(
            CruiseParticipant.cruise_id == cruise_id,
            CruiseParticipant.id != assignment.id,
            CruiseParticipant.is_cruise_leader == True,
        ).update({"is_cruise_leader": False})
        
        # Sincronizar el campo scientific_leader
        cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
        if cruise:
            name = assignment.participant.full_name if assignment.participant else "—"
            cruise.scientific_leader = name
    elif data.is_cruise_leader is False and was_leader:
        # Se desmarcó al líder
        cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
        if cruise:
            cruise.scientific_leader = None

    db.commit()
    db.refresh(assignment)
    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="update", module="cruises", entity_type="CruiseParticipant",
               entity_id=assignment_id,
               description=f"Actualizó participante científico en crucero {cruise_id}",
               ip_address=request.client.host if request.client else None)
    return assignment


@router.delete("/{cruise_id}/participants/{assignment_id}")
async def remove_participant_from_cruise(
    cruise_id: int,
    assignment_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    """Quita un participante científico de un crucero (no lo elimina del catálogo)."""
    assignment = _get_assignment_or_404(assignment_id, cruise_id, db)
    name = assignment.participant.full_name if assignment.participant else "—"
    is_leader = assignment.is_cruise_leader
    db.delete(assignment)
    if is_leader:
        # Limpiar scientific_leader
        cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
        if cruise:
            cruise.scientific_leader = None
    db.commit()
    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="delete", module="cruises", entity_type="CruiseParticipant",
               entity_id=assignment_id,
               description=f"Quitó a '{name}' del crucero {cruise_id}",
               ip_address=request.client.host if request.client else None)
    return {"message": f"'{name}' removido del crucero"}


# 🎛️ ── Endpoints para la Tripulación (Personal DEO) ───────────────────────────

@router.get("/{cruise_id}/crew", response_model=list[CruiseCrewResponse])
async def list_cruise_crew(
    cruise_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "view")),
):
    """Lista todos los tripulantes asignados a un crucero."""
    _get_cruise_or_404(cruise_id, db)
    return (
        db.query(CruiseCrew)
        .filter(CruiseCrew.cruise_id == cruise_id)
        .order_by(CruiseCrew.role)
        .all()
    )


@router.post("/{cruise_id}/crew", response_model=CruiseCrewResponse, status_code=201)
async def add_crew_to_cruise(
    cruise_id: int,
    data: CruiseCrewCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    """Asigna un tripulante del Personal DEO a un crucero."""
    _get_cruise_or_404(cruise_id, db)

    # Verificar que el empleado existe y está activo
    person = db.query(Personnel).filter(
        Personnel.id == data.personnel_id,
        Personnel.is_active == True,
    ).first()
    if not person:
        raise HTTPException(status_code=404, detail="Miembro del personal no encontrado")

    # Evitar duplicados
    existing = db.query(CruiseCrew).filter(
        CruiseCrew.cruise_id == cruise_id,
        CruiseCrew.personnel_id == data.personnel_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409,
                            detail=f"'{person.full_name}' ya está asignado como tripulante a este crucero")

    assignment = CruiseCrew(cruise_id=cruise_id, **data.model_dump())
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="create", module="cruises", entity_type="CruiseCrew",
               entity_id=assignment.id,
               description=f"Asignó tripulante '{person.full_name}' al crucero {cruise_id}",
               ip_address=request.client.host if request.client else None)
    return assignment


@router.put("/{cruise_id}/crew/{assignment_id}", response_model=CruiseCrewResponse)
async def update_cruise_crew(
    cruise_id: int,
    assignment_id: int,
    data: CruiseCrewUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    """Actualiza el rol o notas de un tripulante en este crucero."""
    _get_cruise_or_404(cruise_id, db)
    assignment = db.query(CruiseCrew).filter(
        CruiseCrew.id == assignment_id,
        CruiseCrew.cruise_id == cruise_id,
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Asignación de tripulante no encontrada")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(assignment, key, value)
    db.commit()
    db.refresh(assignment)

    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="update", module="cruises", entity_type="CruiseCrew",
               entity_id=assignment_id,
               description=f"Actualizó tripulante en crucero {cruise_id}",
               ip_address=request.client.host if request.client else None)
    return assignment


@router.delete("/{cruise_id}/crew/{assignment_id}")
async def remove_crew_from_cruise(
    cruise_id: int,
    assignment_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    """Quita un tripulante del crucero (no lo elimina del Personal DEO)."""
    _get_cruise_or_404(cruise_id, db)
    assignment = db.query(CruiseCrew).filter(
        CruiseCrew.id == assignment_id,
        CruiseCrew.cruise_id == cruise_id,
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Asignación de tripulante no encontrada")

    name = assignment.personnel.full_name if assignment.personnel else "—"
    db.delete(assignment)
    db.commit()

    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="delete", module="cruises", entity_type="CruiseCrew",
               entity_id=assignment_id,
               description=f"Quitó tripulante '{name}' del crucero {cruise_id}",
               ip_address=request.client.host if request.client else None)
    return {"message": f"Tripulante '{name}' removido del crucero"}
