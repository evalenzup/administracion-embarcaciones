"""
SIAE — Schemas Pydantic para Permission.
"""

from pydantic import BaseModel


class PermissionResponse(BaseModel):
    """Respuesta de permiso."""
    id: int
    module: str
    action: str
    description: str | None = None

    model_config = {"from_attributes": True}


class PermissionList(BaseModel):
    """Lista paginada de permisos."""
    total: int
    items: list[PermissionResponse]
