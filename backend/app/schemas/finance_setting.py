"""
SIAE — Schemas Pydantic para FinanceSetting (Configuración Financiera).
"""

from datetime import datetime
from pydantic import BaseModel, Field


class FinanceSettingBase(BaseModel):
    key: str = Field(..., max_length=100)
    value: str = Field(..., max_length=500)


class FinanceSettingUpdate(BaseModel):
    """Actualizar una clave de configuración."""
    value: str = Field(..., max_length=500)


class FinanceSettingResponse(FinanceSettingBase):
    """Respuesta de configuración."""
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
