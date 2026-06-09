"""
SIAE — Router de Puertos / Escolleras.
CRUD completo con auditoría y filtros.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.port import Port
from app.schemas.port import PortCreate, PortUpdate, PortResponse, PortList
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/ports", tags=["Puertos"])


@router.get("", response_model=PortList)
async def list_ports(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: str = Query(None),
    is_active: bool = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ports", "view")),
):
    """Listar puertos con paginación y filtros."""
    query = db.query(Port)

    if search:
        query = query.filter(
            (Port.name.ilike(f"%{search}%")) |
            (Port.description.ilike(f"%{search}%"))
        )

    if is_active is not None:
        query = query.filter(Port.is_active == is_active)

    total = query.count()
    items = query.order_by(Port.name).offset(skip).limit(limit).all()

    return PortList(total=total, items=items)


@router.get("/options", response_model=list[PortResponse])
async def port_options(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ports", "view")),
):
    """Listar puertos activos para selects (sin paginación)."""
    items = db.query(Port).filter(Port.is_active == True).order_by(Port.name).all()
    return items


@router.get("/{port_id}", response_model=PortResponse)
async def get_port(
    port_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ports", "view")),
):
    """Obtener un puerto por ID."""
    port = db.query(Port).filter(Port.id == port_id).first()
    if not port:
        raise HTTPException(status_code=404, detail="Puerto no encontrado")
    return port


@router.post("", response_model=PortResponse, status_code=201)
async def create_port(
    data: PortCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ports", "create")),
):
    """Crear un nuevo puerto."""
    # Verificar unicidad
    if db.query(Port).filter(Port.name == data.name).first():
        raise HTTPException(status_code=400, detail="Ya existe un puerto con ese nombre")

    port = Port(**data.model_dump())
    db.add(port)
    db.commit()
    db.refresh(port)

    # Auditoría
    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="create",
        module="ports",
        entity_type="Port",
        entity_id=port.id,
        description=f"Creó puerto '{port.name}' ({port.latitude}, {port.longitude})",
        ip_address=request.client.host if request.client else None,
    )

    return port


@router.put("/{port_id}", response_model=PortResponse)
async def update_port(
    port_id: int,
    data: PortUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ports", "edit")),
):
    """Actualizar un puerto existente."""
    port = db.query(Port).filter(Port.id == port_id).first()
    if not port:
        raise HTTPException(status_code=404, detail="Puerto no encontrado")

    update_data = data.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] != port.name:
        existing = db.query(Port).filter(Port.name == update_data["name"]).first()
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe un puerto con ese nombre")

    # Registrar cambios para auditoría
    changes = {}
    for key, value in update_data.items():
        old_value = getattr(port, key)
        if old_value != value:
            changes[key] = {"antes": str(old_value), "después": str(value)}
        setattr(port, key, value)

    db.commit()
    db.refresh(port)

    if changes:
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="update",
            module="ports",
            entity_type="Port",
            entity_id=port.id,
            description=f"Actualizó puerto '{port.name}'",
            details=changes,
            ip_address=request.client.host if request.client else None,
        )

    return port


@router.delete("/{port_id}")
async def delete_port(
    port_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("ports", "delete")),
):
    """Eliminar un puerto."""
    port = db.query(Port).filter(Port.id == port_id).first()
    if not port:
        raise HTTPException(status_code=404, detail="Puerto no encontrado")

    port_name = port.name
    db.delete(port)
    db.commit()

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="delete",
        module="ports",
        entity_type="Port",
        entity_id=port_id,
        description=f"Eliminó puerto '{port_name}'",
        ip_address=request.client.host if request.client else None,
    )

    return {"message": f"Puerto '{port_name}' eliminado correctamente"}
