"""
SIAE — Schemas Pydantic para PettyCashCount (Conteo de Efectivo / Arqueo).
"""

from datetime import datetime
from pydantic import BaseModel, Field
from app.schemas.petty_cash_invoice import UserBasicResponse


class CashCountCreate(BaseModel):
    """Registrar un conteo físico de caja chica (sin monedas de 50c)."""
    bills_1000: int = Field(default=0, ge=0)
    bills_500: int = Field(default=0, ge=0)
    bills_200: int = Field(default=0, ge=0)
    bills_100: int = Field(default=0, ge=0)
    bills_50: int = Field(default=0, ge=0)
    bills_20: int = Field(default=0, ge=0)
    
    coins_10: int = Field(default=0, ge=0)
    coins_5: int = Field(default=0, ge=0)
    coins_2: int = Field(default=0, ge=0)
    coins_1: int = Field(default=0, ge=0)
    
    notes: str | None = Field(None, max_length=500)


class CashCountResponse(BaseModel):
    """Respuesta de arqueo de caja chica."""
    id: int
    count_date: datetime
    
    bills_1000: int
    bills_500: int
    bills_200: int
    bills_100: int
    bills_50: int
    bills_20: int
    
    coins_10: int
    coins_5: int
    coins_2: int
    coins_1: int
    
    total_counted: float
    expected_balance: float
    difference: float
    notes: str | None
    invoices_details: list | None = None
    
    counted_by_id: int | None
    counted_by: UserBasicResponse | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CashCountList(BaseModel):
    """Lista de arqueos."""
    total: int
    items: list[CashCountResponse]
