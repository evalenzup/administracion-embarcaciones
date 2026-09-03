"""
SIAE — Router de Finanzas: Gastos a Reserva de Comprobar (GRC).
Implementa las APIs para el control de anticipos, firmas, análisis de PDF y comprobaciones fiscales.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form, Body, status
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
import os
import shutil
import uuid
import re
from datetime import datetime, date
from pypdf import PdfReader
import unicodedata

from app.dependencies import get_db, require_permission, get_current_user
from app.models.user import User
from app.models.financial_category import FinancialCategory
from app.models.project import Project
from app.models.account import Account, AccountTransaction, TransactionType
from app.models.gasto_reserva_comprobar import GastoReservaComprobar, GastoReservaComprobarFactura, GastoReservaComprobarItem
from app.services.audit import log_action
from app.schemas.gasto_reserva_comprobar import (
    GastoReservaComprobarCreate,
    GastoReservaComprobarUpdate,
    GastoReservaComprobarResponse,
    GastoReservaComprobarList,
    GastoReservaComprobarFacturaResponse,
    GRCStatsResponse
)
from app.utils.xml_parser import parse_and_validate_cfdi
from app.utils.sat_validator import query_sat_cfdi_status
from app.utils.grc_pdf_parser import parse_grc_pdf

router = APIRouter(prefix="/api/v1/gastos-reserva-comprobar", tags=["Gastos a Reserva de Comprobar"])

# Directorios de carga
UPLOADS_DIR = "uploads/gastos_reserva_comprobar"
PDF_DIR = os.path.join(UPLOADS_DIR, "pdf")
XML_DIR = os.path.join(UPLOADS_DIR, "xml")
REPORTS_DIR = os.path.join(UPLOADS_DIR, "reports")

def ensure_naive(dt: datetime | None) -> datetime | None:
    """Asegura que un datetime sea timezone-naive (sin offset) para evitar errores de resta en Python."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt


def clean_text(text: str) -> str:
    if not text:
        return ""
    text = unicodedata.normalize('NFKD', text)
    text = "".join([c for c in text if not unicodedata.combining(c)])
    return " ".join(text.lower().split())


def find_matching_user(db_session: Session, target_name: str):
    if not target_name:
        return None
    from app.models.user import User
    cleaned_target = clean_text(target_name)
    if not cleaned_target:
        return None
        
    all_users = db_session.query(User).all()
    
    # 1. Exact cleaned match
    for u in all_users:
        if u.full_name:
            if clean_text(u.full_name) == cleaned_target:
                return u
            
    # 2. Substring cleaned match (either target contains DB name or vice-versa)
    for u in all_users:
        if u.full_name:
            cleaned_u = clean_text(u.full_name)
            if cleaned_u in cleaned_target or cleaned_target in cleaned_u:
                return u
            
    # 3. Word matching (at least 2 words match)
    target_parts = cleaned_target.split()
    if len(target_parts) >= 2:
        for u in all_users:
            if u.full_name:
                cleaned_u = clean_text(u.full_name)
                u_parts = cleaned_u.split()
                matched_parts = sum(1 for part in target_parts if part in u_parts)
                if matched_parts >= 2:
                    return u
                
    return None


def parse_date_str(date_str: str) -> date | None:
    """Intenta parsear una fecha con formato DD-MMM-YYYY (ej. 07-AUG-2026)."""
    try:
        parts = date_str.strip().split("-")
        if len(parts) == 3:
            day = int(parts[0])
            month_str = parts[1].upper()
            year = int(parts[2])
            month = MONTH_MAP.get(month_str, 1)
            return date(year, month, day)
    except Exception:
        pass
    return None


def parse_datetime_str(dt_str: str) -> datetime | None:
    """Intenta parsear una marca de tiempo de firma (ej. 31-07-2026 14:47:30)."""
    try:
        dt_str = dt_str.replace("/", "-").strip()
        return datetime.strptime(dt_str, "%d-%m-%Y %H:%M:%S")
    except Exception:
        pass
    return None


def extract_signatures_from_text(text: str) -> list[dict]:
    roles = [
        ("firma_solicitante", "ENCARGADO DE CUENTA / SOLICITANTE"),
        ("firma_revisor", "REVISOR ADMINISTRATIVO"),
        ("firma_jefe", "JEFE INMEDIATO"),
        ("firma_adquisiciones", "DEPARTAMENTO DE ADQUISICIONES"),
        ("firma_director", "DIRECTOR ADMINISTRATIVO"),
        ("firma_tesoreria", "VENTANILLA TESORERIA"),
        ("firma_contabilidad", "VENTANILLA CONTABILIDAD")
    ]
    signatures = []
    lines = text.split("\n")
    for line in lines:
        line = line.strip()
        for field_prefix, role in roles:
            if role in line:
                date_match = re.search(r"(\d{2}[-/]\d{2}[-/]\d{4}\s+\d{2}:\d{2}:\d{2})", line)
                date_val = parse_datetime_str(date_match.group(1)) if date_match else None
                parts = line.split(role)
                name = parts[0].strip()
                signatures.append({
                    "prefix": field_prefix,
                    "name": name,
                    "date": date_val,
                })
                break
    return signatures


# ── RUTAS PRINCIPALES GRC ──

