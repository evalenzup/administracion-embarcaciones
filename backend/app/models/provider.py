"""
SIAE — Modelo de Base de Datos para Proveedores.
Almacena datos fiscales y nombres comerciales de proveedores de bienes y servicios.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Provider(Base):
    """Proveedores registrados en el sistema por sus facturas XML o de forma manual."""
    __tablename__ = "providers"

    id = Column(Integer, primary_key=True, index=True)
    rfc = Column(String(50), unique=True, nullable=False, index=True)
    legal_name = Column(String(250), nullable=True)
    commercial_name = Column(String(250), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    services = relationship("ServiceRequest", back_populates="provider")
    petty_cash_invoices = relationship("PettyCashInvoice", back_populates="provider")

    def __repr__(self):
        return f"<Provider {self.rfc} - {self.commercial_name or self.legal_name}>"
