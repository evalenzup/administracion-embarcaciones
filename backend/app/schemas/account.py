"""
SIAE — Schemas Pydantic para Account y AccountTransaction.
"""

from datetime import datetime
from pydantic import BaseModel, Field
from app.models.account import TransactionType


# ── SCHEMAS DE TRANSACCIONES / MOVIMIENTOS ──

class AccountTransactionBase(BaseModel):
    type: TransactionType
    amount: float = Field(..., gt=0)
    concept: str = Field(..., min_length=2, max_length=200)
    description: str | None = Field(None)
    reference: str | None = Field(None, max_length=100)
    origin_dest_account: str | None = Field(None, max_length=150)
    category_id: int | None = None
    transaction_date: datetime | None = None


class AccountTransactionCreate(AccountTransactionBase):
    """Crear un movimiento manual de cuenta."""
    transfer_account_id: int | None = None


class AccountTransactionUpdate(BaseModel):
    """Actualizar un movimiento manual de cuenta (no enlazado a caja chica)."""
    concept: str | None = Field(None, min_length=2, max_length=200)
    amount: float | None = Field(None, gt=0)
    description: str | None = None
    reference: str | None = Field(None, max_length=100)
    origin_dest_account: str | None = Field(None, max_length=150)
    category_id: int | None = None
    transaction_date: datetime | None = None


class AccountTransactionResponse(AccountTransactionBase):
    id: int
    account_id: int
    petty_cash_invoice_id: int | None = None
    petty_cash_reimbursement_id: int | None = None
    transfer_transaction_id: int | None = None
    created_by_id: int | None = None
    created_by_name: str | None = None
    category_name: str | None = None
    category_icon: str | None = None
    category_color: str | None = None
    running_balance: float | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── SCHEMAS DE CUENTAS ──

class AccountBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    description: str | None = None
    account_number: str | None = Field(None, max_length=50)
    is_active: bool = True


class AccountCreate(AccountBase):
    """Crear una cuenta nueva."""
    initial_balance: float = Field(0.0, ge=0)


class AccountUpdate(BaseModel):
    """Actualizar datos generales de una cuenta."""
    name: str | None = Field(None, min_length=2, max_length=200)
    description: str | None = None
    account_number: str | None = Field(None, max_length=50)
    is_active: bool | None = None


class AccountResponse(AccountBase):
    id: int
    balance: float = 0.0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
