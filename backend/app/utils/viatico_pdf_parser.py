"""
SIAE — Utility to parse CICESE Support Request PDFs (Solicitud de recursos para apoyo a externos).
Extracts traveler, destination, dates, budget, description, and signature log with cryptographic hashes.
"""

import re
from datetime import datetime
from io import BytesIO
from pypdf import PdfReader


def parse_date_to_iso(date_str: str) -> str | None:
    """Convierte fecha DD-MM-YYYY a YYYY-MM-DD."""
    if not date_str:
        return None
    try:
        dt = datetime.strptime(date_str.strip(), "%d-%m-%Y")
        return dt.date().isoformat()
    except Exception:
        pass
    try:
        # Fallback YYYY-MM-DD
        dt = datetime.strptime(date_str.strip(), "%Y-%m-%d")
        return dt.date().isoformat()
    except Exception:
        return None


def parse_datetime_to_iso(dt_str: str) -> str | None:
    """Convierte fecha-hora DD-MM-YYYY HH:MM:SS a formato ISO."""
    if not dt_str:
        return None
    try:
        dt = datetime.strptime(dt_str.strip(), "%d-%m-%Y %H:%M:%S")
        return dt.isoformat()
    except Exception:
        pass
    try:
        dt = datetime.strptime(dt_str.strip(), "%d-%m-%Y")
        return dt.isoformat()
    except Exception:
        return None


