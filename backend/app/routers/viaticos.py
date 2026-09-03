"""
SIAE — Router de Finanzas: Viáticos (Comisiones de Viaje).
Implementa las APIs para el control de comisiones de viaje, montos asignados y comprobaciones fiscales de facturas.
"""

import os
from datetime import datetime, date
from io import BytesIO
from pypdf import PdfReader
import re
import unicodedata


from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status, Body, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.dependencies import get_db, require_permission, get_current_user
from app.models.user import User
from app.models.financial_category import FinancialCategory
from app.models.project import Project
from app.models.account import Account
from app.models.viatico import Viatico, ViaticoFactura
from app.services.audit import log_action
from app.schemas.viatico import (
    ViaticoCreate,
    ViaticoUpdate,
    ViaticoResponse,
    ViaticoList,
    ViaticoFacturaResponse,
    ViaticoStatsResponse
)
from app.utils.xml_parser import parse_and_validate_cfdi
from app.utils.viatico_pdf_parser import parse_viaticos_pdf, parse_viaticos_comprobacion_pdf
from app.utils.sat_validator import query_sat_cfdi_status

router = APIRouter(prefix="/api/v1/viaticos", tags=["Finanzas — Viáticos"])


def clean_text(text: str) -> str:
    if not text:
        return ""
    text = unicodedata.normalize('NFKD', text)
    text = "".join([c for c in text if not unicodedata.combining(c)])
    return " ".join(text.lower().split())


def find_matching_personnel(db_session, target_name: str):
    if not target_name:
        return None
    from app.models.personnel import Personnel
    clean_target = clean_text(target_name)
    all_personnel = db_session.query(Personnel).all()
    # 2. Substring cleaned match (either target contains DB name or vice-versa)
    for p in all_personnel:
        p_full_name = f"{p.first_name} {p.last_name}"
        cleaned_p = clean_text(p_full_name)
        if cleaned_p in cleaned_target or cleaned_target in cleaned_p:
            return p
            
    # 3. Word matching (at least 2 words match)
    target_parts = cleaned_target.split()
    if len(target_parts) >= 2:
        for p in all_personnel:
            cleaned_p = clean_text(f"{p.first_name} {p.last_name}")
            p_parts = cleaned_p.split()
            matched_parts = sum(1 for part in target_parts if part in p_parts)
            if matched_parts >= 2:
                return p
                
    return None


# Directorios de carga
UPLOADS_DIR = "uploads/viaticos"
PDF_DIR = os.path.join(UPLOADS_DIR, "pdf")
XML_DIR = os.path.join(UPLOADS_DIR, "xml")
SOLICITUDES_DIR = os.path.join(UPLOADS_DIR, "solicitudes")
COMPROBACIONES_DIR = os.path.join(UPLOADS_DIR, "comprobaciones")
REPORTES_DIR = os.path.join(UPLOADS_DIR, "reportes")
DEVOLUCIONES_DIR = os.path.join(UPLOADS_DIR, "devoluciones")


@router.get("", response_model=ViaticoList)
async def list_viaticos(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: str = Query(None),
    project_id: int = Query(None),
    folio_comision: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Listar comisiones de viáticos con paginación y filtros. Soporta autoservicio para usuarios."""
    has_global_view = current_user.has_permission("viaticos", "view")
    
    query = db.query(Viatico)
    
    # Si el usuario no tiene permisos globales, filtrar solo sus propios registros o donde es asistente
    if not has_global_view:
        from app.models.personnel import Personnel
        query = query.outerjoin(Personnel, Viatico.personal_id == Personnel.id).filter(
            or_(
                Personnel.user_id == current_user.id,
                Viatico.asistente_id == current_user.id
            )
        )

    if status:
        query = query.filter(Viatico.status == status)
    if project_id:
        query = query.filter(Viatico.project_id == project_id)
    if folio_comision:
        query = query.filter(Viatico.folio_comision.ilike(f"%{folio_comision}%"))

    total = query.count()
    items = query.order_by(Viatico.created_at.desc()).offset(skip).limit(limit).all()
    
    # Populate bot/helper properties
    for viatico in items:
        viatico.is_mine = (viatico.personal and viatico.personal.user_id == current_user.id)
        viatico.is_asistente = (viatico.asistente_id == current_user.id)
        
    return {"total": total, "items": items}


@router.get("/stats", response_model=ViaticoStatsResponse)
async def get_viatico_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("viaticos", "view")),
):
    """Obtener estadísticas de viáticos por estado (solo administración)."""
    total_count = db.query(Viatico).count()
    status_counts = db.query(Viatico.status, func.count(Viatico.id)).group_by(Viatico.status).all()
    by_status = {status_str: count for status_str, count in status_counts}
    
    return {
        "total_count": total_count,
        "by_status": by_status
    }


@router.post("", response_model=ViaticoResponse, status_code=201)
async def create_viatico(
    data: ViaticoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("viaticos", "create")),
):
    """Crear una nueva comisión de viáticos (Administración)."""
    # Verificar folio duplicado
    existing = db.query(Viatico).filter(Viatico.folio_comision == data.folio_comision).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"El folio de comisión '{data.folio_comision}' ya está registrado en el sistema."
        )

    # Validar que proyecto y cuenta existan
    if data.project_id:
        proj = db.query(Project).filter(Project.id == data.project_id).first()
        if not proj:
            raise HTTPException(status_code=400, detail="El proyecto especificado no existe.")
        
    if data.account_id:
        acc = db.query(Account).filter(Account.id == data.account_id).first()
        if not acc:
            raise HTTPException(status_code=400, detail="La cuenta financiera especificada no existe.")

    db_viatico = Viatico(
        folio_comision=data.folio_comision,
        personal_id=data.personal_id,
        fecha_solicitud=data.fecha_solicitud if data.fecha_solicitud is not None else func.current_date(),
        fecha_inicio=data.fecha_inicio,
        fecha_fin=data.fecha_fin,
        destino=data.destino,
        justificacion=data.justificacion,
        observaciones=data.observaciones,
        monto_solicitado=data.monto_solicitado,
        monto_viaticos=data.monto_viaticos,
        monto_pasaje_aereo=data.monto_pasaje_aereo,
        monto_hospedaje_paquete=data.monto_hospedaje_paquete,
        monto_arrendamiento_vehiculos=data.monto_arrendamiento_vehiculos,
        monto_pasaje_terrestre=data.monto_pasaje_terrestre,
        monto_gasolina=data.monto_gasolina,
        account_id=data.account_id,
        project_id=data.project_id,
        project_name=data.project_name,
        asistente_id=data.asistente_id,
        solicitud_pdf_path=data.solicitud_pdf_path,
        
        # Firmas
        firma_solicitante_nombre=data.firma_solicitante_nombre,
        firma_solicitante_fecha=data.firma_solicitante_fecha,
        firma_solicitante_hash=data.firma_solicitante_hash,
        firma_jefe_nombre=data.firma_jefe_nombre,
        firma_jefe_fecha=data.firma_jefe_fecha,
        firma_jefe_hash=data.firma_jefe_hash,
        firma_revisor_nombre=data.firma_revisor_nombre,
        firma_revisor_fecha=data.firma_revisor_fecha,
        firma_revisor_hash=data.firma_revisor_hash,
        firma_tesoreria_nombre=data.firma_tesoreria_nombre,
        firma_tesoreria_fecha=data.firma_tesoreria_fecha,
        firma_tesoreria_hash=data.firma_tesoreria_hash,
        firma_responsable_nombre=data.firma_responsable_nombre,
        firma_responsable_fecha=data.firma_responsable_fecha,
        firma_responsable_hash=data.firma_responsable_hash
    )
    
    db.add(db_viatico)
    db.commit()
    db.refresh(db_viatico)

    # Log de auditoría
    try:
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="create",
            module="viaticos",
            entity_type="Viatico",
            entity_id=db_viatico.id,
            description=f"Creó comisión de viáticos Folio {db_viatico.folio_comision} ({db_viatico.comisionado_nombre}) por ${db_viatico.monto_solicitado:,.2f} MXN",
            details={"folio": db_viatico.folio_comision, "comisionado": db_viatico.comisionado_nombre, "monto_solicitado": db_viatico.monto_solicitado}
        )
    except Exception:
        pass

    return db_viatico


@router.get("/{id}", response_model=ViaticoResponse)
async def get_viatico(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Obtener detalle de un viático. Los usuarios regulares solo pueden ver el suyo."""
    viatico = db.query(Viatico).filter(Viatico.id == id).first()
    if not viatico:
        raise HTTPException(status_code=404, detail="Comisión de viático no encontrada")
    
    # Validar permisos
    has_global_view = current_user.has_permission("viaticos", "view")
    if not has_global_view and (not viatico.personal or viatico.personal.user_id != current_user.id) and viatico.asistente_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para ver esta comisión de viáticos"
        )
        
    viatico.is_mine = (viatico.personal and viatico.personal.user_id == current_user.id)
    viatico.is_asistente = (viatico.asistente_id == current_user.id)
    return viatico


