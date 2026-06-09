"""
SIAE — Router de gestión de roles (admin).
CRUD completo + asignación de permisos.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.role import Role
from app.models.permission import Permission
from app.schemas.role import RoleCreate, RoleUpdate, RoleResponse, RoleList
from app.schemas.permission import PermissionResponse, PermissionList

router = APIRouter(prefix="/api/v1/roles", tags=["Roles"])


@router.get("", response_model=RoleList)
async def list_roles(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("roles", "view")),
):
    """Listar roles con sus permisos."""
    total = db.query(Role).count()
    items = db.query(Role).order_by(Role.id).offset(skip).limit(limit).all()
    return RoleList(total=total, items=items)


@router.get("/permissions", response_model=PermissionList)
async def list_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("roles", "view")),
):
    """Listar todos los permisos disponibles."""
    items = db.query(Permission).order_by(Permission.module, Permission.action).all()
    return PermissionList(total=len(items), items=items)


@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("roles", "view")),
):
    """Obtener un rol por ID con sus permisos."""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    return role


@router.post("", response_model=RoleResponse, status_code=201)
async def create_role(
    data: RoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("roles", "create")),
):
    """Crear un nuevo rol con permisos."""
    if db.query(Role).filter(Role.name == data.name).first():
        raise HTTPException(status_code=400, detail="Ya existe un rol con ese nombre")

    role = Role(
        name=data.name,
        description=data.description,
        is_system_role=False,
    )

    if data.permission_ids:
        permissions = db.query(Permission).filter(Permission.id.in_(data.permission_ids)).all()
        role.permissions = permissions

    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.put("/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: int,
    data: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("roles", "edit")),
):
    """Actualizar un rol existente."""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")

    if data.name is not None:
        existing = db.query(Role).filter(Role.name == data.name, Role.id != role_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe un rol con ese nombre")
        role.name = data.name

    if data.description is not None:
        role.description = data.description

    if data.permission_ids is not None:
        permissions = db.query(Permission).filter(Permission.id.in_(data.permission_ids)).all()
        role.permissions = permissions

    db.commit()
    db.refresh(role)
    return role


@router.delete("/{role_id}")
async def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("roles", "delete")),
):
    """Eliminar un rol."""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")

    if role.is_system_role:
        raise HTTPException(status_code=400, detail="No se pueden eliminar roles del sistema")

    db.delete(role)
    db.commit()
    return {"message": "Rol eliminado correctamente"}
