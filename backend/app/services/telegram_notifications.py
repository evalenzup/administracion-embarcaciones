"""
SIAE — Servicio de Notificaciones y Alertas vía Telegram.
Maneja el despacho de notificaciones en tiempo real, recordatorios y anuncios con enrutamiento dual (Titular + Asistente).
"""

import logging
import json
import httpx
from datetime import datetime, date
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.config import get_settings
from app.models.user import User
from app.models.viatico import Viatico
from app.models.gasto_reserva_comprobar import GastoReservaComprobar
from app.models.personnel import Personnel
from app.models.notification_log import NotificationLog
from app.services.audit import log_action

logger = logging.getLogger("siae.notifications")
settings = get_settings()


async def send_telegram_msg(
    telegram_id: str,
    text: str,
    parse_mode: str = "HTML",
    reply_markup: dict | None = None
) -> dict:
    """Enviar un mensaje a un usuario de Telegram usando la API oficial del bot."""
    bot_token = settings.TELEGRAM_BOT_TOKEN
    if not bot_token or bot_token == "YOUR_TELEGRAM_BOT_TOKEN" or bot_token.strip() == "":
        logger.info(f"[SIMULATED TG MSG] To: {telegram_id} | Text: {text[:60]}...")
        return {
            "status": "simulated",
            "message": "Mensaje simulado (sin TELEGRAM_BOT_TOKEN configurado)",
            "recipient": telegram_id
        }

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": str(telegram_id),
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, timeout=12.0)
            if resp.status_code == 200:
                return {"status": "sent", "data": resp.json()}
            else:
                logger.error(f"Error enviando mensaje a Telegram ({resp.status_code}): {resp.text}")
                return {
                    "status": "failed",
                    "error": resp.text,
                    "error_code": resp.status_code
                }
    except Exception as e:
        logger.error(f"Error de red con Telegram API: {e}")
        return {"status": "failed", "error": str(e)}


