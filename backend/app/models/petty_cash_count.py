"""
SIAE — Modelo PettyCashCount (Conteo de Efectivo / Arqueo de Caja).
Registra las auditorías físicas de la caja chica comparando efectivo contra sistema.
"""

from sqlalchemy import Column, Integer, Float, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class PettyCashCount(Base):
    """Conteo físico de efectivo y arqueo de caja chicas (sin incluir monedas de 50c)."""

    __tablename__ = "petty_cash_counts"

    id = Column(Integer, primary_key=True, index=True)
    count_date = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    # Denominaciones de Billetes
    bills_1000 = Column(Integer, nullable=False, default=0)
    bills_500 = Column(Integer, nullable=False, default=0)
    bills_200 = Column(Integer, nullable=False, default=0)
    bills_100 = Column(Integer, nullable=False, default=0)
    bills_50 = Column(Integer, nullable=False, default=0)
    bills_20 = Column(Integer, nullable=False, default=0)
    
    # Denominaciones de Monedas (sin incluir monedas de 50 centavos)
    coins_10 = Column(Integer, nullable=False, default=0)
    coins_5 = Column(Integer, nullable=False, default=0)
    coins_2 = Column(Integer, nullable=False, default=0)
    coins_1 = Column(Integer, nullable=False, default=0)
    
    # Resumen y discrepancias
    total_counted = Column(Float, nullable=False)
    expected_balance = Column(Float, nullable=False)
    difference = Column(Float, nullable=False) # total_counted - expected_balance
    notes = Column(Text, nullable=True)
    
    # Persona que realiza el arqueo
    counted_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relación
    counted_by = relationship("User", lazy="selectin", foreign_keys=[counted_by_id])

    def __repr__(self):
        return f"<PettyCashCount {self.count_date} - Counted: {self.total_counted} vs Expected: {self.expected_balance} (Diff: {self.difference})>"