@router.get("", response_model=GastoReservaComprobarList)
async def list_grc(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: str = Query(None),
    project_id: int = Query(None),
    folio_episa: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Listar solicitudes GRC con paginación y filtros."""
    has_global_view = current_user.has_permission("gastos_reserva_comprobar", "view")
    
    query = db.query(GastoReservaComprobar)
    
    # Si el usuario no tiene permisos de ver todo, filtrar por sus propios registros o los que tiene asignados como asistente
    if not has_global_view:
        query = query.filter(
            or_(
                GastoReservaComprobar.solicitante_id == current_user.id,
                GastoReservaComprobar.asistente_id == current_user.id
            )
        )

    if status:
        query = query.filter(GastoReservaComprobar.status == status)
    if project_id:
        query = query.filter(GastoReservaComprobar.project_id == project_id)
    if folio_episa:
        query = query.filter(GastoReservaComprobar.folio_episa.ilike(f"%{folio_episa}%"))

    total = query.count()
    items = query.order_by(GastoReservaComprobar.created_at.desc()).offset(skip).limit(limit).all()
    
    # Populate bot/helper properties
    for grc in items:
        grc.is_mine = (grc.solicitante_id == current_user.id)
        grc.is_asistente = (grc.asistente_id == current_user.id)
        
    return {"total": total, "items": items}


@router.get("/stats", response_model=GRCStatsResponse)
async def get_grc_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("gastos_reserva_comprobar", "view")),
):
    """Obtener estadísticas de tiempos de firmas de GRC."""
    total_count = db.query(GastoReservaComprobar).count()
    
    # Agrupar por estado
    status_counts = db.query(
        GastoReservaComprobar.status, func.count(GastoReservaComprobar.id)
    ).group_by(GastoReservaComprobar.status).all()
    by_status = {st: count for st, count in status_counts}

    # Promedios de tiempos
    avg_revisor = db.query(func.avg(GastoReservaComprobar.tiempo_revisor_horas)).scalar()
    avg_jefe = db.query(func.avg(GastoReservaComprobar.tiempo_jefe_horas)).scalar()
    avg_director = db.query(func.avg(GastoReservaComprobar.tiempo_director_horas)).scalar()
    avg_tesoreria = db.query(func.avg(GastoReservaComprobar.tiempo_tesoreria_horas)).scalar()
    avg_contabilidad = db.query(func.avg(GastoReservaComprobar.tiempo_contabilidad_horas)).scalar()
    avg_total = db.query(func.avg(GastoReservaComprobar.tiempo_total_dias)).scalar()

    return {
        "total_count": total_count,
        "by_status": by_status,
        "avg_revisor_hours": round(avg_revisor, 1) if avg_revisor else None,
        "avg_jefe_hours": round(avg_jefe, 1) if avg_jefe else None,
        "avg_director_hours": round(avg_director, 1) if avg_director else None,
        "avg_tesoreria_hours": round(avg_tesoreria, 1) if avg_tesoreria else None,
        "avg_contabilidad_hours": round(avg_contabilidad, 1) if avg_contabilidad else None,
        "avg_total_days": round(avg_total, 1) if avg_total else None,
    }


def recalculate_grc_balances(grc: GastoReservaComprobar, db: Session):
    """Recalcular monto comprobado, devuelto y saldo a favor de un GRC."""
    total_comprobado = db.query(func.sum(GastoReservaComprobarFactura.total)).filter(
        GastoReservaComprobarFactura.gasto_id == grc.id
    ).scalar() or 0.0
    
    grc.monto_comprobado = round(total_comprobado, 2)
    
    if grc.status in ["comprobado", "devolucion_realizada"]:
        if grc.monto_comprobado < grc.monto_solicitado:
            grc.monto_devuelto = round(grc.monto_solicitado - grc.monto_comprobado, 2)
            grc.monto_saldo_favor = 0.0
        else:
            grc.monto_saldo_favor = round(grc.monto_comprobado - grc.monto_solicitado, 2)
            grc.monto_devuelto = 0.0
    else:
        grc.monto_devuelto = 0.0
        grc.monto_saldo_favor = 0.0


def sync_grc_transactions(grc: GastoReservaComprobar, db: Session, user_id: int):
    """Sincroniza los movimientos de cuenta (cargos/abonos) asociados a una solicitud GRC según su estado y montos."""
    # Buscar transacciones existentes vinculadas a este folio EPISA como referencia
    existing_txs = db.query(AccountTransaction).filter(
        AccountTransaction.reference == grc.folio_episa
    ).all()

    # Determinar si la solicitud ya fue depositada/aprobada
    has_charge = grc.status in ["aprobado", "comprobacion_pendiente", "comprobado", "devolucion_realizada"]
    
    # 1. Cargo del anticipo solicitado
    charge_tx = next((t for t in existing_txs if t.type == TransactionType.CARGO and "Anticipo" in t.concept), None)
    if has_charge:
        if grc.account_id:
            if not charge_tx:
                charge_tx = AccountTransaction(
                    account_id=grc.account_id,
                    type=TransactionType.CARGO,
                    amount=grc.monto_solicitado,
                    concept=f"Anticipo GRC Folio: {grc.folio_episa}",
                    description=grc.justificacion,
                    reference=grc.folio_episa,
                    category_id=grc.category_id,
                    created_by_id=user_id
                )
                db.add(charge_tx)
            else:
                charge_tx.account_id = grc.account_id
                charge_tx.amount = grc.monto_solicitado
                charge_tx.category_id = grc.category_id
    else:
        if charge_tx:
            db.delete(charge_tx)

    # 2. Devolución/Reintegro (Abono) o Reembolso adicional (Cargo) en liquidación
    devuelto_tx = next((t for t in existing_txs if t.type == TransactionType.ABONO and "Devolución" in t.concept), None)
    favor_tx = next((t for t in existing_txs if t.type == TransactionType.CARGO and "Reembolso" in t.concept), None)

    # El abono de la devolución se registra ÚNICAMENTE en estado 'devolucion_realizada'
    if grc.status == "devolucion_realizada" and grc.monto_devuelto > 0:
        if not devuelto_tx:
            devuelto_tx = AccountTransaction(
                account_id=grc.account_id,
                type=TransactionType.ABONO,
                amount=grc.monto_devuelto,
                concept=f"Devolución GRC Folio: {grc.folio_episa}",
                description="Reintegro de saldo no utilizado del anticipo.",
                reference=grc.folio_episa,
                category_id=grc.category_id,
                created_by_id=user_id
            )
            db.add(devuelto_tx)
        else:
            devuelto_tx.account_id = grc.account_id
            devuelto_tx.amount = grc.monto_devuelto
            devuelto_tx.category_id = grc.category_id
        if favor_tx:
            db.delete(favor_tx)
    else:
        if devuelto_tx:
            db.delete(devuelto_tx)

    # El reembolso a favor del usuario se registra en 'comprobado' o 'devolucion_realizada'
    if grc.status in ["comprobado", "devolucion_realizada"] and grc.monto_saldo_favor > 0:
        if not favor_tx:
            favor_tx = AccountTransaction(
                account_id=grc.account_id,
                type=TransactionType.CARGO,
                amount=grc.monto_saldo_favor,
                concept=f"Reembolso GRC Folio: {grc.folio_episa}",
                description="Pago complementario por saldo a favor en la comprobación.",
                reference=grc.folio_episa,
                category_id=grc.category_id,
                created_by_id=user_id
            )
            db.add(favor_tx)
        else:
            favor_tx.account_id = grc.account_id
            favor_tx.amount = grc.monto_saldo_favor
            favor_tx.category_id = grc.category_id
    else:
        if favor_tx:
            db.delete(favor_tx)


@router.post("", response_model=GastoReservaComprobarResponse, status_code=201)
async def create_grc(
    data: GastoReservaComprobarCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("gastos_reserva_comprobar", "create")),
):
    """Crear solicitud GRC en borrador de forma manual."""
    existing = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.folio_episa == data.folio_episa).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Ya existe una solicitud con el folio EPISA {data.folio_episa}")

    solicitante_id = data.solicitante_id or current_user.id
    grc = GastoReservaComprobar(
        **data.model_dump(exclude={"solicitante_id", "items"}),
        solicitante_id=solicitante_id,
        status="borrador"
    )
    db.add(grc)
    db.flush()

    for item_data in data.items:
        item = GastoReservaComprobarItem(**item_data.model_dump(), gasto_id=grc.id)
        db.add(item)

    db.commit()
    db.refresh(grc)

    # Log de auditoría
    try:
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="create",
            module="gastos_reserva_comprobar",
            entity_type="GastoReservaComprobar",
            entity_id=grc.id,
            description=f"Creó solicitud GRC Folio {grc.folio_episa} por ${grc.monto_solicitado:,.2f} MXN",
            details={"folio": grc.folio_episa, "solicitante_id": grc.solicitante_id, "monto_solicitado": grc.monto_solicitado}
        )
    except Exception:
        pass

    return grc


@router.get("/{id}", response_model=GastoReservaComprobarResponse)
async def get_grc(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Obtener detalle de una solicitud GRC."""
    grc = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.id == id).first()
    if not grc:
        raise HTTPException(status_code=404, detail="Solicitud GRC no encontrada")
    
    # Validar permisos
    has_global_view = current_user.has_permission("gastos_reserva_comprobar", "view")
    if not has_global_view and grc.solicitante_id != current_user.id and grc.asistente_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para ver este GRC"
        )
        
    grc.is_mine = (grc.solicitante_id == current_user.id)
    grc.is_asistente = (grc.asistente_id == current_user.id)
    return grc