@router.get("/{id}/invoices/zip")
async def download_viatico_invoices_zip(
    id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Descargar bundle contable en ZIP de un viático (Excel con fórmulas dinámicas + facturas renombradas 01_... + anexos)."""
    from fastapi.responses import StreamingResponse
    from app.utils.invoice_bundle import create_invoices_zip_bundle

    viatico = db.query(Viatico).filter(Viatico.id == id).first()
    if not viatico:
        raise HTTPException(status_code=404, detail="Comisión de viáticos no encontrada")

    # Validar permisos de acceso (mismo que get_viatico)
    has_global_view = current_user.has_permission("viaticos", "view")
    if not has_global_view and (not viatico.personal or viatico.personal.user_id != current_user.id) and viatico.asistente_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para ver esta comisión de viáticos"
        )

    if not viatico.facturas:
        raise HTTPException(status_code=400, detail="Esta comisión de viáticos no tiene facturas registradas.")

    extra_files = []
    if getattr(viatico, "solicitud_pdf_path", None):
        extra_files.append((
            viatico.solicitud_pdf_path,
            f"Extras/{os.path.basename(viatico.solicitud_pdf_path)}"
        ))
    if getattr(viatico, "comprobacion_pdf_path", None):
        extra_files.append((
            viatico.comprobacion_pdf_path,
            f"Extras/{os.path.basename(viatico.comprobacion_pdf_path)}"
        ))
    if getattr(viatico, "reporte_pdf_path", None):
        extra_files.append((
            viatico.reporte_pdf_path,
            f"Extras/{os.path.basename(viatico.reporte_pdf_path)}"
        ))
    if getattr(viatico, "comprobante_devolucion_path", None):
        extra_files.append((
            viatico.comprobante_devolucion_path,
            f"Devoluciones/{os.path.basename(viatico.comprobante_devolucion_path)}"
        ))

    zip_buffer = create_invoices_zip_bundle(
        folio=viatico.folio_comision,
        facturas=viatico.facturas,
        tramite_type="viatico",
        extra_files=extra_files
    )

    # Log de auditoría
    try:
        is_telegram = bool(request.headers.get("x-bot-token") or request.headers.get("x-impersonate-telegram-id"))
        source_str = "Telegram Bot" if is_telegram else "Plataforma Web"
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="download",
            module="telegram_bot" if is_telegram else "viaticos",
            entity_type="Viatico",
            entity_id=viatico.id,
            description=f"Descargó bundle ZIP con Excel de comprobación del Viático Folio {viatico.folio_comision} ({source_str})",
            details={"source": "telegram_bot" if is_telegram else "web", "folio": viatico.folio_comision, "facturas_count": len(viatico.facturas)}
        )
    except Exception:
        pass
    
    filename = f"viatico_{viatico.folio_comision}_bundle.zip"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/{id}/invoices/excel")
async def download_viatico_invoices_excel(
    id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Descargar exclusivamente el archivo Excel (.xlsx) de comprobación de facturas con fórmulas."""
    import io
    from fastapi.responses import StreamingResponse
    from app.utils.invoice_bundle import build_comprobacion_excel

    viatico = db.query(Viatico).filter(Viatico.id == id).first()
    if not viatico:
        raise HTTPException(status_code=404, detail="Comisión de viáticos no encontrada")

    # Validar permisos de acceso
    has_global_view = current_user.has_permission("viaticos", "view")
    if not has_global_view and (not viatico.personal or viatico.personal.user_id != current_user.id) and viatico.asistente_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para ver esta comisión de viáticos"
        )

    if not viatico.facturas:
        raise HTTPException(status_code=400, detail="Esta comisión de viáticos no tiene facturas registradas.")

    facturas_sorted = sorted(
        viatico.facturas,
        key=lambda x: (x.fecha_emision or datetime.min)
    )

    excel_bytes = build_comprobacion_excel(
        folio_tramite=viatico.folio_comision,
        facturas_sorted=facturas_sorted,
        tramite_type="viatico"
    )

    try:
        is_telegram = bool(request.headers.get("x-bot-token") or request.headers.get("x-impersonate-telegram-id"))
        source_str = "Telegram Bot" if is_telegram else "Plataforma Web"
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="download",
            module="telegram_bot" if is_telegram else "viaticos",
            entity_type="Viatico",
            entity_id=viatico.id,
            description=f"Descargó reporte Excel de comprobación del Viático Folio {viatico.folio_comision} ({source_str})",
            details={"source": "telegram_bot" if is_telegram else "web", "folio": viatico.folio_comision, "facturas_count": len(viatico.facturas)}
        )
    except Exception:
        pass

    filename = f"comprobacion_viatico_{viatico.folio_comision}.xlsx"
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.put("/{id}", response_model=ViaticoResponse)
async def update_viatico(
    id: int,
    data: ViaticoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("viaticos", "edit")),
):
    """Actualizar datos o estado de un viático (Administración)."""
    viatico = db.query(Viatico).filter(Viatico.id == id).first()
    if not viatico:
        raise HTTPException(status_code=404, detail="Comisión de viático no encontrada")
    
    update_data = data.model_dump(exclude_unset=True)
    
    for key, val in update_data.items():
        setattr(viatico, key, val)
        
    db.commit()
    db.refresh(viatico)

    # Log de auditoría
    try:
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="update",
            module="viaticos",
            entity_type="Viatico",
            entity_id=viatico.id,
            description=f"Actualizó comisión de viáticos Folio {viatico.folio_comision}",
            details={"folio": viatico.folio_comision, "status": viatico.status}
        )
    except Exception:
        pass

    return viatico


