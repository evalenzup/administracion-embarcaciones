import logging
import httpx
from config import settings

logger = logging.getLogger(__name__)


class SIAEAPIClient:
    """Cliente HTTP para interactuar con la API REST de SIAE."""

    def __init__(self):
        self.base_url = settings.SIAE_BACKEND_URL
        self.bot_token = settings.BOT_API_KEY

    def _get_headers(self, impersonate_tg_id: str | None = None) -> dict:
        """Construir cabeceras con el token del bot e impersonación opcional."""
        headers = {
            "X-Bot-Token": self.bot_token,
        }
        if impersonate_tg_id:
            headers["X-Impersonate-Telegram-ID"] = str(impersonate_tg_id)
        return headers

    async def link_account(self, token: str, telegram_id: str) -> dict:
        """
        Vincular la cuenta de Telegram con un usuario de SIAE.
        Llama a: POST /api/v1/auth/link-telegram
        """
        url = f"{self.base_url}/api/v1/auth/link-telegram"
        payload = {
            "token": token,
            "telegram_id": str(telegram_id)
        }
        headers = self._get_headers()

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(url, json=payload, headers=headers, timeout=10.0)
                if resp.status_code == 200:
                    return {"success": True, "data": resp.json()}
                else:
                    detail = "Error desconocido"
                    try:
                        detail = resp.json().get("detail", detail)
                    except Exception:
                        pass
                    return {"success": False, "error": detail}
            except Exception as e:
                logger.error(f"Error al conectar con la API de vinculación: {e}")
                return {"success": False, "error": "No se pudo establecer conexión con el servidor de SIAE."}

    async def get_active_grcs(self, telegram_id: str) -> dict:
        """
        Listar los viáticos (GRCs) asignados al usuario en Telegram.
        Llama a: GET /api/v1/gastos-reserva-comprobar
        """
        url = f"{self.base_url}/api/v1/gastos-reserva-comprobar"
        headers = self._get_headers(impersonate_tg_id=telegram_id)

        async with httpx.AsyncClient() as client:
            try:
                # Filtrar para ver los viáticos activos (ej: los que no están completados o rechazados)
                resp = await client.get(url, headers=headers, timeout=10.0)
                if resp.status_code == 200:
                    grcs = resp.json().get("items", [])
                    # Filtrar en memoria por los estados activos (ej: solicitado, aprobado, comprobacion_pendiente)
                    active_grcs = [
                        g for g in grcs 
                        if g.get("status") in ["aprobado", "comprobacion_pendiente", "solicitado"]
                    ]
                    return {"success": True, "items": active_grcs}
                else:
                    return {"success": False, "error": f"Error del servidor ({resp.status_code})"}
            except Exception as e:
                logger.error(f"Error al listar GRCs: {e}")
                return {"success": False, "error": "Error al conectar con el servidor."}

    async def get_grc_details(self, telegram_id: str, grc_id: int) -> dict:
        """
        Obtener el detalle de un viático específico.
        Llama a: GET /api/v1/gastos-reserva-comprobar/{grc_id}
        """
        url = f"{self.base_url}/api/v1/gastos-reserva-comprobar/{grc_id}"
        headers = self._get_headers(impersonate_tg_id=telegram_id)

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url, headers=headers, timeout=10.0)
                if resp.status_code == 200:
                    return {"success": True, "data": resp.json()}
                else:
                    return {"success": False, "error": f"Error del servidor ({resp.status_code})"}
            except Exception as e:
                logger.error(f"Error al obtener GRC: {e}")
                return {"success": False, "error": "Error de conexión."}

    async def get_categories(self, telegram_id: str) -> dict:
        """
        Obtener las categorías financieras de gasto (para el formulario de subida).
        Llama a: GET /api/v1/petty-cash/categories
        """
        url = f"{self.base_url}/api/v1/petty-cash/categories?active_only=true"
        headers = self._get_headers(impersonate_tg_id=telegram_id)

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url, headers=headers, timeout=10.0)
                if resp.status_code == 200:
                    return {"success": True, "items": resp.json()}
                else:
                    return {"success": False, "error": f"Error ({resp.status_code})"}
            except Exception as e:
                logger.error(f"Error al obtener categorías: {e}")
                return {"success": False, "error": "Error de conexión."}

    async def upload_invoice(
        self,
        telegram_id: str,
        grc_id: int,
        category_id: int,
        xml_bytes: bytes,
        xml_name: str,
        pdf_bytes: bytes | None = None,
        pdf_name: str | None = None,
        description: str | None = None
    ) -> dict:
        """
        Subir y comprobar una factura XML (+PDF opcional) en un GRC.
        Llama a: POST /api/v1/gastos-reserva-comprobar/{grc_id}/invoices
        """
        url = f"{self.base_url}/api/v1/gastos-reserva-comprobar/{grc_id}/invoices"
        headers = self._get_headers(impersonate_tg_id=telegram_id)

        # Configurar archivos para Multipart Form Data
        files = {
            "xml_file": (xml_name, xml_bytes, "application/xml")
        }
        if pdf_bytes and pdf_name:
            files["pdf_file"] = (pdf_name, pdf_bytes, "application/pdf")

        # Configurar datos del formulario
        data = {
            "category_id": str(category_id)
        }
        if description:
            data["description"] = description

        async with httpx.AsyncClient() as client:
            try:
                # Realizar POST como multipart
                resp = await client.post(url, data=data, files=files, headers=headers, timeout=30.0)
                if resp.status_code == 201:
                    return {"success": True, "data": resp.json()}
                else:
                    detail = "Error en la validación fiscal o procesamiento de archivos."
                    try:
                        detail = resp.json().get("detail", detail)
                    except Exception:
                        pass
                    return {"success": False, "error": detail}
            except Exception as e:
                logger.error(f"Error al subir factura: {e}")
                return {"success": False, "error": f"Error al subir archivos al servidor: {str(e)}"}

    async def get_active_viaticos(self, telegram_id: str) -> dict:
        """
        Listar las comisiones de viáticos asignadas al usuario en Telegram.
        Llama a: GET /api/v1/viaticos
        """
        url = f"{self.base_url}/api/v1/viaticos"
        headers = self._get_headers(impersonate_tg_id=telegram_id)

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url, headers=headers, timeout=10.0)
                if resp.status_code == 200:
                    viaticos = resp.json().get("items", [])
                    active = [
                        v for v in viaticos
                        if v.get("status") in ["aprobado", "comprobacion_pendiente", "solicitado"]
                    ]
                    return {"success": True, "items": active}
                else:
                    return {"success": False, "error": f"Error del servidor ({resp.status_code})"}
            except Exception as e:
                logger.error(f"Error al listar viáticos: {e}")
                return {"success": False, "error": "Error al conectar con el servidor."}

    async def get_viatico_details(self, telegram_id: str, viatico_id: int) -> dict:
        """
        Obtener el detalle de una comisión de viático específica.
        Llama a: GET /api/v1/viaticos/{viatico_id}
        """
        url = f"{self.base_url}/api/v1/viaticos/{viatico_id}"
        headers = self._get_headers(impersonate_tg_id=telegram_id)

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url, headers=headers, timeout=10.0)
                if resp.status_code == 200:
                    return {"success": True, "data": resp.json()}
                else:
                    return {"success": False, "error": f"Error del servidor ({resp.status_code})"}
            except Exception as e:
                logger.error(f"Error al obtener viático: {e}")
                return {"success": False, "error": "Error de conexión."}

    async def upload_viatico_invoice(
        self,
        telegram_id: str,
        viatico_id: int,
        category_id: int,
        xml_bytes: bytes,
        xml_name: str,
        pdf_bytes: bytes | None = None,
        pdf_name: str | None = None,
        description: str | None = None
    ) -> dict:
        """
        Subir y comprobar una factura XML (+PDF opcional) en una comisión de viáticos.
        Llama a: POST /api/v1/viaticos/{viatico_id}/invoices
        """
        url = f"{self.base_url}/api/v1/viaticos/{viatico_id}/invoices"
        headers = self._get_headers(impersonate_tg_id=telegram_id)

        files = {
            "xml_file": (xml_name, xml_bytes, "application/xml")
        }
        if pdf_bytes and pdf_name:
            files["pdf_file"] = (pdf_name, pdf_bytes, "application/pdf")

        data = {
            "category_id": str(category_id)
        }
        if description:
            data["description"] = description

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(url, data=data, files=files, headers=headers, timeout=30.0)
                if resp.status_code == 201:
                    return {"success": True, "data": resp.json()}
                else:
                    detail = "Error en la validación fiscal o procesamiento de archivos."
                    try:
                        detail = resp.json().get("detail", detail)
                    except Exception:
                        pass
                    return {"success": False, "error": detail}
            except Exception as e:
                logger.error(f"Error al subir factura a viáticos: {e}")
                return {"success": False, "error": f"Error al subir archivos al servidor: {str(e)}"}

    async def get_admin_digest(self, telegram_id: str) -> dict:
        """
        Obtener el resumen global operativo para administradores y asistentes.
        Llama a: GET /api/v1/notifications/admin-digest
        """
        url = f"{self.base_url}/api/v1/notifications/admin-digest"
        headers = self._get_headers(impersonate_tg_id=telegram_id)

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url, headers=headers, timeout=12.0)
                if resp.status_code == 200:
                    return {"success": True, "data": resp.json()}
                else:
                    detail = "No autorizado o error al obtener resumen."
                    try:
                        detail = resp.json().get("detail", detail)
                    except Exception:
                        pass
                    return {"success": False, "error": detail}
            except Exception as e:
                logger.error(f"Error al obtener admin digest: {e}")
                return {"success": False, "error": "Error de conexión con el servidor."}

    async def get_admin_overdue(self, telegram_id: str) -> dict:
        """
        Obtener la lista de trámites vencidos.
        Llama a: GET /api/v1/notifications/admin-overdue
        """
        url = f"{self.base_url}/api/v1/notifications/admin-overdue"
        headers = self._get_headers(impersonate_tg_id=telegram_id)

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url, headers=headers, timeout=12.0)
                if resp.status_code == 200:
                    return {"success": True, "data": resp.json()}
                else:
                    detail = "No autorizado o error al obtener vencidos."
                    try:
                        detail = resp.json().get("detail", detail)
                    except Exception:
                        pass
                    return {"success": False, "error": detail}
            except Exception as e:
                logger.error(f"Error al obtener admin overdue: {e}")
                return {"success": False, "error": "Error de conexión con el servidor."}

    async def get_admin_pending(self, telegram_id: str) -> dict:
        """
        Obtener la lista de trámites pendientes.
        Llama a: GET /api/v1/notifications/admin-pending
        """
        url = f"{self.base_url}/api/v1/notifications/admin-pending"
        headers = self._get_headers(impersonate_tg_id=telegram_id)

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url, headers=headers, timeout=12.0)
                if resp.status_code == 200:
                    return {"success": True, "data": resp.json()}
                else:
                    detail = "No autorizado o error al obtener pendientes."
                    try:
                        detail = resp.json().get("detail", detail)
                    except Exception:
                        pass
                    return {"success": False, "error": detail}
            except Exception as e:
                logger.error(f"Error al obtener admin pending: {e}")
                return {"success": False, "error": "Error de conexión con el servidor."}

    async def send_reminder_by_folio(self, telegram_id: str, folio: str, custom_note: str | None = None) -> dict:
        """
        Enviar recordatorio formal directo al titular de un folio.
        Llama a: POST /api/v1/notifications/send-reminder-by-folio
        """
        url = f"{self.base_url}/api/v1/notifications/send-reminder-by-folio"
        headers = self._get_headers(impersonate_tg_id=telegram_id)
        payload = {"folio": folio, "custom_note": custom_note}

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(url, json=payload, headers=headers, timeout=15.0)
                if resp.status_code == 200:
                    return {"success": True, "data": resp.json()}
                else:
                    detail = "Error al enviar recordatorio."
                    try:
                        detail = resp.json().get("detail", detail)
                    except Exception:
                        pass
                    return {"success": False, "error": detail}
            except Exception as e:
                logger.error(f"Error al enviar recordatorio por folio: {e}")
                return {"success": False, "error": "Error de conexión con el servidor."}


api_client = SIAEAPIClient()