def parse_viaticos_pdf(pdf_bytes: bytes) -> dict:
    """Extrae datos y firmas de la solicitud en PDF de CICESE."""
    reader = PdfReader(BytesIO(pdf_bytes))
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""

    # Normalizar saltos de línea y espacios
    text_lines = [line.strip() for line in text.split("\n")]
    normalized_text = "\n".join(text_lines)

    # Guardar a un archivo para depuración
    import os
    os.makedirs("uploads/viaticos", exist_ok=True)
    with open("uploads/viaticos/debug_extracted_text.txt", "w", encoding="utf-8") as f:
        f.write(normalized_text)

    result = {
        "folio_comision": None,
        "solicitante_name": None,
        "fecha_inicio": None,
        "fecha_fin": None,
        "destino": None,
        "monto_solicitado": 0.0,
        "monto_viaticos": 0.0,
        "monto_pasaje_aereo": 0.0,
        "monto_hospedaje_paquete": 0.0,
        "monto_arrendamiento_vehiculos": 0.0,
        "monto_pasaje_terrestre": 0.0,
        "monto_gasolina": 0.0,
        "justificacion": "",
        "account_number": None,
        "fecha_solicitud": None,
        # Firmas
        "firma_solicitante_nombre": None,
        "firma_solicitante_fecha": None,
        "firma_solicitante_hash": None,
        "firma_jefe_nombre": None,
        "firma_jefe_fecha": None,
        "firma_jefe_hash": None,
        "firma_revisor_nombre": None,
        "firma_revisor_fecha": None,
        "firma_revisor_hash": None,
        "firma_tesoreria_nombre": None,
        "firma_tesoreria_fecha": None,
        "firma_tesoreria_hash": None,
        "firma_responsable_nombre": None,
        "firma_responsable_fecha": None,
        "firma_responsable_hash": None,
    }

    # 1. Folio
    folio_match = re.search(r"(?:Solicitud de recursos.*N[uú]m\.|N[uú]m\.)\s*(\d+)", normalized_text, re.IGNORECASE)
    if folio_match:
        result["folio_comision"] = folio_match.group(1)

    # 2. Solicitante
    sol_match = re.search(r"Solicitante:\s*([^\n#]+)", normalized_text, re.IGNORECASE)
    if sol_match:
        result["solicitante_name"] = sol_match.group(1).strip()

    # 3. Fechas
    salida_col_match = re.search(r"(\d{2}-\d{2}-\d{4})\s*\n\s*[a-zA-ZÁÉÍÓÚÑáéíóúñ,\- ]*Regreso:", normalized_text, re.IGNORECASE)
    if salida_col_match:
        result["fecha_inicio"] = parse_date_to_iso(salida_col_match.group(1))
    else:
        salida_match = re.search(r"Salida:\s*(\d{2}-\d{2}-\d{4})", normalized_text, re.IGNORECASE)
        if salida_match:
            result["fecha_inicio"] = parse_date_to_iso(salida_match.group(1))

    regreso_col_match = re.search(r"(\d{2}-\d{2}-\d{4})\s*Categor[ií]a", normalized_text, re.IGNORECASE)
    if regreso_col_match:
        result["fecha_fin"] = parse_date_to_iso(regreso_col_match.group(1))
    else:
        regreso_match = re.search(r"Regreso:\s*(\d{2}-\d{2}-\d{4})", normalized_text, re.IGNORECASE)
        if regreso_match:
            result["fecha_fin"] = parse_date_to_iso(regreso_match.group(1))

    # 4. Destino y Monto Solicitado (Total)
    monto_viaticos = 0.0
    monto_arrendamiento_vehiculos = 0.0
    monto_pasaje_terrestre = 0.0
    monto_gasolina = 0.0

    # Parsear Gasolina (26103)
    gasolina_match = re.search(r"Uso gasolina:\s*\$?([\d,]+\.\d{2})", normalized_text, re.IGNORECASE)
    if gasolina_match:
        monto_gasolina = float(gasolina_match.group(1).replace(",", ""))

    # Intentar con la coincidencia del bloque de viáticos (Arrendamiento, Pasaje terrestre, Viáticos)
    block_match = re.search(
        r"\$([\d,]+\.\d{2})\s*\$?([\d,]+\.\d{2})?\s*\n\s*\$?([\d,]+\.\d{2})\s*\n\s*\$?([\d,]+\.\d{2})",
        normalized_text
    )
    if block_match:
        val1 = float(block_match.group(1).replace(",", ""))
        val2 = float(block_match.group(2).replace(",", "")) if block_match.group(2) else None
        val3 = float(block_match.group(3).replace(",", ""))
        val4 = float(block_match.group(4).replace(",", ""))

        if val2 is not None:
            # Caso 1: Glued (ej: $2,600.00$0.00)
            # En nuestro PDF, val1 ($2600) es Pasaje Terrestre y val2 ($0) es Arrendamiento.
            # val3 ($6300) es Viáticos, val4 ($8900) es el Total de viáticos.
            monto_pasaje_terrestre = val1
            monto_arrendamiento_vehiculos = val2
            monto_viaticos = val3
        else:
            # Caso 2: Sin glued, en líneas individuales
            # val1 es Arrendamiento, val3 es Pasaje Terrestre, val4 es Viáticos (y el total no fue capturado o es posterior)
            monto_arrendamiento_vehiculos = val1
            monto_pasaje_terrestre = val3
            monto_viaticos = val4
    else:
        # Fallback a los regexes individuales originales
        destino_monto_match = re.search(
            r"\$([\d,]+\.\d{2})\s*([a-zA-ZÁÉÍÓÚÑáéíóúñ,\- ]*(?:México|Mexico|Veracruz|Llave|B\.C\.|Ensenada|Tijuana)[a-zA-ZÁÉÍÓÚÑáéíóúñ,\- ]*)",
            normalized_text,
            re.IGNORECASE
        )
        if destino_monto_match:
            monto_viaticos = float(destino_monto_match.group(1).replace(",", ""))
        else:
            total_match = re.search(r"Total:\s*\$?\s*([\d,]+\.\d{2})", normalized_text, re.IGNORECASE)
            if total_match:
                monto_viaticos = float(total_match.group(1).replace(",", ""))

    # Intentar obtener destino si no se ha extraído
    destino_monto_match = re.search(
        r"\$([\d,]+\.\d{2})\s*([a-zA-ZÁÉÍÓÚÑáéíóúñ,\- ]*(?:México|Mexico|Veracruz|Llave|B\.C\.|Ensenada|Tijuana)[a-zA-ZÁÉÍÓÚÑáéíóúñ,\- ]*)",
        normalized_text,
        re.IGNORECASE
    )
    if destino_monto_match:
        result["destino"] = destino_monto_match.group(2).strip()
    else:
        destino_match = re.search(r"Destino:\s*([^\n]+)", normalized_text, re.IGNORECASE)
        if destino_match:
            dest_val = destino_match.group(1).strip()
            if "salida" not in dest_val.lower():
                result["destino"] = dest_val

    # Parsear Avión (37104)
    monto_pasaje_aereo = 0.0
    avion_match = re.search(r"\$([\d,]+\.\d{2})\s*(?:Avión|Avion)", normalized_text, re.IGNORECASE)
    if avion_match:
        monto_pasaje_aereo = float(avion_match.group(1).replace(",", ""))

    # Parsear Hotel/Paquete (37504)
    monto_hospedaje_paquete = 0.0
    hotel_match = re.search(r"Hotel\s*-\s*Alimentos\s+(?:del\s+)?paquete\s*\$?([\d,]+\.\d{2})", normalized_text, re.IGNORECASE)
    if hotel_match:
        monto_hospedaje_paquete = float(hotel_match.group(1).replace(",", ""))

    # Guardar desglose y calcular monto_solicitado (suma de todo)
    result["monto_viaticos"] = monto_viaticos
    result["monto_pasaje_aereo"] = monto_pasaje_aereo
    result["monto_hospedaje_paquete"] = monto_hospedaje_paquete
    result["monto_arrendamiento_vehiculos"] = monto_arrendamiento_vehiculos
    result["monto_pasaje_terrestre"] = monto_pasaje_terrestre
    result["monto_gasolina"] = monto_gasolina
    result["monto_solicitado"] = monto_viaticos + monto_pasaje_aereo + monto_hospedaje_paquete + monto_arrendamiento_vehiculos + monto_pasaje_terrestre + monto_gasolina

    # 6. Objetivo del viaje (Justificación)
    objetivo_match = re.search(
        r"Objetivo del viaje\s*\n(.*?)(?=\nObservaciones|\nFirmas|M\.N\.|S/P|Paquete|Solicitante)", 
        normalized_text, 
        re.DOTALL | re.IGNORECASE
    )
    if objetivo_match:
        result["justificacion"] = objetivo_match.group(1).replace("\n", " ").strip()

    # 8. Cuenta#
    account_match = re.search(r"M[eé]xico\s*(\d{5,8})", normalized_text, re.IGNORECASE)
    if account_match:
        result["account_number"] = account_match.group(1)

    # 9. Fecha de elaboración (solicitud)
    elaboracion_match = re.search(
        r"Fecha de elaboraci[oó]n:\s*(\d{2}[-\/]\d{2}[-\/]\d{4}|\d{4}[-\/]\d{2}[-\/]\d{2})", 
        normalized_text, 
        re.IGNORECASE
    )
    if not elaboracion_match:
        elaboracion_match = re.search(
            r"(?:Fecha de elaboraci[oó]n|Elaboraci[oó]n|Fecha solicitud):\s*(\d{2}[-\/]\d{2}[-\/]\d{4})", 
            normalized_text, 
            re.IGNORECASE
        )
    if not elaboracion_match:
        elaboracion_match = re.search(
            r"Dias de viaje:\s*(\d{2}-\d{2}-\d{4})", 
            normalized_text, 
            re.IGNORECASE
        )
    if elaboracion_match:
        result["fecha_solicitud"] = parse_date_to_iso(elaboracion_match.group(1))

    # 7. Bloque de Firmas y Hashes Criptográficos
    roles_config = [
        {
            "regexes": [
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+RESPONSABLE DE CUENTA\s*/\s*SOLICITANTE\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})",
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+SOLICITANTE\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})"
            ],
            "prefix": "firma_solicitante"
        },
        {
            "regexes": [
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+JEFE INMEDIATO\s*/\s*RESPONSABLE DE CUENTA\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})",
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+RESPONSABLE DE CUENTA\s*/\s*JEFE INMEDIATO\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})",
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+JEFE INMEDIATO\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})",
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+RESPONSABLE DE CUENTA\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})"
            ],
            "prefix": "firma_jefe"
        },
        {
            "regexes": [
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+RESPONSABLE DE CUENTA\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})"
            ],
            "prefix": "firma_responsable"
        },
        {
            "regexes": [
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+REVISOR ADMINISTRATIVO\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})"
            ],
            "prefix": "firma_revisor"
        },
        {
            "regexes": [
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+VENTANILLA\s+TESORERIA\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})",
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+TESORERIA\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})"
            ],
            "prefix": "firma_tesoreria"
        }
    ]

    for role in roles_config:
        sig_match = None
        for regex in role["regexes"]:
            sig_match = re.search(regex, normalized_text, re.IGNORECASE)
            if sig_match:
                break
        
        if sig_match:
            name = sig_match.group(1).strip()
            # Limpiar nombre si tiene prefijo del hash pegado (letras minúsculas y números antes del primer caracter en mayúscula)
            name = re.sub(r"^[0-9a-f]+(?=[A-ZÁÉÍÓÚÑ])", "", name)
            # Limpiar prefijo de fecha/hora si existe (ej. 12-AUG-26 14:19 / JCANO)
            if "/" in name:
                name = name.split("/")[-1].strip()
                
            dt_iso = parse_datetime_to_iso(sig_match.group(2))
            
            result[f"{role['prefix']}_nombre"] = name
            result[f"{role['prefix']}_fecha"] = dt_iso
            
            # Buscar el hash criptográfico (líneas consecutivas de caracteres hexadecimales arriba de la firma)
            sig_line = sig_match.group(0).strip()
            idx = -1
            # Primero buscar una línea que contenga la firma y empiece con caracteres hexadecimales seguidos del nombre
            for i, l in enumerate(text_lines):
                line_clean = l.strip()
                if sig_line in line_clean and re.match(r"^[0-9a-f]{10,}", line_clean):
                    idx = i
                    break
            
            # Si no se encuentra, buscar la primera línea que contenga la firma
            if idx == -1:
                for i, l in enumerate(text_lines):
                    if sig_line in l or l in sig_line:
                        idx = i
                        break
            
            if idx != -1:
                # Obtener la parte pegada de la firma (el prefijo hexadecimal de la misma línea)
                glued_match = re.match(r"^([0-9a-f]+)(?=[A-ZÁÉÍÓÚÑ])", text_lines[idx].strip())
                glued_hash = glued_match.group(1) if glued_match else ""
                
                hash_chunks = []
                # Leer las líneas precedentes hacia arriba
                for k in range(idx - 1, max(-1, idx - 4), -1):
                    prev_line = text_lines[k].strip()
                    if re.match(r"^[a-fA-F0-9]{15,512}$", prev_line):
                        hash_chunks.append(prev_line)
                    else:
                        break
                
                hash_chunks.reverse()
                if glued_hash:
                    hash_chunks.append(glued_hash)
                    
                if hash_chunks:
                    result[f"{role['prefix']}_hash"] = " ".join(hash_chunks)

    # Si firma_responsable quedó vacío pero firma_solicitante o firma_jefe tienen roles combinados, duplicar firma
    if not result.get("firma_responsable_nombre"):
        solicitante_text = result.get("firma_solicitante_nombre")
        if solicitante_text:
            match = re.search(r"RESPONSABLE DE CUENTA\s*/\s*SOLICITANTE", normalized_text, re.IGNORECASE)
            if match:
                result["firma_responsable_nombre"] = result["firma_solicitante_nombre"]
                result["firma_responsable_fecha"] = result["firma_solicitante_fecha"]
                result["firma_responsable_hash"] = result["firma_solicitante_hash"]
                
        if not result.get("firma_responsable_nombre"):
            jefe_text = result.get("firma_jefe_nombre")
            if jefe_text:
                match = re.search(r"JEFE INMEDIATO\s*/\s*RESPONSABLE DE CUENTA|RESPONSABLE DE CUENTA\s*/\s*JEFE INMEDIATO", normalized_text, re.IGNORECASE)
                if match:
                    result["firma_responsable_nombre"] = result["firma_jefe_nombre"]
                    result["firma_responsable_fecha"] = result["firma_jefe_fecha"]
                    result["firma_responsable_hash"] = result["firma_jefe_hash"]

    return result