def log_notification_entry(
    db: Session,
    tramite_type: str,
    tramite_id: int | None,
    notification_type: str,
    user_id: int | None,
    telegram_id: str,
    recipient_role: str,
    title: str | None,
    message_text: str,
    status: str,
    error_detail: str | None = None
) -> NotificationLog:
    """Registrar el envío en la bitácora de notificaciones."""
    entry = NotificationLog(
        tramite_type=tramite_type,
        tramite_id=tramite_id,
        notification_type=notification_type,
        user_id=user_id,
        telegram_id=str(telegram_id),
        recipient_role=recipient_role,
        title=title,
        message_text=message_text,
        status=status,
        error_detail=error_detail
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def resolve_viatico_users(db: Session, viatico: Viatico) -> tuple[User | None, User | None]:
    """
    Resolver los usuarios (Titular Comisionado, Asistente) para un Viático.
    """
    titular_user = None
    if viatico.personal and viatico.personal.user_id:
        titular_user = db.query(User).filter(User.id == viatico.personal.user_id).first()
    elif viatico.personal and viatico.personal.email:
        titular_user = db.query(User).filter(User.email == viatico.personal.email).first()

    asistente_user = None
    if viatico.asistente_id:
        asistente_user = db.query(User).filter(User.id == viatico.asistente_id).first()

    return titular_user, asistente_user


def resolve_grc_users(db: Session, grc: GastoReservaComprobar) -> tuple[User | None, User | None]:
    """
    Resolver los usuarios (Titular Solicitante, Asistente) para un GRC.
    """
    titular_user = None
    if grc.solicitante_id:
        titular_user = db.query(User).filter(User.id == grc.solicitante_id).first()

    asistente_user = None
    if grc.asistente_id:
        asistente_user = db.query(User).filter(User.id == grc.asistente_id).first()

    return titular_user, asistente_user


# ── NOTIFICACIONES EN TIEMPO REAL: VIÁTICOS ──

async def notify_viatico_event(
    db: Session,
    viatico: Viatico,
    event_type: str,
    reason_or_notes: str | None = None
) -> dict:
    """
    Despachar notificación de evento para Viático con enrutamiento dual (Titular + Asistente).
    event_type: 'aprobado', 'rechazado', 'comprobacion_pendiente', 'comprobado'
    """
    titular, asistente = resolve_viatico_users(db, viatico)
    results = []

    folio = viatico.folio_comision
    destino = viatico.destino or "No especificado"
    monto = viatico.monto_solicitado or 0.0
    comisionado_name = (
        (viatico.personal.first_name + " " + viatico.personal.last_name) 
        if viatico.personal else (viatico.firma_solicitante_nombre or "Comisionado")
    )
    periodo = f"{viatico.fecha_inicio} al {viatico.fecha_fin}"

    # 1. Armar plantillas según evento
    if event_type in ["aprobado", "comprobacion_pendiente"]:
        title_titular = f"✈️ ¡Tu comisión de viáticos ha sido Aprobada! (Folio {folio})"
        msg_titular = (
            f"🎉 <b>¡Comisión de Viáticos Aprobada!</b>\n\n"
            f"• <b>Folio:</b> <code>{folio}</code>\n"
            f"• <b>Destino:</b> {destino}\n"
            f"• <b>Periodo:</b> {periodo}\n"
            f"• <b>Monto Autorizado:</b> ${monto:,.2f} MXN\n\n"
            f"📌 <b>Recomendaciones de Facturación:</b>\n"
            f"• Solicita CFDIs a nombre de: <b>CICESE</b>\n"
            f"• <b>RFC:</b> <code>CIC7309189G8</code>\n"
            f"• Régimen: <i>603 - Personas Morales con Fines no Lucrativos</i>\n"
            f"• Código Postal: <code>22860</code>\n"
            f"• Método: <b>PUE</b> (Pago en una sola exhibición)\n\n"
            f"<i>Puedes subir tus facturas (XML + PDF) directamente en este bot en cuanto las recibas.</i>"
        )

        title_asistente = f"✈️ Aviso: Viático Aprobado de {comisionado_name} (Folio {folio})"
        msg_asistente = (
            f"✈️ <b>Aviso de Viático Aprobado [Como Asistente]</b>\n\n"
            f"• <b>Comisionado:</b> {comisionado_name}\n"
            f"• <b>Folio:</b> <code>{folio}</code>\n"
            f"• <b>Destino:</b> {destino}\n"
            f"• <b>Periodo:</b> {periodo}\n"
            f"• <b>Monto Autorizado:</b> ${monto:,.2f} MXN\n\n"
            f"ℹ️ <i>Como asistente asignado, puedes consultar este trámite y cargar los comprobantes fiscales del comisionado desde este bot.</i>"
        )

    elif event_type == "rechazado":
        title_titular = f"❌ Tu comisión de viáticos Folio {folio} ha sido Rechazada"
        msg_titular = (
            f"❌ <b>Comisión de Viáticos Rechazada</b>\n\n"
            f"• <b>Folio:</b> <code>{folio}</code>\n"
            f"• <b>Destino:</b> {destino}\n"
            f"• <b>Observaciones / Motivo:</b> {reason_or_notes or 'Consulte los detalles en la plataforma SIAE.'}\n\n"
            f"<i>Por favor ingresa al sistema para realizar las correcciones necesarias o contacta al administrador.</i>"
        )

        title_asistente = f"❌ Aviso: Viático Rechazado de {comisionado_name} (Folio {folio})"
        msg_asistente = (
            f"❌ <b>Aviso de Viático Rechazado [Como Asistente]</b>\n\n"
            f"• <b>Comisionado:</b> {comisionado_name}\n"
            f"• <b>Folio:</b> <code>{folio}</code>\n"
            f"• <b>Observaciones:</b> {reason_or_notes or 'Consulte los detalles en la plataforma SIAE.'}"
        )

    elif event_type == "comprobado":
        monto_comp = viatico.monto_comprobado or 0.0
        title_titular = f"✔️ ¡Expediente de Viáticos Concluido! (Folio {folio})"
        msg_titular = (
            f"✔️ <b>¡Comprobación de Viáticos Cerrada y Liquidada!</b>\n\n"
            f"• <b>Folio:</b> <code>{folio}</code>\n"
            f"• <b>Destino:</b> {destino}\n"
            f"• <b>Total Comprobado:</b> ${monto_comp:,.2f} MXN\n\n"
            f"👏 Tu expediente contable ha sido revisado y finalizado con éxito en el SIAE. ¡Gracias por comprobar a tiempo!"
        )

        title_asistente = f"✔️ Aviso: Viático Concluido de {comisionado_name} (Folio {folio})"
        msg_asistente = (
            f"✔️ <b>Expediente Concluido [Como Asistente]</b>\n\n"
            f"• <b>Comisionado:</b> {comisionado_name}\n"
            f"• <b>Folio:</b> <code>{folio}</code>\n"
            f"• <b>Total Comprobado:</b> ${monto_comp:,.2f} MXN\n\n"
            f"El trámite ha sido cerrado y liquidado satisfactoriamente."
        )
    else:
        return {"status": "skipped", "reason": f"Evento '{event_type}' no requiere notificación"}

    # 2. Despachar a Titular si tiene Telegram
    if titular and titular.telegram_id:
        res = await send_telegram_msg(titular.telegram_id, msg_titular)
        log_notification_entry(
            db=db,
            tramite_type="viatico",
            tramite_id=viatico.id,
            notification_type=event_type,
            user_id=titular.id,
            telegram_id=titular.telegram_id,
            recipient_role="titular",
            title=title_titular,
            message_text=msg_titular,
            status=res.get("status", "sent"),
            error_detail=res.get("error")
        )
        results.append({"role": "titular", "user": titular.username, "result": res})

    # 3. Despachar a Asistente si tiene Telegram y es distinto al titular
    if asistente and asistente.telegram_id and (not titular or asistente.id != titular.id):
        res = await send_telegram_msg(asistente.telegram_id, msg_asistente)
        log_notification_entry(
            db=db,
            tramite_type="viatico",
            tramite_id=viatico.id,
            notification_type=event_type,
            user_id=asistente.id,
            telegram_id=asistente.telegram_id,
            recipient_role="asistente",
            title=title_asistente,
            message_text=msg_asistente,
            status=res.get("status", "sent"),
            error_detail=res.get("error")
        )
        results.append({"role": "asistente", "user": asistente.username, "result": res})

    return {"status": "processed", "results": results}


# ── NOTIFICACIONES EN TIEMPO REAL: GRC (COMPRAS) ──

async def notify_grc_event(
    db: Session,
    grc: GastoReservaComprobar,
    event_type: str,
    reason_or_notes: str | None = None
) -> dict:
    """
    Despachar notificación de evento para GRC con enrutamiento dual (Titular + Asistente).
    event_type: 'aprobado', 'rechazado', 'comprobacion_pendiente', 'comprobado'
    """
    titular, asistente = resolve_grc_users(db, grc)
    results = []

    folio = grc.folio_episa
    just = grc.justificacion or "No especificada"
    monto = grc.monto_solicitado or 0.0
    solicitante_name = titular.full_name if titular else (grc.firma_solicitante_nombre or "Solicitante")

    if event_type in ["aprobado", "comprobacion_pendiente"]:
        title_titular = f"🚢 ¡Tu anticipo GRC ha sido Aprobado! (Folio {folio})"
        msg_titular = (
            f"🎉 <b>¡Anticipo GRC Aprobado!</b>\n\n"
            f"• <b>Folio EPISA:</b> <code>{folio}</code>\n"
            f"• <b>Justificación:</b> {just}\n"
            f"• <b>Monto Autorizado:</b> ${monto:,.2f} MXN\n\n"
            f"📌 <b>Datos de Facturación CICESE:</b>\n"
            f"• <b>RFC:</b> <code>CIC7309189G8</code>\n"
            f"• Régimen: <i>603 - Personas Morales con Fines no Lucrativos</i>\n"
            f"• Código Postal: <code>22860</code>\n"
            f"• Método: <b>PUE</b>\n\n"
            f"<i>Puedes subir las facturas electrónicas de tus compras directamente en este bot.</i>"
        )

        title_asistente = f"🚢 Aviso: GRC Aprobado de {solicitante_name} (Folio {folio})"
        msg_asistente = (
            f"🚢 <b>Aviso de GRC Aprobado [Como Asistente]</b>\n\n"
            f"• <b>Solicitante:</b> {solicitante_name}\n"
            f"• <b>Folio EPISA:</b> <code>{folio}</code>\n"
            f"• <b>Justificación:</b> {just}\n"
            f"• <b>Monto Autorizado:</b> ${monto:,.2f} MXN\n\n"
            f"ℹ️ <i>Como asistente asignado, puedes consultar este trámite y cargar facturas XML/PDF desde este bot.</i>"
        )

    elif event_type == "rechazado":
        title_titular = f"❌ Tu solicitud GRC Folio {folio} ha sido Rechazada"
        msg_titular = (
            f"❌ <b>Solicitud GRC Rechazada</b>\n\n"
            f"• <b>Folio:</b> <code>{folio}</code>\n"
            f"• <b>Observaciones / Motivo:</b> {reason_or_notes or 'Consulte los detalles en la plataforma SIAE.'}\n\n"
            f"<i>Por favor ingresa al sistema para revisar los comentarios.</i>"
        )

        title_asistente = f"❌ Aviso: GRC Rechazado de {solicitante_name} (Folio {folio})"
        msg_asistente = (
            f"❌ <b>Aviso de GRC Rechazado [Como Asistente]</b>\n\n"
            f"• <b>Solicitante:</b> {solicitante_name}\n"
            f"• <b>Folio:</b> <code>{folio}</code>\n"
            f"• <b>Observaciones:</b> {reason_or_notes or 'Consulte los detalles en la plataforma SIAE.'}"
        )

    elif event_type == "comprobado":
        monto_comp = grc.monto_comprobado or 0.0
        title_titular = f"✔️ ¡Expediente GRC Concluido! (Folio {folio})"
        msg_titular = (
            f"✔️ <b>¡Comprobación de GRC Cerrada y Liquidada!</b>\n\n"
            f"• <b>Folio EPISA:</b> <code>{folio}</code>\n"
            f"• <b>Total Comprobado:</b> ${monto_comp:,.2f} MXN\n\n"
            f"👏 Tu expediente de gastos ha sido revisado y finalizado con éxito en el SIAE."
        )

        title_asistente = f"✔️ Aviso: GRC Concluido de {solicitante_name} (Folio {folio})"
        msg_asistente = (
            f"✔️ <b>Expediente GRC Concluido [Como Asistente]</b>\n\n"
            f"• <b>Solicitante:</b> {solicitante_name}\n"
            f"• <b>Folio EPISA:</b> <code>{folio}</code>\n"
            f"• <b>Total Comprobado:</b> ${monto_comp:,.2f} MXN\n\n"
            f"El trámite ha sido cerrado satisfactoriamente."
        )
    else:
        return {"status": "skipped", "reason": f"Evento '{event_type}' no requiere notificación"}

    # 2. Despachar a Titular si tiene Telegram
    if titular and titular.telegram_id:
        res = await send_telegram_msg(titular.telegram_id, msg_titular)
        log_notification_entry(
            db=db,
            tramite_type="grc",
            tramite_id=grc.id,
            notification_type=event_type,
            user_id=titular.id,
            telegram_id=titular.telegram_id,
            recipient_role="titular",
            title=title_titular,
            message_text=msg_titular,
            status=res.get("status", "sent"),
            error_detail=res.get("error")
        )
        results.append({"role": "titular", "user": titular.username, "result": res})

    # 3. Despachar a Asistente si tiene Telegram y es distinto al titular
    if asistente and asistente.telegram_id and (not titular or asistente.id != titular.id):
        res = await send_telegram_msg(asistente.telegram_id, msg_asistente)
        log_notification_entry(
            db=db,
            tramite_type="grc",
            tramite_id=grc.id,
            notification_type=event_type,
            user_id=asistente.id,
            telegram_id=asistente.telegram_id,
            recipient_role="asistente",
            title=title_asistente,
            message_text=msg_asistente,
            status=res.get("status", "sent"),
            error_detail=res.get("error")
        )
        results.append({"role": "asistente", "user": asistente.username, "result": res})

    return {"status": "processed", "results": results}


# ── ANUNCIOS MANUALES Y DIRECTOS ──

async def send_manual_announcement(
    db: Session,
    tramite_type: str,
    tramite_id: int,
    custom_message: str,
    send_to_titular: bool = True,
    send_to_asistente: bool = True,
    sender_name: str = "Administración SIAE"
) -> dict:
    """
    Enviar un mensaje o comunicado manual desde la web hacia los responsables de un trámite.
    """
    if tramite_type == "viatico":
        tramite = db.query(Viatico).filter(Viatico.id == tramite_id).first()
        if not tramite:
            return {"status": "error", "message": "Viático no encontrado"}
        titular, asistente = resolve_viatico_users(db, tramite)
        folio = tramite.folio_comision
        tipo_label = "Viático"
    else:
        tramite = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.id == tramite_id).first()
        if not tramite:
            return {"status": "error", "message": "GRC no encontrado"}
        titular, asistente = resolve_grc_users(db, tramite)
        folio = tramite.folio_episa
        tipo_label = "GRC (Compras)"

    results = []

    # Construir mensaje con cabecera de aviso oficial
    body = (
        f"📢 <b>Aviso de {sender_name}</b>\n"
        f"📋 <b>Trámite:</b> {tipo_label} (Folio <code>{folio}</code>)\n\n"
        f"{custom_message}\n\n"
        f"ℹ️ <i>Puedes responder o consultar más información a través de la plataforma SIAE o contactar al administrador.</i>"
    )

    if send_to_titular and titular and titular.telegram_id:
        res = await send_telegram_msg(titular.telegram_id, body)
        log_notification_entry(
            db=db,
            tramite_type=tramite_type,
            tramite_id=tramite_id,
            notification_type="manual_announcement",
            user_id=titular.id,
            telegram_id=titular.telegram_id,
            recipient_role="titular",
            title=f"Aviso manual de {tipo_label} {folio}",
            message_text=body,
            status=res.get("status", "sent"),
            error_detail=res.get("error")
        )
        results.append({"role": "titular", "user": titular.username, "result": res})

    if send_to_asistente and asistente and asistente.telegram_id and (not titular or asistente.id != titular.id):
        res = await send_telegram_msg(asistente.telegram_id, body)
        log_notification_entry(
            db=db,
            tramite_type=tramite_type,
            tramite_id=tramite_id,
            notification_type="manual_announcement",
            user_id=asistente.id,
            telegram_id=asistente.telegram_id,
            recipient_role="asistente",
            title=f"Aviso manual de {tipo_label} {folio} [Asistente]",
            message_text=body,
            status=res.get("status", "sent"),
            error_detail=res.get("error")
        )
        results.append({"role": "asistente", "user": asistente.username, "result": res})

    return {"status": "processed", "results": results}


