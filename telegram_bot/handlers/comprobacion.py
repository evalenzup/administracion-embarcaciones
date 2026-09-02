import logging
from io import BytesIO
from aiogram import Router, F, Bot
from aiogram.fsm.state import StatesGroup, State
from aiogram.fsm.context import FSMContext
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton, Document, BufferedInputFile
from api_client import api_client

logger = logging.getLogger(__name__)
router = Router(name="comprobacion_router")


# Definición de Estados FSM
class InvoiceUploadStates(StatesGroup):
    waiting_for_category = State()
    waiting_for_xml = State()
    waiting_for_pdf = State()


# ── VISTAS DE DETALLE ──

@router.callback_query(F.data.startswith("view_grc_"))
async def callback_view_grc(callback: CallbackQuery, state: FSMContext):
    """Manejador para ver el detalle de un GRC específico."""
    await callback.answer()
    grc_id = int(callback.data.split("_")[2])
    telegram_id = str(callback.from_user.id)
    
    await show_grc_details(callback.message, telegram_id, grc_id, edit_message=True)


@router.callback_query(F.data.startswith("view_viatico_"))
async def callback_view_viatico(callback: CallbackQuery, state: FSMContext):
    """Manejador para ver el detalle de un Viático específico."""
    await callback.answer()
    viatico_id = int(callback.data.split("_")[2])
    telegram_id = str(callback.from_user.id)
    
    await show_viatico_details(callback.message, telegram_id, viatico_id, edit_message=True)


async def show_grc_details(message: Message, telegram_id: str, grc_id: int, edit_message: bool = False):
    """Auxiliar para renderizar el detalle de un viático GRC."""
    res = await api_client.get_grc_details(telegram_id, grc_id)
    if not res.get("success"):
        error_msg = res.get("error", "No se pudo obtener el detalle.")
        await message.answer(f"⚠️ Error GRC: {error_msg}")
        return

    grc = res["data"]
    folio = grc.get("folio_episa")
    just = grc.get("justificacion")
    monto_solicitado = grc.get("monto_solicitado", 0.0)
    monto_comprobado = grc.get("monto_comprobado", 0.0)
    monto_devuelto = grc.get("monto_devuelto", 0.0)
    
    saldo_pendiente = max(0.0, monto_solicitado - monto_comprobado - monto_devuelto)

    status_map = {
        "borrador": "📝 Borrador",
        "solicitado": "⏳ Solicitado",
        "aprobado": "✅ Aprobado (Pendiente de pago)",
        "comprobacion_pendiente": "📂 Comprobación Pendiente",
        "comprobado": "✔️ Comprobado y Cerrado",
        "rechazado": "❌ Rechazado"
    }
    status_es = status_map.get(grc.get("status"), grc.get("status"))
    solicitante = (grc.get("solicitante") or {}).get("full_name") or grc.get("firma_solicitante_nombre") or "No asignado"

    text = (
        f"📋 *Detalle de GRC (Compras)*\n"
        f"• *Folio EPISA:* {folio}\n"
        f"• *Estado:* {status_es}\n"
        f"• *Justificación:* {just}\n"
        f"• *Solicitante:* {solicitante}\n\n"
        f"💵 *Resumen de Saldos:*\n"
        f"• *Monto Asignado:* ${monto_solicitado:,.2f} MXN\n"
        f"• *Comprobado:* ${monto_comprobado:,.2f} MXN\n"
        f"• *Devolución/Reembolso:* ${monto_devuelto:,.2f} MXN\n"
        f"• *Saldo Pendiente:* ${saldo_pendiente:,.2f} MXN\n"
    )

    buttons = []
    facturas = grc.get("facturas", [])
    if facturas:
        buttons.append([
            InlineKeyboardButton(text=f"📄 Ver Facturas ({len(facturas)})", callback_data=f"list_grc_invs_{grc_id}")
        ])
        buttons.append([
            InlineKeyboardButton(text="📦 Descargar Paquete ZIP (Excel + Facturas)", callback_data=f"down_bundle_grc_{grc_id}")
        ])

    if grc.get("status") in ["comprobacion_pendiente", "aprobado", "solicitado"]:
        buttons.append([
            InlineKeyboardButton(text="📥 Subir Factura (XML + PDF)", callback_data=f"upload_grc_inv_{grc_id}")
        ])
    
    buttons.append([InlineKeyboardButton(text="🔙 Volver al Listado", callback_data="list_grc")])
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)

    if edit_message:
        await message.edit_text(text, parse_mode="Markdown", reply_markup=keyboard)
    else:
        await message.answer(text, parse_mode="Markdown", reply_markup=keyboard)


