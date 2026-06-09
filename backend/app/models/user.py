"""
SIAE — Modelo User y tabla asociativa UserRole.
Define los usuarios del sistema con sus roles asignados.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class UserRole(Base):
    """Tabla asociativa M2M: User <-> Role, con fecha de asignación."""

    __tablename__ = "user_roles"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    user = relationship("User", back_populates="user_roles")
    role = relationship("Role", back_populates="users")


class User(Base):
    """Usuario del sistema con autenticación y roles."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_superadmin = Column(Boolean, default=False, nullable=False)
    personnel_id = Column(Integer, ForeignKey("personnel.id", ondelete="SET NULL"), nullable=True)
    participant_profile_id = Column(Integer, ForeignKey("participant_profiles.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    user_roles = relationship("UserRole", back_populates="user", lazy="selectin", cascade="all, delete-orphan")
    participant_profile = relationship(
        "ParticipantProfile",
        foreign_keys=[participant_profile_id],
        back_populates="linked_user",
        lazy="selectin",
    )

    @property
    def roles(self):
        """Lista de roles del usuario."""
        return [ur.role for ur in self.user_roles]

    @property
    def permissions(self):
        """Set de permisos del usuario (module:action)."""
        perms = set()
        for role in self.roles:
            for perm in role.permissions:
                perms.add(f"{perm.module}:{perm.action}")
        return perms

    def has_permission(self, module: str, action: str) -> bool:
        """Verificar si el usuario tiene un permiso específico."""
        if self.is_superadmin:
            return True
        return f"{module}:{action}" in self.permissions

    def __repr__(self):
        return f"<User {self.username}>"
