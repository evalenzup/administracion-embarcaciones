import os
import re
from pypdf import PdfReader

DOCS_DIR = "/Users/ernesto/Documents/CICESE/DEO/Desarrollo/administracion-embarcaciones/documentacion"
REQ_PDF = os.path.join(DOCS_DIR, "ReporteGastoReservaDeComprobar.pdf")
LIQ_PDF = os.path.join(DOCS_DIR, "ReporteLiquidacionGastoReservaDeComprobar.pdf")

def parse_pdf(path):
    if not os.path.exists(path):
        return ""
    reader = PdfReader(path)
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"
    return text

def extract_metadata_request(text):
    metadata = {}
    
    # 1. Folio Solicitud
    folio_match = re.search(r"Solicitud de Gasto a Reserva de Comprobar Número:\s*(\d+)", text)
    if folio_match:
        metadata["folio_episa"] = folio_match.group(1)
        
    # 2. Cuenta
    cuenta_match = re.search(r"CUENTA#\s*(\d+)", text)
    if cuenta_match:
        metadata["cuenta"] = cuenta_match.group(1)
        
    # 3. Fecha Solicitud
    fecha_match = re.search(r"FECHA\s*(\d{4}-\d{2}-\d{2})", text)
    if fecha_match:
        metadata["fecha_solicitud"] = fecha_match.group(1)
        
    # 4. Fecha Pago Servicio
    fecha_pago_match = re.search(r"FECHA DEL PAGO DEL SERVICIO\s*/?\s*(\d{2}-[A-Z]{3}-\d{4})", text)
    if fecha_pago_match:
        metadata["fecha_pago_servicio"] = fecha_pago_match.group(1)
        
    # 5. Justificación
    just_match = re.search(r"JUSTIFICACION:\s*(.*?)\s*(?:OBSERVACIONES:|Concepto|Partida|$)", text, re.DOTALL)
    if just_match:
        metadata["justificacion"] = just_match.group(1).replace("\n", " ").strip()
        
    # 6. Observaciones
    obs_match = re.search(r"OBSERVACIONES:\s*(.*?)\s*(?:Concepto|Partida|Total|$)", text, re.DOTALL)
    if obs_match:
        metadata["observaciones"] = obs_match.group(1).replace("\n", " ").strip()
        
    # 7. Monto Total
    monto_match = re.search(r"Total:\s*\$\s*([\d,]+\.\d{2})", text)
    if monto_match:
        metadata["monto_total"] = float(monto_match.group(1).replace(",", ""))
        
    return metadata

def extract_metadata_liquidation(text):
    metadata = {}
    
    # 1. Folio Liquidacion
    folio_match = re.search(r"Liquidación de Gasto a Reserva de Comprobar(?:\s+Núm\.)?\s*(\d+)", text)
    if folio_match:
        metadata["folio_liquidacion"] = folio_match.group(1)
        
    # 2. Folio Original GARC
    garc_match = re.search(r"FOLIO:\s*(\d+)", text)
    if garc_match:
        metadata["folio_garc"] = garc_match.group(1)
        
    # 3. Cuenta
    cuenta_match = re.search(r"CUENTA:\s*(\d+)", text)
    if cuenta_match:
        metadata["cuenta"] = cuenta_match.group(1)
        
    # 4. Cheque
    cheque_match = re.search(r"CHEQUE\s*(\d+)", text)
    if cheque_match:
        metadata["cheque"] = cheque_match.group(1)
        
    # 5. Cuenta de Banco
    banco_match = re.search(r"CUENTA BANCO:\s*([\d\.]+)", text)
    if banco_match:
        metadata["cuenta_banco"] = banco_match.group(1)
        
    # 6. Monto Comprobado y Recibido
    # En la tabla de resumen: Recibido Comprobado Devolucion
    # 39202 $ 11,372.00 $ 11,372.00 $ 0.00
    resumen_match = re.search(r"Resumen de importes.*?Concepto.*?(\d+)\s*\$\s*([\d,]+\.\d{2})\s*\$\s*([\d,]+\.\d{2})\s*\$\s*([\d,]+\.\d{2})", text, re.DOTALL)
    if resumen_match:
        metadata["recibido"] = float(resumen_match.group(2).replace(",", ""))
        metadata["comprobado"] = float(resumen_match.group(3).replace(",", ""))
        metadata["devolucion"] = float(resumen_match.group(4).replace(",", ""))
        
    return metadata

req_text = parse_pdf(REQ_PDF)
print("=== REQUEST METADATA ===")
import json
print(json.dumps(extract_metadata_request(req_text), indent=2, ensure_ascii=False))

liq_text = parse_pdf(LIQ_PDF)
print("\n=== LIQUIDATION METADATA ===")
print(json.dumps(extract_metadata_liquidation(liq_text), indent=2, ensure_ascii=False))