@router.get("/{id}/invoices/zip")
async def download_grc_invoices_zip(
    id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Descargar bundle contable en ZIP de un GRC (Excel con fórmulas dinámicas + facturas renombradas 01_... + anexos)."""
    from fastapi.responses import StreamingResponse
    from app.utils.invoice_bundle import create_invoices_zip_bundle

    grc = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.id == id).first()
    if not grc:
        raise HTTPException(status_code=404, detail="Solicitud GRC no encontrada")

    # Validar permisos de acceso (mismo que get_grc)
    has_global_view = current_user.has_permission("gastos_reserva_comprobar", "view")
    if not has_global_view and grc.solicitante_id != current_user.id and grc.asistente_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para ver este GRC"
        )

    if not grc.facturas:
        raise HTTPException(status_code=400, detail="Esta solicitud GRC no tiene facturas registradas.")

    extra_files = []
    if getattr(grc, "comprobante_devolucion_path", None):
        extra_files.append((
            grc.comprobante_devolucion_path,
            f"Devoluciones/{os.path.basename(grc.comprobante_devolucion_path)}"
        ))
    if getattr(grc, "comprobacion_pdf_path", None):
        extra_files.append((
            grc.comprobacion_pdf_path,
            f"Extras/{os.path.basename(grc.comprobacion_pdf_path)}"
        ))

    zip_buffer = create_invoices_zip_bundle(
        folio=grc.folio_episa,
        facturas=grc.facturas,
        tramite_type="grc",
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
            module="telegram_bot" if is_telegram else "gastos_reserva_comprobar",
            entity_type="GastoReservaComprobar",
            entity_id=grc.id,
            description=f"Descargó bundle ZIP con Excel de comprobación de GRC Folio {grc.folio_episa} ({source_str})",
            details={"source": "telegram_bot" if is_telegram else "web", "folio": grc.folio_episa, "facturas_count": len(grc.facturas)}
        )
    except Exception:
        pass
    
    filename = f"grc_{grc.folio_episa}_bundle.zip"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/{id}/invoices/excel")
async def download_grc_invoices_excel(
    id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Descargar exclusivamente el archivo Excel (.xlsx) de comprobación de facturas GRC con fórmulas."""
    import io
    from fastapi.responses import StreamingResponse
    from app.utils.invoice_bundle import build_comprobacion_excel

    grc = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.id == id).first()
    if not grc:
        raise HTTPException(status_code=404, detail="Solicitud GRC no encontrada")

    has_global_view = current_user.has_permission("gastos_reserva_comprobar", "view")
    if not has_global_view and grc.solicitante_id != current_user.id and grc.asistente_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para ver este GRC"
        )

    if not grc.facturas:
        raise HTTPException(status_code=400, detail="Esta solicitud GRC no tiene facturas registradas.")

    facturas_sorted = sorted(
        grc.facturas,
        key=lambda x: (x.fecha_emision or datetime.min)
    )

    excel_bytes = build_comprobacion_excel(
        folio_tramite=grc.folio_episa,
        facturas_sorted=facturas_sorted,
        tramite_type="grc"
    )

    try:
        is_telegram = bool(request.headers.get("x-bot-token") or request.headers.get("x-impersonate-telegram-id"))
        source_str = "Telegram Bot" if is_telegram else "Plataforma Web"
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="download",
            module="telegram_bot" if is_telegram else "gastos_reserva_comprobar",
            entity_type="GastoReservaComprobar",
            entity_id=grc.id,
            description=f"Descargó reporte Excel de comprobación de GRC Folio {grc.folio_episa} ({source_str})",
            details={"source": "telegram_bot" if is_telegram else "web", "folio": grc.folio_episa, "facturas_count": len(grc.facturas)}
        )
    except Exception:
        pass

    filename = f"comprobacion_grc_{grc.folio_episa}.xlsx"
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.put("/{id}", response_model=GastoReservaComprobarResponse)
async def update_grc(
    id: int,
    data: GastoReservaComprobarUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("gastos_reserva_comprobar", "edit")),
):
    """Actualizar datos y estado de un GRC (Flexibilidad manual total)."""
    grc = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.id == id).first()
    if not grc:
        raise HTTPException(status_code=404, detail="Solicitud GRC no encontrada")

    update_data = data.model_dump(exclude_unset=True)
    
    # Validar duplicados de EPISA si cambia
    if "folio_episa" in update_data and update_data["folio_episa"] != grc.folio_episa:
        existing = db.query(GastoReservaComprobar).filter(
            and_(GastoReservaComprobar.folio_episa == update_data["folio_episa"], GastoReservaComprobar.id != id)
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Ya existe otra solicitud con el folio EPISA {update_data['folio_episa']}")

    if "items" in update_data:
        db.query(GastoReservaComprobarItem).filter(GastoReservaComprobarItem.gasto_id == id).delete()
        if update_data["items"]:
            for item_dict in update_data["items"]:
                # Convertir a dict si es un objeto Pydantic
                item_fields = item_dict.model_dump() if hasattr(item_dict, "model_dump") else item_dict
                item = GastoReservaComprobarItem(**item_fields, gasto_id=id)
                db.add(item)
        del update_data["items"]

    for key, val in update_data.items():
        setattr(grc, key, val)

    # Calcular tiempos promedio si se actualizaron firmas
    dt_sol = ensure_naive(grc.firma_solicitante_fecha)
    dt_rev = ensure_naive(grc.firma_revisor_fecha)
    dt_jef = ensure_naive(grc.firma_jefe_fecha)
    dt_dir = ensure_naive(grc.firma_director_fecha)
    dt_tes = ensure_naive(grc.firma_tesoreria_fecha)

    if dt_sol and dt_rev:
        grc.tiempo_revisor_horas = round((dt_rev - dt_sol).total_seconds() / 3600.0, 1)
    if dt_rev and dt_jef:
        grc.tiempo_jefe_horas = round((dt_jef - dt_rev).total_seconds() / 3600.0, 1)
    if dt_jef and dt_dir:
        grc.tiempo_director_horas = round((dt_dir - dt_jef).total_seconds() / 3600.0, 1)
    if dt_dir and dt_tes:
        grc.tiempo_tesoreria_horas = round((dt_tes - dt_dir).total_seconds() / 3600.0, 1)

    # Recalcular saldos del GRC al cambiar monto o cuenta
    recalculate_grc_balances(grc, db)

    # Registrar/sincronizar transacciones en cuentas según el estado
    sync_grc_transactions(grc, db, current_user.id)

    db.commit()
    db.refresh(grc)

    # Log de auditoría
    try:
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="update",
            module="gastos_reserva_comprobar",
            entity_type="GastoReservaComprobar",
            entity_id=grc.id,
            description=f"Actualizó solicitud GRC Folio {grc.folio_episa}",
            details={"folio": grc.folio_episa, "status": grc.status}
        )
    except Exception:
        pass

    return grc