async def show_viatico_details(message: Message, telegram_id: str, viatico_id: int, edit_message: bool = False):
    """Auxiliar para renderizar el detalle de un Viático (Viajes)."""
    res = await api_client.get_viatico_details(telegram_id, viatico_id)
    if not res.get("success"):
        error_msg = res.get("error", "No se pudo obtener el detalle.")
        await message.answer(f"⚠️ Error Viático: {error_msg}")
        return

    v = res["data"]
    folio = v.get("folio_comision")
    just = v.get("justificacion")
    destino = v.get("destino")
    monto_solicitado = v.get("monto_solicitado", 0.0)
    monto_comprobado = v.get("monto_comprobado", 0.0)
    monto_devuelto = v.get("monto_devuelto", 0.0)
    
    saldo_pendiente = max(0.0, monto_solicitado - monto_comprobado - monto_devuelto)

    status_map = {
        "borrador": "📝 Borrador",
        "solicitado": "⏳ Solicitado",
        "aprobado": "✅ Aprobado",
        "comprobacion_pendiente": "📂 Comprobación Pendiente",
        "comprobado": "✔️ Cerrado",
        "rechazado": "❌ Rechazado"
    }
    status_es = status_map.get(v.get("status"), v.get("status"))
    comisionado = (v.get("personal") or {}).get("full_name") or v.get("firma_solicitante_nombre") or "No asignado"

    text = (
        f"✈️ *Detalle de Viáticos (Comisión)*\n"
        f"• *Folio Comisión:* {folio}\n"
        f"• *Estado:* {status_es}\n"
        f"• *Destino:* {destino}\n"
        f"• *Periodo:* {v.get('fecha_inicio')} al {v.get('fecha_fin')}\n"
        f"• *Justificación:* {just}\n"
        f"• *Comisionado:* {comisionado}\n\n"
        f"💵 *Resumen de Saldos:*\n"
        f"• *Monto Asignado:* ${monto_solicitado:,.2f} MXN\n"
        f"• *Comprobado:* ${monto_comprobado:,.2f} MXN\n"
        f"• *Devolución/Reembolso:* ${monto_devuelto:,.2f} MXN\n"
        f"• *Saldo Pendiente:* ${saldo_pendiente:,.2f} MXN\n"
    )

    buttons = []
    facturas = v.get("facturas", [])
    if facturas:
        buttons.append([
            InlineKeyboardButton(text=f"📄 Ver Facturas ({len(facturas)})", callback_data=f"list_via_invs_{viatico_id}")
        ])
        buttons.append([
            InlineKeyboardButton(text="📦 Descargar Paquete ZIP (Excel + Facturas)", callback_data=f"down_bundle_via_{viatico_id}")
        ])

    if v.get("status") in ["comprobacion_pendiente", "aprobado", "solicitado"]:
        buttons.append([
            InlineKeyboardButton(text="📥 Subir Factura (XML + PDF)", callback_data=f"upload_via_inv_{viatico_id}")
        ])
    
    buttons.append([InlineKeyboardButton(text="🔙 Volver al Listado", callback_data="list_viatico")])
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)

    if edit_message:
        await message.edit_text(text, parse_mode="Markdown", reply_markup=keyboard)
    else:
        await message.answer(text, parse_mode="Markdown", reply_markup=keyboard)


# ── FSM: SUBIDA DE FACTURAS ──