async def send_broadcast_message(
    db: Session,
    title: str,
    message: str,
    target_group: str = "all_linked",
    sender_name: str = "Administración DEO / SIAE"
) -> dict:
    """
    Enviar un comunicado general / broadcast a múltiples usuarios en Telegram.
    target_group: 'all_linked' (todos los usuarios con telegram_id),
                  'active_viaticos' (usuarios con viáticos abiertos),
                  'active_grcs' (usuarios con GRCs abiertos)
    """
    users_to_notify = []
    
    if target_group == "all_linked":
        users_to_notify = db.query(User).filter(User.telegram_id.isnot(None), User.is_active == True).all()
    elif target_group == "active_viaticos":
        # Usuarios titulares o asistentes con viáticos activos
        active_viaticos = db.query(Viatico).filter(
            Viatico.status.in_(["solicitado", "aprobado", "comprobacion_pendiente"])
        ).all()
        user_ids = set()
        for v in active_viaticos:
            if v.personal and v.personal.user_id:
                user_ids.add(v.personal.user_id)
            if v.asistente_id:
                user_ids.add(v.asistente_id)
        if user_ids:
            users_to_notify = db.query(User).filter(User.id.in_(user_ids), User.telegram_id.isnot(None), User.is_active == True).all()
    elif target_group == "active_grcs":
        active_grcs = db.query(GastoReservaComprobar).filter(
            GastoReservaComprobar.status.in_(["solicitado", "aprobado", "comprobacion_pendiente"])
        ).all()
        user_ids = set()
        for g in active_grcs:
            if g.solicitante_id:
                user_ids.add(g.solicitante_id)
            if g.asistente_id:
                user_ids.add(g.asistente_id)
        if user_ids:
            users_to_notify = db.query(User).filter(User.id.in_(user_ids), User.telegram_id.isnot(None), User.is_active == True).all()

    formatted_msg = (
        f"📢 <b>COMUNICADO OFICIAL: {title}</b>\n"
        f"<i>De: {sender_name}</i>\n\n"
        f"{message}\n\n"
        f"ℹ️ <i>Mensaje informativo del Sistema de Administración de Embarcaciones (SIAE).</i>"
    )

    sent_count = 0
    failed_count = 0

    for u in users_to_notify:
        res = await send_telegram_msg(u.telegram_id, formatted_msg)
        is_sent = res.get("status") in ["sent", "simulated"]
        if is_sent:
            sent_count += 1
        else:
            failed_count += 1

        log_notification_entry(
            db=db,
            tramite_type="general",
            tramite_id=None,
            notification_type="broadcast",
            user_id=u.id,
            telegram_id=u.telegram_id,
            recipient_role="general",
            title=title,
            message_text=formatted_msg,
            status=res.get("status", "sent"),
            error_detail=res.get("error")
        )

    return {
        "status": "processed",
        "total_targets": len(users_to_notify),
        "sent_count": sent_count,
        "failed_count": failed_count
    }


