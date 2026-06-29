"""
SIAE — Schemas Pydantic para Proveedores.
"""

from datetime import datetime
from pydantic import BaseModel, Field


class ProviderBase(BaseModel):
    rfc: str = Field(..., min_length=12, max_length=13, description="RFC del proveedor")
    legal_name: str | None = Field(None, max_length=250, description="Razón social oficial")
    commercial_name: str | None = Field(None, max_length=250, description="Nombre comercial")


class ProviderCreate(ProviderBase):
    pass


class ProviderUpdate(BaseModel):
    commercial_name: str | None = Field(None, max_length=250)
    is_active: bool | None = None


class ProviderResponse(ProviderBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
