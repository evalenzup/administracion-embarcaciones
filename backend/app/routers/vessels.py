"""
SIAE — Router de Embarcaciones.
CRUD completo con auditoría y filtros.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, File, UploadFile, Header
from sqlalchemy.orm import Session
from typing import Optional, Union, List
import io
import csv
from datetime import datetime, timezone
from fastapi.security.utils import get_authorization_scheme_param

from app.config import get_settings
from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.vessel import Vessel, VesselType, VesselStatus
from app.models.vessel_crew import VesselCrew
from app.models.personnel import Personnel
from app.models.vessel_telemetry import VesselTelemetry
from app.schemas.vessel import VesselCreate, VesselUpdate, VesselResponse, VesselList, VesselBasic
from app.schemas.vessel_crew import VesselCrewCreate, VesselCrewResponse
from app.schemas.vessel_telemetry import VesselTelemetryResponse, VesselTelemetryUploadResult, VesselLatestTelemetry
from app.utils.security import decode_token
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/vessels", tags=["Embarcaciones"])


@router.get("", response_model=VesselList)
async def list_vessels(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: str = Query(None),
    vessel_type: VesselType = Query(None),
    status: VesselStatus = Query(None),
    is_active: bool = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "view")),
):
    """Listar embarcaciones con paginación y filtros."""
    query = db.query(Vessel)

    if search:
        query = query.filter(
            (Vessel.name.ilike(f"%{search}%")) |
            (Vessel.registration_number.ilike(f"%{search}%")) |
            (Vessel.home_port.ilike(f"%{search}%"))
        )

    if vessel_type:
        query = query.filter(Vessel.vessel_type == vessel_type)

    if status:
        query = query.filter(Vessel.status == status)

    if is_active is not None:
        query = query.filter(Vessel.is_active == is_active)

    total = query.count()
    items = query.order_by(Vessel.name).offset(skip).limit(limit).all()

    return VesselList(total=total, items=items)


@router.get("/options", response_model=list[VesselBasic])
async def vessel_options(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "view")),
):
    """Listar embarcaciones activas para selects (sin paginación)."""
    items = db.query(Vessel).filter(Vessel.is_active == True).order_by(Vessel.name).all()
    return items


@router.get("/telemetry/latest", response_model=List[VesselLatestTelemetry])
async def get_all_vessels_telemetry_latest(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "view")),
):
    """Obtener el último punto de telemetría reportado por cada embarcación activa."""
    vessels = db.query(Vessel).filter(Vessel.is_active == True).all()
    results = []

    for v in vessels:
        latest = (
            db.query(VesselTelemetry)
            .filter(VesselTelemetry.vessel_id == v.id)
            .order_by(VesselTelemetry.timestamp.desc())
            .first()
        )
        results.append(
            VesselLatestTelemetry(
                vessel_id=v.id,
                vessel_name=v.name,
                vessel_type=v.vessel_type.value,
                latest_telemetry=latest
            )
        )
    return results


@router.get("/{vessel_id}", response_model=VesselResponse)
async def get_vessel(
    vessel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "view")),
):
    """Obtener una embarcación por ID."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")
    return vessel


@router.post("", response_model=VesselResponse, status_code=201)
async def create_vessel(
    data: VesselCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "create")),
):
    """Crear una nueva embarcación."""
    # Verificar unicidad
    if db.query(Vessel).filter(Vessel.name == data.name).first():
        raise HTTPException(status_code=400, detail="Ya existe una embarcación con ese nombre")

    if data.registration_number:
        if db.query(Vessel).filter(Vessel.registration_number == data.registration_number).first():
            raise HTTPException(status_code=400, detail="El número de registro ya existe")

    vessel = Vessel(**data.model_dump())
    db.add(vessel)
    db.commit()
    db.refresh(vessel)

    # Auditoría
    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="create",
        module="vessels",
        entity_type="Vessel",
        entity_id=vessel.id,
        description=f"Creó embarcación '{vessel.name}'",
        ip_address=request.client.host if request.client else None,
    )

    return vessel


