"""
SIAE — Router de Solicitudes de Embarcación.
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import extract

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.vessel import Vessel
from app.models.vessel_request import VesselRequest, RequestStatus
from app.models.cruise import CruisePlan, CruiseStatus
from app.models.vessel_crew import VesselCrew
from app.models.participant_profile import ParticipantProfile
from app.models.cruise_participant import CruiseParticipant, ParticipantRole
from app.models.cruise_crew import CruiseCrew
from app.schemas.vessel_request import (
    VesselRequestCreate, VesselRequestUpdate, VesselRequestReview, VesselRequestResponse, VesselRequestList
)
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/vessel-requests", tags=["Solicitudes de Embarcación"])


@router.get("", response_model=VesselRequestList)
async def list_requests(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: RequestStatus = Query(None),
    vessel_id: int = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessel_requests", "view")),
):
    """Listar solicitudes. Los administradores ven todas; los investigadores solo las propias."""
    query = db.query(VesselRequest)

    # Verificar si es administrador
    is_admin = current_user.is_superadmin or any(r.name == "Administrador" for r in current_user.roles)

    if not is_admin:
        query = query.filter(VesselRequest.applicant_id == current_user.id)

    if status:
        query = query.filter(VesselRequest.status == status)
    if vessel_id:
        query = query.filter(VesselRequest.vessel_id == vessel_id)

    total = query.count()
    items = query.order_by(VesselRequest.departure_date.desc(), VesselRequest.created_at.desc()).offset(skip).limit(limit).all()

    return VesselRequestList(total=total, items=items)


@router.get("/{request_id}", response_model=VesselRequestResponse)
async def get_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessel_requests", "view")),
):
    """Obtener una solicitud por ID."""
    req = db.query(VesselRequest).filter(VesselRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    # Verificar permisos de lectura (el investigador solo ve las suyas)
    is_admin = current_user.is_superadmin or any(r.name == "Administrador" for r in current_user.roles)
    if not is_admin and req.applicant_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para ver esta solicitud")

    return req


@router.post("", response_model=VesselRequestResponse, status_code=201)
async def create_request(
    data: VesselRequestCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessel_requests", "create")),
):
    """Crear una solicitud de embarcación."""
    if not db.query(Vessel).filter(Vessel.id == data.vessel_id).first():
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    if data.departure_date >= data.return_date:
        raise HTTPException(status_code=400, detail="La fecha de salida debe ser anterior a la de regreso")

    req_data = data.model_dump()
    if req_data.get("project_id"):
        from app.models.project import Project
        project = db.query(Project).filter(Project.id == req_data["project_id"]).first()
        if project:
            req_data["project_name"] = project.name

    req = VesselRequest(
        applicant_id=current_user.id,
        status=RequestStatus.PENDIENTE,
        **req_data
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="create", module="vessel_requests", entity_type="VesselRequest",
        entity_id=req.id, description=f"Creó solicitud de embarcación para '{req.project_name}'",
        ip_address=request.client.host if request.client else None
    )

    return req


@router.put("/{request_id}", response_model=VesselRequestResponse)
async def update_request(
    request_id: int,
    data: VesselRequestUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessel_requests", "edit")),
):
    """Actualizar una solicitud existente mientras esté pendiente."""
    req = db.query(VesselRequest).filter(VesselRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    # Verificar propiedad
    is_admin = current_user.is_superadmin or any(r.name == "Administrador" for r in current_user.roles)
    if not is_admin and req.applicant_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para modificar esta solicitud")

    # Solo se puede editar si está pendiente
    if req.status != RequestStatus.PENDIENTE and not is_admin:
        raise HTTPException(status_code=400, detail="Solo se pueden modificar solicitudes en estado pendiente")

    update_data = data.model_dump(exclude_unset=True)
    if "departure_date" in update_data or "return_date" in update_data:
        dep = update_data.get("departure_date", req.departure_date)
        ret = update_data.get("return_date", req.return_date)
        if dep >= ret:
            raise HTTPException(status_code=400, detail="La fecha de salida debe ser anterior a la de regreso")

    if "project_id" in update_data:
        proj_id = update_data["project_id"]
        if proj_id:
            from app.models.project import Project
            project = db.query(Project).filter(Project.id == proj_id).first()
            if project:
                update_data["project_name"] = project.name
        else:
            update_data["project_name"] = None

    for key, value in update_data.items():
        setattr(req, key, value)

    db.commit()
    db.refresh(req)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="update", module="vessel_requests", entity_type="VesselRequest",
        entity_id=req.id, description=f"Actualizó solicitud de embarcación para '{req.project_name}'",
        ip_address=request.client.host if request.client else None
    )

    return req


@router.post("/{request_id}/review", response_model=VesselRequestResponse)
async def review_request(
    request_id: int,
    data: VesselRequestReview,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessel_requests", "edit")),
):
    """Aprobar o rechazar una solicitud (Solo Administradores)."""
    is_admin = current_user.is_superadmin or any(r.name == "Administrador" for r in current_user.roles)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Solo administradores pueden revisar solicitudes")

    req = db.query(VesselRequest).filter(VesselRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    if req.status != RequestStatus.PENDIENTE:
        raise HTTPException(status_code=400, detail="Esta solicitud ya ha sido revisada")

    req.status = data.status
    req.approved_by_id = current_user.id
    req.approval_date = datetime.utcnow()
    req.admin_notes = data.admin_notes

    # Si es aprobada, crear plan de crucero automático
    if data.status == RequestStatus.APROBADA:
        # Generar número de crucero
        vessel = db.query(Vessel).filter(Vessel.id == req.vessel_id).first()
        vessel_name = vessel.name.upper() if vessel else "BARCO"
        for prefix in ["B/O ", "BO ", "B.O. ", "F.G. ", "FG "]:
            if vessel_name.startswith(prefix):
                vessel_name = vessel_name[len(prefix):].strip()
        vessel_code = "".join(vessel_name.split())[:4]
        if not vessel_code:
            vessel_code = "CRUC"

        year = req.departure_date.year
        count = db.query(CruisePlan).filter(
            CruisePlan.vessel_id == req.vessel_id,
            CruisePlan.is_active == True,
            extract('year', CruisePlan.departure_date) == year
        ).count()
        consecutive = count + 1
        base_num = f"{vessel_code}-{year}-{consecutive:02d}"
        cruise_number = base_num

        # Asegurar unicidad
        check = db.query(CruisePlan).filter(CruisePlan.cruise_number == cruise_number).first()
        idx = 1
        while check:
            cruise_number = f"{base_num}-{idx}"
            check = db.query(CruisePlan).filter(CruisePlan.cruise_number == cruise_number).first()
            idx += 1

        plan = CruisePlan(
            vessel_id=req.vessel_id,
            vessel_request_id=req.id,
            project_id=req.project_id,
            created_by_id=req.applicant_id,
            scientific_leader=req.scientific_leader,
            cruise_responsible=req.cruise_responsible,
            name=req.project_name[:197] + "..." if len(req.project_name) > 200 else req.project_name,
            project_name=req.project_name,
            objective=req.objective,
            study_area=req.study_area,
            departure_date=req.departure_date,
            return_date=req.return_date,
            status=CruiseStatus.BORRADOR,
            cruise_number=cruise_number,
            scientists_count=req.scientists_count,
            crew_count=req.crew_count,
            is_active=True
        )
        db.add(plan)
        db.flush()  # Generate the plan ID

        # Auto-populate base crew of the vessel
        base_crew = db.query(VesselCrew).filter(
            VesselCrew.vessel_id == req.vessel_id,
            VesselCrew.is_active == True
        ).all()

        for member in base_crew:
            crew_assignment = CruiseCrew(
                cruise_id=plan.id,
                personnel_id=member.personnel_id,
                role=member.role,
                notes="Asignado automáticamente como tripulación base"
            )
            db.add(crew_assignment)

    db.commit()
    db.refresh(req)

    action_name = "approved" if data.status == RequestStatus.APROBADA else "rejected"
    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="review", module="vessel_requests", entity_type="VesselRequest",
        entity_id=req.id, description=f"Revisó solicitud '{req.project_name}': {action_name}",
        details={"status": req.status.value, "notes": req.admin_notes},
        ip_address=request.client.host if request.client else None
    )

    return req


@router.delete("/{request_id}")
async def delete_request(
    request_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessel_requests", "delete")),
):
    """Eliminar o cancelar una solicitud."""
    req = db.query(VesselRequest).filter(VesselRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    is_admin = current_user.is_superadmin or any(r.name == "Administrador" for r in current_user.roles)
    if not is_admin and req.applicant_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para eliminar esta solicitud")

    project_name = req.project_name
    db.delete(req)
    db.commit()

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="delete", module="vessel_requests", entity_type="VesselRequest",
        entity_id=request_id, description=f"Eliminó solicitud de embarcación '{project_name}'",
        ip_address=request.client.host if request.client else None
    )

    return {"message": f"Solicitud '{project_name}' eliminada"}
