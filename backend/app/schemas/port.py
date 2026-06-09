"""
SIAE — Schemas Pydantic para Port (Puerto/Escollera).
"""

from datetime import datetime
from pydantic import BaseModel, Field


class PortBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    description: str | None = Field(None, max_length=300)
    is_active: bool = True


class PortCreate(PortBase):
    """Crear un nuevo puerto."""
    pass


class PortUpdate(BaseModel):
    """Actualizar un puerto existente."""
    name: str | None = Field(None, min_length=2, max_length=200)
    latitude: float | None = Field(None, ge=-90.0, le=90.0)
    longitude: float | None = Field(None, ge=-180.0, le=180.0)
    description: str | None = Field(None, max_length=300)
    is_active: bool | None = None


class PortResponse(PortBase):
    """Respuesta de puerto."""
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PortList(BaseModel):
    """Lista paginada de puertos."""
    total: int
    items: list[PortResponse]
