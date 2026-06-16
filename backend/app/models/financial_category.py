"""
SIAE — Modelo FinancialCategory (Categorías de Gasto Financiero).
Define las categorías de gastos generales para todo el módulo financiero.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.database import Base


class FinancialCategory(Base):
    """Categoría de gasto financiero (materiales, servicios, otros)."""

    __tablename__ = "financial_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), unique=True, nullable=False, index=True)
    group = Column(String(50), nullable=False)  # materiales, servicios, otros
    icon = Column(String(50), nullable=True)     # Emoji o nombre de icono
    color = Column(String(50), nullable=True)    # Color CSS o hexadecimal
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<FinancialCategory {self.name} ({self.group})>"
