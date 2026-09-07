"""
SIAE — Utility for parsing and validating Mexican CFDI 4.0 XML invoices.
Uses the Python standard library xml.etree.ElementTree for performance and zero external dependencies.
"""

import xml.etree.ElementTree as ET
from datetime import datetime
import re


# CONSTANTES FISCALES DE CICESE
CICESE_RFC = "CIC7309189G8"
CICESE_REGIMEN = "603" # Personas Morales con Fines no Lucrativos
CICESE_CP = "22860"

# REGLAS DE NEGOCIO DEL FONDO FIJO
MAX_INVOICE_TOTAL = 5000.00
VALID_METODO_PAGO = "PUE"
VALID_USO_CFDI = "G03"
VALID_FORMAS_PAGO = ["01", "03", "04", "28"]  # 01: Efectivo, 03: Transferencia, 04: Tarjeta de Crédito, 28: Tarjeta de Débito

MESES_ES = {
    "ene": 1, "enero": 1, "jan": 1, "january": 1,
    "feb": 2, "febrero": 2, "february": 2,
    "mar": 3, "marzo": 3, "march": 3,
    "abr": 4, "abril": 4, "april": 4,
    "may": 5, "mayo": 5,
    "jun": 6, "junio": 6, "june": 6,
    "jul": 7, "julio": 7, "july": 7,
    "ago": 8, "agosto": 8, "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "septiembre": 9, "september": 9,
    "oct": 10, "octubre": 10, "october": 10,
    "nov": 11, "noviembre": 11, "november": 11,
    "dic": 12, "diciembre": 12, "dec": 12, "december": 12
}


def extract_dates_from_text(text: str) -> list[str]:
    """
    Extract all valid service/trip/consumption dates found in concept or addenda text.
    Returns a sorted list of unique ISO date strings (YYYY-MM-DD).
    """
    if not text:
        return []

    found_dates = []

    # 1. DD/MM/YYYY or DD-MM-YYYY
    for m in re.finditer(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b", text):
        d, m_num, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            from datetime import date
            dt = date(y, m_num, d)
            if 2020 <= y <= 2040:
                found_dates.append(dt)
        except ValueError:
            pass

    # 2. YYYY-MM-DD or YYYY/MM/DD
    for m in re.finditer(r"\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b", text):
        y, m_num, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            from datetime import date
            dt = date(y, m_num, d)
            if 2020 <= y <= 2040:
                found_dates.append(dt)
        except ValueError:
            pass

    # 3. DD/MM/YY or DD-MM-YY
    for m in re.finditer(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2})\b", text):
        d, m_num, y_short = int(m.group(1)), int(m.group(2)), int(m.group(3))
        y = 2000 + y_short
        try:
            from datetime import date
            dt = date(y, m_num, d)
            if 2020 <= y <= 2040:
                found_dates.append(dt)
        except ValueError:
            pass

    # 4. Textual in Spanish/English: "26 de agosto de 2026", "26-AGO-2026", "26/AGO/2026", "26 AGO 2026"
    for m in re.finditer(r"\b(\d{1,2})\s*(?:de|\/|-)?\s*([a-zA-Z]{3,12})\s*(?:de|\/|-)?\s*(\d{4}|\d{2})\b", text):
        d_str, mes_str, y_str = m.group(1), m.group(2).lower(), m.group(3)
        mes_num = None
        for k, v in MESES_ES.items():
            if mes_str.startswith(k):
                mes_num = v
                break
        if mes_num:
            d = int(d_str)
            y = int(y_str) if len(y_str) == 4 else (2000 + int(y_str))
            try:
                from datetime import date
                dt = date(y, mes_num, d)
                if 2020 <= y <= 2040:
                    found_dates.append(dt)
            except ValueError:
                pass

    # Unique and sorted
    seen = set()
    unique_str = []
    for dt in sorted(found_dates):
        iso_str = dt.strftime("%Y-%m-%d")
        if iso_str not in seen:
            seen.add(iso_str)
            unique_str.append(iso_str)

    return unique_str


