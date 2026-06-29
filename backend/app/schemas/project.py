"""
SIAE — Schemas Pydantic para Proyectos.
"""

from datetime import datetime
from pydantic import BaseModel, Field


class ProjectBase(BaseModel):
    account_number: str = Field(..., min_length=2, max_length=100, description="Número de cuenta del proyecto")
    name: str = Field(..., min_length=2, max_length=300, description="Nombre del proyecto")
    responsible_name: str = Field(..., min_length=2, max_length=200, description="Nombre del responsable / PI")
    department: str = Field(..., min_length=2, max_length=150, description="Departamento académico")
    division: str = Field(..., min_length=2, max_length=150, description="División de adscripción")


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    account_number: str | None = Field(None, min_length=2, max_length=100)
    name: str | None = Field(None, min_length=2, max_length=300)
    responsible_name: str | None = Field(None, min_length=2, max_length=200)
    department: str | None = Field(None, min_length=2, max_length=150)
    division: str | None = Field(None, min_length=2, max_length=150)
    is_active: bool | None = None


class ProjectResponse(ProjectBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
