"""
SIAE — Modelo FinanceSetting (Configuración Financiera).
Permite parametrizar valores financieros como montos asignados, límites, etc.
"""

from sqlalchemy import Column, String, DateTime
from sqlalchemy.sql import func
from app.database import Base


class FinanceSetting(Base):
    """Configuración general del área de finanzas."""

    __tablename__ = "finance_settings"

    key = Column(String(100), primary_key=True, index=True)
    value = Column(String(500), nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<FinanceSetting {self.key} = {self.value}>"
