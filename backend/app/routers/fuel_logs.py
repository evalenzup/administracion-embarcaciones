"""
SIAE — Router de Registros de Combustible.
CRUD completo con estadísticas de consumo.
"""

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.fuel_log import FuelLog
from app.models.vessel import Vessel
from app.models.cruise import CruisePlan
from app.schemas.fuel_log import (
    FuelLogCreate, FuelLogUpdate,
    FuelLogResponse, FuelLogList,
    FuelLogStats, FuelLogMonthStat,
)
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/fuel-logs", tags=["Combustible"])


# ── GET lista paginada ────────────────────────────────────────

@router.get("", response_model=FuelLogList)
async def list_fuel_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    vessel_id: Optional[int] = Query(None),
    cruise_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("fuel_logs", "view")),
):
    """Listar registros de combustible con paginación y filtros."""
    query = db.query(FuelLog)

    if vessel_id:
        query = query.filter(FuelLog.vessel_id == vessel_id)
    if cruise_id:
        query = query.filter(FuelLog.cruise_id == cruise_id)
    if date_from:
        query = query.filter(FuelLog.load_date >= date_from)
    if date_to:
        query = query.filter(FuelLog.load_date <= date_to)

    total = query.count()
    items = query.order_by(FuelLog.load_date.desc(), FuelLog.created_at.desc()).offset(skip).limit(limit).all()

    return FuelLogList(total=total, items=items)


# ── GET estadísticas ──────────────────────────────────────────

@router.get("/stats", response_model=FuelLogStats)
async def get_fuel_stats(
    vessel_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    months_back: int = Query(6, ge=1, le=24, description="Meses de historial para la gráfica"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("fuel_logs", "view")),
):
    """Estadísticas de consumo: tarjetas del mes actual y serie mensual para gráfica."""
    from datetime import date as dt_date
    import calendar

    today = dt_date.today()
    first_of_month = today.replace(day=1)

    # Filtro base del mes actual para tarjetas de resumen
    month_q = db.query(FuelLog).filter(FuelLog.load_date >= first_of_month)
    if vessel_id:
        month_q = month_q.filter(FuelLog.vessel_id == vessel_id)

    month_logs = month_q.all()
    total_liters_month = sum(l.liters for l in month_logs)
    total_cost_month = sum(l.total_cost or 0 for l in month_logs) or None
    loads_count_month = len(month_logs)

    # Última carga global (o por embarcación)
    last_q = db.query(FuelLog).order_by(FuelLog.load_date.desc())
    if vessel_id:
        last_q = last_q.filter(FuelLog.vessel_id == vessel_id)
    last_log = last_q.first()
    last_load_date = last_log.load_date if last_log else None

    # Serie mensual para gráfica — agrupar por año/mes/embarcación
    from dateutil.relativedelta import relativedelta  # type: ignore
    cutoff = today - relativedelta(months=months_back - 1)
    cutoff_date = cutoff.replace(day=1)

    series_q = (
        db.query(
            extract("year", FuelLog.load_date).label("year"),
            extract("month", FuelLog.load_date).label("month"),
            FuelLog.vessel_id,
            Vessel.name.label("vessel_name"),
            func.sum(FuelLog.liters).label("total_liters"),
            func.sum(FuelLog.total_cost).label("total_cost"),
            func.count(FuelLog.id).label("loads_count"),
        )
        .join(Vessel, Vessel.id == FuelLog.vessel_id)
        .filter(FuelLog.load_date >= cutoff_date)
    )

    if vessel_id:
        series_q = series_q.filter(FuelLog.vessel_id == vessel_id)

    series_rows = series_q.group_by(
        extract("year", FuelLog.load_date),
        extract("month", FuelLog.load_date),
        FuelLog.vessel_id,
        Vessel.name,
    ).order_by(
        extract("year", FuelLog.load_date),
        extract("month", FuelLog.load_date),
    ).all()

    monthly_series = [
        FuelLogMonthStat(
            year=int(row.year),
            month=int(row.month),
            vessel_id=row.vessel_id,
            vessel_name=row.vessel_name,
            total_liters=float(row.total_liters or 0),
            total_cost=float(row.total_cost) if row.total_cost else None,
            loads_count=int(row.loads_count),
        )
        for row in series_rows
    ]

    return FuelLogStats(
        total_liters_month=total_liters_month,
        total_cost_month=total_cost_month if total_cost_month and total_cost_month > 0 else None,
        loads_count_month=loads_count_month,
        last_load_date=last_load_date,
        monthly_series=monthly_series,
    )