def parse_viaticos_comprobacion_pdf(pdf_bytes: bytes) -> dict:
    """Extrae datos financieros, informe y firmas de seguimiento de la Comprobación de Viáticos de EPISA."""
    reader = PdfReader(BytesIO(pdf_bytes))
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""

    text_lines = [line.strip() for line in text.split("\n")]
    normalized_text = "\n".join(text_lines)

    result = {
        "folio_comision": None,
        "comisionado_nombre": None,
        "account_number": None,
        "fecha_envio_tesoreria": None,
        "fecha_inicio": None,
        "fecha_fin": None,
        "destino": None,
        "informe_viaje": None,
        "monto_solicitado": None,
        "monto_comprobado": None,
        "monto_devuelto": None,
        "monto_saldo_favor": None,
        "firma_comp_solicitante_nombre": None,
        "firma_comp_solicitante_fecha": None,
        "firma_comp_solicitante_hash": None,
        "firma_comp_revisor_nombre": None,
        "firma_comp_revisor_fecha": None,
        "firma_comp_revisor_hash": None,
        "firma_comp_tesoreria_nombre": None,
        "firma_comp_tesoreria_fecha": None,
        "firma_comp_tesoreria_hash": None,
        "firma_comp_contabilidad_nombre": None,
        "firma_comp_contabilidad_fecha": None,
        "firma_comp_contabilidad_hash": None,
    }

    # 1. Folio Comisión
    folio_match = re.search(r"Comprobaci[oó]n de vi[aá]ticos n[uú]mero:\s*(\d+)", normalized_text, re.IGNORECASE)
    if folio_match:
        result["folio_comision"] = folio_match.group(1).strip()

    # 2. Nombre del comisionado
    nombre_match = re.search(r"Nombre:\s*([a-zA-ZÁÉÍÓÚÑáéíóúñ\s]+?)(?=\s+Capturo:|\s+Extensi[oó]n|\n|$)", normalized_text, re.IGNORECASE)
    if nombre_match:
        result["comisionado_nombre"] = nombre_match.group(1).strip()

    # 3. Cuenta#
    cuenta_match = re.search(r"Cuenta#:\s*(\d{5,8})", normalized_text, re.IGNORECASE)
    if cuenta_match:
        result["account_number"] = cuenta_match.group(1).strip()

    # 4. Fecha de envío a tesorería
    envio_match = re.search(r"Fecha de envi[oó] a tesorer[ií]a:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}|\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})", normalized_text, re.IGNORECASE)
    if envio_match:
        result["fecha_envio_tesoreria"] = parse_datetime_to_iso(envio_match.group(1).strip())

    # 5. Salida y Regreso (Fechas)
    fechas_match = re.search(r"Salida:\s*(\d{2}-\d{2}-\d{4})\s+Regreso:\s*(\d{2}-\d{2}-\d{4})", normalized_text, re.IGNORECASE)
    if fechas_match:
        result["fecha_inicio"] = parse_date_to_iso(fechas_match.group(1).strip())
        result["fecha_fin"] = parse_date_to_iso(fechas_match.group(2).strip())

    # 6. Destino
    destino_match = re.search(r"Destino:\s*([a-zA-ZÁÉÍÓÚÑáéíóúñ0-9\s,\.-]+?)(?=\s+Origen:|\n|$)", normalized_text, re.IGNORECASE)
    if destino_match:
        result["destino"] = destino_match.group(1).strip()

    # 7. Totales (Recibido, Comprobado, Devolución, Saldo a favor)
    # Ejemplo: Totales $8,900.00 $5,770.76 $3,129.24 $0.00
    totales_match = re.search(
        r"Totales\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})",
        normalized_text,
        re.IGNORECASE
    )
    if totales_match:
        def clean_val(v):
            return float(v.replace(",", ""))
        result["monto_solicitado"] = clean_val(totales_match.group(1))
        result["monto_comprobado"] = clean_val(totales_match.group(2))
        result["monto_devuelto"] = clean_val(totales_match.group(3))
        result["monto_saldo_favor"] = clean_val(totales_match.group(4))

    # 8. Informe del viaje
    informe_match = re.search(r"Informe del viaje\s*\n(.*?)(?=\nObservaciones|\nConcepto|\nFirmas|$)", normalized_text, re.IGNORECASE | re.DOTALL)
    if informe_match:
        result["informe_viaje"] = informe_match.group(1).replace("\n", " ").strip()

    # 9. Firmas de Seguimiento y Hashes de Comprobación
    comp_roles_config = [
        {
            "regexes": [
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+RESPONSABLE DE CUENTA\s*/\s*SOLICITANTE\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})",
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+SOLICITANTE\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})",
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+RESPONSABLE DE CUENTA\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})"
            ],
            "prefix": "firma_comp_solicitante"
        },
        {
            "regexes": [
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+REVISOR ADMINISTRATIVO\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})"
            ],
            "prefix": "firma_comp_revisor"
        },
        {
            "regexes": [
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+VENTANILLA\s+TESORERIA\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})",
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+TESORERIA\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})"
            ],
            "prefix": "firma_comp_tesoreria"
        },
        {
            "regexes": [
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+VENTANILLA\s+CONTABILIDAD\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})",
                r"([a-zA-ZÁÉÍÓÚÑáéíóúñ\d\/ ]+)\s+CONTABILIDAD\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})"
            ],
            "prefix": "firma_comp_contabilidad"
        }
    ]

    for role in comp_roles_config:
        sig_match = None
        for regex in role["regexes"]:
            sig_match = re.search(regex, normalized_text, re.IGNORECASE)
            if sig_match:
                break

        if sig_match:
            name = sig_match.group(1).strip()
            name = re.sub(r"^[0-9a-f]+(?=[A-ZÁÉÍÓÚÑ])", "", name)
            if "/" in name:
                name = name.split("/")[-1].strip()

            dt_iso = parse_datetime_to_iso(sig_match.group(2))
            result[f"{role['prefix']}_nombre"] = name
            result[f"{role['prefix']}_fecha"] = dt_iso

            sig_line = sig_match.group(0).strip()
            idx = -1
            for i, l in enumerate(text_lines):
                line_clean = l.strip()
                if sig_line in line_clean and re.match(r"^[0-9a-f]{10,}", line_clean):
                    idx = i
                    break

            if idx == -1:
                for i, l in enumerate(text_lines):
                    if sig_line in l or l in sig_line:
                        idx = i
                        break

            if idx != -1:
                glued_match = re.match(r"^([0-9a-f]+)(?=[A-ZÁÉÍÓÚÑ])", text_lines[idx].strip())
                glued_hash = glued_match.group(1) if glued_match else ""

                hash_chunks = []
                for k in range(idx - 1, max(-1, idx - 4), -1):
                    prev_line = text_lines[k].strip()
                    if re.match(r"^[a-fA-F0-9]{15,512}$", prev_line):
                        hash_chunks.append(prev_line)
                    else:
                        break

                hash_chunks.reverse()
                if glued_hash:
                    hash_chunks.append(glued_hash)

                if hash_chunks:
                    result[f"{role['prefix']}_hash"] = " ".join(hash_chunks)

    return result

