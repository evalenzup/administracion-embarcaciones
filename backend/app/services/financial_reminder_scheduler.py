"""
SIAE — Scheduler de Recordatorios Financieros y Alertas vía Telegram.
Ejecuta escaneos periódicos (diarios) para enviar alertas de fechas, semáforos de comprobación y remanentes.
"""

import logging
import asyncio
from datetime import datetime, date, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.database import SessionLocal
from app.models.viatico import Viatico
from app.models.gasto_reserva_comprobar import GastoReservaComprobar
from app.models.notification_log import NotificationLog
from app.services.telegram_notifications import (
    resolve_viatico_users,
    resolve_grc_users,
    send_telegram_msg,
    log_notification_entry,
    send_daily_digest_to_admins
)

logger = logging.getLogger("siae.financial_scheduler")
_scheduler: AsyncIOScheduler | None = None
_reminders_lock = asyncio.Lock()


def has_recent_notification(
    db: Session,
    tramite_type: str,
    tramite_id: int,
    notification_type: str,
    user_id: int | None,
    within_days: int = 1
) -> bool:
    """
    Verificar si ya se envió una notificación idéntica en los últimos N días para evitar spam.
    """
    cutoff = datetime.now() - timedelta(days=within_days)
    query = db.query(NotificationLog).filter(
        NotificationLog.tramite_type == tramite_type,
        NotificationLog.tramite_id == tramite_id,
        NotificationLog.notification_type == notification_type,
        NotificationLog.sent_at >= cutoff,
        NotificationLog.status.in_(["sent", "simulated"])
    )
    if user_id:
        query = query.filter(NotificationLog.user_id == user_id)
    return query.first() is not None