@router.delete("/{id}")
async def delete_viatico(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("viaticos", "delete")),
):
    """Eliminar viático (Administración)."""
    viatico = db.query(Viatico).filter(Viatico.id == id).first()
    if not viatico:
        raise HTTPException(status_code=404, detail="Comisión de viático no encontrada")
        
    folio_deleted = viatico.folio_comision
    db.delete(viatico)
    db.commit()

    # Log de auditoría
    try:
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="delete",
            module="viaticos",
            entity_type="Viatico",
            entity_id=id,
            description=f"Eliminó comisión de viáticos Folio {folio_deleted}",
            details={"folio": folio_deleted}
        )
    except Exception:
        pass

    return {"message": "Comisión de viáticos eliminada con éxito"}


@router.post("/parse-pdf")
async def parse_pdf_route(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("viaticos", "create")),
):
    """Parsear un PDF de solicitud de recursos y extraer sus campos y firmas."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF válido.")
    
    pdf_bytes = await file.read()
    try:
        parsed_data = parse_viaticos_pdf(pdf_bytes)
        
        # Guardar archivo PDF definitivo en solicitudes
        os.makedirs(SOLICITUDES_DIR, exist_ok=True)
        filename = f"solicitud_parsed_{int(datetime.timestamp(datetime.now()))}.pdf"
        pdf_path = os.path.join(SOLICITUDES_DIR, filename)
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)
            
        parsed_data["solicitud_pdf_path"] = f"/uploads/viaticos/solicitudes/{filename}"
        
        # Buscar el personal_id por nombre en la base de datos para intentar asociarlo automáticamente
        if parsed_data.get("solicitante_name"):
            person = find_matching_personnel(db, parsed_data["solicitante_name"])
            if person:
                parsed_data["personal_id"] = person.id
            else:
                parsed_data["personal_id"] = None

        # Buscar el account_id por número de cuenta en la base de datos
        if parsed_data.get("account_number"):
            acc_num = parsed_data["account_number"]
            account = db.query(Account).filter(Account.account_number == acc_num).first()
            if account:
                parsed_data["account_id"] = account.id
            else:
                parsed_data["account_id"] = None
                
        return parsed_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al analizar el PDF de solicitud: {str(e)}")


@router.post("/{id}/replace-pdf", response_model=ViaticoResponse)
async def replace_pdf_route(
    id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("viaticos", "edit")),
):
    """Reemplazar/Actualizar el PDF de solicitud de un viático existente y actualizar sus datos y firmas."""
    viatico = db.query(Viatico).filter(Viatico.id == id).first()
    if not viatico:
        raise HTTPException(status_code=404, detail="Comisión de viático no encontrada")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF válido.")

    pdf_bytes = await file.read()
    try:
        parsed_data = parse_viaticos_pdf(pdf_bytes)
        
        # Guardar archivo PDF definitivo en disco
        os.makedirs(SOLICITUDES_DIR, exist_ok=True)
        filename = f"solicitud_{viatico.id}_{int(datetime.timestamp(datetime.now()))}.pdf"
        pdf_path = os.path.join(SOLICITUDES_DIR, filename)
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)

        # Actualizar datos del viático
        viatico.solicitud_pdf_path = f"/uploads/viaticos/solicitudes/{filename}"
        
        if parsed_data.get("solicitante_name"):
            person = find_matching_personnel(db, parsed_data["solicitante_name"])
            if person:
                viatico.personal_id = person.id
        
        if parsed_data.get("account_number"):
            acc_num = parsed_data["account_number"]
            account = db.query(Account).filter(Account.account_number == acc_num).first()
            if account:
                viatico.account_id = account.id

        if parsed_data.get("fecha_solicitud"):
            viatico.fecha_solicitud = date.fromisoformat(parsed_data["fecha_solicitud"])
        
        if parsed_data.get("folio_comision"):
            viatico.folio_comision = parsed_data["folio_comision"]
        if parsed_data.get("fecha_inicio"):
            viatico.fecha_inicio = date.fromisoformat(parsed_data["fecha_inicio"])
        if parsed_data.get("fecha_fin"):
            viatico.fecha_fin = date.fromisoformat(parsed_data["fecha_fin"])
        if parsed_data.get("destino"):
            viatico.destino = parsed_data["destino"]
        if parsed_data.get("monto_solicitado"):
            viatico.monto_solicitado = parsed_data["monto_solicitado"]
        if "monto_viaticos" in parsed_data:
            viatico.monto_viaticos = parsed_data["monto_viaticos"]
        if "monto_pasaje_aereo" in parsed_data:
            viatico.monto_pasaje_aereo = parsed_data["monto_pasaje_aereo"]
        if "monto_hospedaje_paquete" in parsed_data:
            viatico.monto_hospedaje_paquete = parsed_data["monto_hospedaje_paquete"]
        if "monto_arrendamiento_vehiculos" in parsed_data:
            viatico.monto_arrendamiento_vehiculos = parsed_data["monto_arrendamiento_vehiculos"]
        if "monto_pasaje_terrestre" in parsed_data:
            viatico.monto_pasaje_terrestre = parsed_data["monto_pasaje_terrestre"]
        if "monto_gasolina" in parsed_data:
            viatico.monto_gasolina = parsed_data["monto_gasolina"]
        if parsed_data.get("justificacion"):
            viatico.justificacion = parsed_data["justificacion"]

        # Actualizar firmas
        viatico.firma_solicitante_nombre = parsed_data.get("firma_solicitante_nombre")
        viatico.firma_solicitante_fecha = datetime.fromisoformat(parsed_data["firma_solicitante_fecha"]) if parsed_data.get("firma_solicitante_fecha") else None
        viatico.firma_solicitante_hash = parsed_data.get("firma_solicitante_hash")

        viatico.firma_jefe_nombre = parsed_data.get("firma_jefe_nombre")
        viatico.firma_jefe_fecha = datetime.fromisoformat(parsed_data["firma_jefe_fecha"]) if parsed_data.get("firma_jefe_fecha") else None
        viatico.firma_jefe_hash = parsed_data.get("firma_jefe_hash")

        viatico.firma_revisor_nombre = parsed_data.get("firma_revisor_nombre")
        viatico.firma_revisor_fecha = datetime.fromisoformat(parsed_data["firma_revisor_fecha"]) if parsed_data.get("firma_revisor_fecha") else None
        viatico.firma_revisor_hash = parsed_data.get("firma_revisor_hash")

        viatico.firma_tesoreria_nombre = parsed_data.get("firma_tesoreria_nombre")
        viatico.firma_tesoreria_fecha = datetime.fromisoformat(parsed_data["firma_tesoreria_fecha"]) if parsed_data.get("firma_tesoreria_fecha") else None
        viatico.firma_tesoreria_hash = parsed_data.get("firma_tesoreria_hash")
        
        viatico.firma_responsable_nombre = parsed_data.get("firma_responsable_nombre")
        viatico.firma_responsable_fecha = datetime.fromisoformat(parsed_data["firma_responsable_fecha"]) if parsed_data.get("firma_responsable_fecha") else None
        viatico.firma_responsable_hash = parsed_data.get("firma_responsable_hash")

        # Recalcular saldos
        total_solicitado = viatico.monto_solicitado or 0.0
        total_comprobado = viatico.monto_comprobado or 0.0
        total_devuelto = viatico.monto_devuelto or 0.0
        diferencia = total_solicitado - total_comprobado - total_devuelto
        if diferencia < 0:
            viatico.monto_saldo_favor = abs(diferencia)
        else:
            viatico.monto_saldo_favor = 0.0

        db.commit()
        db.refresh(viatico)
        return viatico
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al reemplazar PDF y actualizar: {str(e)}")


@router.post("/{id}/upload-comprobacion-pdf", response_model=ViaticoResponse)
async def upload_comprobacion_pdf_route(
    id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Subir el PDF de comprobación oficial de EPISA y extraer firmas de seguimiento y montos liquidados."""
    viatico = db.query(Viatico).filter(Viatico.id == id).first()
    if not viatico:
        raise HTTPException(status_code=404, detail="Comisión de viáticos no encontrada")

    has_global_edit = current_user.has_permission("viaticos", "edit")
    if not has_global_edit and (not viatico.personal or viatico.personal.user_id != current_user.id) and viatico.asistente_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para actualizar esta comisión de viáticos"
        )

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF válido.")

    pdf_bytes = await file.read()
    try:
        parsed_data = parse_viaticos_comprobacion_pdf(pdf_bytes)

        os.makedirs(COMPROBACIONES_DIR, exist_ok=True)
        filename = f"comprobacion_{viatico.folio_comision}_{int(datetime.timestamp(datetime.now()))}.pdf"
        pdf_path = os.path.join(COMPROBACIONES_DIR, filename)
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)

        viatico.comprobacion_pdf_path = f"/uploads/viaticos/comprobaciones/{filename}"

        # Actualizar firmas de comprobación
        viatico.firma_comp_solicitante_nombre = parsed_data.get("firma_comp_solicitante_nombre")
        viatico.firma_comp_solicitante_fecha = datetime.fromisoformat(parsed_data["firma_comp_solicitante_fecha"]) if parsed_data.get("firma_comp_solicitante_fecha") else None
        viatico.firma_comp_solicitante_hash = parsed_data.get("firma_comp_solicitante_hash")

        viatico.firma_comp_revisor_nombre = parsed_data.get("firma_comp_revisor_nombre")
        viatico.firma_comp_revisor_fecha = datetime.fromisoformat(parsed_data["firma_comp_revisor_fecha"]) if parsed_data.get("firma_comp_revisor_fecha") else None
        viatico.firma_comp_revisor_hash = parsed_data.get("firma_comp_revisor_hash")

        viatico.firma_comp_tesoreria_nombre = parsed_data.get("firma_comp_tesoreria_nombre")
        viatico.firma_comp_tesoreria_fecha = datetime.fromisoformat(parsed_data["firma_comp_tesoreria_fecha"]) if parsed_data.get("firma_comp_tesoreria_fecha") else None
        viatico.firma_comp_tesoreria_hash = parsed_data.get("firma_comp_tesoreria_hash")

        viatico.firma_comp_contabilidad_nombre = parsed_data.get("firma_comp_contabilidad_nombre")
        viatico.firma_comp_contabilidad_fecha = datetime.fromisoformat(parsed_data["firma_comp_contabilidad_fecha"]) if parsed_data.get("firma_comp_contabilidad_fecha") else None
        viatico.firma_comp_contabilidad_hash = parsed_data.get("firma_comp_contabilidad_hash")

        # Actualizar montos si vienen en el resumen oficial
        if parsed_data.get("monto_devuelto") is not None and parsed_data["monto_devuelto"] > 0:
            viatico.monto_devuelto = parsed_data["monto_devuelto"]
        if parsed_data.get("monto_saldo_favor") is not None:
            viatico.monto_saldo_favor = parsed_data["monto_saldo_favor"]

        # Si el comprobado extraído es mayor a 0 y no hay facturas o se desea sincronizar
        if parsed_data.get("monto_comprobado") is not None and parsed_data["monto_comprobado"] > 0 and (viatico.monto_comprobado or 0) == 0:
            viatico.monto_comprobado = parsed_data["monto_comprobado"]

        # Actualizar estado si ya fue firmado o devuelto
        if viatico.firma_comp_contabilidad_fecha:
            viatico.status = "comprobado"
        elif (viatico.monto_devuelto or 0) > 0 and not viatico.comprobante_devolucion_path:
            viatico.status = "comprobacion_pendiente"

        # Recalcular saldos
        total_solicitado = viatico.monto_solicitado or 0.0
        total_comprobado = viatico.monto_comprobado or 0.0
        total_devuelto = viatico.monto_devuelto or 0.0
        diferencia = total_solicitado - total_comprobado - total_devuelto
        if diferencia < 0:
            viatico.monto_saldo_favor = abs(diferencia)

        db.commit()
        db.refresh(viatico)

        try:
            log_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action="upload_pdf",
                module="viaticos",
                entity_type="Viatico",
                entity_id=viatico.id,
                description=f"Cargó comprobación EPISA PDF para la comisión {viatico.folio_comision}",
            )
        except Exception:
            pass

        return viatico
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al procesar el PDF de comprobación: {str(e)}")


