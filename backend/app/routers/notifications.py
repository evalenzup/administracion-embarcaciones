"""
SIAE — Router para notificaciones salientes (Push).
Permite enviar alertas automáticas, recordatorios y anuncios al bot de Telegram.
"""

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel, Field

from app.dependencies import get_db, require_permission, get_current_user
from app.models.user import User
from app.models.notification_log import NotificationLog
from app.config import get_settings
from app.services.telegram_notifications import (
    send_manual_announcement,
    send_broadcast_message,
    send_telegram_msg,
    log_notification_entry,
    generate_daily_digest,
    get_admin_overdue_report,
    get_admin_pending_report,
    send_reminder_for_folio
)
from app.services.financial_reminder_scheduler import run_financial_reminders_job

settings = get_settings()
router = APIRouter(prefix="/api/v1/notifications", tags=["Notificaciones"])


# ── SCHEMAS ──

class TelegramNotificationRequest(BaseModel):
    """Solicitud de envío de notificación push directa."""
    user_id: int | None = Field(None, description="ID del usuario en SIAE")
    telegram_id: str | None = Field(None, description="ID de Telegram directo (opcional)")
    text: str = Field(..., description="Cuerpo del mensaje en HTML o texto plano")
    parse_mode: str = Field("HTML", description="Modo de parseo de Telegram (HTML o Markdown)")


class AnnouncementRequest(BaseModel):
    """Solicitud de anuncio manual para un trámite específico (Viático o GRC)."""
    tramite_type: str = Field(..., description="'viatico' o 'grc'")
    tramite_id: int = Field(..., description="ID del trámite")
    message: str = Field(..., description="Mensaje o comunicado personalizado")
    send_to_titular: bool = Field(True, description="Enviar al comisionado / solicitante")
    send_to_asistente: bool = Field(True, description="Enviar al asistente asignado")


class BroadcastRequest(BaseModel):
    """Solicitud de comunicado general / masivo."""
    title: str = Field(..., description="Título del comunicado")
    message: str = Field(..., description="Cuerpo del mensaje")
    target_group: str = Field("all_linked", description="'all_linked', 'active_viaticos', o 'active_grcs'")


# ── ENDPOINTS ──

@router.post("/telegram")
async def send_direct_telegram_notification(
    data: TelegramNotificationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users", "edit"))
):
    """
    Enviar una notificación push directa a un usuario de Telegram.
    """
    target_tg_id = data.telegram_id
    target_user = None

    if not target_tg_id:
        if not data.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Debe proporcionar 'user_id' o 'telegram_id'"
            )
        target_user = db.query(User).filter(User.id == data.user_id).first()
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado"
            )
        if not target_user.telegram_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El usuario {target_user.full_name} no tiene una cuenta de Telegram vinculada"
            )
        target_tg_id = target_user.telegram_id

    res = await send_telegram_msg(target_tg_id, data.text, parse_mode=data.parse_mode)
    
    log_notification_entry(
        db=db,
        tramite_type="general",
        tramite_id=None,
        notification_type="manual_direct",
        user_id=target_user.id if target_user else None,
        telegram_id=target_tg_id,
        recipient_role="direct",
        title="Mensaje directo",
        message_text=data.text,
        status=res.get("status", "sent"),
        error_detail=res.get("error")
    )

    return res


