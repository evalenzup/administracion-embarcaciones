import logging
from aiogram import Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from api_client import api_client

logger = logging.getLogger(__name__)
router = Router(name="nav_router")


def get_main_keyboard(is_linked: bool = True) -> InlineKeyboardMarkup:
    """Generar teclado principal según estado de vinculación."""
    buttons = []
    if is_linked:
        buttons.append([
            InlineKeyboardButton(text="🚢 GRCs (Compras / Prov)", callback_data="list_grc"),
            InlineKeyboardButton(text="✈️ Viáticos (Comisiones)", callback_data="list_viatico")
        ])
        buttons.append([InlineKeyboardButton(text="❓ Ayuda de comprobación", callback_data="help_info")])
    else:
        buttons.append([InlineKeyboardButton(text="🔑 Vincular cuenta en Web", url="http://localhost:3010/profile")])
    
    return InlineKeyboardMarkup(inline_keyboard=buttons)


@router.message(CommandStart())
async def cmd_start(message: Message):
    """Manejador de /start. Soporta deep linking para vinculación."""
    args = message.text.split()
    telegram_id = str(message.from_user.id)

    # 1. Si viene con token en los argumentos (ej: /start token_jwt)
    if len(args) > 1:
        token = args[1]
        await message.answer("🔄 Procesando vinculación con tu cuenta de SIAE...")
        res = await api_client.link_account(token, telegram_id)
        
        if res.get("success"):
            data = res["data"]
            username = data.get("username")
            full_name = data.get("full_name")
            await message.answer(
                f"🎉 ¡Hola *{full_name}* (@{username})!\n\n"
                f"Tu cuenta de Telegram ha sido vinculada exitosamente al *Sistema de Administración de Embarcaciones (SIAE)*.\n\n"
                f"A partir de ahora, cuando los administradores te asignen un viático o GRC, "
                f"recibirás notificaciones aquí y podrás subir tus facturas para comprobar gastos.",
                parse_mode="Markdown",
                reply_markup=get_main_keyboard(is_linked=True)
            )
        else:
            error_msg = res.get("error", "Token inválido o expirado.")
            await message.answer(
                f"❌ *Error de vinculación:*\n{error_msg}\n\n"
                f"Por favor, ve a tu perfil en el portal web de SIAE y genera un nuevo código de vinculación.",
                parse_mode="Markdown",
                reply_markup=get_main_keyboard(is_linked=False)
            )
        return

    # 2. Si es un /start básico, verificar si ya está vinculado
    await message.answer("🔄 Verificando vinculación...")
    res = await api_client.get_active_grcs(telegram_id)
    
    if res.get("success"):
        await message.answer(
            "👋 ¡Bienvenido de nuevo al bot de viáticos y compras de SIAE!\n\n"
            "Usa el menú de abajo para ver tus trámites activos o subir comprobantes.",
            reply_markup=get_main_keyboard(is_linked=True)
        )
    else:
        await message.answer(
            f"👋 ¡Hola! Para utilizar este bot necesitas vincular tu cuenta de Telegram con tu usuario de SIAE.\n\n"
            f"1. Inicia sesión en el portal web de SIAE.\n"
            f"2. Ve a la sección de tu Perfil.\n"
            f"3. Haz clic en 'Vincular Telegram' para abrir este chat de forma segura.\n\n"
            f"ℹ️ *Tu ID de Telegram es:* `{telegram_id}`\n"
            f"(Compártelo con tu administrador si no tienes acceso al portal web para que te vincule directamente).",
            parse_mode="Markdown",
            reply_markup=get_main_keyboard(is_linked=False)
        )


@router.message(Command("menu"))
@router.message(Command("ayuda"))
async def cmd_menu(message: Message):
    """Mostrar menú general de opciones."""
    telegram_id = str(message.from_user.id)
    res = await api_client.get_active_grcs(telegram_id)
    
    if res.get("success"):
        await message.answer(
            "📌 *Menú de Viáticos y Comprobaciones*\n\n"
            "Selecciona una opción:",
            parse_mode="Markdown",
            reply_markup=get_main_keyboard(is_linked=True)
        )
    else:
        await message.answer(
            "⚠️ No has vinculado tu cuenta de Telegram.\n\n"
            "Por favor, inicia sesión en SIAE Web, ve a tu perfil y haz clic en 'Vincular Telegram'.",
            reply_markup=get_main_keyboard(is_linked=False)
        )