# ── NOTIFICACIONES EN TIEMPO REAL: SUBIDA DE FACTURAS Y REMANENTES ──

async def notify_invoice_uploaded(
    db: Session,
    tramite_type: str,
    tramite: Viatico | GastoReservaComprobar,
    invoice_data: dict,
    source_str: str = "Plataforma Web"
) -> dict:
    """
    Notificar en tiempo real al Asistente y/o Titular cuando se registra una nueva factura.
    """
    results = []
    if tramite_type == "viatico":
        titular, asistente = resolve_viatico_users(db, tramite)
        folio = tramite.folio_comision
        persona_name = (
            (tramite.personal.first_name + " " + tramite.personal.last_name)
            if tramite.personal else (tramite.firma_solicitante_nombre or "Comisionado")
        )
        tipo_label = "Viático"
        monto_total = tramite.monto_solicitado or 0.0
        monto_comp = tramite.monto_comprobado or 0.0
    else:
        titular, asistente = resolve_grc_users(db, tramite)
        folio = tramite.folio_episa
        persona_name = titular.full_name if titular else (tramite.firma_solicitante_nombre or "Solicitante")
        tipo_label = "GRC (Compras)"
        monto_total = tramite.monto_solicitado or 0.0
        monto_comp = tramite.monto_comprobado or 0.0

    emisor = invoice_data.get("emisor_nombre") or invoice_data.get("emisor_rfc") or "Proveedor"
    total_factura = invoice_data.get("total", 0.0)
    pct = (monto_comp / monto_total * 100.0) if monto_total > 0 else 100.0
    pct_str = f"{pct:.1f}%"

    # Mensaje para el Asistente
    if asistente and asistente.telegram_id:
        msg_asistente = (
            f"🧾 <b>Nueva Factura Registrada [{tipo_label}]</b>\n\n"
            f"• <b>Folio:</b> <code>{folio}</code>\n"
            f"• <b>Titular:</b> {persona_name}\n"
            f"• <b>Proveedor:</b> {emisor}\n"
            f"• <b>Importe Factura:</b> ${total_factura:,.2f} MXN\n"
            f"• <b>Avance Comprobación:</b> ${monto_comp:,.2f} / ${monto_total:,.2f} MXN (<b>{pct_str}</b>)\n"
            f"• <b>Origen:</b> {source_str}\n\n"
            f"ℹ️ <i>Comprobante disponible para cotejo en el sistema SIAE.</i>"
        )
        res_asist = await send_telegram_msg(asistente.telegram_id, msg_asistente)
        log_notification_entry(
            db=db,
            tramite_type=tramite_type,
            tramite_id=tramite.id,
            notification_type="factura_subida",
            user_id=asistente.id,
            telegram_id=asistente.telegram_id,
            recipient_role="asistente",
            title=f"Factura subida en {tipo_label} {folio}",
            message_text=msg_asistente,
            status=res_asist.get("status", "sent"),
            error_detail=res_asist.get("error")
        )
        results.append({"role": "asistente", "user": asistente.username, "result": res_asist})

    return {"status": "processed", "results": results}


