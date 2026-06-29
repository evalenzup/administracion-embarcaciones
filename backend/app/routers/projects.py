"""
SIAE — Endpoints para la gestión de Proyectos (Operaciones).
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_permission
from app.models.user import User
from app.models.project import Project
from app.models.cruise import CruisePlan
from app.models.vessel_request import VesselRequest
from app.schemas.project import ProjectResponse, ProjectCreate, ProjectUpdate
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/projects", tags=["Operaciones — Catálogo de Proyectos"])


@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    search: Optional[str] = Query(None, description="Buscar por número de cuenta, nombre, o responsable"),
    active_only: bool = Query(True, description="Filtrar solo proyectos activos"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("projects", "view")),
):
    """Listar todos los proyectos con filtros y buscadores."""
    query = db.query(Project)

    if active_only:
        query = query.filter(Project.is_active == True)

    if search:
        search_like = f"%{search}%"
        query = query.filter(
            (Project.account_number.ilike(search_like)) |
            (Project.name.ilike(search_like)) |
            (Project.responsible_name.ilike(search_like)) |
            (Project.department.ilike(search_like)) |
            (Project.division.ilike(search_like))
        )

    return query.order_by(Project.account_number.asc()).all()


@router.get("/{id}")
async def get_project_detail(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("projects", "view")),
):
    """Obtener el detalle de un proyecto junto con estadísticas e historial de cruceros/solicitudes."""
    project = db.query(Project).filter(Project.id == id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")

    # Calcular estadísticas asociadas
    cruises = db.query(CruisePlan).filter(CruisePlan.project_id == id, CruisePlan.is_active == True).all()
    vessel_requests = db.query(VesselRequest).filter(VesselRequest.project_id == id).all()

    cruises_data = []
    for c in cruises:
        cruises_data.append({
            "id": c.id,
            "cruise_number": c.cruise_number,
            "name": c.name,
            "status": c.status.value if hasattr(c.status, 'value') else str(c.status),
            "departure_date": c.departure_date,
            "return_date": c.return_date,
            "scientific_leader": c.scientific_leader,
            "vessel_name": c.vessel.name if c.vessel else "Embarcación"
        })

    vessel_requests_data = []
    for vr in vessel_requests:
        vessel_requests_data.append({
            "id": vr.id,
            "scientific_leader": vr.scientific_leader,
            "status": vr.status.value if hasattr(vr.status, 'value') else str(vr.status),
            "departure_date": vr.departure_date,
            "return_date": vr.return_date,
            "vessel_name": vr.vessel.name if vr.vessel else "Embarcación",
            "applicant_name": vr.applicant.full_name if vr.applicant else "Usuario"
        })

    return {
        "id": project.id,
        "account_number": project.account_number,
        "name": project.name,
        "responsible_name": project.responsible_name,
        "department": project.department,
        "division": project.division,
        "is_active": project.is_active,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "stats": {
            "cruises_count": len(cruises),
            "vessel_requests_count": len(vessel_requests)
        },
        "cruises": cruises_data,
        "vessel_requests": vessel_requests_data
    }


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    data: ProjectCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("projects", "create")),
):
    """Crear un proyecto en el catálogo."""
    existing = db.query(Project).filter(Project.account_number == data.account_number.strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Ya existe un proyecto con el número de cuenta '{data.account_number.strip()}'.")

    project = Project(
        account_number=data.account_number.strip(),
        name=data.name.strip(),
        responsible_name=data.responsible_name.strip(),
        department=data.department.strip(),
        division=data.division.strip()
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="create",
        module="projects",
        entity_type="Project",
        entity_id=project.id,
        description=f"Creó el proyecto '{project.account_number}' - '{project.name}'",
        ip_address=request.client.host if request and request.client else None
    )

    return project


@router.put("/{id}", response_model=ProjectResponse)
async def update_project(
    id: int,
    data: ProjectUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("projects", "edit")),
):
    """Actualizar datos de un proyecto."""
    project = db.query(Project).filter(Project.id == id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")

    if data.account_number is not None:
        # Validar unicidad si cambia el número de cuenta
        new_account = data.account_number.strip()
        if new_account != project.account_number:
            existing = db.query(Project).filter(Project.account_number == new_account).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Ya existe otro proyecto con el número de cuenta '{new_account}'.")
            project.account_number = new_account

    if data.name is not None:
        project.name = data.name.strip()
    if data.responsible_name is not None:
        project.responsible_name = data.responsible_name.strip()
    if data.department is not None:
        project.department = data.department.strip()
    if data.division is not None:
        project.division = data.division.strip()
    if data.is_active is not None:
        project.is_active = data.is_active

    db.commit()
    db.refresh(project)

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="update",
        module="projects",
        entity_type="Project",
        entity_id=project.id,
        description=f"Actualizó el proyecto '{project.account_number}' (Activo: {project.is_active})",
        ip_address=request.client.host if request and request.client else None
    )

    return project


@router.delete("/{id}")
async def delete_project(
    id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("projects", "delete")),
):
    """Eliminar físicamente un proyecto si no tiene registros asociados, o desactivarlo en su defecto."""
    project = db.query(Project).filter(Project.id == id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")

    # Verificar cruceros o solicitudes de embarcación asociadas
    cruises_count = db.query(CruisePlan).filter(CruisePlan.project_id == id, CruisePlan.is_active == True).count()
    vessel_requests_count = db.query(VesselRequest).filter(VesselRequest.project_id == id).count()

    account = project.account_number
    name = project.name

    if cruises_count > 0 or vessel_requests_count > 0:
        # Desactivar por integridad referencial
        project.is_active = False
        db.commit()

        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="update",
            module="projects",
            entity_type="Project",
            entity_id=id,
            description=f"Desactivó el proyecto '{account}' (no se eliminó por tener {cruises_count} cruceros y {vessel_requests_count} solicitudes asociadas)",
            ip_address=request.client.host if request and request.client else None
        )
        return {"status": "deactivated", "message": f"El proyecto '{name}' tiene registros vinculados. Se ha desactivado en lugar de eliminar."}

    db.delete(project)
    db.commit()

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="delete",
        module="projects",
        entity_type="Project",
        entity_id=id,
        description=f"Eliminó permanentemente el proyecto '{account}' - '{name}'",
        ip_address=request.client.host if request and request.client else None
    )

    return {"status": "deleted", "message": f"Proyecto '{name}' eliminado correctamente."}
