"""
SIAE — Utility to parse Mexican Bank Transfer Receipts / Fichas de Depósito.
Supports BBVA, Banorte, Santander, Citibanamex, HSBC, Scotiabank, BanBajío, and SPEI (CEP Banxico).
Extracts transferred amount, bank name, operation folio, tracking key (clave de rastreo), and date.
Includes OCR fallback with pytesseract for scanned documents or image-based screenshots inside PDFs/images.
"""

import re
import io
import logging
from datetime import datetime
from pypdf import PdfReader

logger = logging.getLogger("siae.bank_receipt_parser")

try:
    from PIL import Image
    import pytesseract
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    logger.warning("PIL o pytesseract no están disponibles. OCR deshabilitado.")

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
    "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
    "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12
}


def parse_bank_receipt_text(text: str) -> dict:
    """
    Analizar el texto extraído de un comprobante bancario y obtener importe, banco y datos de operación.
    """
    cleaned = text.replace("\r", " ")
    
    result = {
        "monto": None,
        "banco": None,
        "folio_operacion": None,
        "clave_rastreo": None,
        "fecha": None,
        "beneficiario": None,
        "concepto": None,
        "raw_text_preview": text[:300].strip() if text else ""
    }

    if not text or not text.strip():
        return result

    # 1. Detectar Banco
    text_lower = text.lower()
    if "bbva" in text_lower or "bancomer" in text_lower:
        result["banco"] = "BBVA"
    elif "banorte" in text_lower or "ixe" in text_lower:
        result["banco"] = "Banorte"
    elif "santander" in text_lower:
        result["banco"] = "Santander"
    elif "citibanamex" in text_lower or "banamex" in text_lower:
        result["banco"] = "Citibanamex"
    elif "hsbc" in text_lower:
        result["banco"] = "HSBC"
    elif "scotiabank" in text_lower:
        result["banco"] = "Scotiabank"
    elif "banbajio" in text_lower or "banbají­o" in text_lower or "banbajío" in text_lower:
        result["banco"] = "BanBajío"
    elif "banxico" in text_lower or "spei" in text_lower:
        result["banco"] = "SPEI / Banxico"
    else:
        result["banco"] = "Bancario"

    # 2. Extraer Monto / Importe transferido
    monto_patterns = [
        # BBVA / Banorte: "Importe transferido\n$ 2,500.00" o "Importe de la operación:\n$ 2,500.00"
        r"(?:importe\s+transferido|importe\s+de\s+la\s+operaci[oó]n|importe|monto\s+transferido|monto\s+pagado|monto\s+de\s+la\s+transferencia|monto|cantidad|total)\s*[:\n]?\s*\$?\s*([\d]{1,3}(?:[,\s]\d{3})*(?:\.\d{2})|[\d]+(?:\.\d{2}))",
        # Patrones con contexto de transferencia y signo de pesos
        r"(?:importe|monto|total|transferencia|abono).*?\$?\s*([\d]{1,3}(?:[,\s]\d{3})*\.\d{2}|[\d]+\.\d{2})",
        # Fallback para cualquier cantidad con signo $
        r"\$\s*([\d]{1,3}(?:[,\s]\d{3})*\.\d{2}|[\d]+\.\d{2})"
    ]

    for pat in monto_patterns:
        match = re.search(pat, text, re.IGNORECASE | re.DOTALL)
        if match:
            try:
                val_str = match.group(1).replace(",", "").strip()
                val_float = float(val_str)
                if val_float > 0:
                    result["monto"] = val_float
                    break
            except Exception:
                continue

    # 3. Folio de Operación
    folio_match = re.search(
        r"(?:folio(?:\s+de\s+la\s+operaci[oó]n|\s+de\s+autorizaci[oó]n|\s+electr[oó]nico|\s+spei)?|no\.\s*de\s*autorizaci[oó]n|n[uú]mero\s+de\s+autorizaci[oó]n)\s*[:\n]?\s*([a-zA-Z0-9\-]+)",
        text,
        re.IGNORECASE
    )
    if folio_match:
        result["folio_operacion"] = folio_match.group(1).strip()

    # 4. Clave de Rastreo
    rastreo_match = re.search(
        r"(?:clave\s+de\s+rastreo|n[uú]mero\s+de\s+referencia|referencia\s+num[eé]rica|referencia)\s*[:\n]?\s*([a-zA-Z0-9\-]+)",
        text,
        re.IGNORECASE
    )
    if rastreo_match:
        result["clave_rastreo"] = rastreo_match.group(1).strip()

    # 5. Beneficiario
    ben_match = re.search(
        r"(?:nombre\s+del\s+beneficiario|beneficiario|destinatario|cuenta\s+destino)\s*[:\n]?\s*([^\n\r]+)",
        text,
        re.IGNORECASE
    )
    if ben_match:
        result["beneficiario"] = ben_match.group(1).strip()

    # 6. Concepto
    conc_match = re.search(
        r"(?:concepto(?:\s+de\s+pago)?|motivo\s+de\s+pago|descripci[oó]n)\s*[:\n]?\s*([^\n\r]+)",
        text,
        re.IGNORECASE
    )
    if conc_match:
        result["concepto"] = conc_match.group(1).strip()

    # 7. Fecha
    # Patrón "07 septiembre 2026" o "07 de septiembre de 2026"
    date_text_match = re.search(
        r"(?:fecha(?:\s+de\s+la\s+operaci[oó]n)?|operado\s+el)\s*[:\n]?\s*(\d{1,2})\s*(?:de\s+)?([a-zA-Z]+)(?:\s+de\s+|\s+)?(\d{4})",
        text,
        re.IGNORECASE
    )
    if date_text_match:
        try:
            day = int(date_text_match.group(1))
            month_str = date_text_match.group(2).lower()
            year = int(date_text_match.group(3))
            month = MESES.get(month_str, MESES.get(month_str[:3], 1))
            result["fecha"] = f"{year:04d}-{month:02d}-{day:02d}"
        except Exception:
            pass

    if not result["fecha"]:
        # Patrón DD/MM/YYYY o DD-MM-YYYY
        date_num_match = re.search(
            r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})",
            text
        )
        if date_num_match:
            try:
                day = int(date_num_match.group(1))
                month = int(date_num_match.group(2))
                year = int(date_num_match.group(3))
                if 1 <= month <= 12 and 1 <= day <= 31:
                    result["fecha"] = f"{year:04d}-{month:02d}-{day:02d}"
            except Exception:
                pass

    return result