# ── GET por ID ────────────────────────────────────────────────

@router.get("/{log_id}", response_model=FuelLogResponse)
async def get_fuel_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("fuel_logs", "view")),
):
    """Obtener un registro de combustible por ID."""
    log = db.query(FuelLog).filter(FuelLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return log


# ── POST crear ────────────────────────────────────────────────

@router.post("", response_model=FuelLogResponse, status_code=201)
async def create_fuel_log(
    data: FuelLogCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("fuel_logs", "create")),
):
    """Crear un nuevo registro de carga de combustible."""
    # Verificar que la embarcación existe
    vessel = db.query(Vessel).filter(Vessel.id == data.vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    # Verificar crucero si se proporciona
    if data.cruise_id:
        cruise = db.query(CruisePlan).filter(CruisePlan.id == data.cruise_id).first()
        if not cruise:
            raise HTTPException(status_code=404, detail="Crucero no encontrado")

    # Auto-calcular costo total si se dan litros y costo unitario pero no total
    log_data = data.model_dump()
    if log_data.get("unit_cost") and log_data.get("liters") and not log_data.get("total_cost"):
        log_data["total_cost"] = round(log_data["unit_cost"] * log_data["liters"], 2)

    log = FuelLog(**log_data, user_id=current_user.id)
    db.add(log)
    db.commit()
    db.refresh(log)

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="create",
        module="fuel_logs",
        entity_type="FuelLog",
        entity_id=log.id,
        description=f"Registró carga de {log.liters} L de {log.fuel_type} para '{vessel.name}' el {log.load_date}",
        ip_address=request.client.host if request.client else None,
    )

    return log


# ── PUT actualizar ────────────────────────────────────────────

@router.put("/{log_id}", response_model=FuelLogResponse)
async def update_fuel_log(
    log_id: int,
    data: FuelLogUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("fuel_logs", "edit")),
):
    """Actualizar un registro de combustible."""
    log = db.query(FuelLog).filter(FuelLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    update_data = data.model_dump(exclude_unset=True)

    # Recalcular total si cambian litros o costo unitario
    liters = update_data.get("liters", log.liters)
    unit_cost = update_data.get("unit_cost", log.unit_cost)
    if "unit_cost" in update_data and unit_cost and liters and "total_cost" not in update_data:
        update_data["total_cost"] = round(unit_cost * liters, 2)

    changes = {}
    for key, value in update_data.items():
        old_value = getattr(log, key)
        if old_value != value:
            changes[key] = {"antes": str(old_value), "después": str(value)}
        setattr(log, key, value)

    db.commit()
    db.refresh(log)

    if changes:
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="update",
            module="fuel_logs",
            entity_type="FuelLog",
            entity_id=log.id,
            description=f"Actualizó registro de combustible #{log_id}",
            details=changes,
            ip_address=request.client.host if request.client else None,
        )

    return log


# ── DELETE ────────────────────────────────────────────────────

@router.delete("/{log_id}")
async def delete_fuel_log(
    log_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("fuel_logs", "delete")),
):
    """Eliminar un registro de combustible."""
    log = db.query(FuelLog).filter(FuelLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    vessel_name = log.vessel.name if log.vessel else f"vessel_id={log.vessel_id}"
    db.delete(log)
    db.commit()

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="delete",
        module="fuel_logs",
        entity_type="FuelLog",
        entity_id=log_id,
        description=f"Eliminó registro de combustible de '{vessel_name}' del {log.load_date}",
        ip_address=request.client.host if request.client else None,
    )

    return {"message": "Registro eliminado correctamente"}