async def notify_remanente_uploaded(
    db: Session,
    tramite_type: str,
    tramite: Viatico | GastoReservaComprobar,
    amount: float,
    source_str: str = "Plataforma Web"
) -> dict:
    """
    Notificar al Asistente cuando el comisionado sube una ficha de depósito o comprobante de devolución.
    """
    results = []
    if tramite_type == "viatico":
        titular, asistente = resolve_viatico_users(db, tramite)
        folio = tramite.folio_comision
        persona_name = (
            (tramite.personal.first_name + " " + tramite.personal.last_name)
            if tramite.personal else (tramite.firma_solicitante_nombre or "Comisionado")
        )
        tipo_label = "Viático"
    else:
        titular, asistente = resolve_grc_users(db, tramite)
        folio = tramite.folio_episa
        persona_name = titular.full_name if titular else (tramite.firma_solicitante_nombre or "Solicitante")
        tipo_label = "GRC (Compras)"

    if asistente and asistente.telegram_id:
        msg_asistente = (
            f"💵 <b>Ficha de Reintegro Subida [{tipo_label}]</b>\n\n"
            f"• <b>Folio:</b> <code>{folio}</code>\n"
            f"• <b>Titular:</b> {persona_name}\n"
            f"• <b>Monto Reintegrado:</b> <b>${amount:,.2f} MXN</b>\n"
            f"• <b>Origen:</b> {source_str}\n\n"
            f"🔍 <i>El comprobante bancario está listo para validación en SIAE.</i>"
        )
        res_asist = await send_telegram_msg(asistente.telegram_id, msg_asistente)
        log_notification_entry(
            db=db,
            tramite_type=tramite_type,
            tramite_id=tramite.id,
            notification_type="remanente_subido",
            user_id=asistente.id,
            telegram_id=asistente.telegram_id,
            recipient_role="asistente",
            title=f"Reintegro subido en {tipo_label} {folio}",
            message_text=msg_asistente,
            status=res_asist.get("status", "sent"),
            error_detail=res_asist.get("error")
        )
        results.append({"role": "asistente", "user": asistente.username, "result": res_asist})

    return {"status": "processed", "results": results}


