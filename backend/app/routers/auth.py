"""
SIAE — Router de autenticación.
Endpoints: login, refresh, me, change-password.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user
from app.models.user import User
from app.schemas.user import (
    LoginRequest, TokenResponse, RefreshRequest, ChangePasswordRequest, UserMe,
    TelegramLinkTokenResponse, TelegramLinkRequest, TelegramLinkResponse
)
from app.utils.security import (
    verify_password, create_access_token, create_refresh_token, decode_token, hash_password,
    create_telegram_link_token
)
from app.config import get_settings
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/auth", tags=["Autenticación"])


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: Session = Depends(get_db)):
    """Iniciar sesión con username y password."""
    user = db.query(User).filter(User.username == data.username).first()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario desactivado. Contacte al administrador.",
        )

    access_token = create_access_token(data={"sub": user.id})
    refresh_token = create_refresh_token(data={"sub": user.id})

    # Log de auditoría
    try:
        log_action(
            db=db,
            user_id=user.id,
            username=user.username,
            action="login",
            module="auth",
            entity_type="User",
            entity_id=user.id,
            description=f"Inicio de sesión exitoso ({user.username})",
            details={"source": "web"}
        )
    except Exception:
        pass

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(data: RefreshRequest, db: Session = Depends(get_db)):
    """Renovar tokens usando un refresh token válido."""
    payload = decode_token(data.refresh_token)

    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido o expirado",
        )

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o desactivado",
        )

    access_token = create_access_token(data={"sub": user.id})
    new_refresh_token = create_refresh_token(data={"sub": user.id})

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
    )


@router.get("/me", response_model=UserMe)
async def get_me(current_user: User = Depends(get_current_user)):
    """Obtener datos del usuario autenticado con permisos resueltos."""
    return UserMe(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        is_superadmin=current_user.is_superadmin,
        participant_profile_id=current_user.participant_profile_id,
        roles=[{"id": r.id, "name": r.name, "description": r.description} for r in current_user.roles],
        permissions=sorted(list(current_user.permissions)),
    )


@router.put("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cambiar la contraseña del usuario autenticado."""
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contraseña actual incorrecta",
        )

    current_user.hashed_password = hash_password(data.new_password)
    db.commit()

    return {"message": "Contraseña actualizada correctamente"}


# ── Telegram Link Endpoints ─────────────────────────────────────

settings = get_settings()


@router.post("/telegram-token", response_model=TelegramLinkTokenResponse)
async def generate_telegram_token(
    current_user: User = Depends(get_current_user)
):
    """Generar token temporal para vincular Telegram (requiere estar logueado en la Web)."""
    token = create_telegram_link_token(current_user.id)
    return TelegramLinkTokenResponse(
        link_token=token,
        bot_username=settings.TELEGRAM_BOT_USERNAME
    )


@router.post("/link-telegram", response_model=TelegramLinkResponse)
async def link_telegram(
    data: TelegramLinkRequest,
    x_bot_token: str = Header(None),
    db: Session = Depends(get_db)
):
    """Vincular un telegram_id a un usuario usando el token temporal (llamado por el bot)."""
    # Validar bot api key
    if not x_bot_token or x_bot_token != settings.BOT_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de Bot inválido o no proporcionado"
        )

    # Decodificar y validar el link token
    payload = decode_token(data.token)
    if payload is None or payload.get("type") != "telegram_link":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token de vinculación inválido o expirado"
        )

    user_id = int(payload.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El usuario está desactivado"
        )

    # Validar si este telegram_id ya está en uso por otro usuario
    existing = db.query(User).filter(User.telegram_id == data.telegram_id).first()
    if existing and existing.id != user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta cuenta de Telegram ya está vinculada a otro usuario de SIAE"
        )

    # Guardar vinculación
    user.telegram_id = data.telegram_id
    db.commit()

    # Log de auditoría
    try:
        log_action(
            db=db,
            user_id=user.id,
            username=user.username,
            action="link_telegram",
            module="telegram_bot",
            entity_type="User",
            entity_id=user.id,
            description=f"Vinculó cuenta de Telegram (ID: {data.telegram_id}) al usuario {user.username}",
            details={"telegram_id": str(data.telegram_id), "username": user.username, "source": "telegram_bot"}
        )
    except Exception:
        pass

    return TelegramLinkResponse(
        username=user.username,
        full_name=user.full_name
    )
