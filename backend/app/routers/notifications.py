"""
SIAE — Router para notificaciones salientes (Push).
Permite enviar alertas automáticas y notificaciones al bot de Telegram.
"""

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.config import get_settings
from pydantic import BaseModel, Field

settings = get_settings()
router = APIRouter(prefix="/api/v1/notifications", tags=["Notificaciones"])


class TelegramNotificationRequest(BaseModel):
    """Solicitud de envío de notificación push."""
    user_id: int | None = Field(None, description="ID del usuario en SIAE")
    telegram_id: str | None = Field(None, description="ID de Telegram directo (opcional)")
    text: str = Field(..., description="Cuerpo del mensaje en HTML o texto plano")
    parse_mode: str = Field("HTML", description="Modo de parseo de Telegram (HTML o Markdown)")


@router.post("/telegram")
async def send_telegram_notification(
    data: TelegramNotificationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users", "edit"))
):
    """
    Enviar una notificación push proactiva a un usuario de Telegram.
    Requiere permisos de edición en el módulo de usuarios.
    """
    # 1. Resolver el telegram_id
    target_tg_id = data.telegram_id
    if not target_tg_id:
        if not data.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Debe proporcionar 'user_id' o 'telegram_id'"
            )
        user = db.query(User).filter(User.id == data.user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado"
            )
        if not user.telegram_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El usuario {user.full_name} no tiene una cuenta de Telegram vinculada"
            )
        target_tg_id = user.telegram_id

    # 2. Verificar si hay token configurado. Si no, simular el envío
    bot_token = settings.TELEGRAM_BOT_TOKEN
    if not bot_token or bot_token == "YOUR_TELEGRAM_BOT_TOKEN" or bot_token.strip() == "":
        return {
            "status": "simulated",
            "message": "Envío de notificación simulado (sin TELEGRAM_BOT_TOKEN en .env)",
            "recipient": target_tg_id,
            "text": data.text
        }

    # 3. Enviar la petición a la API de Telegram
    telegram_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": target_tg_id,
        "text": data.text,
        "parse_mode": data.parse_mode
    }

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(telegram_url, json=payload, timeout=10.0)
            if resp.status_code != 200:
                return {
                    "status": "error",
                    "telegram_error_code": resp.status_code,
                    "telegram_response": resp.text
                }
            return {
                "status": "ok",
                "message": "Notificación enviada con éxito"
            }
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error de red al conectar con Telegram: {str(e)}"
            )