# ── RESUMEN DIARIO INTELIGENTE (DAILY DIGEST) & REPORTES ADMINISTRATIVOS ──

def generate_daily_digest(db: Session, today: date | None = None) -> dict:
    """
    Calcular métricas consolidadas de Viáticos y GRC para administradores y asistentes.
    """
    if today is None:
        today = date.today()

    # 1. Consultar Viáticos activos
    active_viaticos = db.query(Viatico).filter(
        Viatico.status.in_(["aprobado", "comprobacion_pendiente", "solicitado"])
    ).all()

    # 2. Consultar GRCs activos
    active_grcs = db.query(GastoReservaComprobar).filter(
        GastoReservaComprobar.status.in_(["aprobado", "comprobacion_pendiente", "solicitado"])
    ).all()

    vencidos = []
    proximos = []
    completados = []
    salidas_hoy = []
    regresos_hoy = []

    # Analizar Viáticos
    for v in active_viaticos:
        monto_sol = v.monto_solicitado or 0.0
        monto_comp = v.monto_comprobado or 0.0
        monto_dev = v.monto_devuelto or 0.0
        saldo_pend = max(0.0, monto_sol - monto_comp - monto_dev)
        persona = (
            (v.personal.first_name + " " + v.personal.last_name)
            if v.personal else (v.firma_solicitante_nombre or "Comisionado")
        )

        item = {
            "type": "viatico",
            "id": v.id,
            "folio": v.folio_comision,
            "persona": persona,
            "destino": v.destino or "N/D",
            "monto_sol": monto_sol,
            "monto_comp": monto_comp,
            "saldo_pend": saldo_pend,
            "fecha_inicio": str(v.fecha_inicio) if v.fecha_inicio else None,
            "fecha_fin": str(v.fecha_fin) if v.fecha_fin else None,
            "status": v.status
        }

        if v.fecha_inicio == today:
            salidas_hoy.append(item)
        if v.fecha_fin == today:
            regresos_hoy.append(item)

        if saldo_pend <= 0.01 and monto_sol > 0:
            completados.append(item)
        elif v.fecha_fin:
            dias_desde_fin = (today - v.fecha_fin).days
            if dias_desde_fin > 10:
                item["dias_vencido"] = dias_desde_fin
                vencidos.append(item)
            elif 5 <= dias_desde_fin <= 10:
                item["dias_restantes"] = 10 - dias_desde_fin
                proximos.append(item)

    # Analizar GRCs
    for g in active_grcs:
        monto_sol = g.monto_solicitado or 0.0
        monto_comp = g.monto_comprobado or 0.0
        monto_dev = g.monto_devuelto or 0.0
        saldo_pend = max(0.0, monto_sol - monto_comp - monto_dev)
        titular, _ = resolve_grc_users(db, g)
        persona = titular.full_name if titular else (g.firma_solicitante_nombre or "Solicitante")
        created = g.created_at.date() if g.created_at else today

        item = {
            "type": "grc",
            "id": g.id,
            "folio": g.folio_episa,
            "persona": persona,
            "destino": g.justificacion or "Compras/Servicios",
            "monto_sol": monto_sol,
            "monto_comp": monto_comp,
            "saldo_pend": saldo_pend,
            "created_at": str(created),
            "status": g.status
        }

        if saldo_pend <= 0.01 and monto_sol > 0:
            completados.append(item)
        else:
            dias_activo = (today - created).days
            if dias_activo > 15:
                item["dias_vencido"] = dias_activo - 15
                vencidos.append(item)
            elif 10 <= dias_activo <= 15:
                item["dias_restantes"] = 15 - dias_activo
                proximos.append(item)

    # Construir texto HTML formateado
    fecha_str = today.strftime("%d/%m/%Y")
    lines = [
        f"📊 <b>Resumen Operativo SIAE — {fecha_str}</b>",
        f"<i>Gestión de Viáticos y Compras a Comprobar (GRC)</i>\n"
    ]

    lines.append(f"• <b>Trámites Activos:</b> {len(active_viaticos)} Viáticos | {len(active_grcs)} GRCs")

    if vencidos:
        lines.append(f"\n🔴 <b>Trámites Vencidos ({len(vencidos)}):</b>")
        for x in vencidos[:5]:
            t_icon = "✈️" if x["type"] == "viatico" else "🚢"
            lines.append(f"  {t_icon} <code>{x['folio']}</code> - {x['persona']} (<b>${x['saldo_pend']:,.2f}</b> pend)")
        if len(vencidos) > 5:
            lines.append(f"  <i>...y {len(vencidos) - 5} trámite(s) más.</i>")
    else:
        lines.append("\n🟢 <b>Trámites Vencidos:</b> Ninguno (¡Al día!)")

    if proximos:
        lines.append(f"\n🟡 <b>Próximos a Vencer ({len(proximos)}):</b>")
        for x in proximos[:4]:
            t_icon = "✈️" if x["type"] == "viatico" else "🚢"
            lines.append(f"  {t_icon} <code>{x['folio']}</code> - {x['persona']} (${x['saldo_pend']:,.2f} pend)")

    if completados:
        lines.append(f"\n✅ <b>Listos para Finiquito / 100% ({len(completados)}):</b>")
        for x in completados[:3]:
            lines.append(f"  • <code>{x['folio']}</code> - {x['persona']}")

    if salidas_hoy or regresos_hoy:
        lines.append("\n🗓️ <b>Movimiento de Hoy:</b>")
        if salidas_hoy:
            lines.append(f"  🛫 Salidas a comisión: {len(salidas_hoy)}")
        if regresos_hoy:
            lines.append(f"  🛬 Regresos de comisión: {len(regresos_hoy)}")

    lines.append("\nℹ️ <i>Usa /vencidos o /resumen en este bot para ver detalles interactivos.</i>")

    return {
        "date": str(today),
        "total_active_viaticos": len(active_viaticos),
        "total_active_grcs": len(active_grcs),
        "vencidos_count": len(vencidos),
        "proximos_count": len(proximos),
        "completados_count": len(completados),
        "salidas_hoy_count": len(salidas_hoy),
        "regresos_hoy_count": len(regresos_hoy),
        "vencidos": vencidos,
        "proximos": proximos,
        "completados": completados,
        "formatted_text": "\n".join(lines)
    }


