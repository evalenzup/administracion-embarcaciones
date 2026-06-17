"""
SIAE — Utility for querying the Mexican SAT CFDI Web Service.
Queries invoice status using the official SOAP endpoint with zero external dependencies.
"""

import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime


def query_sat_cfdi_status(emisor_rfc: str, receptor_rfc: str, total: float, uuid_str: str) -> dict:
    """
    Queries the official SAT SOAP Web Service to get the current status of a CFDI.
    
    Returns a dictionary with the SAT response:
    {
        "status": "Vigente" | "Cancelado" | "No Encontrado" | "Error de Conexión" | "Desconocido",
        "efos_status": str | None,
        "codigo_estatus": str | None,
        "es_cancelable": str | None,
        "estatus_cancelacion": str | None
    }
    """
    url = "https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc"
    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "http://tempuri.org/IConsultaCFDIService/Consulta"
    }

    # Format total: must be 18 positions total (including dot and 6 decimal places).
    # Format specification: 11 integers, dot, 6 decimals.
    total_formatted = f"{total:018.6f}"

    # Build QR Query string/expression
    expression = f"?re={emisor_rfc}&rr={receptor_rfc}&tt={total_formatted}&id={uuid_str}"

    # Build SOAP envelope
    soap_envelope = f"""<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
   <soapenv:Header/>
   <soapenv:Body>
      <tem:Consulta>
         <tem:expresionImpresa><![CDATA[{expression}]]></tem:expresionImpresa>
      </tem:Consulta>
   </soapenv:Body>
</soapenv:Envelope>"""

    default_result = {
        "status": "Desconocido",
        "efos_status": None,
        "codigo_estatus": None,
        "es_cancelable": None,
        "estatus_cancelacion": None
    }

    try:
        req = urllib.request.Request(
            url, 
            data=soap_envelope.encode("utf-8"), 
            headers=headers, 
            method="POST"
        )
        
        # Connect to SAT WS with a timeout of 8 seconds
        with urllib.request.urlopen(req, timeout=8) as response:
            if response.status != 200:
                default_result["status"] = f"HTTP Error {response.status}"
                return default_result
                
            xml_content = response.read()
            
        # Parse XML response
        root = ET.fromstring(xml_content)
        
        # Find ConsultaResult node recursively
        result_elem = None
        for elem in root.iter():
            local_name = elem.tag.split("}")[-1]
            if local_name == "ConsultaResult":
                result_elem = elem
                break
                
        if result_elem is not None:
            codigo_estatus = None
            estado = None
            es_cancelable = None
            estatus_cancelacion = None
            validacion_efos = None
            
            for child in result_elem:
                child_name = child.tag.split("}")[-1]
                val = child.text
                if child_name == "CodigoEstatus":
                    codigo_estatus = val
                elif child_name == "Estado":
                    estado = val
                elif child_name == "EsCancelable":
                    es_cancelable = val
                elif child_name == "EstatusCancelacion":
                    estatus_cancelacion = val
                elif child_name == "ValidacionEFOS":
                    validacion_efos = val
            
            default_result["codigo_estatus"] = codigo_estatus
            default_result["es_cancelable"] = es_cancelable
            default_result["estatus_cancelacion"] = estatus_cancelacion
            default_result["efos_status"] = validacion_efos
            
            # Map SAT responses to standard statuses
            if codigo_estatus and "N - 602" in codigo_estatus:
                default_result["status"] = "No Encontrado"
            elif codigo_estatus and "N - 601" in codigo_estatus:
                default_result["status"] = "Expresión no válida"
            elif estado:
                default_result["status"] = estado  # e.g., "Vigente" or "Cancelado"
            else:
                default_result["status"] = "Desconocido"
                
            return default_result
            
        return default_result
        
    except Exception as e:
        default_result["status"] = "Error de Conexión"
        # Optional: log error details if needed
        return default_result
