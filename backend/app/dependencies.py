"""
SIAE — Dependencies comunes de FastAPI.
Incluye: get_db, get_current_user, require_permission.
"""

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.user import User
from app.utils.security import decode_token
from app.config import get_settings

settings = get_settings()
security_scheme = HTTPBearer(auto_error=False)


def get_db():
    """Dependency que provee una sesión de BD por request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Obtener el usuario autenticado del token JWT o del Bot (impersonación)."""
    # 1. Intentar autenticar vía Bot Token + Telegram ID (Impersonación)
    bot_token = request.headers.get("x-bot-token")
    impersonate_tg_id = request.headers.get("x-impersonate-telegram-id")

    if bot_token:
        if bot_token != settings.BOT_API_KEY:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token de Bot no válido",
            )
        if not impersonate_tg_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cabecera X-Impersonate-Telegram-ID requerida para solicitudes de Bot",
            )
        # Buscar usuario por telegram_id
        user = db.query(User).filter(User.telegram_id == impersonate_tg_id).first()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Usuario con Telegram ID {impersonate_tg_id} no encontrado",
            )
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuario desactivado",
            )
        return user

    # 2. Si no es petición de bot, validar JWT normal
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales de autenticación no proporcionadas",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tipo de token inválido",
        )

    user_id_raw = payload.get("sub")
    if user_id_raw is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sin identificador de usuario",
        )

    user_id = int(user_id_raw)
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario desactivado",
        )

    return user


def require_permission(module: str, action: str):
    """
    Dependency factory que verifica un permiso específico.

    Uso:
        @router.get("/vessels")
        async def list_vessels(
            current_user: User = Depends(require_permission("vessels", "view"))
        ):
            ...
    """
    async def _check_permission(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if not current_user.has_permission(module, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"No tienes permiso para '{action}' en el módulo '{module}'",
            )
        return current_user

    return _check_permission