async def send_daily_digest_to_admins(db: Session) -> dict:
    """
    Enviar el Daily Digest a todos los usuarios con rol 'admin' o con trámites asignados como asistente
    que tengan su cuenta de Telegram vinculada (incluye a Yolanda).
    """
    digest_data = generate_daily_digest(db)
    msg_text = digest_data["formatted_text"]

    # Buscar administradores y asistentes activos con telegram_id
    all_users = db.query(User).filter(
        User.telegram_id.isnot(None),
        User.is_active == True
    ).all()

    admin_users = [
        u for u in all_users
        if u.is_superadmin or any(r.name.lower() in ["administrador", "admin", "superadmin", "asistente", "auditor"] for r in u.roles) or u.has_permission("viaticos", "view")
    ]

    # También incluir usuarios que sean asistente_id en viáticos/grcs activos
    asistente_ids = set()
    for v in db.query(Viatico.asistente_id).filter(Viatico.asistente_id.isnot(None), Viatico.status.in_(["aprobado", "comprobacion_pendiente"])).all():
        if v[0]:
            asistente_ids.add(v[0])
    for g in db.query(GastoReservaComprobar.asistente_id).filter(GastoReservaComprobar.asistente_id.isnot(None), GastoReservaComprobar.status.in_(["aprobado", "comprobacion_pendiente"])).all():
        if g[0]:
            asistente_ids.add(g[0])

    if asistente_ids:
        more_asistentes = db.query(User).filter(
            User.id.in_(asistente_ids),
            User.telegram_id.isnot(None),
            User.is_active == True
        ).all()
        for a in more_asistentes:
            if not any(x.id == a.id for x in admin_users):
                admin_users.append(a)

    sent_count = 0
    for u in admin_users:
        res = await send_telegram_msg(u.telegram_id, msg_text)
        if res.get("status") in ["sent", "simulated"]:
            sent_count += 1
        log_notification_entry(
            db=db,
            tramite_type="general",
            tramite_id=None,
            notification_type="daily_digest",
            user_id=u.id,
            telegram_id=u.telegram_id,
            recipient_role="admin",
            title=f"Daily Digest SIAE {digest_data['date']}",
            message_text=msg_text,
            status=res.get("status", "sent"),
            error_detail=res.get("error")
        )

    return {
        "status": "completed",
        "date": digest_data["date"],
        "total_admins": len(admin_users),
        "sent_count": sent_count
    }


def get_admin_overdue_report(db: Session) -> dict:
    """Obtener lista estructurada de trámites vencidos para el bot."""
    digest = generate_daily_digest(db)
    vencidos = digest.get("vencidos", [])

    lines = [
        f"🚨 <b>Trámites Vencidos de Comprobación ({len(vencidos)})</b>\n"
    ]
    if not vencidos:
        lines.append("🎉 <i>¡Excelente! No hay ningún viático ni GRC en mora actualmente.</i>")
    else:
        for idx, item in enumerate(vencidos, 1):
            t_icon = "✈️ Viático" if item["type"] == "viatico" else "🚢 GRC"
            lines.append(
                f"<b>{idx}. {t_icon} <code>{item['folio']}</code></b>\n"
                f"• <b>Titular:</b> {item['persona']}\n"
                f"• <b>Destino/Concepto:</b> {item['destino']}\n"
                f"• <b>Saldo Pendiente:</b> <b>${item['saldo_pend']:,.2f} MXN</b>\n"
                f"• <b>Días Vencido:</b> {item.get('dias_vencido', 1)} días\n"
            )

    return {
        "count": len(vencidos),
        "items": vencidos,
        "formatted_text": "\n".join(lines)
    }