@router.delete("/{id}")
async def delete_grc(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("gastos_reserva_comprobar", "delete")),
):
    """Eliminar una solicitud GRC (permite eliminar en cualquier momento)."""
    grc = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.id == id).first()
    if not grc:
        raise HTTPException(status_code=404, detail="Solicitud GRC no encontrada")
    
    folio_deleted = grc.folio_episa
    # Eliminar transacciones bancarias asociadas
    db.query(AccountTransaction).filter(AccountTransaction.reference == grc.folio_episa).delete()
    
    db.delete(grc)
    db.commit()

    # Log de auditoría
    try:
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="delete",
            module="gastos_reserva_comprobar",
            entity_type="GastoReservaComprobar",
            entity_id=id,
            description=f"Eliminó solicitud GRC Folio {folio_deleted}",
            details={"folio": folio_deleted}
        )
    except Exception:
        pass

    return {"message": "Solicitud GRC eliminada correctamente"}


@router.post("/parse-pdf")
async def parse_grc_pdf_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Analizar el PDF de una solicitud GRC y retornar los datos pre-llenados para confirmación."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF válido")

    try:
        content = await file.read()
        parsed_data = parse_grc_pdf(content)
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"Error al analizar el PDF de GRC: {str(ex)}")

    # 1. Buscar correspondencia de cuenta contable
    account_id = None
    if parsed_data.get("account_number"):
        acc = db.query(Account).filter(Account.account_number.ilike(f"%{parsed_data['account_number']}%")).first()
        if acc:
            account_id = acc.id

    # 2. Buscar correspondencia de solicitante
    solicitante_id = None
    if parsed_data.get("solicitante_name"):
        user_match = find_matching_user(db, parsed_data["solicitante_name"])
        if user_match:
            solicitante_id = user_match.id
    
    # Fallback si no se encontró coincidencia en la BD
    if not solicitante_id:
        solicitante_id = current_user.id

    # Guardar temporalmente el PDF en carpeta de reportes
    os.makedirs(REPORTS_DIR, exist_ok=True)
    temp_filename = f"grc_solicitud_temp_{uuid.uuid4().hex[:8]}.pdf"
    file_path = os.path.join(REPORTS_DIR, temp_filename)
    with open(file_path, "wb") as f:
        f.write(content)

    return {
        "folio_episa": parsed_data.get("folio_episa"),
        "monto_solicitado": parsed_data.get("monto_solicitado"),
        "justificacion": parsed_data.get("justificacion"),
        "observaciones": parsed_data.get("observaciones"),
        "fecha_pago_servicio": parsed_data.get("fecha_pago_servicio"),
        "account_id": account_id,
        "solicitante_id": solicitante_id,
        "solicitud_pdf_path": f"/uploads/gastos_reserva_comprobar/reports/{temp_filename}",
        "items": parsed_data.get("items", []),
        
        # Firmas
        "firma_solicitante_nombre": parsed_data.get("firma_solicitante_nombre"),
        "firma_solicitante_fecha": parsed_data.get("firma_solicitante_fecha"),
        "firma_solicitante_hash": parsed_data.get("firma_solicitante_hash"),
        
        "firma_revisor_nombre": parsed_data.get("firma_revisor_nombre"),
        "firma_revisor_fecha": parsed_data.get("firma_revisor_fecha"),
        "firma_revisor_hash": parsed_data.get("firma_revisor_hash"),
        
        "firma_jefe_nombre": parsed_data.get("firma_jefe_nombre"),
        "firma_jefe_fecha": parsed_data.get("firma_jefe_fecha"),
        "firma_jefe_hash": parsed_data.get("firma_jefe_hash"),
        
        "firma_adquisiciones_nombre": parsed_data.get("firma_adquisiciones_nombre"),
        "firma_adquisiciones_fecha": parsed_data.get("firma_adquisiciones_fecha"),
        "firma_adquisiciones_hash": parsed_data.get("firma_adquisiciones_hash"),
        
        "firma_director_nombre": parsed_data.get("firma_director_nombre"),
        "firma_director_fecha": parsed_data.get("firma_director_fecha"),
        "firma_director_hash": parsed_data.get("firma_director_hash"),
        
        "firma_tesoreria_nombre": parsed_data.get("firma_tesoreria_nombre"),
        "firma_tesoreria_fecha": parsed_data.get("firma_tesoreria_fecha"),
        "firma_tesoreria_hash": parsed_data.get("firma_tesoreria_hash"),
        
        "firma_contabilidad_nombre": parsed_data.get("firma_contabilidad_nombre"),
        "firma_contabilidad_fecha": parsed_data.get("firma_contabilidad_fecha"),
        "firma_contabilidad_hash": parsed_data.get("firma_contabilidad_hash"),
    }