@router.callback_query(F.data.startswith("upload_grc_inv_"))
@router.callback_query(F.data.startswith("upload_via_inv_"))
async def start_upload_flow(callback: CallbackQuery, state: FSMContext):
    """Iniciar el flujo FSM solicitando la categoría."""
    await callback.answer()
    
    parts = callback.data.split("_")
    tramite_type = parts[1]  # "grc" o "via"
    tramite_id = int(parts[3])
    telegram_id = str(callback.from_user.id)

    # 1. Almacenar datos en el FSM
    await state.update_data(
        tramite_id=tramite_id,
        tramite_type="grc" if tramite_type == "grc" else "viatico"
    )

    # 2. Consultar las categorías financieras disponibles
    res = await api_client.get_categories(telegram_id)
    if not res.get("success"):
        await callback.message.answer("⚠️ No se pudieron cargar las categorías de gasto de SIAE. Cancelando operación.")
        await state.clear()
        return

    categories = res.get("items", [])
    if not categories:
        await callback.message.answer("⚠️ No hay categorías financieras configuradas en el sistema. Contacta a Finanzas.")
        await state.clear()
        return

    # 3. Mostrar categorías como inline keyboard
    buttons = []
    row = []
    for cat in categories:
        icon = cat.get("icon") or "🏷️"
        btn = InlineKeyboardButton(text=f"{icon} {cat['name']}", callback_data=f"select_cat_{cat['id']}")
        row.append(btn)
        if len(row) == 2:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)

    buttons.append([InlineKeyboardButton(text="❌ Cancelar", callback_data="cancel_upload")])
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)

    await state.set_state(InvoiceUploadStates.waiting_for_category)
    await callback.message.edit_text(
        "📂 *Paso 1/3: Categoría de Gasto*\n\nSelecciona la categoría correspondiente a este comprobante:",
        parse_mode="Markdown",
        reply_markup=keyboard
    )


@router.callback_query(InvoiceUploadStates.waiting_for_category, F.data.startswith("select_cat_"))
async def category_selected(callback: CallbackQuery, state: FSMContext):
    """Categoría seleccionada. Solicitar archivo XML."""
    await callback.answer()
    category_id = int(callback.data.split("_")[2])
    
    # Obtener el nombre de la categoría del botón pulsado
    cat_name = "Categoría Seleccionada"
    for row in callback.message.reply_markup.inline_keyboard:
        for button in row:
            if button.callback_data == callback.data:
                cat_name = button.text
                break

    await state.update_data(category_id=category_id, category_name=cat_name)
    await state.set_state(InvoiceUploadStates.waiting_for_xml)

    buttons = [[InlineKeyboardButton(text="❌ Cancelar", callback_data="cancel_upload")]]
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)

    await callback.message.edit_text(
        f"📂 *Categoría:* {cat_name}\n\n"
        f"📑 *Paso 2/3: Archivo XML (CFDI)*\n\n"
        f"Por favor, adjunta y envía el archivo *XML* de la factura emitida por el SAT.",
        parse_mode="Markdown",
        reply_markup=keyboard
    )


@router.message(InvoiceUploadStates.waiting_for_xml, F.document)
async def process_xml_file(message: Message, state: FSMContext, bot: Bot):
    """Procesar y descargar el XML enviado."""
    doc: Document = message.document
    
    if not doc.file_name.lower().endswith(".xml"):
        await message.answer("❌ El archivo enviado debe ser un XML válido (.xml). Vuelve a intentarlo.")
        return

    await message.answer("⏳ Descargando y validando estructura XML...")

    file = await bot.get_file(doc.file_id)
    destination = BytesIO()
    await bot.download(file, destination=destination)
    xml_bytes = destination.getvalue()

    await state.update_data(xml_bytes=xml_bytes, xml_name=doc.file_name)
    await state.set_state(InvoiceUploadStates.waiting_for_pdf)

    buttons = [
        [InlineKeyboardButton(text="⏩ Omitir PDF (Enviar solo XML)", callback_data="skip_pdf")],
        [InlineKeyboardButton(text="❌ Cancelar", callback_data="cancel_upload")]
    ]
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)

    await message.answer(
        "📄 *Paso 3/3: Archivo PDF (Opcional)*\n\n"
        "Envía ahora el archivo *PDF* correspondiente a la factura para validar la coincidencia.\n"
        "Si no tienes el PDF, puedes hacer clic en el botón de abajo para omitirlo.",
        parse_mode="Markdown",
        reply_markup=keyboard
    )