@router.post("/{id}/upload-reporte-pdf", response_model=ViaticoResponse)
async def upload_reporte_pdf_route(
    id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Subir el Reporte / Informe de Actividades de la comisión en PDF."""
    viatico = db.query(Viatico).filter(Viatico.id == id).first()
    if not viatico:
        raise HTTPException(status_code=404, detail="Comisión de viáticos no encontrada")

    has_global_edit = current_user.has_permission("viaticos", "edit")
    if not has_global_edit and (not viatico.personal or viatico.personal.user_id != current_user.id) and viatico.asistente_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para actualizar esta comisión de viáticos"
        )

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF válido.")

    pdf_bytes = await file.read()
    try:
        os.makedirs(REPORTES_DIR, exist_ok=True)
        filename = f"reporte_actividades_{viatico.folio_comision}_{int(datetime.timestamp(datetime.now()))}.pdf"
        pdf_path = os.path.join(REPORTES_DIR, filename)
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)

        viatico.reporte_pdf_path = f"/uploads/viaticos/reportes/{filename}"
        db.commit()
        db.refresh(viatico)

        try:
            log_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action="upload_reporte",
                module="viaticos",
                entity_type="Viatico",
                entity_id=viatico.id,
                description=f"Cargó reporte de actividades de comisión Folio {viatico.folio_comision}",
            )
        except Exception:
            pass

        return viatico
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar reporte de actividades: {str(e)}")


@router.post("/{id}/upload-return-receipt", response_model=ViaticoResponse)
async def upload_return_receipt_route(
    id: int,
    file: UploadFile = File(...),
    monto_devuelto: float = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Subir el comprobante de devolución de remanente (PDF o imagen) y registrar monto devuelto."""
    viatico = db.query(Viatico).filter(Viatico.id == id).first()
    if not viatico:
        raise HTTPException(status_code=404, detail="Comisión de viáticos no encontrada")

    has_global_edit = current_user.has_permission("viaticos", "edit")
    if not has_global_edit and (not viatico.personal or viatico.personal.user_id != current_user.id) and viatico.asistente_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para registrar devolución en esta comisión"
        )

    filename_lower = file.filename.lower()
    if not (filename_lower.endswith(".pdf") or filename_lower.endswith(".jpg") or filename_lower.endswith(".jpeg") or filename_lower.endswith(".png")):
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF o una imagen (JPG, PNG)")

    file_bytes = await file.read()
    try:
        os.makedirs(DEVOLUCIONES_DIR, exist_ok=True)
        ext = os.path.splitext(file.filename)[1]
        new_filename = f"devolucion_{viatico.folio_comision}_{int(datetime.timestamp(datetime.now()))}{ext}"
        pdf_path = os.path.join(DEVOLUCIONES_DIR, new_filename)
        with open(pdf_path, "wb") as f:
            f.write(file_bytes)

        viatico.comprobante_devolucion_path = f"/uploads/viaticos/devoluciones/{new_filename}"
        if monto_devuelto is not None:
            viatico.monto_devuelto = monto_devuelto

        viatico.status = "comprobado"

        db.commit()
        db.refresh(viatico)

        try:
            monto_log = viatico.monto_devuelto or 0.0
            log_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action="upload_return_receipt",
                module="viaticos",
                entity_type="Viatico",
                entity_id=viatico.id,
                description=f"Cargó comprobante de devolución por ${monto_log:,.2f} MXN para Folio {viatico.folio_comision}",
            )
        except Exception:
            pass

        return viatico
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al registrar comprobante de devolución: {str(e)}")