# ── CARGA Y ANÁLISIS DE REPORTES PDF ──

@router.post("/{id}/upload-request-pdf")
async def upload_request_pdf(
    id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("gastos_reserva_comprobar", "edit")),
):
    """Subir y procesar PDF de Solicitud GRC. Extrae firmas, calcula tiempos y contrasta datos."""
    grc = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.id == id).first()
    if not grc:
        raise HTTPException(status_code=404, detail="Solicitud GRC no encontrada")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF válido")

    # Guardar reporte
    os.makedirs(REPORTS_DIR, exist_ok=True)
    file_ext = ".pdf"
    filename = f"grc_solicitud_{id}_{uuid.uuid4().hex[:8]}{file_ext}"
    file_path = os.path.join(REPORTS_DIR, filename)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Leer y extraer texto del PDF
    warnings = []
    text = ""
    try:
        reader = PdfReader(file_path)
        for page in reader.pages:
            text += page.extract_text() + "\n"
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"No se pudo extraer el texto del PDF: {str(ex)}")

    # 1. Validación Cruzada (Contraste)
    # Folio
    folio_match = re.search(r"Solicitud de Gasto a Reserva de Comprobar Número:\s*(\d+)", text)
    if folio_match:
        pdf_folio = folio_match.group(1)
        if pdf_folio != grc.folio_episa:
            warnings.append(f"El folio EPISA del PDF ({pdf_folio}) no coincide con el registrado ({grc.folio_episa}).")

    # Monto
    monto_match = re.search(r"Total:\s*\$\s*([\d,]+\.\d{2})", text)
    if monto_match:
        pdf_monto = float(monto_match.group(1).replace(",", ""))
        if abs(pdf_monto - grc.monto_solicitado) > 1.0:
            warnings.append(f"El importe total del PDF (${pdf_monto:,.2f}) difiere del solicitado (${grc.monto_solicitado:,.2f}).")

    # 2. Extracción de firmas y fechas
    signatures = extract_signatures_from_text(text)
    for sig in signatures:
        prefix = sig["prefix"]
        setattr(grc, f"{prefix}_nombre", sig["name"])
        setattr(grc, f"{prefix}_fecha", sig["date"])

    # 3. Cálculo de tiempos promedio por área
    dt_sol = ensure_naive(grc.firma_solicitante_fecha)
    dt_rev = ensure_naive(grc.firma_revisor_fecha)
    dt_jef = ensure_naive(grc.firma_jefe_fecha)
    dt_dir = ensure_naive(grc.firma_director_fecha)
    dt_tes = ensure_naive(grc.firma_tesoreria_fecha)

    # Revisor
    if dt_sol and dt_rev:
        grc.tiempo_revisor_horas = round(
            (dt_rev - dt_sol).total_seconds() / 3600.0, 1
        )
    # Jefe
    if dt_rev and dt_jef:
        grc.tiempo_jefe_horas = round(
            (dt_jef - dt_rev).total_seconds() / 3600.0, 1
        )
    # Director
    if dt_jef and dt_dir:
        grc.tiempo_director_horas = round(
            (dt_dir - dt_jef).total_seconds() / 3600.0, 1
        )
    # Tesorería (Aprobación final del depósito)
    if dt_dir and dt_tes:
        grc.tiempo_tesoreria_horas = round(
            (dt_tes - dt_dir).total_seconds() / 3600.0, 1
        )

    # Guardar ruta del archivo
    grc.solicitud_pdf_path = f"/uploads/gastos_reserva_comprobar/reports/{filename}"
    
    # Transición automática de estado
    if grc.firma_tesoreria_fecha:
        grc.status = "aprobado"
    elif grc.firma_revisor_fecha:
        grc.status = "solicitado"

    sync_grc_transactions(grc, db, current_user.id)
    db.commit()
    db.refresh(grc)

    return {"gasto": grc, "warnings": warnings}