@router.message(Command("mis_viaticos"))
async def cmd_mis_viaticos(message: Message):
    """Mostrar listado de viáticos asignados al usuario."""
    telegram_id = str(message.from_user.id)
    await show_viatico_list(message, telegram_id)


@router.message(Command("mis_grcs"))
async def cmd_mis_grcs(message: Message):
    """Mostrar listado de GRCs asignados al usuario."""
    telegram_id = str(message.from_user.id)
    await show_grc_list(message, telegram_id)


# Manejadores de callback para menús
@router.callback_query(F.data == "list_grc")
async def callback_list_grc(callback: CallbackQuery):
    telegram_id = str(callback.from_user.id)
    await callback.answer()
    await show_grc_list(callback.message, telegram_id, edit_message=True)


@router.callback_query(F.data == "list_viatico")
async def callback_list_viatico(callback: CallbackQuery):
    telegram_id = str(callback.from_user.id)
    await callback.answer()
    await show_viatico_list(callback.message, telegram_id, edit_message=True)


@router.callback_query(F.data == "help_info")
async def callback_help_info(callback: CallbackQuery):
    await callback.answer()
    help_text = (
        "💡 *¿Cómo comprobar tus trámites desde Telegram?*\n\n"
        "1. Selecciona tu viático o GRC activo en el menú.\n"
        "2. Selecciona la opción *Subir Factura*.\n"
        "3. Elige la categoría de gasto (ej: Alimentación, Hospedaje, Pasajes, etc).\n"
        "4. Envía el archivo `.xml` de la factura (CFDI 4.0).\n"
        "5. Envía el archivo `.pdf` de la misma factura para validar correspondencia.\n\n"
        "⚠️ *Reglas Fiscales SAT:*\n"
        "• El receptor debe tener el RFC de CICESE.\n"
        "• El método de pago debe ser PUE (Pago en una sola exhibición).\n"
        "• El uso del CFDI debe ser G03 (Gastos en general).\n"
        "• El archivo PDF se validará automáticamente para confirmar que coincide con el XML."
    )
    buttons = [[InlineKeyboardButton(text="🔙 Volver al Menú", callback_data="back_to_menu")]]
    await callback.message.edit_text(
        help_text,
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons)
    )


@router.callback_query(F.data == "back_to_menu")
async def callback_back_to_menu(callback: CallbackQuery):
    await callback.answer()
    await callback.message.edit_text(
        "📌 *Menú de Viáticos y Comprobaciones*\n\nSelecciona una opción:",
        parse_mode="Markdown",
        reply_markup=get_main_keyboard(is_linked=True)
    )


# ── RENDERIZADO DE LISTADOS ──