def parse_and_validate_cfdi(xml_content: bytes) -> dict:
    """
    Parse a CFDI XML byte stream and validate against CICESE and Petty Cash business rules.
    Returns a dictionary matching the XMLValidationResult schema.
    """
    errors = []
    
    # Intentar parsear el XML
    try:
        root = ET.fromstring(xml_content)
    except Exception as e:
        return {
            "uuid": "",
            "folio": None,
            "serie": None,
            "emisor_rfc": "",
            "emisor_nombre": "",
            "emisor_regimen_fiscal": None,
            "receptor_rfc": "",
            "receptor_nombre": "",
            "receptor_regimen_fiscal": None,
            "receptor_cp": None,
            "subtotal": 0.0,
            "iva": 0.0,
            "total": 0.0,
            "moneda": "MXN",
            "metodo_pago": None,
            "forma_pago": None,
            "uso_cfdi": None,
            "fecha_emision": None,
            "fecha_timbrado": None,
            "conceptos": [],
            "concept_dates": [],
            "concept_summary": None,
            "is_valid": False,
            "errors": [f"Error al parsear archivo XML: {str(e)}"]
        }

    # Namespaces estándar de CFDI
    ns = {
        'cfdi': 'http://www.sat.gob.mx/cfd/4',
        'tfd': 'http://www.sat.gob.mx/TimbreFiscalDigital',
        'cfdi3': 'http://www.sat.gob.mx/cfd/3'
    }

    # Detectar la versión del CFDI
    version = root.attrib.get('Version') or root.attrib.get('version')
    if version != '4.0':
        errors.append(f"El CFDI debe ser versión 4.0. Versión detectada: {version or 'Desconocida'}")

    # Extraer atributos principales del Comprobante
    folio = root.attrib.get('Folio') or root.attrib.get('folio')
    serie = root.attrib.get('Serie') or root.attrib.get('serie')
    subtotal_str = root.attrib.get('SubTotal') or root.attrib.get('subTotal') or "0.0"
    total_str = root.attrib.get('Total') or root.attrib.get('total') or "0.0"
    moneda = root.attrib.get('Moneda') or root.attrib.get('moneda') or "MXN"
    metodo_pago = root.attrib.get('MetodoPago') or root.attrib.get('metodoPago')
    forma_pago = root.attrib.get('FormaPago') or root.attrib.get('formaPago')
    fecha_emision_str = root.attrib.get('Fecha') or root.attrib.get('fecha')

    try:
        subtotal = float(subtotal_str)
    except ValueError:
        subtotal = 0.0
        errors.append("No se pudo obtener el subtotal de la factura.")

    try:
        total = float(total_str)
    except ValueError:
        total = 0.0
        errors.append("No se pudo obtener el total de la factura.")

    # Parsear fecha de emisión
    fecha_emision = None
    if fecha_emision_str:
        try:
            # Reemplazar T por espacio si es necesario
            clean_date = fecha_emision_str.replace('T', ' ')
            fecha_emision = datetime.strptime(clean_date[:19], "%Y-%m-%d %H:%M:%S")
        except Exception:
            try:
                fecha_emision = datetime.fromisoformat(fecha_emision_str)
            except Exception:
                errors.append(f"Error al parsear la fecha de emisión: {fecha_emision_str}")

    # Buscar elementos Emisor y Receptor
    # En CFDI 4.0, a veces se omite la declaración de namespace si está implícito, o se incluye.
    # Buscamos por tag local
    emisor_elem = None
    receptor_elem = None
    
    for elem in root:
        local_tag = elem.tag.split('}')[-1]
        if local_tag == 'Emisor':
            emisor_elem = elem
        elif local_tag == 'Receptor':
            receptor_elem = elem

    # Extraer datos de Emisor
    emisor_rfc = ""
    emisor_nombre = ""
    emisor_regimen_fiscal = None
    if emisor_elem is not None:
        emisor_rfc = emisor_elem.attrib.get('Rfc') or emisor_elem.attrib.get('rfc') or ""
        emisor_nombre = emisor_elem.attrib.get('Nombre') or emisor_elem.attrib.get('nombre') or ""
        emisor_regimen_fiscal = emisor_elem.attrib.get('RegimenFiscal') or emisor_elem.attrib.get('regimenFiscal')
    else:
        errors.append("No se encontró el nodo del Emisor (proveedor).")

    # Extraer datos de Receptor
    receptor_rfc = ""
    receptor_nombre = ""
    receptor_regimen_fiscal = None
    receptor_cp = None
    uso_cfdi = None
    if receptor_elem is not None:
        receptor_rfc = receptor_elem.attrib.get('Rfc') or receptor_elem.attrib.get('rfc') or ""
        receptor_nombre = receptor_elem.attrib.get('Nombre') or receptor_elem.attrib.get('nombre') or ""
        receptor_regimen_fiscal = receptor_elem.attrib.get('RegimenFiscalReceptor') or receptor_elem.attrib.get('regimenFiscalReceptor')
        receptor_cp = receptor_elem.attrib.get('DomicilioFiscalReceptor') or receptor_elem.attrib.get('domicilioFiscalReceptor')
        uso_cfdi = receptor_elem.attrib.get('UsoCFDI') or receptor_elem.attrib.get('usoCFDI')
    else:
        errors.append("No se encontró el nodo del Receptor (CICESE).")

    # Extraer IVA
    # El IVA se encuentra típicamente en cfdi:Impuestos/cfdi:Traslados/cfdi:Traslado
    # Buscamos en todo el árbol de forma general
    iva = 0.0
    iva_found = False
    for elem in root.iter():
        local_tag = elem.tag.split('}')[-1]
        if local_tag == 'Traslado':
            impuesto = elem.attrib.get('Impuesto') or elem.attrib.get('impuesto')
            if impuesto == '002': # IVA
                importe_str = elem.attrib.get('Importe') or elem.attrib.get('importe')
                if importe_str:
                    try:
                        # Nota: En CFDI puede haber múltiples traslados de IVA (por conceptos o globales).
                        # Para evitar duplicar (conceptos vs total), revisamos si este Traslado está bajo cfdi:Impuestos global
                        # O bien, si no, simplemente sumamos el IVA. Para mayor precisión, el IVA global suele estar al final.
                        # Evaluamos el padre del elemento.
                        pass
                    except Exception:
                        pass
    
    # Una forma muy robusta de extraer el IVA total trasladado:
    # Buscar el nodo <cfdi:Impuestos TotalImpuestosTrasladados="..."> que sea hijo directo de cfdi:Comprobante
    impuestos_elem = None
    for elem in root:
        local_tag = elem.tag.split('}')[-1]
        if local_tag == 'Impuestos':
            # Solo considerar si tiene TotalImpuestosTrasladados
            total_tras = elem.attrib.get('TotalImpuestosTrasladados') or elem.attrib.get('totalImpuestosTrasladados')
            if total_tras:
                impuestos_elem = elem
                break
                
    if impuestos_elem is not None:
        # Buscar traslados dentro de este nodo de Impuestos
        for tras_elem in impuestos_elem.iter():
            local_tag = tras_elem.tag.split('}')[-1]
            if local_tag == 'Traslado':
                imp = tras_elem.attrib.get('Impuesto') or tras_elem.attrib.get('impuesto')
                if imp == '002': # IVA
                    imp_str = tras_elem.attrib.get('Importe') or tras_elem.attrib.get('importe')
                    if imp_str:
                        try:
                            iva += float(imp_str)
                            iva_found = True
                        except ValueError:
                            pass
                            
    # Si no se encontró en el nodo global, buscamos la suma de traslados a nivel concepto
    if not iva_found:
        conceptos_iva = 0.0
        for elem in root.iter():
            local_tag = elem.tag.split('}')[-1]
            if local_tag == 'Traslado':
                imp = elem.attrib.get('Impuesto') or elem.attrib.get('impuesto')
                tasa_cuota = elem.attrib.get('TasaOCuota') or elem.attrib.get('tasaOCuota')
                # Verificar que sea IVA y no retención u otro
                if imp == '002' and tasa_cuota:
                    imp_str = elem.attrib.get('Importe') or elem.attrib.get('importe')
                    if imp_str:
                        try:
                            conceptos_iva += float(imp_str)
                        except ValueError:
                            pass
        # Si sumamos conceptos, asegurémonos de no duplicar si hay un nodo global que no vimos.
        # Por seguridad, si conceptos_iva > 0, lo usamos.
        if conceptos_iva > 0.0:
            iva = conceptos_iva
        else:
            # Si no hay IVA desglosado, calculamos como diferencia total - subtotal si total > subtotal
            if total > subtotal:
                iva = round(total - subtotal, 2)

    # Extraer UUID y Fecha de timbrado del Complemento TimbreFiscalDigital
    uuid = ""
    fecha_timbrado = None
    
    tfd_elem = None
    for elem in root.iter():
        local_tag = elem.tag.split('}')[-1]
        if local_tag == 'TimbreFiscalDigital':
            tfd_elem = elem
            break
            
    if tfd_elem is not None:
        uuid = tfd_elem.attrib.get('UUID') or tfd_elem.attrib.get('uuid') or ""
        fecha_timbrado_str = tfd_elem.attrib.get('FechaTimbrado') or tfd_elem.attrib.get('fechaTimbrado')
        if fecha_timbrado_str:
            try:
                clean_date = fecha_timbrado_str.replace('T', ' ')
                fecha_timbrado = datetime.strptime(clean_date[:19], "%Y-%m-%d %H:%M:%S")
            except Exception:
                try:
                    fecha_timbrado = datetime.fromisoformat(fecha_timbrado_str)
                except Exception:
                    errors.append(f"Error al parsear la fecha de timbrado: {fecha_timbrado_str}")
    else:
        errors.append("No se encontró el Timbre Fiscal Digital (factura no timbrada).")

    # Extraer Conceptos y Fechas de Servicio/Consumo
    conceptos = []
    concept_descriptions = []
    for elem in root.iter():
        local_tag = elem.tag.split('}')[-1]
        if local_tag == 'Concepto':
            desc = elem.attrib.get('Descripcion') or elem.attrib.get('descripcion') or ""
            clave = elem.attrib.get('ClaveProdServ') or elem.attrib.get('claveProdServ')
            cant = elem.attrib.get('Cantidad') or elem.attrib.get('cantidad')
            val_unit = elem.attrib.get('ValorUnitario') or elem.attrib.get('valorUnitario')
            imp = elem.attrib.get('Importe') or elem.attrib.get('importe')
            conceptos.append({
                "descripcion": desc,
                "clave_prod_serv": clave,
                "cantidad": cant,
                "valor_unitario": val_unit,
                "importe": imp
            })
            if desc:
                concept_descriptions.append(desc)
        elif local_tag == 'Addenda':
            # Extraer textos y atributos relevantes de Addendas si existen
            for sub in elem.iter():
                for attr_val in sub.attrib.values():
                    if isinstance(attr_val, str) and len(attr_val) > 4:
                        concept_descriptions.append(attr_val)
                if sub.text and len(sub.text.strip()) > 4:
                    concept_descriptions.append(sub.text.strip())

    all_concepts_text = " | ".join(concept_descriptions)
    concept_dates = extract_dates_from_text(all_concepts_text)
    concept_summary = concept_descriptions[0] if concept_descriptions else None

    # VALIDACIONES DE REGLAS DE NEGOCIO (FISCALES Y DE CAJA CHICA)

    # Regla 1: Receptor RFC = CIC7309189G8
    if receptor_rfc.upper() != CICESE_RFC:
        errors.append(f"RFC del receptor no válido. Se esperaba '{CICESE_RFC}' (CICESE), se recibió '{receptor_rfc}'")

    # Regla 2: Receptor Régimen Fiscal = 603 (solo para versión 4.0)
    if version == '4.0':
        if receptor_regimen_fiscal != CICESE_REGIMEN:
            errors.append(f"Régimen fiscal del receptor no válido. Se esperaba '{CICESE_REGIMEN}' (Personas Morales con Fines no Lucrativos), se recibió '{receptor_regimen_fiscal}'")

    # Regla 3: Receptor CP = 22860 (solo para versión 4.0)
    if version == '4.0':
        if receptor_cp != CICESE_CP:
            errors.append(f"Código postal del receptor no válido. Se esperaba '{CICESE_CP}', se recibió '{receptor_cp}'")

    # Regla 4: Método de Pago = PUE (Pago en Una sola Exhibición)
    if metodo_pago != VALID_METODO_PAGO:
        errors.append(f"Método de pago no válido. Se requiere '{VALID_METODO_PAGO}' (Pago en Una sola Exhibición), se recibió '{metodo_pago}'")

    # Regla 5: Uso de CFDI = G03 (Gastos en General)
    if uso_cfdi != VALID_USO_CFDI:
        errors.append(f"Uso de CFDI no válido. Se requiere '{VALID_USO_CFDI}' (Gastos en general), se recibió '{uso_cfdi}'")

    # Regla 6: Forma de Pago = 01 (Efectivo), 03 (Transferencia), 04 (Tarjeta de Crédito) o 28 (Tarjeta de Débito)
    if forma_pago not in VALID_FORMAS_PAGO:
        errors.append(f"Forma de pago no permitida para el Fondo Fijo. Se requiere '01' (Efectivo), '03' (Transferencia), '04' (Tarjeta de Crédito) o '28' (Tarjeta de Débito), se recibió '{forma_pago}'")

    # Regla 7: Total <= $5,000.00 MXN
    if total > MAX_INVOICE_TOTAL:
        errors.append(f"El monto total de la factura (${total:.2f} MXN) sobrepasa el límite permitido de ${MAX_INVOICE_TOTAL:.2f} MXN")

    # Validar que no falte el UUID
    if not uuid:
        errors.append("La factura no contiene un UUID (Folio Fiscal) válido.")

    # Si hay algún error, no es válida
    is_valid = len(errors) == 0

    return {
        "uuid": uuid,
        "folio": folio,
        "serie": serie,
        "emisor_rfc": emisor_rfc,
        "emisor_nombre": emisor_nombre,
        "emisor_regimen_fiscal": emisor_regimen_fiscal,
        "receptor_rfc": receptor_rfc,
        "receptor_nombre": receptor_nombre,
        "receptor_regimen_fiscal": receptor_regimen_fiscal,
        "receptor_cp": receptor_cp,
        "subtotal": subtotal,
        "iva": iva,
        "total": total,
        "moneda": moneda,
        "metodo_pago": metodo_pago,
        "forma_pago": forma_pago,
        "uso_cfdi": uso_cfdi,
        "fecha_emision": fecha_emision,
        "fecha_timbrado": fecha_timbrado,
        "conceptos": conceptos,
        "concept_dates": concept_dates,
        "concept_summary": concept_summary,
        "is_valid": is_valid,
        "errors": errors
    }