@router.delete("/{id}/clear-file/{file_type}", response_model=ViaticoResponse)
async def clear_file_route(
    id: int,
    file_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("viaticos", "edit")),
):
    """Eliminar uno de los archivos adjuntos (solicitud, comprobacion, reporte, devolucion)."""
    viatico = db.query(Viatico).filter(Viatico.id == id).first()
    if not viatico:
        raise HTTPException(status_code=404, detail="Comisión de viáticos no encontrada")

    if file_type == "solicitud":
        viatico.solicitud_pdf_path = None
        viatico.firma_solicitante_nombre = None
        viatico.firma_solicitante_fecha = None
        viatico.firma_solicitante_hash = None
        viatico.firma_jefe_nombre = None
        viatico.firma_jefe_fecha = None
        viatico.firma_jefe_hash = None
        viatico.firma_revisor_nombre = None
        viatico.firma_revisor_fecha = None
        viatico.firma_revisor_hash = None
        viatico.firma_tesoreria_nombre = None
        viatico.firma_tesoreria_fecha = None
        viatico.firma_tesoreria_hash = None
        viatico.firma_responsable_nombre = None
        viatico.firma_responsable_fecha = None
        viatico.firma_responsable_hash = None
    elif file_type == "comprobacion":
        viatico.comprobacion_pdf_path = None
        viatico.firma_comp_solicitante_nombre = None
        viatico.firma_comp_solicitante_fecha = None
        viatico.firma_comp_solicitante_hash = None
        viatico.firma_comp_revisor_nombre = None
        viatico.firma_comp_revisor_fecha = None
        viatico.firma_comp_revisor_hash = None
        viatico.firma_comp_tesoreria_nombre = None
        viatico.firma_comp_tesoreria_fecha = None
        viatico.firma_comp_tesoreria_hash = None
        viatico.firma_comp_contabilidad_nombre = None
        viatico.firma_comp_contabilidad_fecha = None
        viatico.firma_comp_contabilidad_hash = None
    elif file_type == "reporte":
        viatico.reporte_pdf_path = None
    elif file_type == "devolucion":
        viatico.comprobante_devolucion_path = None
    else:
        raise HTTPException(status_code=400, detail="Tipo de archivo inválido.")

    db.commit()
    db.refresh(viatico)
    return viatico


