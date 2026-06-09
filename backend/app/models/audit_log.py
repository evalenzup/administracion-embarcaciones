"""
SIAE — Modelo AuditLog.
Registra automáticamente todas las acciones de los usuarios en el sistema.
"""

from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class AuditLog(Base):
    """Registro de auditoría: quién hizo qué y cuándo."""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    username = Column(String(50), nullable=False)
    action = Column(String(20), nullable=False, index=True)  # create, update, delete, login, logout
    module = Column(String(50), nullable=False, index=True)  # vessels, users, auth, etc.
    entity_type = Column(String(50), nullable=True)  # User, Role, Vessel, etc.
    entity_id = Column(Integer, nullable=True)
    description = Column(String(500), nullable=True)
    details = Column(Text, nullable=True)  # JSON con datos adicionales
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relación
    user = relationship("User", lazy="selectin")

    def __repr__(self):
        return f"<AuditLog {self.username}:{self.action}:{self.module}>"