@router.post("/{id}/upload-liquidation-pdf")
async def upload_liquidation_pdf(
    id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("gastos_reserva_comprobar", "edit")),
):
    """Subir y procesar PDF de Liquidación LGRC. Extrae firmas de liquidación y completa el ciclo."""
    grc = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.id == id).first()
    if not grc:
        raise HTTPException(status_code=404, detail="Solicitud GRC no encontrada")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF válido")

    # Guardar reporte
    os.makedirs(REPORTS_DIR, exist_ok=True)
    file_ext = ".pdf"
    filename = f"grc_liquidacion_{id}_{uuid.uuid4().hex[:8]}{file_ext}"
    file_path = os.path.join(REPORTS_DIR, filename)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Leer texto del PDF
    text = ""
    try:
        reader = PdfReader(file_path)
        for page in reader.pages:
            text += page.extract_text() + "\n"
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"No se pudo extraer el texto del PDF: {str(ex)}")

    # Extraer firmas
    signatures = extract_signatures_from_text(text)
    for sig in signatures:
        prefix = sig["prefix"]
        # No sobrescribir firmas previas de la solicitud (GARC) con las de la liquidación (LGRC)
        if prefix != "firma_contabilidad" and getattr(grc, f"{prefix}_fecha") is not None:
            continue
        setattr(grc, f"{prefix}_nombre", sig["name"])
        setattr(grc, f"{prefix}_fecha", sig["date"])

    # Calcular tiempos de Contabilidad
    dt_tes = ensure_naive(grc.firma_tesoreria_fecha)
    dt_con = ensure_naive(grc.firma_contabilidad_fecha)
    dt_sol = ensure_naive(grc.firma_solicitante_fecha)

    if dt_tes and dt_con:
        grc.tiempo_contabilidad_horas = round(
            (dt_con - dt_tes).total_seconds() / 3600.0, 1
        )
    if dt_sol and dt_con:
        grc.tiempo_total_dias = round(
            (dt_con - dt_sol).total_seconds() / 86400.0, 1
        )

    # Guardar ruta del archivo
    grc.comprobacion_pdf_path = f"/uploads/gastos_reserva_comprobar/reports/{filename}"
    
    # Pasar a estado comprobado automáticamente si firmó contabilidad
    if grc.firma_contabilidad_fecha:
        grc.status = "comprobado"

    sync_grc_transactions(grc, db, current_user.id)
    db.commit()
    db.refresh(grc)

    return {"gasto": grc}