@router.message(InvoiceUploadStates.waiting_for_pdf, F.document)
async def process_pdf_file(message: Message, state: FSMContext, bot: Bot):
    """Procesar PDF y realizar subida final al backend."""
    doc: Document = message.document

    if not doc.file_name.lower().endswith(".pdf"):
        await message.answer("❌ El archivo enviado debe ser un PDF válido (.pdf). Vuelve a intentarlo u omítelo.")
        return

    await message.answer("⏳ Descargando PDF y subiendo comprobantes a SIAE...")

    file = await bot.get_file(doc.file_id)
    destination = BytesIO()
    await bot.download(file, destination=destination)
    pdf_bytes = destination.getvalue()

    data = await state.get_data()
    tramite_id = data["tramite_id"]
    tramite_type = data["tramite_type"]
    category_id = data["category_id"]
    xml_bytes = data["xml_bytes"]
    xml_name = data["xml_name"]
    telegram_id = str(message.from_user.id)

    # Subir factura
    if tramite_type == "grc":
        res = await api_client.upload_invoice(
            telegram_id=telegram_id,
            grc_id=tramite_id,
            category_id=category_id,
            xml_bytes=xml_bytes,
            xml_name=xml_name,
            pdf_bytes=pdf_bytes,
            pdf_name=doc.file_name
        )
    else:
        res = await api_client.upload_viatico_invoice(
            telegram_id=telegram_id,
            viatico_id=tramite_id,
            category_id=category_id,
            xml_bytes=xml_bytes,
            xml_name=xml_name,
            pdf_bytes=pdf_bytes,
            pdf_name=doc.file_name
        )

    await handle_upload_response(message, res, tramite_id, tramite_type, telegram_id, state)


@router.callback_query(InvoiceUploadStates.waiting_for_pdf, F.data == "skip_pdf")
async def callback_skip_pdf(callback: CallbackQuery, state: FSMContext):
    """Omitir el PDF y subir solo el XML."""
    await callback.answer()
    await callback.message.edit_text("⏳ Subiendo comprobante XML a SIAE sin PDF...")

    data = await state.get_data()
    tramite_id = data["tramite_id"]
    tramite_type = data["tramite_type"]
    category_id = data["category_id"]
    xml_bytes = data["xml_bytes"]
    xml_name = data["xml_name"]
    telegram_id = str(callback.from_user.id)

    if tramite_type == "grc":
        res = await api_client.upload_invoice(
            telegram_id=telegram_id,
            grc_id=tramite_id,
            category_id=category_id,
            xml_bytes=xml_bytes,
            xml_name=xml_name
        )
    else:
        res = await api_client.upload_viatico_invoice(
            telegram_id=telegram_id,
            viatico_id=tramite_id,
            category_id=category_id,
            xml_bytes=xml_bytes,
            xml_name=xml_name
        )

    await handle_upload_response(callback.message, res, tramite_id, tramite_type, telegram_id, state)


async def handle_upload_response(message: Message, res: dict, tramite_id: int, tramite_type: str, telegram_id: str, state: FSMContext):
    """Procesar respuesta de la subida."""
    if res.get("success"):
        invoice = res["data"]
        emisor = invoice.get("emisor_nombre")
        total = invoice.get("total", 0.0)
        
        await message.answer(
            f"✅ *Factura cargada con éxito*\n\n"
            f"• *Emisor:* {emisor}\n"
            f"• *Monto:* ${total:,.2f} MXN\n"
            f"• *UUID:* `{invoice.get('uuid') or 'N/A'}`\n\n"
            f"La factura ha sido vinculada al trámite en SIAE. Los administradores ya pueden verla.",
            parse_mode="Markdown"
        )
        await state.clear()
        
        # Mostrar el detalle actualizado
        if tramite_type == "grc":
            await show_grc_details(message, telegram_id, tramite_id, edit_message=False)
        else:
            await show_viatico_details(message, telegram_id, tramite_id, edit_message=False)
    else:
        error_msg = res.get("error", "Error al procesar la factura.")
        await message.answer(
            f"❌ *Error al registrar la factura:*\n\n"
            f"{error_msg}\n\n"
            f"El flujo ha sido cancelado. Vuelve a intentarlo asegurándote de que la factura cumpla las reglas del SAT y sea para el RFC de CICESE.",
            parse_mode="Markdown"
        )
        await state.clear()


@router.callback_query(F.data == "cancel_upload")
@router.callback_query(InvoiceUploadStates(), F.data == "cancel_upload")
async def cancel_upload_flow(callback: CallbackQuery, state: FSMContext):
    """Cancelar flujo de subida y borrar FSM."""
    await callback.answer("Operación cancelada")
    data = await state.get_data()
    tramite_id = data.get("tramite_id")
    tramite_type = data.get("tramite_type")
    telegram_id = str(callback.from_user.id)
    await state.clear()

    if tramite_id:
        if tramite_type == "grc":
            await show_grc_details(callback.message, telegram_id, tramite_id, edit_message=True)
        else:
            await show_viatico_details(callback.message, telegram_id, tramite_id, edit_message=True)
    else:
        await callback.message.edit_text(
            "📌 *Menú Principal*\n\nOperación cancelada.",
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text="🚢 Ver viáticos/GRCs", callback_data="back_to_menu")]]
            )
        )


