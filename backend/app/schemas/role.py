"""
SIAE — Schemas Pydantic para Role.
"""

from datetime import datetime
from pydantic import BaseModel, Field
from app.schemas.permission import PermissionResponse


class RoleCreate(BaseModel):
    """Crear un nuevo rol."""
    name: str = Field(..., min_length=2, max_length=50)
    description: str | None = Field(None, max_length=200)
    permission_ids: list[int] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    """Actualizar un rol existente."""
    name: str | None = Field(None, min_length=2, max_length=50)
    description: str | None = Field(None, max_length=200)
    permission_ids: list[int] | None = None


class RoleResponse(BaseModel):
    """Respuesta de rol con permisos."""
    id: int
    name: str
    description: str | None = None
    is_system_role: bool
    created_at: datetime
    permissions: list[PermissionResponse] = []

    model_config = {"from_attributes": True}


class RoleBasic(BaseModel):
    """Respuesta básica de rol (sin permisos detallados)."""
    id: int
    name: str
    description: str | None = None

    model_config = {"from_attributes": True}


class RoleList(BaseModel):
    """Lista paginada de roles."""
    total: int
    items: list[RoleResponse]
