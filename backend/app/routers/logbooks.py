"""
SIAE — Router de Bitácoras.
CRUD de entradas de bitácora por tipo y embarcación.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from datetime import date

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.vessel import Vessel
from app.models.logbook import LogbookEntry, LogbookType, LogbookEventType
from app.schemas.logbook import (
    LogbookEntryCreate, LogbookEntryUpdate, LogbookEntryResponse, LogbookEntryList,
    LogbookEventTypeCreate, LogbookEventTypeUpdate, LogbookEventTypeResponse
)
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/logbooks", tags=["Bitácoras"])


@router.get("", response_model=LogbookEntryList)
async def list_entries(
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    vessel_id: int = Query(None),
    logbook_type: LogbookType = Query(None),
    cruise_id: int = Query(None),
    date_from: date = Query(None),
    date_to: date = Query(None),
    search: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("logbooks", "view")),
):
    query = db.query(LogbookEntry)
    if vessel_id:
        query = query.filter(LogbookEntry.vessel_id == vessel_id)
    if logbook_type:
        query = query.filter(LogbookEntry.logbook_type == logbook_type)
    if cruise_id:
        query = query.filter(LogbookEntry.cruise_id == cruise_id)
    if date_from:
        query = query.filter(LogbookEntry.entry_date >= date_from)
    if date_to:
        query = query.filter(LogbookEntry.entry_date <= date_to)
    if search:
        query = query.filter(
            (LogbookEntry.content.ilike(f"%{search}%")) |
            (LogbookEntry.title.ilike(f"%{search}%")) |
            (LogbookEntry.location_name.ilike(f"%{search}%"))
        )

    total = query.count()
    items = query.order_by(LogbookEntry.entry_date.desc(), LogbookEntry.created_at.desc()).offset(skip).limit(limit).all()
    return LogbookEntryList(total=total, items=items)

# ── Event Types ───────────────────────────────────────────────

@router.get("/event-types", response_model=list[LogbookEventTypeResponse])
async def list_event_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("logbooks", "view")),
):
    return db.query(LogbookEventType).filter(LogbookEventType.is_active == True).order_by(LogbookEventType.name).all()

@router.post("/event-types", response_model=LogbookEventTypeResponse, status_code=201)
async def create_event_type(
    data: LogbookEventTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("logbooks", "create")), # Solo roles altos deberian poder crear, pero reusamos el perm
):
    et = LogbookEventType(**data.model_dump())
    db.add(et)
    db.commit()
    db.refresh(et)
    return et

@router.put("/event-types/{et_id}", response_model=LogbookEventTypeResponse)
async def update_event_type(
    et_id: int,
    data: LogbookEventTypeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("logbooks", "edit")),
):
    et = db.query(LogbookEventType).filter(LogbookEventType.id == et_id).first()
    if not et:
        raise HTTPException(status_code=404, detail="Tipo de evento no encontrado")
    
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(et, key, val)
        
    db.commit()
    db.refresh(et)
    return et

# ── Entries ───────────────────────────────────────────────

@router.get("/latest-hourmeters")
async def latest_hourmeters(
    vessel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("logbooks", "view")),
):
    """Últimas lecturas de horómetro por componente para una embarcación."""
    entries = (
        db.query(LogbookEntry)
        .filter(
            LogbookEntry.vessel_id == vessel_id,
            LogbookEntry.logbook_type == LogbookType.MAQUINAS,
            LogbookEntry.engine_hours.isnot(None),
        )
        .order_by(LogbookEntry.entry_date.desc())
        .limit(50)
        .all()
    )
    # Agrupar por componente, quedarnos con el más reciente de cada uno
    latest = {}
    for e in entries:
        comp = e.component_name or "Sin nombre"
        if comp not in latest:
            latest[comp] = {
                "component_name": comp,
                "engine_hours": e.engine_hours,
                "entry_date": e.entry_date.isoformat(),
            }
    return list(latest.values())


@router.get("/{entry_id}", response_model=LogbookEntryResponse)
async def get_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("logbooks", "view")),
):
    entry = db.query(LogbookEntry).filter(LogbookEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")
    return entry


@router.post("", response_model=LogbookEntryResponse, status_code=201)
async def create_entry(
    data: LogbookEntryCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("logbooks", "create")),
):
    if not db.query(Vessel).filter(Vessel.id == data.vessel_id).first():
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    payload = data.model_dump()
    payload["user_id"] = current_user.id

    entry = LogbookEntry(**payload)
    db.add(entry)
    db.commit()
    db.refresh(entry)

    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="create", module="logbooks", entity_type="LogbookEntry",
               entity_id=entry.id,
               description=f"Registró entrada de bitácora [{entry.logbook_type.value}] para vessel_id={entry.vessel_id}",
               ip_address=request.client.host if request.client else None)
    return entry


@router.put("/{entry_id}", response_model=LogbookEntryResponse)
async def update_entry(
    entry_id: int,
    data: LogbookEntryUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("logbooks", "edit")),
):
    entry = db.query(LogbookEntry).filter(LogbookEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)

    db.commit()
    db.refresh(entry)
    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="update", module="logbooks", entity_type="LogbookEntry",
               entity_id=entry.id, description=f"Actualizó entrada de bitácora #{entry.id}",
               ip_address=request.client.host if request.client else None)
    return entry


@router.delete("/{entry_id}")
async def delete_entry(
    entry_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("logbooks", "delete")),
):
    entry = db.query(LogbookEntry).filter(LogbookEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")

    db.delete(entry)
    db.commit()
    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="delete", module="logbooks", entity_type="LogbookEntry",
               entity_id=entry_id, description=f"Eliminó entrada de bitácora #{entry_id}",
               ip_address=request.client.host if request.client else None)
    return {"message": "Entrada eliminada"}
