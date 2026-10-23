"""
SIAE Bot — Módulo de Comandos Administrativos y de Gestión.
Diseñado para Administradores y Asistentes (ej: Yolanda) para control de Viáticos y GRC.
"""

import logging
from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from api_client import api_client

logger = logging.getLogger(__name__)
router = Router(name="admin_router")


def get_admin_menu_keyboard() -> InlineKeyboardMarkup:
    """Teclado inline de acciones administrativas."""
    buttons = [
        [
            InlineKeyboardButton(text="🔴 Ver Vencidos", callback_data="admin_overdue"),
            InlineKeyboardButton(text="⏳ Ver Pendientes", callback_data="admin_pending")
        ],
        [
            InlineKeyboardButton(text="📊 Resumen General", callback_data="admin_digest"),
            InlineKeyboardButton(text="🔄 Actualizar", callback_data="admin_digest")
        ],
        [
            InlineKeyboardButton(text="🔙 Volver al Menú Principal", callback_data="back_to_menu")
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


@router.message(Command("resumen"))
@router.message(Command("digest"))
@router.message(Command("admin"))
async def cmd_resumen(message: Message):
    """Comando /resumen para administradores y asistentes."""
    telegram_id = str(message.from_user.id)
    loading = await message.answer("🔄 Generando resumen operativo de SIAE...")
    
    res = await api_client.get_admin_digest(telegram_id)
    if res.get("success"):
        data = res.get("data", {})
        text = data.get("formatted_text", "No hay datos disponibles.")
        await loading.edit_text(
            text,
            parse_mode="HTML",
            reply_markup=get_admin_menu_keyboard()
        )
    else:
        err = res.get("error", "No tienes permisos de administrador o asistente.")
        await loading.edit_text(
            f"⚠️ <b>Acceso Restringido o Error:</b>\n{err}\n\n"
            f"ℹ️ Este comando está disponible exclusivamente para administradores y asistentes asignados a trámites.",
            parse_mode="HTML"
        )


@router.callback_query(F.data == "admin_digest")
async def callback_admin_digest(callback: CallbackQuery):
    telegram_id = str(callback.from_user.id)
    await callback.answer("Actualizando resumen...")
    res = await api_client.get_admin_digest(telegram_id)
    if res.get("success"):
        data = res.get("data", {})
        text = data.get("formatted_text", "No hay datos disponibles.")
        await callback.message.edit_text(
            text,
            parse_mode="HTML",
            reply_markup=get_admin_menu_keyboard()
        )
    else:
        await callback.message.edit_text(
            f"⚠️ {res.get('error', 'Error al obtener resumen.')}",
            parse_mode="HTML"
        )


@router.message(Command("vencidos"))
@router.message(Command("mora"))
async def cmd_vencidos(message: Message):
    """Comando /vencidos para ver trámites fuera de plazo reglamentario."""
    telegram_id = str(message.from_user.id)
    loading = await message.answer("🔍 Consultando trámites vencidos...")
    
    res = await api_client.get_admin_overdue(telegram_id)
    if res.get("success"):
        data = res.get("data", {})
        text = data.get("formatted_text", "")
        items = data.get("items", [])
        
        buttons = []
        for it in items[:6]:
            folio = it.get("folio")
            persona = it.get("persona", "").split()[0] if it.get("persona") else "Comisionado"
            buttons.append([
                InlineKeyboardButton(
                    text=f"📲 Recordar {folio} ({persona})",
                    callback_data=f"remind_folio:{folio}"
                )
            ])
        
        buttons.append([
            InlineKeyboardButton(text="📊 Volver a Resumen", callback_data="admin_digest"),
            InlineKeyboardButton(text="🔙 Menú Principal", callback_data="back_to_menu")
        ])
        
        await loading.edit_text(
            text,
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons)
        )
    else:
        await loading.edit_text(
            f"⚠️ {res.get('error', 'No tienes permisos para ver este reporte.')}",
            parse_mode="HTML"
        )


@router.callback_query(F.data == "admin_overdue")
async def callback_admin_overdue(callback: CallbackQuery):
    telegram_id = str(callback.from_user.id)
    await callback.answer("Consultando vencidos...")
    res = await api_client.get_admin_overdue(telegram_id)
    if res.get("success"):
        data = res.get("data", {})
        text = data.get("formatted_text", "")
        items = data.get("items", [])
        
        buttons = []
        for it in items[:6]:
            folio = it.get("folio")
            persona = it.get("persona", "").split()[0] if it.get("persona") else "Comisionado"
            buttons.append([
                InlineKeyboardButton(
                    text=f"📲 Recordar {folio} ({persona})",
                    callback_data=f"remind_folio:{folio}"
                )
            ])
        
        buttons.append([
            InlineKeyboardButton(text="📊 Volver a Resumen", callback_data="admin_digest"),
            InlineKeyboardButton(text="🔙 Menú", callback_data="back_to_menu")
        ])
        
        await callback.message.edit_text(
            text,
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons)
        )
    else:
        await callback.message.edit_text(
            f"⚠️ {res.get('error', 'Error al obtener reporte.')}",
            parse_mode="HTML"
        )