async def show_grc_list(message: Message, telegram_id: str, edit_message: bool = False):
    """Función auxiliar para consultar y listar GRCs."""
    res = await api_client.get_active_grcs(telegram_id)
    
    if not res.get("success"):
        error_msg = res.get("error", "Error de conexión.")
        text = f"⚠️ *No se pudieron obtener tus GRCs:*\n{error_msg}"
        if edit_message:
            await message.edit_text(text, parse_mode="Markdown")
        else:
            await message.answer(text, parse_mode="Markdown")
        return

    items = res.get("items", [])
    if not items:
        text = "🏖️ No tienes GRCs (Compras/Servicios) activos asignados en este momento."
        buttons = [[InlineKeyboardButton(text="🔄 Actualizar", callback_data="list_grc")],
                   [InlineKeyboardButton(text="🔙 Menú", callback_data="back_to_menu")]]
        keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)
        if edit_message:
            await message.edit_text(text, reply_markup=keyboard)
        else:
            await message.answer(text, reply_markup=keyboard)
        return

    # Ordenar: primero los personales (is_mine = True)
    items_sorted = sorted(items, key=lambda x: not x.get("is_mine", False))

    text = (
        "🚢 *Trámites GRC Activos en SIAE:*\n\n"
        "👤 = Tus comprobaciones personales.\n"
        "👥 = Otras comprobaciones (Acceso Admin/Asistente).\n\n"
        "Selecciona uno para ver su estado o comprobar gastos:"
    )
    
    buttons = []
    for grc in items_sorted:
        folio = grc.get("folio_episa")
        just = grc.get("justificacion", "")
        just_short = just[:15] + "..." if len(just) > 15 else just
        monto = grc.get("monto_solicitado", 0.0)
        is_mine = grc.get("is_mine", False)
        
        if is_mine:
            btn_text = f"👤 {folio} (${monto:,.2f}) - {just_short}"
        else:
            solicitante = grc.get("solicitante") or {}
            full_name = solicitante.get("full_name", "")
            parts = [p.strip() for p in full_name.split() if p.strip()]
            short_name = f"{parts[0]} {parts[1]}" if len(parts) >= 2 else (full_name or "N/A")
            btn_text = f"👥 {folio} ({short_name}) - {just_short}"
            
        buttons.append([InlineKeyboardButton(text=btn_text, callback_data=f"view_grc_{grc['id']}")])
        
    buttons.append([InlineKeyboardButton(text="🔙 Menú Principal", callback_data="back_to_menu")])
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)
    
    if edit_message:
        await message.edit_text(text, parse_mode="Markdown", reply_markup=keyboard)
    else:
        await message.answer(text, parse_mode="Markdown", reply_markup=keyboard)


async def show_viatico_list(message: Message, telegram_id: str, edit_message: bool = False):
    """Función auxiliar para consultar y listar Viáticos."""
    res = await api_client.get_active_viaticos(telegram_id)
    
    if not res.get("success"):
        error_msg = res.get("error", "Error de conexión.")
        text = f"⚠️ *No se pudieron obtener tus viáticos:*\n{error_msg}"
        if edit_message:
            await message.edit_text(text, parse_mode="Markdown")
        else:
            await message.answer(text, parse_mode="Markdown")
        return

    items = res.get("items", [])
    if not items:
        text = "✈️ No tienes comisiones de viáticos activas asignadas en este momento."
        buttons = [[InlineKeyboardButton(text="🔄 Actualizar", callback_data="list_viatico")],
                   [InlineKeyboardButton(text="🔙 Menú", callback_data="back_to_menu")]]
        keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)
        if edit_message:
            await message.edit_text(text, reply_markup=keyboard)
        else:
            await message.answer(text, reply_markup=keyboard)
        return

    # Ordenar: primero los personales (is_mine = True)
    items_sorted = sorted(items, key=lambda x: not x.get("is_mine", False))

    text = (
        "✈️ *Trámites de Viáticos Activos:*\n\n"
        "👤 = Tus comisiones personales.\n"
        "👥 = Otras comisiones (Acceso Admin/Asistente).\n\n"
        "Selecciona uno para ver su estado o comprobar gastos:"
    )
    
    buttons = []
    for v in items_sorted:
        folio = v.get("folio_comision")
        just = v.get("justificacion", "")
        just_short = just[:15] + "..." if len(just) > 15 else just
        monto = v.get("monto_solicitado", 0.0)
        is_mine = v.get("is_mine", False)
        
        if is_mine:
            btn_text = f"👤 {folio} (${monto:,.2f}) - {just_short}"
        else:
            personal = v.get("personal") or {}
            full_name = personal.get("full_name", "")
            parts = [p.strip() for p in full_name.split() if p.strip()]
            short_name = f"{parts[0]} {parts[1]}" if len(parts) >= 2 else (full_name or "N/A")
            btn_text = f"👥 {folio} ({short_name}) - {just_short}"
            
        buttons.append([InlineKeyboardButton(text=btn_text, callback_data=f"view_viatico_{v['id']}")])
        
    buttons.append([InlineKeyboardButton(text="🔙 Menú Principal", callback_data="back_to_menu")])
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)
    
    if edit_message:
        await message.edit_text(text, parse_mode="Markdown", reply_markup=keyboard)
    else:
        await message.answer(text, parse_mode="Markdown", reply_markup=keyboard)
