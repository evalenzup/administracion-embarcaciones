"""
SIAE — Modelo Permission.
Define los permisos granulares por módulo y acción.
"""

from sqlalchemy import Column, Integer, String, UniqueConstraint
from app.database import Base


class Permission(Base):
    """Permiso individual: combinación de módulo + acción."""

    __tablename__ = "permissions"
    __table_args__ = (
        UniqueConstraint("module", "action", name="uq_permission_module_action"),
    )

    id = Column(Integer, primary_key=True, index=True)
    module = Column(String(50), nullable=False, index=True)
    action = Column(String(20), nullable=False)
    description = Column(String(200), nullable=True)

    def __repr__(self):
        return f"<Permission {self.module}:{self.action}>"
