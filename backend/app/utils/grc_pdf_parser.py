"""
SIAE — Utility to parse CICESE GRC (Gasto a Reserva de Comprobar) Request PDFs.
Extracts folio, accounts, traveler, justification, itemized concepts/budget lines, and signature history with hashes.
"""

import re
from datetime import datetime
from io import BytesIO
from pypdf import PdfReader


def parse_date_to_iso(date_str: str) -> str | None:
    """Convierte fecha de varios formatos (incl. dd-MMM-yyyy) a YYYY-MM-DD."""
    if not date_str:
        return None
    
    date_str = date_str.strip()
    
    # Mapeo de meses en inglés/español
    months = {
        "jan": 1, "ene": 1, "feb": 2, "mar": 3, "apr": 4, "abr": 4,
        "may": 5, "jun": 6, "jul": 7, "aug": 8, "ago": 8, "sep": 9,
        "oct": 10, "nov": 11, "dec": 12, "dic": 12
    }
    
    # Intentar formato 17-AUG-2026 o 17-AGO-2026
    match_str = re.search(r"(\d{1,2})[-/\s]([a-zA-Z]{3})[-/\s](\d{4})", date_str)
    if match_str:
        day = int(match_str.group(1))
        month_name = match_str.group(2).lower()
        year = int(match_str.group(3))
        if month_name in months:
            month = months[month_name]
            return f"{year:04d}-{month:02d}-{day:02d}"

    # Formatos tradicionales
    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.date().isoformat()
        except ValueError:
            pass

    return None