async def process_viatico_reminders(db: Session, today: date) -> dict:
    """Evaluar y despachar recordatorios para comisiones de viáticos."""
    active_viaticos = db.query(Viatico).filter(
        Viatico.status.in_(["aprobado", "comprobacion_pendiente"])
    ).all()

    stats = {"evaluated": len(active_viaticos), "sent": 0}

    for v in active_viaticos:
        titular, asistente = resolve_viatico_users(db, v)
        folio = v.folio_comision
        destino = v.destino or "Comisión"
        monto_sol = v.monto_solicitado or 0.0
        monto_comp = v.monto_comprobado or 0.0
        monto_dev = v.monto_devuelto or 0.0
        saldo_pendiente = max(0.0, monto_sol - monto_comp - monto_dev)
        
        comisionado_name = (
            (v.personal.first_name + " " + v.personal.last_name)
            if v.personal else (v.firma_solicitante_nombre or "Comisionado")
        )

        # 1. SALIDA DÍA PREVIO
        if v.fecha_inicio and (v.fecha_inicio - timedelta(days=1)) == today:
            notif_type = "salida_dia_previo"
            
            # Titular
            if titular and titular.telegram_id and not has_recent_notification(db, "viatico", v.id, notif_type, titular.id, within_days=30):
                msg_titular = (
                    f"🛫 <b>Recordatorio de Salida a Comisión</b>\n\n"
                    f"• <b>Folio:</b> <code>{folio}</code>\n"
                    f"• <b>Destino:</b> {destino}\n"
                    f"• <b>Inicio:</b> Mañana, {v.fecha_inicio}\n\n"
                    f"💡 <i>Consejo: Recuerda pedir tus facturas a nombre de CICESE (RFC: <code>CIC7309189G8</code>) con método de pago PUE.</i>"
                )
                res = await send_telegram_msg(titular.telegram_id, msg_titular)
                log_notification_entry(db, "viatico", v.id, notif_type, titular.id, titular.telegram_id, "titular", f"Recordatorio de salida {folio}", msg_titular, res.get("status", "sent"), res.get("error"))
                stats["sent"] += 1

            # Asistente
            if asistente and asistente.telegram_id and (not titular or asistente.id != titular.id) and not has_recent_notification(db, "viatico", v.id, notif_type, asistente.id, within_days=30):
                msg_asistente = (
                    f"🛫 <b>Aviso de Salida a Comisión [Como Asistente]</b>\n\n"
                    f"• <b>Comisionado:</b> {comisionado_name}\n"
                    f"• <b>Folio:</b> <code>{folio}</code>\n"
                    f"• <b>Destino:</b> {destino}\n"
                    f"• <b>Inicio:</b> Mañana, {v.fecha_inicio}"
                )
                res = await send_telegram_msg(asistente.telegram_id, msg_asistente)
                log_notification_entry(db, "viatico", v.id, notif_type, asistente.id, asistente.telegram_id, "asistente", f"Recordatorio de salida {folio} [Asistente]", msg_asistente, res.get("status", "sent"), res.get("error"))
                stats["sent"] += 1

        # 2. FIN DE COMISIÓN (DÍA 0)
        if v.fecha_fin and v.fecha_fin == today:
            notif_type = "fin_comision"
            
            # Titular
            if titular and titular.telegram_id and not has_recent_notification(db, "viatico", v.id, notif_type, titular.id, within_days=30):
                msg_titular = (
                    f"🏁 <b>¡Bienvenido de regreso!</b>\n\n"
                    f"• <b>Folio:</b> <code>{folio}</code> | <b>Destino:</b> {destino}\n"
                    f"• <b>Monto a Comprobar:</b> ${monto_sol:,.2f} MXN\n\n"
                    f"Ya puedes subir tus comprobantes (XML + PDF) en este bot para iniciar la comprobación de tu viático."
                )
                res = await send_telegram_msg(titular.telegram_id, msg_titular)
                log_notification_entry(db, "viatico", v.id, notif_type, titular.id, titular.telegram_id, "titular", f"Fin de comisión {folio}", msg_titular, res.get("status", "sent"), res.get("error"))
                stats["sent"] += 1

            # Asistente
            if asistente and asistente.telegram_id and (not titular or asistente.id != titular.id) and not has_recent_notification(db, "viatico", v.id, notif_type, asistente.id, within_days=30):
                msg_asistente = (
                    f"🏁 <b>Fin de Comisión [Como Asistente]</b>\n\n"
                    f"• <b>Comisionado:</b> {comisionado_name}\n"
                    f"• <b>Folio:</b> <code>{folio}</code>\n"
                    f"• <b>Monto Asignado:</b> ${monto_sol:,.2f} MXN\n\n"
                    f"Ha concluido el periodo de comisión. Ya pueden iniciar la carga de facturas en el bot."
                )
                res = await send_telegram_msg(asistente.telegram_id, msg_asistente)
                log_notification_entry(db, "viatico", v.id, notif_type, asistente.id, asistente.telegram_id, "asistente", f"Fin de comisión {folio} [Asistente]", msg_asistente, res.get("status", "sent"), res.get("error"))
                stats["sent"] += 1

        # 3. SEMÁFORO PREVENTIVO (DÍA +3)
        if v.fecha_fin and (v.fecha_fin + timedelta(days=3)) == today and saldo_pendiente > 0.01:
            notif_type = "semaforo_preventivo"

            # Titular
            if titular and titular.telegram_id and not has_recent_notification(db, "viatico", v.id, notif_type, titular.id, within_days=30):
                msg_titular = (
                    f"🟡 <b>Recordatorio Preventivo de Comprobación</b>\n\n"
                    f"• <b>Folio:</b> <code>{folio}</code> ({destino})\n"
                    f"• <b>Monto Asignado:</b> ${monto_sol:,.2f} MXN\n"
                    f"• <b>Comprobado a la fecha:</b> ${monto_comp:,.2f} MXN\n"
                    f"• <b>Saldo Pendiente:</b> <b>${saldo_pendiente:,.2f} MXN</b>\n\n"
                    f"Recuerda cargar tus facturas en el bot para mantener tu expediente al día."
                )
                res = await send_telegram_msg(titular.telegram_id, msg_titular)
                log_notification_entry(db, "viatico", v.id, notif_type, titular.id, titular.telegram_id, "titular", f"Preventivo {folio}", msg_titular, res.get("status", "sent"), res.get("error"))
                stats["sent"] += 1

            # Asistente
            if asistente and asistente.telegram_id and (not titular or asistente.id != titular.id) and not has_recent_notification(db, "viatico", v.id, notif_type, asistente.id, within_days=30):
                msg_asistente = (
                    f"🟡 <b>Recordatorio Preventivo [Como Asistente]</b>\n\n"
                    f"• <b>Comisionado:</b> {comisionado_name}\n"
                    f"• <b>Folio:</b> <code>{folio}</code>\n"
                    f"• <b>Saldo Pendiente:</b> <b>${saldo_pendiente:,.2f} MXN</b>"
                )
                res = await send_telegram_msg(asistente.telegram_id, msg_asistente)
                log_notification_entry(db, "viatico", v.id, notif_type, asistente.id, asistente.telegram_id, "asistente", f"Preventivo {folio} [Asistente]", msg_asistente, res.get("status", "sent"), res.get("error"))
                stats["sent"] += 1

        # 4. SEMÁFORO URGENTE / PLAZO VENCIDO (+8 DÍAS O MÁS)
        if v.fecha_fin and today >= (v.fecha_fin + timedelta(days=8)) and saldo_pendiente > 0.01:
            notif_type = "semaforo_urgente"
            dias_transcurridos = (today - v.fecha_fin).days

            # Evitar enviar más de 1 vez cada 6 días
            if titular and titular.telegram_id and not has_recent_notification(db, "viatico", v.id, notif_type, titular.id, within_days=6):
                msg_titular = (
                    f"🔴 <b>¡Alerta: Comisión Vencida de Comprobación!</b>\n\n"
                    f"• <b>Folio:</b> <code>{folio}</code> ({destino})\n"
                    f"• <b>Días transcurridos:</b> {dias_transcurridos} días desde el fin del viaje\n"
                    f"• <b>Saldo por Comprobar:</b> <b>${saldo_pendiente:,.2f} MXN</b>\n\n"
                    f"⚠️ <i>Es urgente regularizar este expediente para evitar bloqueos administrativos. Por favor carga las facturas pendientes o realiza la devolución correspondiente.</i>"
                )
                res = await send_telegram_msg(titular.telegram_id, msg_titular)
                log_notification_entry(db, "viatico", v.id, notif_type, titular.id, titular.telegram_id, "titular", f"Urgente {folio}", msg_titular, res.get("status", "sent"), res.get("error"))
                stats["sent"] += 1

            if asistente and asistente.telegram_id and (not titular or asistente.id != titular.id) and not has_recent_notification(db, "viatico", v.id, notif_type, asistente.id, within_days=6):
                msg_asistente = (
                    f"🔴 <b>Alerta Urgente de Comisión Vencida [Como Asistente]</b>\n\n"
                    f"• <b>Comisionado:</b> {comisionado_name}\n"
                    f"• <b>Folio:</b> <code>{folio}</code> ({dias_transcurridos} días vencido)\n"
                    f"• <b>Saldo por Comprobar:</b> <b>${saldo_pendiente:,.2f} MXN</b>"
                )
                res = await send_telegram_msg(asistente.telegram_id, msg_asistente)
                log_notification_entry(db, "viatico", v.id, notif_type, asistente.id, asistente.telegram_id, "asistente", f"Urgente {folio} [Asistente]", msg_asistente, res.get("status", "sent"), res.get("error"))
                stats["sent"] += 1

        # 5. REMANENTE PENDIENTE DE DEVOLUCIÓN
        if v.fecha_fin and today > (v.fecha_fin + timedelta(days=2)) and monto_comp > 0 and saldo_pendiente > 0.01 and not v.comprobante_devolucion_path:
            notif_type = "remanente_devolucion"
            if titular and titular.telegram_id and not has_recent_notification(db, "viatico", v.id, notif_type, titular.id, within_days=7):
                msg_titular = (
                    f"💳 <b>Recordatorio de Reintegro de Viáticos</b>\n\n"
                    f"• <b>Folio:</b> <code>{folio}</code>\n"
                    f"• <b>Monto no ejercido:</b> <b>${saldo_pendiente:,.2f} MXN</b>\n\n"
                    f"Por favor realiza el depósito de reintegro a la cuenta institucional y adjunta el comprobante para cerrar tu trámite."
                )
                res = await send_telegram_msg(titular.telegram_id, msg_titular)
                log_notification_entry(db, "viatico", v.id, notif_type, titular.id, titular.telegram_id, "titular", f"Devolución {folio}", msg_titular, res.get("status", "sent"), res.get("error"))
                stats["sent"] += 1

    return stats