# ── VINCULACIÓN DE VISTAS Y DESCARGA DE FACTURAS ──

@router.callback_query(F.data.startswith("list_via_invs_"))
async def callback_list_via_invoices(callback: CallbackQuery):
    await callback.answer()
    viatico_id = int(callback.data.split("_")[3])
    telegram_id = str(callback.from_user.id)
    
    res = await api_client.get_viatico_details(telegram_id, viatico_id)
    if not res.get("success"):
        await callback.message.answer(f"⚠️ Error al obtener facturas: {res.get('error')}")
        return
        
    v = res["data"]
    facturas = v.get("facturas", [])
    
    MESES_ES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    def format_inv_date(fecha_str):
        from datetime import datetime
        try:
            dt = datetime.strptime(str(fecha_str)[:10], "%Y-%m-%d") if fecha_str else None
            if dt:
                return f"{dt.day} {MESES_ES[dt.month]}"
        except Exception:
            pass
        return ""

    text = f"📄 *Facturas de Comisión Folio {v.get('folio_comision')}:*\n\nSelecciona una para ver detalles y descargar:"
    buttons = []
    for f in facturas:
        emisor = f.get("emisor_nombre", "Sin Emisor")
        emisor_short = emisor[:12] + "..." if len(emisor) > 12 else emisor
        total = f.get("total", 0.0)
        category = f.get("category") or {}
        cat_icon = category.get("icon", "📄")
        d_str = format_inv_date(f.get("fecha_emision") or f.get("created_at"))
        d_tag = f"[{d_str}] " if d_str else ""
        
        btn_text = f"{cat_icon} {d_tag}{emisor_short} - ${total:,.2f}"
        buttons.append([InlineKeyboardButton(text=btn_text, callback_data=f"view_via_inv_{viatico_id}_{f['id']}")])
        
    buttons.append([InlineKeyboardButton(text="🔙 Volver al Detalle", callback_data=f"view_viatico_{viatico_id}")])
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)
    await callback.message.edit_text(text, parse_mode="Markdown", reply_markup=keyboard)


@router.callback_query(F.data.startswith("list_grc_invs_"))
async def callback_list_grc_invoices(callback: CallbackQuery):
    await callback.answer()
    grc_id = int(callback.data.split("_")[3])
    telegram_id = str(callback.from_user.id)
    
    res = await api_client.get_grc_details(telegram_id, grc_id)
    if not res.get("success"):
        await callback.message.answer(f"⚠️ Error al obtener facturas: {res.get('error')}")
        return
        
    grc = res["data"]
    facturas = grc.get("facturas", [])
    
    MESES_ES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    def format_inv_date(fecha_str):
        from datetime import datetime
        try:
            dt = datetime.strptime(str(fecha_str)[:10], "%Y-%m-%d") if fecha_str else None
            if dt:
                return f"{dt.day} {MESES_ES[dt.month]}"
        except Exception:
            pass
        return ""

    text = f"📄 *Facturas de GRC Folio {grc.get('folio_episa')}:*\n\nSelecciona una para ver detalles y descargar:"
    buttons = []
    for f in facturas:
        emisor = f.get("emisor_nombre", "Sin Emisor")
        emisor_short = emisor[:12] + "..." if len(emisor) > 12 else emisor
        total = f.get("total", 0.0)
        category = f.get("category") or {}
        cat_icon = category.get("icon", "📄")
        d_str = format_inv_date(f.get("fecha_emision") or f.get("created_at"))
        d_tag = f"[{d_str}] " if d_str else ""
        
        btn_text = f"{cat_icon} {d_tag}{emisor_short} - ${total:,.2f}"
        buttons.append([InlineKeyboardButton(text=btn_text, callback_data=f"view_grc_inv_{grc_id}_{f['id']}")])
        
    buttons.append([InlineKeyboardButton(text="🔙 Volver al Detalle", callback_data=f"view_grc_{grc_id}")])
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)
    await callback.message.edit_text(text, parse_mode="Markdown", reply_markup=keyboard)