# ── COMPROBACIÓN DE FACTURAS ──

@router.post("/{id}/invoices", response_model=ViaticoFacturaResponse, status_code=201)
async def upload_viatico_invoice(
    id: int,
    xml_file: UploadFile = File(...),
    pdf_file: UploadFile = File(None),
    category_id: int = Form(None),
    description: str = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Subir y validar una factura fiscal XML (+PDF) para comprobar viáticos (comida, hospedaje, etc)."""
    viatico = db.query(Viatico).filter(Viatico.id == id).first()
    if not viatico:
        raise HTTPException(status_code=404, detail="Comisión de viáticos no encontrada")

    # Validar permisos (debe ser admin o el comisionado de la comisión)
    has_global_edit = current_user.has_permission("viaticos", "edit")
    if not has_global_edit and (not viatico.personal or viatico.personal.user_id != current_user.id) and viatico.asistente_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para comprobar gastos en esta comisión de viáticos"
        )

    if not xml_file.filename.lower().endswith(".xml"):
        raise HTTPException(status_code=400, detail="El archivo principal debe ser un XML válido")

    # Leer y parsear XML
    xml_content = await xml_file.read()
    parsed = parse_and_validate_cfdi(xml_content)

    # Obtener nombre de la categoría para bypass fiscal
    bypass_fiscal_rules = False
    if category_id:
        category = db.query(FinancialCategory).filter(FinancialCategory.id == category_id).first()
        if category:
            cat_name_lower = category.name.lower()
            if "avion" in cat_name_lower or "avión" in cat_name_lower or "paquete" in cat_name_lower or "hotel" in cat_name_lower:
                bypass_fiscal_rules = True

    if not parsed["is_valid"]:
        # Omitir el error de límite de $5,000 para viáticos
        errors = [
            e for e in parsed["errors"]
            if not ("limite" in e.lower() or "límite" in e.lower() or "5000" in e or "5,000" in e)
        ]
        
        # Si aplica el bypass para Avión o Hotel/Paquete, omitir reglas de PPD y Forma de Pago 99
        if bypass_fiscal_rules:
            errors = [
                e for e in errors
                if not (
                    "método de pago" in e.lower() or 
                    "metodo de pago" in e.lower() or 
                    "forma de pago" in e.lower() or
                    "pue" in e.lower() or
                    "ppd" in e.lower() or
                    "99" in e
                )
            ]
            
        if errors:
            raise HTTPException(
                status_code=400, 
                detail=f"XML de factura no cumple con las reglas fiscales: {', '.join(errors)}"
            )

    uuid_str = parsed["uuid"]
    # Validar duplicados de factura (en viaticos o en GRC)
    existing_viatico = db.query(ViaticoFactura).filter(ViaticoFactura.uuid == uuid_str).first()
    if existing_viatico:
        traveler = "Desconocido"
        if existing_viatico.viatico and existing_viatico.viatico.personal:
            traveler = existing_viatico.viatico.personal.full_name
        elif existing_viatico.viatico and existing_viatico.viatico.firma_solicitante_nombre:
            traveler = existing_viatico.viatico.firma_solicitante_nombre
        folio = existing_viatico.viatico.folio_comision if existing_viatico.viatico else "Desconocido"
        raise HTTPException(
            status_code=400, 
            detail=f"La factura con UUID {uuid_str} ya fue registrada en el trámite de viáticos Folio: {folio} de {traveler}."
        )

    from app.models.gasto_reserva_comprobar import GastoReservaComprobarFactura
    existing_grc = db.query(GastoReservaComprobarFactura).filter(GastoReservaComprobarFactura.uuid == uuid_str).first()
    if existing_grc:
        applicant = "Desconocido"
        if existing_grc.gasto and existing_grc.gasto.solicitante:
            applicant = existing_grc.gasto.solicitante.full_name
        elif existing_grc.gasto and existing_grc.gasto.firma_solicitante_nombre:
            applicant = existing_grc.gasto.firma_solicitante_nombre
        folio = existing_grc.gasto.folio_episa if existing_grc.gasto else "Desconocido"
        raise HTTPException(
            status_code=400, 
            detail=f"La factura con UUID {uuid_str} ya fue registrada en la comprobación GRC Folio: {folio} de {applicant}."
        )

    # Guardar archivos
    os.makedirs(XML_DIR, exist_ok=True)
    os.makedirs(PDF_DIR, exist_ok=True)

    xml_filename = f"{uuid_str}.xml"
    with open(os.path.join(XML_DIR, xml_filename), "wb") as f:
        f.write(xml_content)

    pdf_filename = None
    if pdf_file:
        if not pdf_file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="El archivo adjunto debe ser un PDF válido")
        
        # Validar correspondencia XML vs PDF
        try:
            pdf_reader = PdfReader(pdf_file.file)
            pdf_text = ""
            for page in pdf_reader.pages:
                pdf_text += page.extract_text() or ""
            
            await pdf_file.seek(0)
            
            if len(pdf_text.strip()) > 30:
                clean_uuid = uuid_str.lower().replace("-", "").strip()
                clean_pdf_text = pdf_text.lower().replace("-", "").replace(" ", "")
                uuid_found = clean_uuid in clean_pdf_text
                
                emisor_rfc_found = parsed["emisor_rfc"].lower() in pdf_text.lower()
                
                total_val = parsed["total"]
                total_str_plain = f"{total_val:.2f}"
                total_str_comma = f"{total_val:,.2f}"
                total_found = (total_str_plain in pdf_text) or (total_str_comma in pdf_text)
                
                if not (uuid_found or (emisor_rfc_found and total_found)):
                    raise HTTPException(
                        status_code=400,
                        detail="El archivo PDF no corresponde a la factura XML cargada. Por favor, verifique que sean del mismo comprobante."
                    )
        except HTTPException:
            raise
        except Exception:
            pass

        pdf_filename = f"{uuid_str}.pdf"
        with open(os.path.join(PDF_DIR, pdf_filename), "wb") as f:
            shutil = __import__("shutil")
            pdf_file.file.seek(0)
            shutil.copyfileobj(pdf_file.file, f)

    # Validar ante el SAT
    sat_status = "Desconocido"
    try:
        sat_res = query_sat_cfdi_status(
            emisor_rfc=parsed["emisor_rfc"],
            receptor_rfc=parsed["receptor_rfc"],
            total=parsed["total"],
            uuid_str=uuid_str
        )
        sat_status = sat_res["status"]
    except Exception:
        pass

    if sat_status == "Cancelado":
        raise HTTPException(
            status_code=400,
            detail="La factura cargada ya fue cancelada ante el SAT. No se permite su registro."
        )

    # Crear factura
    db_invoice = ViaticoFactura(
        viatico_id=id,
        uuid=uuid_str,
        folio=parsed["folio"],
        serie=parsed["serie"],
        emisor_rfc=parsed["emisor_rfc"],
        emisor_nombre=parsed["emisor_nombre"],
        receptor_rfc=parsed["receptor_rfc"],
        receptor_nombre=parsed["receptor_nombre"],
        subtotal=parsed["subtotal"],
        iva=parsed["iva"],
        total=parsed["total"],
        moneda=parsed["moneda"],
        fecha_emision=parsed["fecha_emision"],
        xml_filename=f"/uploads/viaticos/xml/{xml_filename}",
        pdf_filename=f"/uploads/viaticos/pdf/{pdf_filename}" if pdf_filename else None,
        category_id=category_id,
        description=description,
        sat_status=sat_status,
        sat_verified_at=datetime.now() if sat_status != "Desconocido" else None,
        registered_by_id=current_user.id
    )

    db.add(db_invoice)
    
    # Actualizar monto comprobado del viático
    viatico.monto_comprobado = (viatico.monto_comprobado or 0.0) + parsed["total"]
    
    # Recalcular saldos
    total_solicitado = viatico.monto_solicitado or 0.0
    total_comprobado = viatico.monto_comprobado
    total_devuelto = viatico.monto_devuelto or 0.0
    
    diferencia = total_solicitado - total_comprobado - total_devuelto
    if diferencia < 0:
        viatico.monto_saldo_favor = abs(diferencia)
    else:
        viatico.monto_saldo_favor = 0.0
        
    db.commit()
    db.refresh(db_invoice)

    # Log de auditoría
    try:
        is_telegram = bool(request.headers.get("x-bot-token") or request.headers.get("x-impersonate-telegram-id"))
        source_str = "Telegram Bot" if is_telegram else "Plataforma Web"
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="create",
            module="telegram_bot" if is_telegram else "viaticos",
            entity_type="ViaticoFactura",
            entity_id=db_invoice.id,
            description=f"Subió factura {db_invoice.emisor_nombre} (${db_invoice.total:,.2f} MXN) UUID: {db_invoice.uuid or 'MANUAL'} al Viático Folio {viatico.folio_comision} ({source_str})",
            details={
                "source": "telegram_bot" if is_telegram else "web",
                "viatico_id": viatico.id,
                "folio_comision": viatico.folio_comision,
                "invoice_id": db_invoice.id,
                "uuid": db_invoice.uuid,
                "emisor_nombre": db_invoice.emisor_nombre,
                "emisor_rfc": db_invoice.emisor_rfc,
                "total": db_invoice.total,
                "category": db_invoice.category.name if db_invoice.category else None,
            }
        )
    except Exception:
        pass

    return db_invoice


@router.delete("/invoices/{inv_id}")
async def delete_viatico_invoice(
    inv_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Eliminar una factura comprobada (comisionado o admin)."""
    invoice = db.query(ViaticoFactura).filter(ViaticoFactura.id == inv_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura de viáticos no encontrada")

    viatico = db.query(Viatico).filter(Viatico.id == invoice.viatico_id).first()
    
    # Validar permisos
    has_global_edit = current_user.has_permission("viaticos", "edit")
    if not has_global_edit and (not viatico.personal or viatico.personal.user_id != current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para eliminar facturas de esta comisión"
        )

    # Restar el monto
    viatico.monto_comprobado = max(0.0, (viatico.monto_comprobado or 0.0) - invoice.total)
    
    # Recalcular saldos
    total_solicitado = viatico.monto_solicitado or 0.0
    total_comprobado = viatico.monto_comprobado
    total_devuelto = viatico.monto_devuelto or 0.0
    
    diferencia = total_solicitado - total_comprobado - total_devuelto
    if diferencia < 0:
        viatico.monto_saldo_favor = abs(diferencia)
    else:
        viatico.monto_saldo_favor = 0.0

    # Borrar archivos físicos
    try:
        if invoice.xml_filename:
            xml_path = invoice.xml_filename.lstrip("/")
            if os.path.exists(xml_path):
                os.remove(xml_path)
        if invoice.pdf_filename:
            pdf_path = invoice.pdf_filename.lstrip("/")
            if os.path.exists(pdf_path):
                os.remove(pdf_path)
    except Exception:
        pass

    inv_details = {
        "source": "telegram_bot" if bool(request.headers.get("x-bot-token") or request.headers.get("x-impersonate-telegram-id")) else "web",
        "uuid": invoice.uuid,
        "emisor_nombre": invoice.emisor_nombre,
        "total": invoice.total,
        "folio": viatico.folio_comision if viatico else None
    }

    db.delete(invoice)
    db.commit()

    # Log de auditoría
    try:
        is_telegram = bool(request.headers.get("x-bot-token") or request.headers.get("x-impersonate-telegram-id"))
        source_str = "Telegram Bot" if is_telegram else "Plataforma Web"
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="delete",
            module="telegram_bot" if is_telegram else "viaticos",
            entity_type="ViaticoFactura",
            entity_id=inv_id,
            description=f"Eliminó factura {inv_details['emisor_nombre']} (${inv_details['total']:,.2f} MXN) del Viático Folio {inv_details['folio']} ({source_str})",
            details=inv_details
        )
    except Exception:
        pass
    
    return {"message": "Factura eliminada con éxito"}


@router.put("/invoices/{inv_id}/category")
async def update_viatico_invoice_category(
    inv_id: int,
    category_id: int = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Actualizar la categoría de gasto de una factura de viáticos."""
    invoice = db.query(ViaticoFactura).filter(ViaticoFactura.id == inv_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura de viáticos no encontrada")

    viatico = db.query(Viatico).filter(Viatico.id == invoice.viatico_id).first()
    if not viatico:
        raise HTTPException(status_code=404, detail="Comisión de viáticos no encontrada")

    # Validar permisos
    has_global_edit = current_user.has_permission("viaticos", "edit")
    if not has_global_edit and (not viatico.personal or viatico.personal.user_id != current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para modificar facturas de esta comisión"
        )

    # Validar categoría
    category = db.query(FinancialCategory).filter(FinancialCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=400, detail="Categoría financiera no válida")

    invoice.category_id = category_id
    db.commit()
    db.refresh(invoice)

    # Log de auditoría
    try:
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="update",
            module="viaticos",
            entity_type="ViaticoFactura",
            entity_id=invoice.id,
            description=f"Cambió categoría a '{category.name}' en factura {invoice.emisor_nombre} de Viático Folio {viatico.folio_comision}",
            details={"invoice_id": invoice.id, "category": category.name, "folio": viatico.folio_comision}
        )
    except Exception:
        pass

    return {"message": "Categoría de factura actualizada correctamente", "category_id": category_id}


@router.post("/invoices/{inv_id}/verify-sat")
async def verify_viatico_invoice_sat(
    inv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Consultar al WS del SAT el estado actual de la factura de viáticos y actualizarlo."""
    invoice = db.query(ViaticoFactura).filter(ViaticoFactura.id == inv_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura de viáticos no encontrada")

    if not invoice.uuid:
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden verificar ante el SAT facturas que cuenten con archivo XML y UUID fiscal."
        )

    # Validar permisos
    viatico = db.query(Viatico).filter(Viatico.id == invoice.viatico_id).first()
    has_global_edit = current_user.has_permission("viaticos", "edit")
    if not has_global_edit and (not viatico.personal or viatico.personal.user_id != current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para verificar facturas de esta comisión"
        )

    try:
        sat_res = query_sat_cfdi_status(
            emisor_rfc=invoice.emisor_rfc,
            receptor_rfc=invoice.receptor_rfc or "CIC7309189G8",
            total=invoice.total,
            uuid_str=invoice.uuid
        )
        sat_status = sat_res["status"]
        
        if sat_status == "Cancelado":
            invoice.sat_status = "Cancelado"
            invoice.sat_verified_at = datetime.now()
            db.commit()
            raise HTTPException(
                status_code=400,
                detail="El SAT reporta que esta factura está cancelada. Se ha marcado como CANCELADA."
            )
            
        invoice.sat_status = sat_status
        invoice.sat_verified_at = datetime.now()
        db.commit()
        db.refresh(invoice)
        
        return {
            "message": f"Factura verificada con éxito ante el SAT. Estado: {sat_status}",
            "sat_status": sat_status,
            "sat_verified_at": invoice.sat_verified_at
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al conectar con el servicio de validación del SAT: {str(e)}"
        )


@router.post("/invoices/{inv_id}/ticket", response_model=ViaticoFacturaResponse)
async def upload_viatico_invoice_ticket(
    inv_id: int,
    file: UploadFile = File(...),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Subir foto o PDF del ticket o comprobante de consumo para justificar fecha/gasto."""
    import shutil

    invoice = db.query(ViaticoFactura).filter(ViaticoFactura.id == inv_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura de viáticos no encontrada")

    viatico = db.query(Viatico).filter(Viatico.id == invoice.viatico_id).first()
    if not viatico:
        raise HTTPException(status_code=404, detail="Comisión de viáticos no encontrada")

    has_global_edit = current_user.has_permission("viaticos", "edit")
    if not has_global_edit and (not viatico.personal or viatico.personal.user_id != current_user.id) and viatico.asistente_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para modificar facturas de esta comisión"
        )

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".pdf", ".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="El ticket debe ser una imagen (JPG, PNG, WebP) o un documento PDF")

    tickets_dir = "uploads/viaticos/tickets"
    os.makedirs(tickets_dir, exist_ok=True)

    # Eliminar ticket previo si existía
    if invoice.ticket_filename:
        prev_path = invoice.ticket_filename.lstrip("/")
        if os.path.exists(prev_path):
            try:
                os.remove(prev_path)
            except Exception:
                pass

    safe_name = invoice.uuid or f"inv_{invoice.id}"
    saved_filename = f"{safe_name}_ticket_{int(datetime.now().timestamp())}{ext}"
    saved_path = os.path.join(tickets_dir, saved_filename)

    with open(saved_path, "wb") as f:
        file.file.seek(0)
        shutil.copyfileobj(file.file, f)

    invoice.ticket_filename = f"/uploads/viaticos/tickets/{saved_filename}"
    db.commit()
    db.refresh(invoice)

    try:
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="upload",
            module="viaticos",
            entity_type="ViaticoFactura",
            entity_id=invoice.id,
            description=f"Subió ticket/justificante para la factura {invoice.emisor_nombre} (${invoice.total:,.2f}) del Viático Folio {viatico.folio_comision}",
            details={"invoice_id": invoice.id, "ticket_file": invoice.ticket_filename}
        )
    except Exception:
        pass

    return invoice


@router.delete("/invoices/{inv_id}/ticket", response_model=ViaticoFacturaResponse)
async def delete_viatico_invoice_ticket(
    inv_id: int,
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Eliminar el ticket/justificante de gasto de una factura."""
    invoice = db.query(ViaticoFactura).filter(ViaticoFactura.id == inv_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura de viáticos no encontrada")

    viatico = db.query(Viatico).filter(Viatico.id == invoice.viatico_id).first()
    if not viatico:
        raise HTTPException(status_code=404, detail="Comisión de viáticos no encontrada")

    has_global_edit = current_user.has_permission("viaticos", "edit")
    if not has_global_edit and (not viatico.personal or viatico.personal.user_id != current_user.id) and viatico.asistente_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para modificar facturas de esta comisión"
        )

    if invoice.ticket_filename:
        prev_path = invoice.ticket_filename.lstrip("/")
        if os.path.exists(prev_path):
            try:
                os.remove(prev_path)
            except Exception:
                pass
        invoice.ticket_filename = None
        db.commit()
        db.refresh(invoice)

    return invoice



