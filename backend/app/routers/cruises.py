"""
SIAE — Router de Planes de Crucero.
CRUD con waypoints incluidos. Los waypoints se reemplazan en cada actualización.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime
from sqlalchemy import extract

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.vessel import Vessel
from app.models.vessel_crew import VesselCrew
from app.models.cruise_crew import CruiseCrew
from app.models.cruise import CruisePlan, CruiseWaypoint, CruiseStatus, CruiseEquipmentChecklist, CruiseLogisticsDischarge, CruiseWaypointSample
from app.models.port import Port
from app.schemas.cruise import (
    CruisePlanCreate, CruisePlanUpdate, CruisePlanResponse, CruisePlanList, WaypointCreate, WaypointResponse,
    CruiseEquipmentChecklistCreate, CruiseEquipmentChecklistUpdate, CruiseEquipmentChecklistResponse,
    CruiseLogisticsDischargeCreate, CruiseLogisticsDischargeUpdate, CruiseLogisticsDischargeResponse,
    CruiseWaypointSampleCreate, CruiseWaypointSampleUpdate, CruiseWaypointSampleResponse
)
from app.services.audit import log_action
from app.utils.docx_exporter import generate_docx, get_static_map_image

router = APIRouter(prefix="/api/v1/cruises", tags=["Cruceros"])


@router.get("/public-schedule", response_model=CruisePlanList)
async def public_schedule(
    db: Session = Depends(get_db),
):
    """Obtener cruceros programados, en curso o completados para la agenda pública (sin autenticación)."""
    query = db.query(CruisePlan).filter(
        CruisePlan.is_active == True,
        CruisePlan.status.in_([CruiseStatus.PLANIFICADO, CruiseStatus.EN_CURSO, CruiseStatus.COMPLETADO])
    )
    items = query.order_by(CruisePlan.departure_date.asc()).all()
    return CruisePlanList(total=len(items), items=items)


@router.get("", response_model=CruisePlanList)
async def list_cruises(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=250),
    vessel_id: int = Query(None),
    status: CruiseStatus = Query(None),
    search: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "view")),
):
    query = db.query(CruisePlan).filter(CruisePlan.is_active == True)
    
    # Restringir visibilidad para investigadores (no administradores/operadores)
    is_admin = current_user.is_superadmin or any(r.name in ["Administrador", "Capitán", "Jefe de Máquinas", "Operador"] for r in current_user.roles)
    if not is_admin:
        query = query.filter(CruisePlan.created_by_id == current_user.id)

    if vessel_id:
        query = query.filter(CruisePlan.vessel_id == vessel_id)
    if status:
        query = query.filter(CruisePlan.status == status)
    if search:
        query = query.filter(CruisePlan.name.ilike(f"%{search}%"))

    total = query.count()
    items = query.order_by(CruisePlan.departure_date.desc().nullslast(), CruisePlan.created_at.desc()).offset(skip).limit(limit).all()
    return CruisePlanList(total=total, items=items)


@router.get("/summary")
async def cruises_summary(
    vessel_id: int = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "view")),
):
    query = db.query(CruisePlan).filter(CruisePlan.is_active == True)
    
    # Restringir visibilidad para investigadores (no administradores/operadores)
    is_admin = current_user.is_superadmin or any(r.name in ["Administrador", "Capitán", "Jefe de Máquinas", "Operador"] for r in current_user.roles)
    if not is_admin:
        query = query.filter(CruisePlan.created_by_id == current_user.id)

    if vessel_id:
        query = query.filter(CruisePlan.vessel_id == vessel_id)
    cruises = query.all()
    return {
        "total": len(cruises),
        "borrador": sum(1 for c in cruises if c.status == CruiseStatus.BORRADOR),
        "pendiente": sum(1 for c in cruises if c.status == CruiseStatus.PENDIENTE),
        "planificado": sum(1 for c in cruises if c.status == CruiseStatus.PLANIFICADO),
        "en_curso": sum(1 for c in cruises if c.status == CruiseStatus.EN_CURSO),
        "completado": sum(1 for c in cruises if c.status == CruiseStatus.COMPLETADO),
        "cancelado": sum(1 for c in cruises if c.status == CruiseStatus.CANCELADO),
        "total_nm": round(sum(c.actual_nm or c.planned_nm or 0 for c in cruises), 1),
    }


@router.get("/options")
async def get_cruise_options(
    vessel_id: int = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "view")),
):
    """Obtener lista simplificada de cruceros para selectores."""
    query = db.query(CruisePlan).filter(CruisePlan.is_active == True)
    if vessel_id:
        query = query.filter(CruisePlan.vessel_id == vessel_id)
    
    cruises = query.order_by(CruisePlan.name).all()
    return [{"id": c.id, "name": c.name, "cruise_number": c.cruise_number, "vessel_id": c.vessel_id} for c in cruises]


@router.get("/{cruise_id}", response_model=CruisePlanResponse)
async def get_cruise(
    cruise_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "view")),
):
    cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
    if not cruise:
        raise HTTPException(status_code=404, detail="Plan de crucero no encontrado")
        
    # Verificar propiedad para investigadores
    is_admin = current_user.is_superadmin or any(r.name in ["Administrador", "Capitán", "Jefe de Máquinas", "Operador"] for r in current_user.roles)
    if not is_admin and cruise.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para acceder a este plan")
        
    return cruise


@router.post("", response_model=CruisePlanResponse, status_code=201)
async def create_cruise(
    data: CruisePlanCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "create")),
):
    if not db.query(Vessel).filter(Vessel.id == data.vessel_id).first():
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    waypoints_data = data.waypoints
    cruise_data = data.model_dump(exclude={"waypoints"})

    # Sincronizar nombres string de puertos
    if cruise_data.get("departure_port_id"):
        port = db.query(Port).filter(Port.id == cruise_data["departure_port_id"]).first()
        if port:
            cruise_data["departure_port"] = port.name

    if cruise_data.get("return_port_id"):
        port = db.query(Port).filter(Port.id == cruise_data["return_port_id"]).first()
        if port:
            cruise_data["return_port"] = port.name

    # Auto-generar número de crucero si no se especifica
    if not cruise_data.get("cruise_number"):
        vessel = db.query(Vessel).filter(Vessel.id == data.vessel_id).first()
        vessel_name = vessel.name.upper()
        # Eliminar prefijos comunes
        for prefix in ["B/O ", "BO ", "B.O. ", "F.G. ", "FG "]:
            if vessel_name.startswith(prefix):
                vessel_name = vessel_name[len(prefix):].strip()
        
        # Limpiar espacios y quedarnos con los primeros 4 caracteres
        vessel_code = "".join(vessel_name.split())[:4]
        if not vessel_code:
            vessel_code = "CRUC"

        year = data.departure_date.year if data.departure_date else datetime.now().year
        
        # Contar cruceros existentes del mismo año y embarcación
        count = db.query(CruisePlan).filter(
            CruisePlan.vessel_id == data.vessel_id,
            CruisePlan.is_active == True,
            extract('year', CruisePlan.departure_date) == year
        ).count()
        consecutive = count + 1
        
        base_num = f"{vessel_code}-{year}-{consecutive:02d}"
        cruise_number = base_num
        
        # Asegurar unicidad
        check = db.query(CruisePlan).filter(CruisePlan.cruise_number == cruise_number).first()
        idx = 1
        while check:
            cruise_number = f"{base_num}-{idx}"
            check = db.query(CruisePlan).filter(CruisePlan.cruise_number == cruise_number).first()
            idx += 1
        
        cruise_data["cruise_number"] = cruise_number

    cruise = CruisePlan(**cruise_data)
    db.add(cruise)
    db.flush()

    # Auto-populate base crew of the vessel
    base_crew = db.query(VesselCrew).filter(
        VesselCrew.vessel_id == cruise.vessel_id,
        VesselCrew.is_active == True
    ).all()

    for member in base_crew:
        crew_assignment = CruiseCrew(
            cruise_id=cruise.id,
            personnel_id=member.personnel_id,
            role=member.role,
            notes="Asignado automáticamente como tripulación base"
        )
        db.add(crew_assignment)

    for wp_data in waypoints_data:
        wp = CruiseWaypoint(cruise_id=cruise.id, **wp_data.model_dump())
        db.add(wp)

    db.commit()
    db.refresh(cruise)

    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="create", module="cruises", entity_type="CruisePlan",
               entity_id=cruise.id, description=f"Creó plan de crucero '{cruise.name}'",
               ip_address=request.client.host if request.client else None)
    return cruise


@router.put("/{cruise_id}", response_model=CruisePlanResponse)
async def update_cruise(
    cruise_id: int,
    data: CruisePlanUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
    if not cruise:
        raise HTTPException(status_code=404, detail="Plan no encontrado")

    # Verificar propiedad para investigadores
    is_admin = current_user.is_superadmin or any(r.name in ["Administrador", "Capitán", "Jefe de Máquinas", "Operador"] for r in current_user.roles)
    if not is_admin and cruise.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para modificar este plan")

    update_dict = data.model_dump(exclude_unset=True)

    # Sincronizar nombres string de puertos si cambian sus IDs
    if "departure_port_id" in update_dict:
        dp_id = update_dict["departure_port_id"]
        if dp_id:
            port = db.query(Port).filter(Port.id == dp_id).first()
            if port:
                update_dict["departure_port"] = port.name
        else:
            update_dict["departure_port"] = None

    if "return_port_id" in update_dict:
        rp_id = update_dict["return_port_id"]
        if rp_id:
            port = db.query(Port).filter(Port.id == rp_id).first()
            if port:
                update_dict["return_port"] = port.name
        else:
            update_dict["return_port"] = None

    for key, value in update_dict.items():
        setattr(cruise, key, value)

    db.commit()
    db.refresh(cruise)
    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="update", module="cruises", entity_type="CruisePlan",
               entity_id=cruise.id, description=f"Actualizó plan '{cruise.name}'",
               ip_address=request.client.host if request.client else None)
    return cruise


@router.delete("/{cruise_id}")
async def delete_cruise(
    cruise_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "delete")),
):
    cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
    if not cruise:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    name = cruise.name
    db.delete(cruise)
    db.commit()
    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="delete", module="cruises", entity_type="CruisePlan",
               entity_id=cruise_id, description=f"Eliminó plan '{name}'",
               ip_address=request.client.host if request.client else None)
    return {"message": f"Plan '{name}' eliminado"}


# ── Waypoints ─────────────────────────────────────────────────

@router.post("/{cruise_id}/waypoints", response_model=WaypointResponse, status_code=201)
async def add_waypoint(
    cruise_id: int,
    data: WaypointCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
    if not cruise:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    wp = CruiseWaypoint(cruise_id=cruise_id, **data.model_dump())
    db.add(wp)
    db.commit()
    db.refresh(wp)
    return wp


@router.put("/{cruise_id}/waypoints", response_model=list[WaypointResponse])
async def replace_waypoints(
    cruise_id: int,
    waypoints: list[WaypointCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    """Reemplaza todos los waypoints del crucero reconciliándolos por nombre para conservar muestras."""
    cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
    if not cruise:
        raise HTTPException(status_code=404, detail="Plan no encontrado")

    # Obtener los waypoints existentes
    existing_wps = db.query(CruiseWaypoint).filter(CruiseWaypoint.cruise_id == cruise_id).all()
    
    reused_ids = set()
    new_wps = []
    
    for i, wp_data in enumerate(waypoints):
        existing_wp = None
        if wp_data.name:
            existing_wp = next((w for w in existing_wps if w.name == wp_data.name and w.id not in reused_ids), None)
            
        if existing_wp:
            existing_wp.order_index = i
            existing_wp.latitude = wp_data.latitude
            existing_wp.longitude = wp_data.longitude
            existing_wp.description = wp_data.description
            existing_wp.waypoint_type = wp_data.waypoint_type
            existing_wp.arrival_date = wp_data.arrival_date
            existing_wp.departure_date = wp_data.departure_date
            existing_wp.speed_knots = wp_data.speed_knots
            existing_wp.activity = wp_data.activity
            existing_wp.duration_hours = wp_data.duration_hours
            reused_ids.add(existing_wp.id)
            new_wps.append(existing_wp)
        else:
            wp = CruiseWaypoint(
                cruise_id=cruise_id,
                order_index=i,
                **wp_data.model_dump(exclude={"order_index"})
            )
            db.add(wp)
            new_wps.append(wp)

    for old_wp in existing_wps:
        if old_wp.id not in reused_ids:
            db.delete(old_wp)

    db.commit()
    for wp in new_wps:
        db.refresh(wp)
    return new_wps


@router.delete("/{cruise_id}/waypoints/{waypoint_id}")
async def delete_waypoint(
    cruise_id: int,
    waypoint_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    wp = db.query(CruiseWaypoint).filter(
        CruiseWaypoint.id == waypoint_id,
        CruiseWaypoint.cruise_id == cruise_id
    ).first()
    if not wp:
        raise HTTPException(status_code=404, detail="Waypoint no encontrado")
    db.delete(wp)
    db.commit()
    return {"message": "Waypoint eliminado"}


@router.get("/{cruise_id}/export/docx")
async def export_cruise_docx(
    cruise_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "view")),
):
    """Genera y descarga el documento editable de Word (DOCX) del Plan de Campaña."""
    cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
    if not cruise:
        raise HTTPException(status_code=404, detail="Plan de crucero no encontrado")
        
    try:
        stream = generate_docx(cruise)
        filename = f"Plan_de_Campana_{cruise.cruise_number or cruise.id}.docx"
        return StreamingResponse(
            stream,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar Word: {str(e)}")


@router.get("/{cruise_id}/static-map")
async def get_cruise_static_map(
    cruise_id: int,
    db: Session = Depends(get_db)
):
    """Genera y sirve la imagen del mapa estático para evitar problemas de CORS en el cliente PDF."""
    cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
    if not cruise:
        raise HTTPException(status_code=404, detail="Plan de crucero no encontrado")
        
    map_img = get_static_map_image(cruise.waypoints, cruise.departure_port_ref, cruise.return_port_ref)
    if not map_img:
        raise HTTPException(status_code=404, detail="No se pudo generar la imagen del mapa")
        
    return StreamingResponse(map_img, media_type="image/png")


# ── Endpoints de Checklist de Equipos ──

@router.get("/{cruise_id}/checklist", response_model=list[CruiseEquipmentChecklistResponse])
async def get_cruise_checklist(
    cruise_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "view")),
):
    cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
    if not cruise:
        raise HTTPException(status_code=404, detail="Plan de crucero no encontrado")
    return db.query(CruiseEquipmentChecklist).filter(CruiseEquipmentChecklist.cruise_id == cruise_id).all()


@router.post("/{cruise_id}/checklist", response_model=CruiseEquipmentChecklistResponse, status_code=201)
async def add_checklist_item(
    cruise_id: int,
    data: CruiseEquipmentChecklistCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
    if not cruise:
        raise HTTPException(status_code=404, detail="Plan de crucero no encontrado")
    item = CruiseEquipmentChecklist(cruise_id=cruise_id, **data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{cruise_id}/checklist/{item_id}", response_model=CruiseEquipmentChecklistResponse)
async def update_checklist_item(
    cruise_id: int,
    item_id: int,
    data: CruiseEquipmentChecklistUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    item = db.query(CruiseEquipmentChecklist).filter(
        CruiseEquipmentChecklist.id == item_id,
        CruiseEquipmentChecklist.cruise_id == cruise_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem del checklist no encontrado")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)
    
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{cruise_id}/checklist/{item_id}")
async def delete_checklist_item(
    cruise_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    item = db.query(CruiseEquipmentChecklist).filter(
        CruiseEquipmentChecklist.id == item_id,
        CruiseEquipmentChecklist.cruise_id == cruise_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem del checklist no encontrado")
    
    db.delete(item)
    db.commit()
    return {"message": "Ítem eliminado"}


# ── Endpoints de Logística de Descarga ──

@router.get("/{cruise_id}/discharges", response_model=list[CruiseLogisticsDischargeResponse])
async def get_cruise_discharges(
    cruise_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "view")),
):
    cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
    if not cruise:
        raise HTTPException(status_code=404, detail="Plan de crucero no encontrado")
    return db.query(CruiseLogisticsDischarge).filter(CruiseLogisticsDischarge.cruise_id == cruise_id).all()


@router.post("/{cruise_id}/discharges", response_model=CruiseLogisticsDischargeResponse, status_code=201)
async def add_discharge(
    cruise_id: int,
    data: CruiseLogisticsDischargeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
    if not cruise:
        raise HTTPException(status_code=404, detail="Plan de crucero no encontrado")
    discharge = CruiseLogisticsDischarge(cruise_id=cruise_id, **data.model_dump())
    db.add(discharge)
    db.commit()
    db.refresh(discharge)
    return discharge


@router.put("/{cruise_id}/discharges/{discharge_id}", response_model=CruiseLogisticsDischargeResponse)
async def update_discharge(
    cruise_id: int,
    discharge_id: int,
    data: CruiseLogisticsDischargeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    discharge = db.query(CruiseLogisticsDischarge).filter(
        CruiseLogisticsDischarge.id == discharge_id,
        CruiseLogisticsDischarge.cruise_id == cruise_id
    ).first()
    if not discharge:
        raise HTTPException(status_code=404, detail="Punto de descarga no encontrado")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(discharge, key, value)
    
    db.commit()
    db.refresh(discharge)
    return discharge


@router.delete("/{cruise_id}/discharges/{discharge_id}")
async def delete_discharge(
    cruise_id: int,
    discharge_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    discharge = db.query(CruiseLogisticsDischarge).filter(
        CruiseLogisticsDischarge.id == discharge_id,
        CruiseLogisticsDischarge.cruise_id == cruise_id
    ).first()
    if not discharge:
        raise HTTPException(status_code=404, detail="Punto de descarga no encontrado")
    
    db.delete(discharge)
    db.commit()
    return {"message": "Punto de descarga eliminado"}


# ── Endpoints de Muestras por Waypoint ──

@router.get("/waypoints/{waypoint_id}/samples", response_model=list[CruiseWaypointSampleResponse])
async def get_waypoint_samples(
    waypoint_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "view")),
):
    wp = db.query(CruiseWaypoint).filter(CruiseWaypoint.id == waypoint_id).first()
    if not wp:
        raise HTTPException(status_code=404, detail="Waypoint no encontrado")
    return db.query(CruiseWaypointSample).filter(CruiseWaypointSample.waypoint_id == waypoint_id).all()


@router.post("/waypoints/{waypoint_id}/samples", response_model=CruiseWaypointSampleResponse, status_code=201)
async def add_waypoint_sample(
    waypoint_id: int,
    data: CruiseWaypointSampleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    wp = db.query(CruiseWaypoint).filter(CruiseWaypoint.id == waypoint_id).first()
    if not wp:
        raise HTTPException(status_code=404, detail="Waypoint no encontrado")
    sample = CruiseWaypointSample(waypoint_id=waypoint_id, **data.model_dump())
    db.add(sample)
    db.commit()
    db.refresh(sample)
    return sample


@router.put("/waypoints/{waypoint_id}/samples/{sample_id}", response_model=CruiseWaypointSampleResponse)
async def update_waypoint_sample(
    waypoint_id: int,
    sample_id: int,
    data: CruiseWaypointSampleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    sample = db.query(CruiseWaypointSample).filter(
        CruiseWaypointSample.id == sample_id,
        CruiseWaypointSample.waypoint_id == waypoint_id
    ).first()
    if not sample:
        raise HTTPException(status_code=404, detail="Muestra no encontrada")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(sample, key, value)
    
    db.commit()
    db.refresh(sample)
    return sample


@router.delete("/waypoints/{waypoint_id}/samples/{sample_id}")
async def delete_waypoint_sample(
    waypoint_id: int,
    sample_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    sample = db.query(CruiseWaypointSample).filter(
        CruiseWaypointSample.id == sample_id,
        CruiseWaypointSample.waypoint_id == waypoint_id
    ).first()
    if not sample:
        raise HTTPException(status_code=404, detail="Muestra no encontrada")
    
    db.delete(sample)
    db.commit()
    return {"message": "Muestra eliminada"}


# ── Track GPX Real ────────────────────────────────────────────

from pydantic import BaseModel as _PydanticBase

class GpxTrackPayload(_PydanticBase):
    """Puntos del track GPX ya parseados en el frontend."""
    points: list[dict]          # [{lat, lon, time?}]
    filename: str | None = None


@router.post("/{cruise_id}/gpx", response_model=CruisePlanResponse)
async def upload_gpx_track(
    cruise_id: int,
    payload: GpxTrackPayload,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    """Guarda el track GPS real de un crucero (parseado en el frontend desde un archivo .gpx)."""
    cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
    if not cruise:
        raise HTTPException(status_code=404, detail="Crucero no encontrado")

    if not (current_user.is_superadmin or any(r.name == "Administrador" for r in (current_user.roles or []))):
        raise HTTPException(status_code=403, detail="Solo los administradores pueden subir tracks GPX")

    if not payload.points or len(payload.points) < 2:
        raise HTTPException(status_code=400, detail="El archivo GPX debe contener al menos 2 puntos")

    cruise.actual_track = payload.points
    cruise.actual_track_filename = payload.filename
    cruise.actual_track_uploaded_at = datetime.utcnow()

    db.commit()
    db.refresh(cruise)

    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="update", module="cruises", entity_type="CruisePlan",
               entity_id=cruise_id,
               description=f"Subió track GPX '{payload.filename}' ({len(payload.points)} puntos) al crucero #{cruise_id}",
               ip_address=request.client.host if request.client else None)

    return cruise


@router.delete("/{cruise_id}/gpx")
async def delete_gpx_track(
    cruise_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("cruises", "edit")),
):
    """Elimina el track GPS real de un crucero."""
    cruise = db.query(CruisePlan).filter(CruisePlan.id == cruise_id).first()
    if not cruise:
        raise HTTPException(status_code=404, detail="Crucero no encontrado")

    if not (current_user.is_superadmin or any(r.name == "Administrador" for r in (current_user.roles or []))):
        raise HTTPException(status_code=403, detail="Solo los administradores pueden eliminar tracks GPX")

    cruise.actual_track = None
    cruise.actual_track_filename = None
    cruise.actual_track_uploaded_at = None

    db.commit()

    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="update", module="cruises", entity_type="CruisePlan",
               entity_id=cruise_id,
               description=f"Eliminó el track GPX del crucero #{cruise_id}",
               ip_address=request.client.host if request.client else None)

    return {"message": "Track GPX eliminado"}