@router.callback_query(F.data.startswith("view_via_inv_"))
async def callback_view_via_invoice(callback: CallbackQuery):
    await callback.answer()
    parts = callback.data.split("_")
    viatico_id = int(parts[3])
    invoice_id = int(parts[4])
    telegram_id = str(callback.from_user.id)
    
    res = await api_client.get_viatico_details(telegram_id, viatico_id)
    if not res.get("success"):
        await callback.message.answer(f"⚠️ Error: {res.get('error')}")
        return
        
    v = res["data"]
    factura = next((f for f in v.get("facturas", []) if f["id"] == invoice_id), None)
    if not factura:
        await callback.message.answer("⚠️ Factura no encontrada.")
        return
        
    category = factura.get("category") or {}
    cat_name = category.get("name", "Sin Categoría")
    cat_icon = category.get("icon", "📄")
    
    text = (
        f"📄 *Detalle de Factura (Viáticos)*\n\n"
        f"• *Emisor:* {factura.get('emisor_nombre')}\n"
        f"• *RFC:* `{factura.get('emisor_rfc')}`\n"
        f"• *UUID:* `{factura.get('uuid') or 'Carga Manual'}`\n"
        f"• *Folio/Serie:* {factura.get('serie') or ''} {factura.get('folio') or ''}\n"
        f"• *Categoría:* {cat_icon} {cat_name}\n"
        f"• *Subtotal:* ${factura.get('subtotal', 0.0):,.2f} MXN\n"
        f"• *IVA:* ${factura.get('iva', 0.0):,.2f} MXN\n"
        f"• *Total:* ${factura.get('total', 0.0):,.2f} MXN\n"
        f"• *Estado SAT:* {factura.get('sat_status') or 'No Verificado'}\n"
    )
    
    buttons = []
    if factura.get("pdf_filename"):
        buttons.append([InlineKeyboardButton(text="📥 Descargar PDF", callback_data=f"down_via_pdf_{viatico_id}_{invoice_id}")])
    if factura.get("xml_filename"):
        buttons.append([InlineKeyboardButton(text="📥 Descargar XML", callback_data=f"down_via_xml_{viatico_id}_{invoice_id}")])
        
    buttons.append([InlineKeyboardButton(text="🔙 Volver a la Lista", callback_data=f"list_via_invs_{viatico_id}")])
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)
    await callback.message.edit_text(text, parse_mode="Markdown", reply_markup=keyboard)


@router.callback_query(F.data.startswith("view_grc_inv_"))
async def callback_view_grc_invoice(callback: CallbackQuery):
    await callback.answer()
    parts = callback.data.split("_")
    grc_id = int(parts[3])
    invoice_id = int(parts[4])
    telegram_id = str(callback.from_user.id)
    
    res = await api_client.get_grc_details(telegram_id, grc_id)
    if not res.get("success"):
        await callback.message.answer(f"⚠️ Error: {res.get('error')}")
        return
        
    grc = res["data"]
    factura = next((f for f in grc.get("facturas", []) if f["id"] == invoice_id), None)
    if not factura:
        await callback.message.answer("⚠️ Factura no encontrada.")
        return
        
    category = factura.get("category") or {}
    cat_name = category.get("name", "Sin Categoría")
    cat_icon = category.get("icon", "📄")
    
    text = (
        f"📄 *Detalle de Factura (GRC)*\n\n"
        f"• *Emisor:* {factura.get('emisor_nombre')}\n"
        f"• *RFC:* `{factura.get('emisor_rfc')}`\n"
        f"• *UUID:* `{factura.get('uuid') or 'Carga Manual'}`\n"
        f"• *Folio/Serie:* {factura.get('serie') or ''} {factura.get('folio') or ''}\n"
        f"• *Categoría:* {cat_icon} {cat_name}\n"
        f"• *Subtotal:* ${factura.get('subtotal', 0.0):,.2f} MXN\n"
        f"• *IVA:* ${factura.get('iva', 0.0):,.2f} MXN\n"
        f"• *Total:* ${factura.get('total', 0.0):,.2f} MXN\n"
        f"• *Estado SAT:* {factura.get('sat_status') or 'No Verificado'}\n"
    )
    
    buttons = []
    if factura.get("pdf_filename"):
        buttons.append([InlineKeyboardButton(text="📥 Descargar PDF", callback_data=f"down_grc_pdf_{grc_id}_{invoice_id}")])
    if factura.get("xml_filename"):
        buttons.append([InlineKeyboardButton(text="📥 Descargar XML", callback_data=f"down_grc_xml_{grc_id}_{invoice_id}")])
        
    buttons.append([InlineKeyboardButton(text="🔙 Volver a la Lista", callback_data=f"list_grc_invs_{grc_id}")])
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)
    await callback.message.edit_text(text, parse_mode="Markdown", reply_markup=keyboard)