@router.message(Command("pendientes"))
async def cmd_pendientes(message: Message):
    """Comando /pendientes para ver trámites activos y saldos pendientes."""
    telegram_id = str(message.from_user.id)
    loading = await message.answer("⏳ Consultando trámites pendientes...")
    
    res = await api_client.get_admin_pending(telegram_id)
    if res.get("success"):
        data = res.get("data", {})
        text = data.get("formatted_text", "")
        await loading.edit_text(
            text,
            parse_mode="HTML",
            reply_markup=get_admin_menu_keyboard()
        )
    else:
        await loading.edit_text(
            f"⚠️ {res.get('error', 'Error al obtener trámites pendientes.')}",
            parse_mode="HTML"
        )


@router.callback_query(F.data == "admin_pending")
async def callback_admin_pending(callback: CallbackQuery):
    telegram_id = str(callback.from_user.id)
    await callback.answer("Consultando pendientes...")
    res = await api_client.get_admin_pending(telegram_id)
    if res.get("success"):
        data = res.get("data", {})
        text = data.get("formatted_text", "")
        await callback.message.edit_text(
            text,
            parse_mode="HTML",
            reply_markup=get_admin_menu_keyboard()
        )
    else:
        await callback.message.edit_text(
            f"⚠️ {res.get('error', 'Error al obtener reporte.')}",
            parse_mode="HTML"
        )


@router.callback_query(F.data.startswith("remind_folio:"))
async def callback_remind_folio(callback: CallbackQuery):
    """Manejador del botón rápido para enviar recordatorio por folio."""
    telegram_id = str(callback.from_user.id)
    folio = callback.data.split(":", 1)[1]
    
    await callback.answer(f"Enviando recordatorio para {folio}...")
    res = await api_client.send_reminder_by_folio(telegram_id, folio)
    
    if res.get("success"):
        recipient = res.get("recipient", "titular")
        await callback.message.answer(
            f"✅ <b>Recordatorio enviado exitosamente</b>\n\n"
            f"Se ha notificado vía Telegram a <b>@{recipient}</b> sobre el estado pendiente del trámite <code>{folio}</code>.",
            parse_mode="HTML"
        )
    else:
        err = res.get("error", "No se pudo entregar el recordatorio.")
        await callback.message.answer(
            f"❌ <b>No se pudo enviar el recordatorio para {folio}:</b>\n{err}",
            parse_mode="HTML"
        )


@router.message(Command("recordar"))
async def cmd_recordar(message: Message):
    """
    Comando /recordar <folio> [nota opcional]
    Permite a Yolanda o administradores enviar un recordatorio formal directo.
    """
    telegram_id = str(message.from_user.id)
    parts = message.text.split(maxsplit=2)
    
    if len(parts) < 2:
        await message.answer(
            "ℹ️ <b>Uso del comando:</b>\n"
            "<code>/recordar &lt;folio&gt; [nota opcional]</code>\n\n"
            "<b>Ejemplos:</b>\n"
            "• <code>/recordar 105551</code>\n"
            "• <code>/recordar 105551 Por favor sube la factura del hotel para cerrar tu trámite hoy.</code>",
            parse_mode="HTML"
        )
        return
        
    folio = parts[1].strip()
    custom_note = parts[2].strip() if len(parts) > 2 else None
    
    loading = await message.answer(f"📨 Despachando recordatorio formal para el folio <code>{folio}</code>...", parse_mode="HTML")
    res = await api_client.send_reminder_by_folio(telegram_id, folio, custom_note)
    
    if res.get("success"):
        recipient = res.get("recipient", "titular")
        await loading.edit_text(
            f"🎉 <b>¡Recordatorio entregado con éxito!</b>\n\n"
            f"• <b>Folio:</b> <code>{folio}</code>\n"
            f"• <b>Destinatario:</b> @{recipient}\n"
            f"• <b>Nota adjunta:</b> {custom_note or '<i>(Sin nota adicional)</i>'}\n\n"
            f"El usuario ha recibido la alerta con el desglose de su saldo pendiente en su chat de Telegram.",
            parse_mode="HTML"
        )
    else:
        err = res.get("error", "No se pudo enviar el recordatorio.")
        await loading.edit_text(
            f"❌ <b>Error al enviar recordatorio:</b>\n{err}",
            parse_mode="HTML"
        )