@router.delete("/{id}/clear-request-pdf", response_model=GastoReservaComprobarResponse)
async def clear_request_pdf(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("gastos_reserva_comprobar", "edit")),
):
    """Eliminar el reporte PDF de solicitud y restablecer sus firmas y marcas de tiempo."""
    grc = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.id == id).first()
    if not grc:
        raise HTTPException(status_code=404, detail="Solicitud GRC no encontrada")

    grc.solicitud_pdf_path = None
    grc.firma_solicitante_nombre = None
    grc.firma_solicitante_fecha = None
    grc.firma_revisor_nombre = None
    grc.firma_revisor_fecha = None
    grc.firma_jefe_nombre = None
    grc.firma_jefe_fecha = None
    grc.firma_director_nombre = None
    grc.firma_director_fecha = None
    grc.firma_tesoreria_nombre = None
    grc.firma_tesoreria_fecha = None

    grc.tiempo_revisor_horas = None
    grc.tiempo_jefe_horas = None
    grc.tiempo_director_horas = None
    grc.tiempo_tesoreria_horas = None

    sync_grc_transactions(grc, db, current_user.id)
    db.commit()
    db.refresh(grc)
    return grc


@router.delete("/{id}/clear-liquidation-pdf", response_model=GastoReservaComprobarResponse)
async def clear_liquidation_pdf(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("gastos_reserva_comprobar", "edit")),
):
    """Eliminar el reporte PDF de liquidación y restablecer sus firmas y marcas de tiempo."""
    grc = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.id == id).first()
    if not grc:
        raise HTTPException(status_code=404, detail="Solicitud GRC no encontrada")

    grc.comprobacion_pdf_path = None
    grc.firma_contabilidad_nombre = None
    grc.firma_contabilidad_fecha = None

    grc.tiempo_contabilidad_horas = None
    grc.tiempo_total_dias = None

    sync_grc_transactions(grc, db, current_user.id)
    db.commit()
    db.refresh(grc)
    return grc


@router.post("/{id}/upload-return-receipt", response_model=GastoReservaComprobarResponse)
async def upload_return_receipt(
    id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("gastos_reserva_comprobar", "edit")),
):
    """Subir el comprobante de pago de la devolución y cambiar el estado del GRC."""
    grc = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.id == id).first()
    if not grc:
        raise HTTPException(status_code=404, detail="Solicitud GRC no encontrada")

    # Validar extensión de archivo
    filename = file.filename.lower()
    if not (filename.endswith(".pdf") or filename.endswith(".jpg") or filename.endswith(".jpeg") or filename.endswith(".png")):
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF o una imagen (JPG, PNG)")

    # Crear carpeta si no existe
    upload_dir = "uploads/gastos_reserva_comprobar/devoluciones"
    os.makedirs(upload_dir, exist_ok=True)

    # Nombre único del archivo
    ext = os.path.splitext(file.filename)[1]
    new_filename = f"devolucion_{grc.folio_episa}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = f"/uploads/gastos_reserva_comprobar/devoluciones/{new_filename}"

    with open(os.path.join(upload_dir, new_filename), "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Actualizar GRC
    grc.comprobante_devolucion_path = file_path
    grc.status = "devolucion_realizada"

    # Recalcular saldos
    recalculate_grc_balances(grc, db)

    # Sincronizar transacciones bancarias
    sync_grc_transactions(grc, db, current_user.id)
    
    db.commit()
    db.refresh(grc)
    return grc


@router.delete("/{id}/clear-return-receipt", response_model=GastoReservaComprobarResponse)
async def clear_return_receipt(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("gastos_reserva_comprobar", "edit")),
):
    """Eliminar el comprobante de devolución y regresar al estado comprobado."""
    grc = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.id == id).first()
    if not grc:
        raise HTTPException(status_code=404, detail="Solicitud GRC no encontrada")

    grc.comprobante_devolucion_path = None
    grc.status = "comprobado"

    recalculate_grc_balances(grc, db)
    sync_grc_transactions(grc, db, current_user.id)

    db.commit()
    db.refresh(grc)
    return grc


# ── GESTIÓN DE COMPROBANTES DE GASTO (FACTURAS GRC) ──

