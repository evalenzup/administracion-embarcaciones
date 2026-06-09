"""
SIAE — Modelo Role y tabla asociativa RolePermission.
Define los roles del sistema y sus permisos asignados.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


# Tabla asociativa M2M: Role <-> Permission
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", Integer, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class Role(Base):
    """Rol del sistema con permisos asociados."""

    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(String(200), nullable=True)
    is_system_role = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    permissions = relationship(
        "Permission",
        secondary=role_permissions,
        backref="roles",
        lazy="selectin",
    )
    users = relationship("UserRole", back_populates="role", lazy="selectin")

    def __repr__(self):
        return f"<Role {self.name}>"