@router.put("/{vessel_id}", response_model=VesselResponse)
async def update_vessel(
    vessel_id: int,
    data: VesselUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "edit")),
):
    """Actualizar una embarcación existente."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    # Verificar unicidad si se cambia nombre
    update_data = data.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] != vessel.name:
        existing = db.query(Vessel).filter(Vessel.name == update_data["name"]).first()
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe una embarcación con ese nombre")

    if "registration_number" in update_data and update_data["registration_number"] != vessel.registration_number:
        existing = db.query(Vessel).filter(
            Vessel.registration_number == update_data["registration_number"]
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="El número de registro ya existe")

    # Registrar cambios para auditoría
    changes = {}
    for key, value in update_data.items():
        old_value = getattr(vessel, key)
        if old_value != value:
            changes[key] = {"antes": str(old_value), "después": str(value)}
        setattr(vessel, key, value)

    db.commit()
    db.refresh(vessel)

    if changes:
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="update",
            module="vessels",
            entity_type="Vessel",
            entity_id=vessel.id,
            description=f"Actualizó embarcación '{vessel.name}'",
            details=changes,
            ip_address=request.client.host if request.client else None,
        )

    return vessel


@router.delete("/{vessel_id}")
async def delete_vessel(
    vessel_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "delete")),
):
    """Eliminar una embarcación."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    vessel_name = vessel.name
    db.delete(vessel)
    db.commit()

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="delete",
        module="vessels",
        entity_type="Vessel",
        entity_id=vessel_id,
        description=f"Eliminó embarcación '{vessel_name}'",
        ip_address=request.client.host if request.client else None,
    )

    return {"message": f"Embarcación '{vessel_name}' eliminada correctamente"}


# ── Tripulación Base ──────────────────────────────────────────

@router.get("/{vessel_id}/crew", response_model=list[VesselCrewResponse])
async def list_vessel_crew(
    vessel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "view")),
):
    """Listar la tripulación base asignada a una embarcación."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    return (
        db.query(VesselCrew)
        .filter(VesselCrew.vessel_id == vessel_id, VesselCrew.is_active == True)
        .order_by(VesselCrew.role)
        .all()
    )


@router.post("/{vessel_id}/crew", response_model=VesselCrewResponse, status_code=201)
async def add_vessel_crew(
    vessel_id: int,
    data: VesselCrewCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "edit")),
):
    """Agregar un miembro de personal a la tripulación base de una embarcación."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    personnel = db.query(Personnel).filter(Personnel.id == data.personnel_id).first()
    if not personnel:
        raise HTTPException(status_code=404, detail="Personal no encontrado")

    # Evitar duplicados
    existing = db.query(VesselCrew).filter(
        VesselCrew.vessel_id == vessel_id,
        VesselCrew.personnel_id == data.personnel_id,
        VesselCrew.is_active == True,
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"'{personnel.full_name}' ya está asignado a esta embarcación"
        )

    crew = VesselCrew(vessel_id=vessel_id, **data.model_dump())
    db.add(crew)
    db.commit()
    db.refresh(crew)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="create", module="vessels", entity_type="VesselCrew",
        entity_id=crew.id,
        description=f"Asignó '{personnel.full_name}' como tripulación base de '{vessel.name}'",
        ip_address=request.client.host if request.client else None,
    )
    return crew


@router.delete("/{vessel_id}/crew/{crew_id}")
async def remove_vessel_crew(
    vessel_id: int,
    crew_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "edit")),
):
    """Quitar un miembro de la tripulación base de una embarcación."""
    crew = db.query(VesselCrew).filter(
        VesselCrew.id == crew_id,
        VesselCrew.vessel_id == vessel_id,
    ).first()
    if not crew:
        raise HTTPException(status_code=404, detail="Miembro de tripulación no encontrado")

    name = crew.personnel.full_name if crew.personnel else "—"
    vessel_name = crew.vessel.name if crew.vessel else "—"
    db.delete(crew)
    db.commit()

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="delete", module="vessels", entity_type="VesselCrew",
        entity_id=crew_id,
        description=f"Quitó a '{name}' de la tripulación base de '{vessel_name}'",
        ip_address=request.client.host if request.client else None,
    )
    return {"message": f"'{name}' removido de la tripulación base"}


# ── Telemetría (Meteorología y GPS) ───────────────────────────