@router.post("/{id}/invoices", response_model=GastoReservaComprobarFacturaResponse, status_code=201)
async def upload_grc_invoice(
    id: int,
    xml_file: UploadFile = File(...),
    pdf_file: UploadFile = File(None),
    category_id: int = Form(None),
    description: str = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Subir y validar una factura CFDI (XML/PDF) para comprobar gastos del GRC (sin límites de importe)."""
    grc = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.id == id).first()
    if not grc:
        raise HTTPException(status_code=404, detail="Solicitud GRC no encontrada")

    # Validar permisos (debe ser admin/finanzas o el solicitante/beneficiario del GRC)
    has_global_edit = current_user.has_permission("gastos_reserva_comprobar", "edit")
    if not has_global_edit and grc.solicitante_id != current_user.id and grc.asistente_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para subir facturas a esta solicitud GRC"
        )

    if not xml_file.filename.lower().endswith(".xml"):
        raise HTTPException(status_code=400, detail="El archivo principal debe ser un XML válido")

    # Leer y parsear XML
    xml_content = await xml_file.read()
    parsed = parse_and_validate_cfdi(xml_content)

    if not parsed["is_valid"]:
        # NOTA: Omitimos el error de límite de $5,000 en facturas de GRC
        errors = [
            e for e in parsed["errors"]
            if not ("limite" in e.lower() or "límite" in e.lower() or "5000" in e or "5,000" in e)
        ]
        if errors:
            raise HTTPException(
                status_code=400, 
                detail=f"XML de factura no cumple con las reglas fiscales: {', '.join(errors)}"
            )

    uuid_str = parsed["uuid"]
    # Validar duplicados de factura (en GRC o en viaticos)
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

    from app.models.viatico import ViaticoFactura
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
        
        # Validar correspondencia XML vs PDF (solo si el PDF tiene texto extraíble)
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

    # Crear factura de comprobación
    invoice = GastoReservaComprobarFactura(
        gasto_id=id,
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
        xml_filename=f"/uploads/gastos_reserva_comprobar/xml/{xml_filename}",
        pdf_filename=f"/uploads/gastos_reserva_comprobar/pdf/{pdf_filename}" if pdf_filename else None,
        is_manual=0,
        category_id=category_id,
        description=description,
        sat_status=sat_status,
        sat_verified_at=datetime.now() if sat_status != "Desconocido" else None,
        registered_by_id=current_user.id
    )
    db.add(invoice)
    db.flush()

    # Recalcular montos consolidados del GRC
    recalculate_grc_balances(grc, db)

    # Cambiar estado a comprobacion_pendiente automáticamente
    if grc.status == "aprobado":
        grc.status = "comprobacion_pendiente"

    sync_grc_transactions(grc, db, current_user.id)
    db.commit()
    db.refresh(invoice)
    db.refresh(grc)

    # Log de auditoría
    try:
        is_telegram = bool(request.headers.get("x-bot-token") or request.headers.get("x-impersonate-telegram-id"))
        source_str = "Telegram Bot" if is_telegram else "Plataforma Web"
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="create",
            module="telegram_bot" if is_telegram else "gastos_reserva_comprobar",
            entity_type="GastoReservaComprobarFactura",
            entity_id=invoice.id,
            description=f"Subió factura {invoice.emisor_nombre} (${invoice.total:,.2f} MXN) UUID: {invoice.uuid or 'MANUAL'} a GRC Folio {grc.folio_episa} ({source_str})",
            details={
                "source": "telegram_bot" if is_telegram else "web",
                "gasto_id": grc.id,
                "folio_episa": grc.folio_episa,
                "invoice_id": invoice.id,
                "uuid": invoice.uuid,
                "emisor_nombre": invoice.emisor_nombre,
                "emisor_rfc": invoice.emisor_rfc,
                "total": invoice.total,
                "category": invoice.category.name if invoice.category else None,
            }
        )
    except Exception:
        pass

    return invoice


@router.delete("/invoices/{inv_id}")
async def delete_grc_invoice(
    inv_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("gastos_reserva_comprobar", "edit")),
):
    """Eliminar una factura de la comprobación y recalcular montos."""
    invoice = db.query(GastoReservaComprobarFactura).filter(GastoReservaComprobarFactura.id == inv_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    grc_id = invoice.gasto_id
    grc = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.id == grc_id).first()

    inv_details = {
        "source": "telegram_bot" if bool(request.headers.get("x-bot-token") or request.headers.get("x-impersonate-telegram-id")) else "web",
        "uuid": invoice.uuid,
        "emisor_nombre": invoice.emisor_nombre,
        "total": invoice.total,
        "folio": grc.folio_episa if grc else None
    }

    # Borrar archivos físicos del servidor
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

    db.delete(invoice)
    db.flush()

    # Recalcular montos consolidados
    recalculate_grc_balances(grc, db)

    sync_grc_transactions(grc, db, current_user.id)
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
            module="telegram_bot" if is_telegram else "gastos_reserva_comprobar",
            entity_type="GastoReservaComprobarFactura",
            entity_id=inv_id,
            description=f"Eliminó factura {inv_details['emisor_nombre']} (${inv_details['total']:,.2f} MXN) del GRC Folio {inv_details['folio']} ({source_str})",
            details=inv_details
        )
    except Exception:
        pass

    return {"message": "Factura eliminada de la comprobación"}


@router.put("/invoices/{inv_id}/category")
async def update_grc_invoice_category(
    inv_id: int,
    category_id: int = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Actualizar la categoría de gasto de una factura de GRC."""
    invoice = db.query(GastoReservaComprobarFactura).filter(GastoReservaComprobarFactura.id == inv_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    grc = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.id == invoice.gasto_id).first()
    if not grc:
        raise HTTPException(status_code=404, detail="Solicitud GRC no encontrada")

    # Validar permisos
    has_global_edit = current_user.has_permission("gastos_reserva_comprobar", "edit")
    if not has_global_edit and grc.solicitante_id != current_user.id and grc.asistente_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para modificar facturas de esta solicitud GRC"
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
            module="gastos_reserva_comprobar",
            entity_type="GastoReservaComprobarFactura",
            entity_id=invoice.id,
            description=f"Cambió categoría a '{category.name}' en factura {invoice.emisor_nombre} de GRC Folio {grc.folio_episa}",
            details={"invoice_id": invoice.id, "category": category.name, "folio": grc.folio_episa}
        )
    except Exception:
        pass

    return {"message": "Categoría de factura actualizada correctamente", "category_id": category_id}


@router.post("/invoices/{inv_id}/verify-sat")
async def verify_grc_invoice_sat(
    inv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Consultar al WS del SAT el estado actual de la factura de GRC y actualizarlo."""
    invoice = db.query(GastoReservaComprobarFactura).filter(GastoReservaComprobarFactura.id == inv_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    if not invoice.uuid:
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden verificar ante el SAT facturas que cuenten con archivo XML y UUID fiscal."
        )

    # Validar permisos
    grc = db.query(GastoReservaComprobar).filter(GastoReservaComprobar.id == invoice.gasto_id).first()
    has_global_edit = current_user.has_permission("gastos_reserva_comprobar", "edit")
    if not has_global_edit and grc.solicitante_id != current_user.id and grc.asistente_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para verificar facturas de esta solicitud GRC"
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