@router.callback_query(F.data.startswith("down_via_"))
@router.callback_query(F.data.startswith("down_grc_"))
async def callback_download_invoice_file(callback: CallbackQuery):
    await callback.answer("Generando descarga...")
    import httpx
    import os
    from aiogram.types import BufferedInputFile
    
    parts = callback.data.split("_")
    # Format: down_via_pdf_{viatico_id}_{invoice_id}
    module = parts[1] # "via" or "grc"
    file_type = parts[2] # "pdf" or "xml"
    tramite_id = int(parts[3])
    invoice_id = int(parts[4])
    telegram_id = str(callback.from_user.id)
    
    # 1. Obtener detalles del trámite para buscar el nombre de archivo
    if module == "via":
        res = await api_client.get_viatico_details(telegram_id, tramite_id)
    else:
        res = await api_client.get_grc_details(telegram_id, tramite_id)
        
    if not res.get("success"):
        await callback.message.answer("❌ Error al recuperar el archivo del servidor.")
        return
        
    tramite = res["data"]
    factura = next((f for f in tramite.get("facturas", []) if f["id"] == invoice_id), None)
    if not factura:
        await callback.message.answer("❌ Archivo de factura no encontrado.")
        return
        
    filename = factura.get(f"{file_type}_filename")
    if not filename:
        await callback.message.answer("❌ El archivo no está disponible.")
        return
        
    # 2. Construir URL correcta (si empieza con / es ruta completa en uploads)
    if filename.startswith("/"):
        url = f"{api_client.base_url}{filename}"
    else:
        folder = "viaticos" if module == "via" else "gastos_reserva_comprobar"
        url = f"{api_client.base_url}/uploads/{folder}/{file_type}/{filename}"
        
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=15.0)
            if resp.status_code == 200:
                file_bytes = resp.content
                base_filename = os.path.basename(filename)
                input_file = BufferedInputFile(file_bytes, filename=base_filename)
                await callback.message.answer_document(
                    document=input_file,
                    caption=f"📄 Archivo {file_type.upper()} de la factura: `{base_filename}`"
                )
            else:
                await callback.message.answer("❌ El archivo solicitado no se encuentra en el servidor.")
    except Exception as e:
        logger.error(f"Error al descargar archivo de bot: {e}")
        await callback.message.answer("❌ Error al conectar con el servidor para descargar el archivo.")


@router.callback_query(F.data.startswith("down_bundle_via_"))
@router.callback_query(F.data.startswith("down_bundle_grc_"))
async def callback_download_bundle(callback: CallbackQuery):
    await callback.answer("Generando paquete contable ZIP...")
    import httpx
    from aiogram.types import BufferedInputFile

    parts = callback.data.split("_")
    # Format: down_bundle_via_{viatico_id} or down_bundle_grc_{grc_id}
    module = parts[2]  # "via" or "grc"
    tramite_id = int(parts[3])
    telegram_id = str(callback.from_user.id)

    endpoint = f"/api/v1/{'viaticos' if module == 'via' else 'gastos-reserva-comprobar'}/{tramite_id}/invoices/zip"
    url = f"{api_client.base_url}{endpoint}"
    headers = api_client._get_headers(impersonate_tg_id=telegram_id)

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=60.0)
            if resp.status_code == 200:
                zip_bytes = resp.content
                cd = resp.headers.get("content-disposition", "")
                filename = f"{'viatico' if module == 'via' else 'grc'}_{tramite_id}_bundle.zip"
                if "filename=" in cd:
                    filename = cd.split("filename=")[-1].strip('"').strip()
                
                input_file = BufferedInputFile(zip_bytes, filename=filename)
                await callback.message.answer_document(
                    document=input_file,
                    caption=f"📦 *Paquete Contable Completo:*\n• Reporte en Excel con Fórmulas (`.xlsx`)\n• Facturas digitales correlacionadas (`XML + PDF`)"
                )
            else:
                await callback.message.answer("❌ No se pudo generar el paquete ZIP en este momento.")
    except Exception as e:
        logger.error(f"Error al descargar bundle ZIP: {e}")
        await callback.message.answer("❌ Error de conexión al generar el archivo ZIP.")
