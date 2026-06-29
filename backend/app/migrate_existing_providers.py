"""
SIAE — Script para alimentar el catálogo de proveedores
a partir de las facturas existentes de Caja Chica y Solicitudes de Servicios.
"""

import os
import sys

from app.database import SessionLocal
from app.models.provider import Provider
from app.models.petty_cash_invoice import PettyCashInvoice
from app.models.service_request import ServiceRequest
from app.utils.xml_parser import parse_and_validate_cfdi

def migrate():
    db = SessionLocal()
    try:
        print("=== INICIANDO MIGRACIÓN DE PROVEEDORES DESDE HISTORIAL ===")
        
        # --- 1. Migrar desde Facturas de Caja Chica (Fondo Fijo) ---
        print("\n1. Procesando facturas de Fondo Fijo...")
        invoices = db.query(PettyCashInvoice).all()
        print(f"Total de facturas encontradas: {len(invoices)}")
        
        caja_chica_linked = 0
        providers_created = 0
        
        for inv in invoices:
            if not inv.emisor_rfc:
                continue
                
            rfc = inv.emisor_rfc.upper().strip()
            legal_name = inv.emisor_nombre.strip() if inv.emisor_nombre else "Proveedor de Caja Chica"
            
            # Buscar o crear proveedor
            provider = db.query(Provider).filter(Provider.rfc == rfc).first()
            if not provider:
                provider = Provider(
                    rfc=rfc,
                    legal_name=legal_name,
                    commercial_name=legal_name
                )
                db.add(provider)
                db.flush()  # Obtener ID
                providers_created += 1
                print(f" [+] Proveedor creado: {rfc} - {legal_name}")
            else:
                # Si ya existe, asegurar que el nombre legal esté lleno si estaba vacío
                if not provider.legal_name:
                    provider.legal_name = legal_name
                    db.flush()
            
            # Vincular a la factura
            if inv.provider_id != provider.id:
                inv.provider_id = provider.id
                caja_chica_linked += 1
                
        # --- 2. Migrar desde Solicitudes de Servicios con XML ---
        print("\n2. Procesando solicitudes de Servicios...")
        services = db.query(ServiceRequest).all()
        print(f"Total de solicitudes encontradas: {len(services)}")
        
        services_linked = 0
        
        for srv in services:
            # Si ya tiene provider_id, omitir
            if srv.provider_id:
                continue
                
            # Si tiene XML adjunto, intentar extraer el RFC del XML
            if srv.invoice_xml_file:
                xml_relative_path = srv.invoice_xml_file.lstrip('/')
                # Resolver ruta absoluta (las cargas se guardan en /app/uploads o en el volumen siae_uploads)
                # En compose: siae_uploads:/app/uploads
                # Por lo tanto, srv.invoice_xml_file ej. "/uploads/services/file.xml" está en "/app/uploads/services/file.xml"
                xml_path = os.path.join("/app", xml_relative_path)
                
                if os.path.exists(xml_path):
                    try:
                        with open(xml_path, "rb") as f:
                            xml_content = f.read()
                        
                        parsed = parse_and_validate_cfdi(xml_content)
                        if parsed.get("emisor_rfc") and parsed.get("emisor_nombre"):
                            rfc = parsed["emisor_rfc"].upper().strip()
                            legal_name = parsed["emisor_nombre"].strip()
                            
                            provider = db.query(Provider).filter(Provider.rfc == rfc).first()
                            if not provider:
                                provider = Provider(
                                    rfc=rfc,
                                    legal_name=legal_name,
                                    commercial_name=srv.provider_name or legal_name
                                )
                                db.add(provider)
                                db.flush()
                                providers_created += 1
                                print(f" [+] Proveedor creado desde XML de Servicio: {rfc} - {legal_name}")
                            
                            srv.provider_id = provider.id
                            services_linked += 1
                    except Exception as ex:
                        print(f" ⚠️ Error al leer XML de solicitud ID {srv.id}: {ex}")
                else:
                    print(f" ⚠️ XML no encontrado físicamente en: {xml_path}")
            
            # Si no tiene XML, pero tiene provider_name, buscar si algún proveedor ya tiene ese nombre como legal o comercial
            elif srv.provider_name:
                name_clean = srv.provider_name.strip()
                provider = db.query(Provider).filter(
                    (Provider.legal_name.ilike(name_clean)) | 
                    (Provider.commercial_name.ilike(name_clean))
                ).first()
                if provider:
                    srv.provider_id = provider.id
                    services_linked += 1
                    print(f" [~] Servicio ID {srv.id} vinculado difusamente a {provider.rfc} ({name_clean})")

        db.commit()
        print("\n=== MIGRACIÓN FINALIZADA CON ÉXITO ===")
        print(f" -> Proveedores creados: {providers_created}")
        print(f" -> Facturas de Caja Chica enlazadas: {caja_chica_linked}")
        print(f" -> Solicitudes de Servicios enlazadas: {services_linked}")
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ Ocurrió un error durante la migración: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    migrate()
