"""
SIAE — Modelo de Cuentas y Movimientos Bancarios/Financieros.
Lleva el control de saldos (cargos y abonos) por cuenta.
"""

import enum
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Boolean, Enum as SAEnum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class TransactionType(str, enum.Enum):
    """Tipos de movimiento de cuenta."""
    CARGO = "cargo"   # Gasto/Retiro/Deducción (disminuye saldo)
    ABONO = "abono"   # Ingreso/Depósito/Abono (aumenta saldo)


class Account(Base):
    """Cuentas bancarias o de fondos institucionales (ej. Fondo Fijo, Dirección Administrativa, etc.)."""
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    account_number = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    transactions = relationship("AccountTransaction", back_populates="account", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Account {self.name} - Active: {self.is_active}>"


class AccountTransaction(Base):
    """Movimientos individuales de cargo o abono en una cuenta."""
    __tablename__ = "account_transactions"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(SAEnum(TransactionType), nullable=False)
    amount = Column(Float, nullable=False)
    concept = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    reference = Column(String(100), nullable=True)  # Folio, UUID, etc.
    origin_dest_account = Column(String(150), nullable=True)  # Texto libre para cuenta de origen/destino externa
    transaction_date = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    # Vínculo con caja chica (opcionales)
    petty_cash_invoice_id = Column(Integer, ForeignKey("petty_cash_invoices.id", ondelete="SET NULL"), nullable=True)
    petty_cash_reimbursement_id = Column(Integer, ForeignKey("petty_cash_reimbursements.id", ondelete="SET NULL"), nullable=True)
    cruise_billing_id = Column(Integer, ForeignKey("cruise_billings.id", ondelete="SET NULL"), nullable=True)

    # Vínculo con otra transacción para transferencias entre cuentas
    transfer_transaction_id = Column(Integer, ForeignKey("account_transactions.id", ondelete="SET NULL"), nullable=True)

    # Auditoría
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Categoría Financiera (opcional)
    category_id = Column(Integer, ForeignKey("financial_categories.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    account = relationship("Account", back_populates="transactions")
    petty_cash_invoice = relationship("PettyCashInvoice", lazy="select")
    petty_cash_reimbursement = relationship("PettyCashReimbursement", lazy="select")
    cruise_billing = relationship("CruiseBilling", lazy="select")
    created_by = relationship("User", lazy="selectin", foreign_keys=[created_by_id])
    category = relationship("FinancialCategory", lazy="selectin")
    
    # Relación autoreferencial para transferencias
    transfer_transaction = relationship(
        "AccountTransaction",
        remote_side=[id],
        post_update=True,
        foreign_keys=[transfer_transaction_id]
    )

    def __repr__(self):
        return f"<AccountTransaction {self.concept} - {self.type.value}: {self.amount}>"