@router.post("/announcement")
async def send_tramite_announcement(
    data: AnnouncementRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Enviar un aviso o comunicado personalizado a los responsables de un Viático o GRC
    (con soporte de enrutamiento a Titular, Asistente o ambos).
    """
    if data.tramite_type not in ["viatico", "grc"]:
        raise HTTPException(status_code=400, detail="El tipo de trámite debe ser 'viatico' o 'grc'")

    sender_name = current_user.full_name or current_user.username
    res = await send_manual_announcement(
        db=db,
        tramite_type=data.tramite_type,
        tramite_id=data.tramite_id,
        custom_message=data.message,
        send_to_titular=data.send_to_titular,
        send_to_asistente=data.send_to_asistente,
        sender_name=sender_name
    )

    if res.get("status") == "error":
        raise HTTPException(status_code=404, detail=res.get("message", "Error al procesar el trámite"))

    return res


@router.post("/broadcast")
async def send_broadcast_announcement(
    data: BroadcastRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users", "edit"))
):
    """
    Enviar un comunicado oficial masivo a todos los usuarios con cuenta de Telegram vinculada.
    """
    sender_name = current_user.full_name or "Administración DEO / SIAE"
    res = await send_broadcast_message(
        db=db,
        title=data.title,
        message=data.message,
        target_group=data.target_group,
        sender_name=sender_name
    )
    return res


@router.post("/run-reminders-now")
async def trigger_financial_reminders_now(
    current_user: User = Depends(require_permission("viaticos", "view"))
):
    """
    Ejecutar manualmente el escaneo de recordatorios financieros (útil para pruebas y administradores).
    """
    res = await run_financial_reminders_job()
    return res


@router.get("/logs")
def get_notification_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    tramite_type: str | None = Query(None),
    notification_type: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users", "view"))
):
    """
    Obtener el histórico paginado de notificaciones enviadas por Telegram.
    """
    query = db.query(NotificationLog)
    if tramite_type:
        query = query.filter(NotificationLog.tramite_type == tramite_type)
    if notification_type:
        query = query.filter(NotificationLog.notification_type == notification_type)

    total = query.count()
    items = query.order_by(desc(NotificationLog.sent_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [
            {
                "id": log.id,
                "tramite_type": log.tramite_type,
                "tramite_id": log.tramite_id,
                "notification_type": log.notification_type,
                "user_id": log.user_id,
                "username": log.user.username if log.user else None,
                "full_name": log.user.full_name if log.user else None,
                "telegram_id": log.telegram_id,
                "recipient_role": log.recipient_role,
                "title": log.title,
                "message_text": log.message_text,
                "status": log.status,
                "error_detail": log.error_detail,
                "sent_at": log.sent_at
            }
            for log in items
        ]
    }


# ── REPORTES ADMINISTRATIVOS & DIGEST PARA TELEGRAM BOT / WEB ──

@router.get("/admin-digest")
def get_admin_digest_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtener el resumen consolidado de estado financiero y operativo de Viáticos y GRCs.
    Accesible para administradores, asistentes o usuarios autorizados.
    """
    has_access = (
        current_user.is_superadmin or
        any(r.name.lower() in ["administrador", "admin", "superadmin", "asistente", "auditor"] for r in current_user.roles) or
        current_user.has_permission("viaticos", "view")
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para ver el resumen administrativo."
        )

    digest = generate_daily_digest(db)
    return digest


@router.get("/admin-overdue")
def get_admin_overdue_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtener la lista de trámites vencidos o fuera de plazo de comprobación.
    """
    has_access = (
        current_user.is_superadmin or
        any(r.name.lower() in ["administrador", "admin", "superadmin", "asistente", "auditor"] for r in current_user.roles) or
        current_user.has_permission("viaticos", "view")
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para ver el reporte de trámites vencidos."
        )

    return get_admin_overdue_report(db)


@router.get("/admin-pending")
def get_admin_pending_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtener la lista de trámites activos y pendientes de cierre.
    """
    has_access = (
        current_user.is_superadmin or
        any(r.name.lower() in ["administrador", "admin", "superadmin", "asistente", "auditor"] for r in current_user.roles) or
        current_user.has_permission("viaticos", "view")
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para ver el reporte de trámites pendientes."
        )

    return get_admin_pending_report(db)


class SendReminderByFolioRequest(BaseModel):
    """Solicitud de recordatorio manual por folio para bot y web."""
    folio: str = Field(..., description="Folio del Viático o GRC")
    custom_note: str | None = Field(None, description="Nota adicional opcional")


@router.post("/send-reminder-by-folio")
async def send_reminder_by_folio_endpoint(
    data: SendReminderByFolioRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Enviar recordatorio formal directo al titular de un trámite buscando por su Folio.
    """
    has_access = (
        current_user.is_superadmin or
        any(r.name.lower() in ["administrador", "admin", "superadmin", "asistente", "auditor"] for r in current_user.roles) or
        current_user.has_permission("viaticos", "edit")
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para enviar recordatorios de trámites."
        )

    sender_name = current_user.full_name or current_user.username
    res = await send_reminder_for_folio(
        db=db,
        folio=data.folio,
        custom_note=data.custom_note,
        sender_name=sender_name
    )

    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Error al enviar recordatorio"))

    return res

