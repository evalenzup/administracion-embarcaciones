"""
SIAE — Schemas Pydantic para User y Auth.
"""

from datetime import datetime
from pydantic import BaseModel, Field, EmailStr
from app.schemas.role import RoleBasic


# ── Auth schemas ──────────────────────────────────────────────

class LoginRequest(BaseModel):
    """Solicitud de login."""
    username: str = Field(..., min_length=2)
    password: str = Field(..., min_length=4)


class TokenResponse(BaseModel):
    """Respuesta con tokens JWT."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    """Solicitud de refresh token."""
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    """Solicitud de cambio de contraseña."""
    current_password: str = Field(..., min_length=4)
    new_password: str = Field(..., min_length=6)


# ── User schemas ──────────────────────────────────────────────

class UserResetPassword(BaseModel):
    """Solicitud de reseteo de contraseña por administrador."""
    password: str = Field(..., min_length=6)


class UserCreate(BaseModel):
    """Crear un nuevo usuario."""
    username: str = Field(..., min_length=2, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2, max_length=100)
    is_active: bool = True
    role_ids: list[int] = Field(default_factory=list)
    participant_profile_id: int | None = None
    personnel_id: int | None = None


class UserUpdate(BaseModel):
    """Actualizar un usuario existente."""
    email: EmailStr | None = None
    full_name: str | None = Field(None, min_length=2, max_length=100)
    is_active: bool | None = None
    role_ids: list[int] | None = None
    participant_profile_id: int | None = None
    personnel_id: int | None = None


class UserResponse(BaseModel):
    """Respuesta de usuario con roles."""
    id: int
    username: str
    email: str
    full_name: str
    is_active: bool
    is_superadmin: bool
    personnel_id: int | None = None
    participant_profile_id: int | None = None
    created_at: datetime
    updated_at: datetime
    roles: list[RoleBasic] = []

    model_config = {"from_attributes": True}


class UserMe(BaseModel):
    """Respuesta para GET /auth/me con permisos resueltos."""
    id: int
    username: str
    email: str
    full_name: str
    is_superadmin: bool
    participant_profile_id: int | None = None
    roles: list[RoleBasic] = []
    permissions: list[str] = []

    model_config = {"from_attributes": True}


class UserList(BaseModel):
    """Lista paginada de usuarios."""
    total: int
    items: list[UserResponse]