def parse_bank_receipt_image(image_bytes: bytes) -> dict:
    """
    Extraer texto mediante OCR de una imagen directa (JPG, PNG, JPEG) y analizarla.
    """
    if not OCR_AVAILABLE:
        return {"monto": None, "banco": None, "error": "OCR no está disponible en el servidor."}

    try:
        pil_img = Image.open(io.BytesIO(image_bytes))
        ocr_text = pytesseract.image_to_string(pil_img, lang="spa+eng")
        return parse_bank_receipt_text(ocr_text)
    except Exception as e:
        logger.error(f"Error procesando imagen con OCR: {e}")
        return {"monto": None, "banco": None, "error": f"Error OCR: {str(e)}"}


def parse_bank_receipt_pdf(pdf_bytes: bytes) -> dict:
    """
    Extraer texto y procesar comprobante bancario en PDF con soporte para OCR si el PDF contiene imágenes.
    """
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        full_text = ""
        has_text = False

        for page in reader.pages:
            page_text = page.extract_text() or ""
            if len(page_text.strip()) > 5:
                has_text = True
            full_text += page_text + "\n"

        # Intentar parsear el texto estándar
        result = parse_bank_receipt_text(full_text)

        # Si no encontramos monto o casi no hubo texto, y OCR está habilitado, inspeccionamos las imágenes embebidas
        if (result.get("monto") is None or not has_text) and OCR_AVAILABLE:
            ocr_text = ""
            for page in reader.pages:
                if hasattr(page, "images"):
                    for img in page.images:
                        try:
                            pil_img = Image.open(io.BytesIO(img.data))
                            img_text = pytesseract.image_to_string(pil_img, lang="spa+eng")
                            ocr_text += img_text + "\n"
                        except Exception as img_err:
                            logger.warning(f"No se pudo extraer/OCR imagen del PDF: {img_err}")
            
            if ocr_text.strip():
                ocr_result = parse_bank_receipt_text(ocr_text)
                if ocr_result.get("monto") is not None:
                    return ocr_result
                # Si no detectó monto pero detectó otros datos en OCR, mergeamos
                if not result.get("banco") or result.get("banco") == "Bancario":
                    result["banco"] = ocr_result.get("banco")
                result["raw_text_preview"] = ocr_text[:300].strip()

        return result
    except Exception as e:
        logger.error(f"Error parseando PDF bancario: {e}")
        return {
            "monto": None,
            "banco": None,
            "error": f"No se pudo leer el PDF: {str(e)}"
        }


def parse_bank_receipt(file_bytes: bytes, filename: str) -> dict:
    """
    Función general para parsear cualquier comprobante bancario (PDF o imagen).
    """
    filename_lower = filename.lower()
    if filename_lower.endswith(".pdf"):
        return parse_bank_receipt_pdf(file_bytes)
    elif filename_lower.endswith((".jpg", ".jpeg", ".png", ".webp")):
        return parse_bank_receipt_image(file_bytes)
    else:
        return {"monto": None, "banco": None, "error": "Formato de archivo no soportado."}
