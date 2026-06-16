"""
SIAE — Schemas Pydantic para FinancialCategory (Categorías de Gasto).
"""

from datetime import datetime
from pydantic import BaseModel, Field


class FinancialCategoryBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    group: str = Field(..., max_length=50) # materiales, servicios, otros
    icon: str | None = Field(None, max_length=50)
    color: str | None = Field(None, max_length=50)
    is_active: bool = True


class FinancialCategoryCreate(FinancialCategoryBase):
    """Crear una categoría de gasto."""
    pass


class FinancialCategoryUpdate(BaseModel):
    """Actualizar una categoría de gasto."""
    name: str | None = Field(None, min_length=2, max_length=200)
    group: str | None = Field(None, max_length=50)
    icon: str | None = Field(None, max_length=50)
    color: str | None = Field(None, max_length=50)
    is_active: bool | None = None


class FinancialCategoryResponse(FinancialCategoryBase):
    """Respuesta de categoría de gasto."""
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