async def process_grc_reminders(db: Session, today: date) -> dict:
    """Evaluar y despachar recordatorios para gastos a reserva de comprobar (GRC)."""
    active_grcs = db.query(GastoReservaComprobar).filter(
        GastoReservaComprobar.status.in_(["aprobado", "comprobacion_pendiente"])
    ).all()

    stats = {"evaluated": len(active_grcs), "sent": 0}

    for g in active_grcs:
        titular, asistente = resolve_grc_users(db, g)
        folio = g.folio_episa
        just = g.justificacion or "Compras / Servicios"
        monto_sol = g.monto_solicitado or 0.0
        monto_comp = g.monto_comprobado or 0.0
        monto_dev = g.monto_devuelto or 0.0
        saldo_pendiente = max(0.0, monto_sol - monto_comp - monto_dev)
        
        solicitante_name = titular.full_name if titular else (g.firma_solicitante_nombre or "Solicitante")

        # 1. SEMÁFORO PREVENTIVO (+7 días desde creación si no ha comprobado)
        created_date = g.created_at.date() if g.created_at else None
        if created_date and (created_date + timedelta(days=7)) == today and saldo_pendiente > 0.01:
            notif_type = "semaforo_preventivo"
            if titular and titular.telegram_id and not has_recent_notification(db, "grc", g.id, notif_type, titular.id, within_days=30):
                msg_titular = (
                    f"🟡 <b>Recordatorio Preventivo GRC (Compras)</b>\n\n"
                    f"• <b>Folio EPISA:</b> <code>{folio}</code>\n"
                    f"• <b>Justificación:</b> {just}\n"
                    f"• <b>Saldo por Comprobar:</b> <b>${saldo_pendiente:,.2f} MXN</b>\n\n"
                    f"Recuerda cargar las facturas electrónicas de tus compras en este bot."
                )
                res = await send_telegram_msg(titular.telegram_id, msg_titular)
                log_notification_entry(db, "grc", g.id, notif_type, titular.id, titular.telegram_id, "titular", f"Preventivo GRC {folio}", msg_titular, res.get("status", "sent"), res.get("error"))
                stats["sent"] += 1

            if asistente and asistente.telegram_id and (not titular or asistente.id != titular.id) and not has_recent_notification(db, "grc", g.id, notif_type, asistente.id, within_days=30):
                msg_asistente = (
                    f"🟡 <b>Recordatorio Preventivo GRC [Como Asistente]</b>\n\n"
                    f"• <b>Solicitante:</b> {solicitante_name}\n"
                    f"• <b>Folio EPISA:</b> <code>{folio}</code>\n"
                    f"• <b>Saldo Pendiente:</b> <b>${saldo_pendiente:,.2f} MXN</b>"
                )
                res = await send_telegram_msg(asistente.telegram_id, msg_asistente)
                log_notification_entry(db, "grc", g.id, notif_type, asistente.id, asistente.telegram_id, "asistente", f"Preventivo GRC {folio} [Asistente]", msg_asistente, res.get("status", "sent"), res.get("error"))
                stats["sent"] += 1

        # 2. SEMÁFORO URGENTE GRC (+15 días sin comprobación total)
        if created_date and today >= (created_date + timedelta(days=15)) and saldo_pendiente > 0.01:
            notif_type = "semaforo_urgente"
            dias = (today - created_date).days

            if titular and titular.telegram_id and not has_recent_notification(db, "grc", g.id, notif_type, titular.id, within_days=7):
                msg_titular = (
                    f"🔴 <b>¡Alerta de GRC Pendiente de Comprobación!</b>\n\n"
                    f"• <b>Folio EPISA:</b> <code>{folio}</code> ({dias} días activo)\n"
                    f"• <b>Saldo Pendiente:</b> <b>${saldo_pendiente:,.2f} MXN</b>\n\n"
                    f"Por favor regulariza la carga de comprobantes fiscales a la brevedad."
                )
                res = await send_telegram_msg(titular.telegram_id, msg_titular)
                log_notification_entry(db, "grc", g.id, notif_type, titular.id, titular.telegram_id, "titular", f"Urgente GRC {folio}", msg_titular, res.get("status", "sent"), res.get("error"))
                stats["sent"] += 1

            if asistente and asistente.telegram_id and (not titular or asistente.id != titular.id) and not has_recent_notification(db, "grc", g.id, notif_type, asistente.id, within_days=7):
                msg_asistente = (
                    f"🔴 <b>Alerta de GRC Pendiente [Como Asistente]</b>\n\n"
                    f"• <b>Solicitante:</b> {solicitante_name}\n"
                    f"• <b>Folio EPISA:</b> <code>{folio}</code>\n"
                    f"• <b>Saldo Pendiente:</b> <b>${saldo_pendiente:,.2f} MXN</b>"
                )
                res = await send_telegram_msg(asistente.telegram_id, msg_asistente)
                log_notification_entry(db, "grc", g.id, notif_type, asistente.id, asistente.telegram_id, "asistente", f"Urgente GRC {folio} [Asistente]", msg_asistente, res.get("status", "sent"), res.get("error"))
                stats["sent"] += 1

    return stats