def parse_datetime_to_iso(dt_str: str) -> str | None:
    """Convierte fecha-hora DD-MM-YYYY HH:MM:SS a formato ISO."""
    if not dt_str:
        return None
    
    dt_str = dt_str.strip()
    for fmt in ("%d-%m-%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%d-%m-%Y", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(dt_str, fmt)
            return dt.isoformat()
        except ValueError:
            pass
    return None


def parse_grc_pdf(pdf_bytes: bytes) -> dict:
    """Extrae metadatos, partidas y firmas de la solicitud GRC en PDF."""
    reader = PdfReader(BytesIO(pdf_bytes))
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""

    # Normalizar espacios y saltos de línea
    text_lines = [line.strip() for line in text.split("\n")]
    normalized_text = "\n".join(text_lines)

    # Para depuración
    import os
    os.makedirs("uploads/gastos_reserva_comprobar/reports", exist_ok=True)
    with open("uploads/gastos_reserva_comprobar/reports/debug_extracted_text.txt", "w", encoding="utf-8") as f:
        f.write(normalized_text)

    result = {
        "folio_episa": None,
        "fecha_solicitud": None,
        "fecha_pago_servicio": None,
        "solicitante_name": None,
        "account_number": None,
        "justificacion": "",
        "observaciones": "",
        "monto_solicitado": 0.0,
        "items": [],
        
        # Firmas y hashes
        "firma_solicitante_nombre": None,
        "firma_solicitante_fecha": None,
        "firma_solicitante_hash": None,
        
        "firma_revisor_nombre": None,
        "firma_revisor_fecha": None,
        "firma_revisor_hash": None,
        
        "firma_jefe_nombre": None,
        "firma_jefe_fecha": None,
        "firma_jefe_hash": None,
        
        "firma_adquisiciones_nombre": None,
        "firma_adquisiciones_fecha": None,
        "firma_adquisiciones_hash": None,
        
        "firma_director_nombre": None,
        "firma_director_fecha": None,
        "firma_director_hash": None,
        
        "firma_tesoreria_nombre": None,
        "firma_tesoreria_fecha": None,
        "firma_tesoreria_hash": None,
        
        "firma_contabilidad_nombre": None,
        "firma_contabilidad_fecha": None,
        "firma_contabilidad_hash": None,
    }

    # 1. Folio
    folio_match = re.search(r"Solicitud de Gasto a Reserva de Comprobar Número:\s*(\d+)", normalized_text, re.IGNORECASE)
    if folio_match:
        result["folio_episa"] = folio_match.group(1)
    else:
        folio_match = re.search(r"FOLIO\s*(\d+)", normalized_text, re.IGNORECASE)
        if folio_match:
            result["folio_episa"] = folio_match.group(1)

    # 2. Cuenta
    account_match = re.search(r"CUENTA#\s*(\d+)", normalized_text, re.IGNORECASE)
    if account_match:
        result["account_number"] = account_match.group(1)
    else:
        # Fallback a buscar cualquier número de cuenta de 6 dígitos que inicie con 624
        account_match = re.search(r"(624\d{3})", normalized_text)
        if account_match:
            result["account_number"] = account_match.group(1)

    # 3. Fecha Solicitud
    fecha_match = re.search(r"FECHA\s+(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})", normalized_text, re.IGNORECASE)
    if fecha_match:
        result["fecha_solicitud"] = parse_date_to_iso(fecha_match.group(1))

    # 4. Solicitante
    # Intentamos primero buscar el formato de ID - NOMBRE (ej. 3397 - ERNESTO ALONSO VALENZUELA PALACIOS)
    solicitante_match = re.search(r"\b\d+\s*-\s*([a-zA-ZÁÉÍÓÚÑáéíóúñ ]+)", normalized_text, re.IGNORECASE)
    if solicitante_match:
        result["solicitante_name"] = solicitante_match.group(1).strip()
    else:
        # Fallback al formato original
        solicitante_match = re.search(r"SOLICITANT[E]?\s+\d+\s*-\s*([a-zA-ZÁÉÍÓÚÑáéíóúñ ]+)", normalized_text, re.IGNORECASE)
        if solicitante_match:
            result["solicitante_name"] = solicitante_match.group(1).strip()

    # 5. Fecha Pago Servicio
    # Intentamos buscar cualquier fecha con formato dd-MMM-yyyy (ej. 17-AUG-2026) en todo el texto
    fecha_pago_match = re.search(r"(\d{1,2})[-/\s]([a-zA-Z]{3})[-/\s](\d{4})", normalized_text, re.IGNORECASE)
    if fecha_pago_match:
        result["fecha_pago_servicio"] = parse_date_to_iso(fecha_pago_match.group(0))
    else:
        # Fallback original
        fecha_pago_match = re.search(r"FECHA DEL PAGO DEL SERVICIO\s*/\s*([^\n]+)", normalized_text, re.IGNORECASE)
        if fecha_pago_match:
            result["fecha_pago_servicio"] = parse_date_to_iso(fecha_pago_match.group(1))

    # 6. Justificación
    just_match = re.search(r"JUSTIFICACION:\s*\n(.*?)(?=\nOBSERVACIONES:|\nConcepto|\nPartida)", normalized_text, re.DOTALL | re.IGNORECASE)
    if just_match:
        result["justificacion"] = just_match.group(1).replace("\n", " ").strip()

    # 7. Observaciones
    obs_match = re.search(r"OBSERVACIONES:\s*\n(.*?)(?=\nConcepto|\nPartida|\nTotal agrupado)", normalized_text, re.DOTALL | re.IGNORECASE)
    if obs_match:
        result["observaciones"] = obs_match.group(1).replace("\n", " ").strip()

    # 8. Monto Total
    total_match = re.search(r"Total:\s*\$\s*([\d,]+\.\d{2})", normalized_text, re.IGNORECASE)
    if total_match:
        result["monto_solicitado"] = float(total_match.group(1).replace(",", ""))

    # 9. Items/Partidas
    # Buscamos filas individuales con el formato: Concepto Partida CUCOP Rubro Subtotal
    for line in text_lines:
        # Formato 1: Concepto Rubro $ Subtotal Partida CUCOP RubroDesc (columna corrida, ej: bolsas 0 $ 1,000.00 2160121600075 BOLSAS...)
        item_match = re.search(r"^(.*?)\s+(\d+)\s+\$\s*([\d,]+\.\d{2})\s+(\d{5})\s*(\d{8})\s*(.*)$", line)
        if item_match:
            concepto = item_match.group(1).strip()
            partida = item_match.group(4).strip()
            cucop = item_match.group(5).strip()
            rubro = item_match.group(2).strip()
            subtotal = float(item_match.group(3).replace(",", ""))
            result["items"].append({
                "concepto": concepto,
                "partida": partida,
                "cucop": f"{cucop} {item_match.group(6).strip()}".strip(),
                "rubro_conacyt": rubro,
                "subtotal": subtotal
            })
        else:
            # Formato 2: Concepto Partida(5d) CUCOP(8d + desc) Rubro Subtotal
            item_match = re.search(r"^(.*?)\s+(\d{5})\s+(\d{8}\s+.*?)\s+(\d+)\s+\$\s*([\d,]+\.\d{2})", line)
            if item_match:
                concepto = item_match.group(1).strip()
                partida = item_match.group(2).strip()
                cucop = item_match.group(3).strip()
                rubro = item_match.group(4).strip()
                subtotal = float(item_match.group(5).replace(",", ""))
                result["items"].append({
                    "concepto": concepto,
                    "partida": partida,
                    "cucop": cucop,
                    "rubro_conacyt": rubro,
                    "subtotal": subtotal
                })

    # 10. Firmas y Hashes Criptográficos
    # Definimos los roles y sus prefijos correspondientes
    roles_config = [
        {"regex": r"([a-zA-ZÁÉÍÓÚÑáéíóúñ ]+)\s+ENCARGADO DE CUENTA\s*/\s*SOLICITANTE\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})", "prefix": "firma_solicitante"},
        {"regex": r"([a-zA-ZÁÉÍÓÚÑáéíóúñ ]+)\s+REVISOR ADMINISTRATIVO\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})", "prefix": "firma_revisor"},
        {"regex": r"([a-zA-ZÁÉÍÓÚÑáéíóúñ ]+)\s+JEFE INMEDIATO\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})", "prefix": "firma_jefe"},
        {"regex": r"([a-zA-ZÁÉÍÓÚÑáéíóúñ ]+)\s+DEPARTAMENTO DE ADQUISICIONES\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})", "prefix": "firma_adquisiciones"},
        {"regex": r"([a-zA-ZÁÉÍÓÚÑáéíóúñ ]+)\s+DIRECTOR ADMINISTRATIVO\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})", "prefix": "firma_director"},
        {"regex": r"([a-zA-ZÁÉÍÓÚÑáéíóúñ ]+)\s+VENTANILLA TESORERIA\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})", "prefix": "firma_tesoreria"},
        {"regex": r"([a-zA-ZÁÉÍÓÚÑáéíóúñ ]+)\s+CONTABILIDAD\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})", "prefix": "firma_contabilidad"},
    ]

    for role in roles_config:
        sig_match = re.search(role["regex"], normalized_text, re.IGNORECASE)
        if sig_match:
            name = sig_match.group(1).strip()
            dt_iso = parse_datetime_to_iso(sig_match.group(2))
            
            result[f"{role['prefix']}_nombre"] = name
            result[f"{role['prefix']}_fecha"] = dt_iso
            
            # Buscar el hash criptográfico (líneas consecutivas de caracteres hexadecimales)
            sig_line = sig_match.group(0).strip()
            # Encontrar el índice de esta línea en las líneas originales
            try:
                idx = text_lines.index(sig_line)
            except ValueError:
                idx = -1
                for i, l in enumerate(text_lines):
                    if sig_line in l or l in sig_line:
                        idx = i
                        break
            
            if idx != -1:
                hash_chunks = []
                # Leer las siguientes líneas mientras sean hashes hexadecimales
                for k in range(idx + 1, min(idx + 5, len(text_lines))):
                    next_line = text_lines[k].strip()
                    # Si la línea tiene un formato de hash (solo hexágonos, mínimo 15 caracteres)
                    # o contiene el string del tipo '2026/08/14 12:13:07/shermosillo'
                    if re.match(r"^[a-fA-F0-9]{15,512}$", next_line) or re.search(r"\d{4}/\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2}/\w+", next_line):
                        hash_chunks.append(next_line)
                    else:
                        break
                if hash_chunks:
                    result[f"{role['prefix']}_hash"] = " ".join(hash_chunks)

    return result