async def get_current_user_optional_bearer_or_api_key(
    request: Request,
    db: Session = Depends(get_db),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    api_key: Optional[str] = Query(None),
) -> Union[User, str]:
    settings = get_settings()
    provided_key = x_api_key or api_key
    if provided_key:
        if provided_key == settings.TELEMETRY_API_KEY:
            return "device"
        raise HTTPException(status_code=401, detail="API Key de telemetría inválida")

    authorization = request.headers.get("Authorization")
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Falta autenticación (X-API-Key, api_key query, o Bearer token)",
        )
    
    scheme, credentials = get_authorization_scheme_param(authorization)
    if scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Esquema de autorización inválido")
    
    payload = decode_token(credentials)
    if payload is None:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    
    user_id = int(payload.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario inválido o inactivo")
    
    return user


def parse_telemetry_csv(csv_content: str) -> List[dict]:
    reader = csv.DictReader(io.StringIO(csv_content))
    if reader.fieldnames:
        reader.fieldnames = [name.strip() for name in reader.fieldnames]
    
    field_mapping = {
        "timestamp_utc": "timestamp",
        "node": "node",
        "dir": "wind_dir",
        "speed": "wind_speed",
        "cdir": "wind_dir_corr",
        "cspeed": "wind_speed_corr",
        "pressure": "pressure",
        "humidity": "humidity",
        "temp": "temp",
        "dewpoint": "dewpoint",
        "precip_total": "precip_total",
        "precip_int": "precip_int",
        "lat": "latitude",
        "lon": "longitude",
        "gps_fix": "gps_fix",
        "supply_v": "supply_v",
        "status": "status"
    }

    records = []
    for row in reader:
        ts_str = row.get("timestamp_utc") or row.get("timestamp")
        if not ts_str:
            continue
        
        try:
            ts_str = ts_str.strip()
            ts = datetime.fromisoformat(ts_str)
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
        except ValueError:
            continue

        record = {"timestamp": ts}
        for csv_col, model_col in field_mapping.items():
            if csv_col in ("timestamp_utc", "timestamp"):
                continue
            
            val = row.get(csv_col)
            if val is not None:
                val = val.strip()
                if val == "":
                    record[model_col] = None
                elif model_col == "gps_fix":
                    record[model_col] = val.lower() in ("1", "true", "yes")
                elif model_col in ("node", "status"):
                    record[model_col] = val
                else:
                    try:
                        record[model_col] = float(val)
                    except ValueError:
                        record[model_col] = None
            else:
                record[model_col] = None
        
        records.append(record)
    
    return records


@router.post("/{vessel_id}/telemetry", response_model=VesselTelemetryUploadResult, status_code=201)
async def upload_vessel_telemetry(
    vessel_id: int,
    request: Request,
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    auth: Union[User, str] = Depends(get_current_user_optional_bearer_or_api_key),
):
    """
    Subir telemetría meteorológica y de posición de una embarcación.
    Acepta tanto carga de archivo CSV (multipart) como cuerpo de texto CSV crudo.
    """
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    if isinstance(auth, User):
        if not auth.has_permission("vessels", "edit"):
            raise HTTPException(status_code=403, detail="No tienes permisos para modificar datos de la embarcación")

    csv_content = ""
    if file:
        content_bytes = await file.read()
        csv_content = content_bytes.decode("utf-8")
    else:
        content_bytes = await request.body()
        csv_content = content_bytes.decode("utf-8")

    if not csv_content.strip():
        raise HTTPException(status_code=400, detail="Contenido de telemetría vacío")

    try:
        raw_records = parse_telemetry_csv(csv_content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parseando CSV: {str(e)}")

    if not raw_records:
        return VesselTelemetryUploadResult(
            success=True,
            message="No se encontraron registros de telemetría válidos para procesar",
            records_received=0,
            records_inserted=0
        )

    timestamps = [r["timestamp"] for r in raw_records]
    min_ts, max_ts = min(timestamps), max(timestamps)

    existing_rows = (
        db.query(VesselTelemetry.timestamp)
        .filter(
            VesselTelemetry.vessel_id == vessel_id,
            VesselTelemetry.timestamp >= min_ts,
            VesselTelemetry.timestamp <= max_ts
        )
        .all()
    )
    existing_timestamps = {row.timestamp for row in existing_rows}

    inserted_count = 0
    for r in raw_records:
        if r["timestamp"] in existing_timestamps:
            continue
        
        db_record = VesselTelemetry(vessel_id=vessel_id, **r)
        db.add(db_record)
        inserted_count += 1

    if inserted_count > 0:
        db.commit()

    return VesselTelemetryUploadResult(
        success=True,
        message=f"Se procesaron {len(raw_records)} registros, {inserted_count} nuevos insertados.",
        records_received=len(raw_records),
        records_inserted=inserted_count
    )


@router.get("/{vessel_id}/telemetry", response_model=List[VesselTelemetryResponse])
async def get_vessel_telemetry(
    vessel_id: int,
    start: Optional[datetime] = Query(None, description="Fecha de inicio (ISO, UTC)"),
    end: Optional[datetime] = Query(None, description="Fecha de fin (ISO, UTC)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "view")),
):
    """Obtener el historial de telemetría de una embarcación en un rango de fechas."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    query = db.query(VesselTelemetry).filter(VesselTelemetry.vessel_id == vessel_id)

    if start:
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        query = query.filter(VesselTelemetry.timestamp >= start)
    if end:
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        query = query.filter(VesselTelemetry.timestamp <= end)

    return query.order_by(VesselTelemetry.timestamp.asc()).all()


@router.get("/{vessel_id}/telemetry/latest", response_model=Optional[VesselTelemetryResponse])
async def get_vessel_telemetry_latest(
    vessel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vessels", "view")),
):
    """Obtener la lectura de telemetría más reciente de una embarcación."""
    vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    return (
        db.query(VesselTelemetry)
        .filter(VesselTelemetry.vessel_id == vessel_id)
        .order_by(VesselTelemetry.timestamp.desc())
        .first()
    )