async def run_financial_reminders_job() -> dict:
    """
    Función principal invocada por el Scheduler para evaluar trámites y enviar recordatorios.
    Protegida por lock para evitar ejecuciones concurrentes.
    """
    if _reminders_lock.locked():
        logger.info("Escaneo de recordatorios financieros ya en ejecución, se omite.")
        return {"status": "skipped", "reason": "already_running"}

    async with _reminders_lock:
        today = date.today()
        logger.info(f"Iniciando escaneo de recordatorios financieros ({today})...")
        db = SessionLocal()
        try:
            viatico_stats = await process_viatico_reminders(db, today)
            grc_stats = await process_grc_reminders(db, today)
            digest_stats = await send_daily_digest_to_admins(db)
            logger.info(f"Escaneo de recordatorios completado: Viáticos {viatico_stats}, GRCs {grc_stats}, Digest {digest_stats}")
            return {
                "status": "completed",
                "date": str(today),
                "viaticos": viatico_stats,
                "grcs": grc_stats,
                "digest": digest_stats
            }
        except Exception as e:
            logger.error(f"Error en escaneo de recordatorios financieros: {e}", exc_info=True)
            return {"status": "error", "message": str(e)}
        finally:
            db.close()


def start_financial_scheduler():
    """Iniciar el scheduler periódico de recordatorios financieros."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return

    _scheduler = AsyncIOScheduler()
    # Programar de Lunes a Viernes a las 09:00 AM
    _scheduler.add_job(
        run_financial_reminders_job,
        "cron",
        day_of_week="mon-fri",
        hour=9,
        minute=0,
        id="financial_reminders_daily",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("Scheduler de recordatorios financieros iniciado (Lunes-Viernes 09:00 AM).")


def shutdown_financial_scheduler():
    """Detener el scheduler."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler de recordatorios financieros detenido.")