def get_admin_pending_report(db: Session) -> dict:
    """Obtener lista estructurada de trámites activos y pendientes de comprobar."""
    digest = generate_daily_digest(db)
    proximos = digest.get("proximos", [])
    completados = digest.get("completados", [])

    lines = [
        f"⏳ <b>Trámites Activos y Pendientes de Cierre</b>\n"
    ]
    if proximos:
        lines.append(f"🟡 <b>Próximos a Vencer ({len(proximos)}):</b>")
        for item in proximos:
            lines.append(f"• <code>{item['folio']}</code> - {item['persona']} (Saldo: ${item['saldo_pend']:,.2f})")

    if completados:
        lines.append(f"\n🟢 <b>Listos para Cierre / 100% ({len(completados)}):</b>")
        for item in completados:
            lines.append(f"• <code>{item['folio']}</code> - {item['persona']} (Comprobado: ${item['monto_comp']:,.2f})")

    if not proximos and not completados:
        lines.append("<i>No hay trámites en ventana de alerta actualmente.</i>")

    return {
        "proximos": proximos,
        "completados": completados,
        "formatted_text": "\n".join(lines)
    }


async def send_reminder_for_folio(
    db: Session,
    folio: str,
    custom_note: str | None = None,
    sender_name: str = "Administración SIAE"
) -> dict:
    """
    Enviar recordatorio formal directo a un comisionado/solicitante buscando por su Folio.
    """
    folio_clean = folio.strip()

    # Buscar en Viáticos
    viatico = db.query(Viatico).filter(Viatico.folio_comision.ilike(folio_clean)).first()
    if viatico:
        titular, asistente = resolve_viatico_users(db, viatico)
        if not titular or not titular.telegram_id:
            return {"success": False, "error": f"El titular del Viático {folio_clean} no tiene Telegram vinculado."}

        monto_sol = viatico.monto_solicitado or 0.0
        monto_comp = viatico.monto_comprobado or 0.0
        monto_dev = viatico.monto_devuelto or 0.0
        saldo_pend = max(0.0, monto_sol - monto_comp - monto_dev)

        msg = (
            f"🔔 <b>Aviso de Comprobación: Viático {folio_clean}</b>\n"
            f"<i>Enviado por: {sender_name}</i>\n\n"
            f"• <b>Destino:</b> {viatico.destino}\n"
            f"• <b>Periodo:</b> {viatico.fecha_inicio} al {viatico.fecha_fin}\n"
            f"• <b>Saldo por Comprobar:</b> <b>${saldo_pend:,.2f} MXN</b>\n\n"
            f"{('📝 <b>Nota:</b> ' + custom_note + chr(10) + chr(10)) if custom_note else ''}"
            f"Por favor sube tus comprobantes fiscales (XML + PDF) en este bot para mantener tu trámite al día."
        )
        res = await send_telegram_msg(titular.telegram_id, msg)
        log_notification_entry(
            db=db,
            tramite_type="viatico",
            tramite_id=viatico.id,
            notification_type="recordatorio_manual",
            user_id=titular.id,
            telegram_id=titular.telegram_id,
            recipient_role="titular",
            title=f"Recordatorio Viático {folio_clean}",
            message_text=msg,
            status=res.get("status", "sent"),
            error_detail=res.get("error")
        )
        return {"success": True, "folio": folio_clean, "type": "viatico", "recipient": titular.username, "result": res}

    # Buscar en GRC
    grc = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.folio_episa.ilike(folio_clean)).first()
    if grc:
        titular, asistente = resolve_grc_users(db, grc)
        if not titular or not titular.telegram_id:
            return {"success": False, "error": f"El solicitante del GRC {folio_clean} no tiene Telegram vinculado."}

        monto_sol = grc.monto_solicitado or 0.0
        monto_comp = grc.monto_comprobado or 0.0
        monto_dev = grc.monto_devuelto or 0.0
        saldo_pend = max(0.0, monto_sol - monto_comp - monto_dev)

        msg = (
            f"🔔 <b>Aviso de Comprobación: GRC {folio_clean}</b>\n"
            f"<i>Enviado por: {sender_name}</i>\n\n"
            f"• <b>Concepto:</b> {grc.justificacion}\n"
            f"• <b>Saldo por Comprobar:</b> <b>${saldo_pend:,.2f} MXN</b>\n\n"
            f"{('📝 <b>Nota:</b> ' + custom_note + chr(10) + chr(10)) if custom_note else ''}"
            f"Por favor sube tus facturas electrónicas de compras en este bot para regularizar el trámite."
        )
        res = await send_telegram_msg(titular.telegram_id, msg)
        log_notification_entry(
            db=db,
            tramite_type="grc",
            tramite_id=grc.id,
            notification_type="recordatorio_manual",
            user_id=titular.id,
            telegram_id=titular.telegram_id,
            recipient_role="titular",
            title=f"Recordatorio GRC {folio_clean}",
            message_text=msg,
            status=res.get("status", "sent"),
            error_detail=res.get("error")
        )
        return {"success": True, "folio": folio_clean, "type": "grc", "recipient": titular.username, "result": res}

    return {"success": False, "error": f"No se encontró ningún trámite con el folio '{folio_clean}'."}

