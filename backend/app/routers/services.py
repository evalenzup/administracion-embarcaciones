"""
SIAE — Endpoints para la gestión de Solicitudes de Servicios de Terceros.
"""

import os
import shutil
import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_permission
from app.models.user import User
from app.models.provider import Provider
from app.models.service_request import ServiceRequest, ServiceStageHistory, ServiceObservation
from app.schemas.service import (
    ServiceRequestResponse,
    ServiceObservationResponse,
    ServiceObservationCreate,
    ServiceStageHistoryUpdate,
)
from app.services.audit import log_action
from app.utils.xml_parser import parse_and_validate_cfdi

router = APIRouter(prefix="/api/v1/services", tags=["Finanzas — Solicitudes de Servicios"])

UPLOAD_DIR = "uploads/services"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def calculate_stage_durations(history: List[ServiceStageHistory]) -> dict:
    """Calcula el tiempo transcurrido en cada etapa en formato legible (ej. '2d 4h 10m')."""
    durations = {}
    if not history:
        return durations

    # Asegurar orden cronológico ascendente
    sorted_history = sorted(history, key=lambda h: h.entered_at)

    for i in range(len(sorted_history)):
        start_tx = sorted_history[i]
        start_time = start_tx.entered_at

        # Si hay una siguiente etapa, esa define el fin de la actual
        if i < len(sorted_history) - 1:
            end_time = sorted_history[i + 1].entered_at
        else:
            # Si es la última etapa y es final (pagado o cancelado), no sumamos tiempo activo
            if start_tx.stage in ("pagado", "cancelado"):
                continue
            else:
                end_time = datetime.now(start_time.tzinfo)

        delta = end_time - start_time
        days = delta.days
        hours = delta.seconds // 3600
        minutes = (delta.seconds % 3600) // 60

        parts = []
        if days > 0:
            parts.append(f"{days}d")
        if hours > 0:
            parts.append(f"{hours}h")
        if minutes > 0 or not parts:
            parts.append(f"{minutes}m")

        durations[start_tx.stage] = " ".join(parts)

    return durations


def map_service_response(req: ServiceRequest) -> dict:
    """Serializa un ServiceRequest mapeando campos adicionales como nombres e historiales."""
    history_responses = []
    for h in req.history:
        history_responses.append({
            "id": h.id,
            "stage": h.stage,
            "entered_at": h.entered_at,
            "notes": h.notes,
            "user_id": h.user_id,
            "user_name": h.user.full_name if h.user else "Sistema"
        })

    observation_responses = []
    for o in req.observations:
        observation_responses.append({
            "id": o.id,
            "notes": o.notes,
            "created_at": o.created_at,
            "user_id": o.user_id,
            "user_name": o.user.full_name if o.user else "Sistema"
        })

    stage_durations = calculate_stage_durations(req.history)

    return {
        "id": req.id,
        "internal_folio": req.internal_folio,
        "provider_name": req.provider_name,
        "provider_id": req.provider_id,
        "provider": {
            "id": req.provider.id,
            "rfc": req.provider.rfc,
            "legal_name": req.provider.legal_name,
            "commercial_name": req.provider.commercial_name,
            "is_active": req.provider.is_active,
            "created_at": req.provider.created_at,
            "updated_at": req.provider.updated_at
        } if req.provider else None,
        "description": req.description,
        "status": req.status,
        "episa_folio": req.episa_folio,
        "authorization_folio": req.authorization_folio,
        "budget_amount": req.budget_amount,
        "budget_file": req.budget_file,
        "authorization_email_file": req.authorization_email_file,
        "invoice_xml_file": req.invoice_xml_file,
        "invoice_pdf_file": req.invoice_pdf_file,
        "conformity_letter_file": req.conformity_letter_file,
        "payment_receipt_file": req.payment_receipt_file,
        "created_by_id": req.created_by_id,
        "created_by_name": req.created_by.full_name if req.created_by else "Sistema",
        "created_at": req.created_at,
        "updated_at": req.updated_at,
        "history": history_responses,
        "observations": observation_responses,
        "stage_durations": stage_durations
    }


# ── RUTAS DE API ──

@router.get("", response_model=List[ServiceRequestResponse])
async def list_services(
    status: Optional[str] = Query(None, description="Filtrar por etapa"),
    search: Optional[str] = Query(None, description="Buscar por proveedor, folio o descripción"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("services", "view")),
):
    """Listar todas las solicitudes de servicios con filtros."""
    query = db.query(ServiceRequest)

    if status:
        query = query.filter(ServiceRequest.status == status)

    if search:
        search_like = f"%{search}%"
        query = query.filter(
            (ServiceRequest.provider_name.ilike(search_like)) |
            (ServiceRequest.internal_folio.ilike(search_like)) |
            (ServiceRequest.episa_folio.ilike(search_like)) |
            (ServiceRequest.description.ilike(search_like))
        )

    requests = query.order_by(ServiceRequest.created_at.desc()).all()
    return [map_service_response(r) for r in requests]


@router.post("", response_model=ServiceRequestResponse, status_code=201)
async def create_service(
    request: Request,
    description: str = Form(...),
    episa_folio: str = Form(...),
    budget_amount: float = Form(...),
    provider_name: Optional[str] = Form(None),
    provider_id: Optional[int] = Form(None),
    date: Optional[datetime] = Form(None),
    budget_file: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("services", "create")),
):
    """Crear una nueva solicitud de servicio (Solicitado)."""
    # Generar Folio Interno SRV-YYYY-XXXX
    current_year = datetime.now().year
    year_start = datetime(current_year, 1, 1)
    year_end = datetime(current_year, 12, 31, 23, 59, 59)

    count = db.query(ServiceRequest).filter(
        ServiceRequest.created_at >= year_start,
        ServiceRequest.created_at <= year_end
    ).count()

    internal_folio = f"SRV-{current_year}-{count + 1:04d}"

    if provider_id:
        provider = db.query(Provider).filter(Provider.id == provider_id).first()
        if not provider:
            raise HTTPException(status_code=400, detail="El proveedor seleccionado no existe.")
        if not provider_name:
            provider_name = provider.commercial_name or provider.legal_name

    event_date = date or datetime.now()

    # Crear entidad
    srv = ServiceRequest(
        internal_folio=internal_folio,
        provider_name=provider_name,
        provider_id=provider_id,
        description=description,
        status="solicitado",
        episa_folio=episa_folio,
        budget_amount=budget_amount,
        created_by_id=current_user.id,
        created_at=event_date,
        updated_at=event_date
    )
    db.add(srv)
    db.flush()

    # Guardar archivo de presupuesto si existe
    if budget_file:
        ext = budget_file.filename.split(".")[-1] if "." in budget_file.filename else "pdf"
        unique_filename = f"{srv.id}_budget_{uuid.uuid4().hex[:8]}.{ext}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(budget_file.file, buffer)

        srv.budget_file = f"/uploads/services/{unique_filename}"

    # Registrar historial inicial
    history = ServiceStageHistory(
        service_request_id=srv.id,
        stage="solicitado",
        notes=f"Solicitud creada. Folio e-pisa: {episa_folio}",
        user_id=current_user.id,
        entered_at=event_date
    )
    db.add(history)
    
    db.commit()
    db.refresh(srv)

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="create",
        module="services",
        entity_type="ServiceRequest",
        entity_id=srv.id,
        description=f"Registró solicitud de servicio '{srv.internal_folio}' de '{srv.provider_name}' por ${srv.budget_amount}",
        ip_address=request.client.host if request and request.client else None
    )

    return map_service_response(srv)


@router.get("/{id}", response_model=ServiceRequestResponse)
async def get_service(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("services", "view")),
):
    """Obtener el detalle completo de una solicitud de servicio."""
    srv = db.query(ServiceRequest).filter(ServiceRequest.id == id).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Solicitud de servicio no encontrada.")
    return map_service_response(srv)


@router.put("/{id}/stage", response_model=ServiceRequestResponse)
async def update_stage(
    id: int,
    request: Request,
    status: str = Form(...),
    notes: Optional[str] = Form(None),
    authorization_folio: Optional[str] = Form(None),
    authorization_email_file: Optional[UploadFile] = File(None),
    xml_file: Optional[UploadFile] = File(None),
    pdf_file: Optional[UploadFile] = File(None),
    conformity_file: Optional[UploadFile] = File(None),
    payment_file: Optional[UploadFile] = File(None),
    date: Optional[datetime] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("services", "edit")),
):
    """Actualizar la etapa del servicio y cargar la documentación correspondiente."""
    srv = db.query(ServiceRequest).filter(ServiceRequest.id == id).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Solicitud de servicio no encontrada.")

    valid_stages = ["solicitado", "aprobado_hacienda", "en_proceso_pago", "pagado", "cancelado"]
    if status not in valid_stages:
        raise HTTPException(status_code=400, detail="Etapa inválida.")

    # Validaciones según la etapa destino
    if status == "aprobado_hacienda":
        if authorization_email_file:
            ext = authorization_email_file.filename.split(".")[-1] if "." in authorization_email_file.filename else "png"
            unique_filename = f"{srv.id}_auth_{uuid.uuid4().hex[:8]}.{ext}"
            file_path = os.path.join(UPLOAD_DIR, unique_filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(authorization_email_file.file, buffer)
            srv.authorization_email_file = f"/uploads/services/{unique_filename}"

    elif status == "en_proceso_pago":
        if not srv.invoice_xml_file and not xml_file:
            raise HTTPException(status_code=400, detail="El archivo XML de la factura es obligatorio en esta etapa.")
        if not srv.invoice_pdf_file and not pdf_file:
            raise HTTPException(status_code=400, detail="El archivo PDF de la factura es obligatorio en esta etapa.")
        
        # Guardar XML si se subió uno nuevo
        if xml_file:
            xml_ext = xml_file.filename.split(".")[-1] if "." in xml_file.filename else "xml"
            xml_name = f"{srv.id}_invoice_{uuid.uuid4().hex[:8]}.{xml_ext}"
            xml_path = os.path.join(UPLOAD_DIR, xml_name)
            with open(xml_path, "wb") as buffer:
                shutil.copyfileobj(xml_file.file, buffer)
            srv.invoice_xml_file = f"/uploads/services/{xml_name}"

            # Parsear XML para extraer datos de proveedor
            try:
                with open(xml_path, "rb") as f:
                    xml_content = f.read()
                parsed = parse_and_validate_cfdi(xml_content)
                if parsed.get("emisor_rfc") and parsed.get("emisor_nombre"):
                    rfc = parsed["emisor_rfc"].upper().strip()
                    legal_name = parsed["emisor_nombre"].strip()
                    
                    # Buscar si el proveedor ya existe
                    provider = db.query(Provider).filter(Provider.rfc == rfc).first()
                    if not provider:
                        provider = Provider(
                            rfc=rfc,
                            legal_name=legal_name,
                            commercial_name=srv.provider_name or legal_name
                        )
                        db.add(provider)
                        db.flush()
                    else:
                        if not provider.legal_name:
                            provider.legal_name = legal_name
                            db.flush()
                    
                    srv.provider_id = provider.id
            except Exception as e:
                print(f"⚠️ Error al parsear XML para extraer proveedor: {e}")

        # Guardar PDF si se subió uno nuevo
        if pdf_file:
            pdf_ext = pdf_file.filename.split(".")[-1] if "." in pdf_file.filename else "pdf"
            pdf_name = f"{srv.id}_invoice_{uuid.uuid4().hex[:8]}.{pdf_ext}"
            pdf_path = os.path.join(UPLOAD_DIR, pdf_name)
            with open(pdf_path, "wb") as buffer:
                shutil.copyfileobj(pdf_file.file, buffer)
            srv.invoice_pdf_file = f"/uploads/services/{pdf_name}"

        # Guardar Carta de conformidad (opcional)
        if conformity_file:
            conf_ext = conformity_file.filename.split(".")[-1] if "." in conformity_file.filename else "pdf"
            conf_name = f"{srv.id}_conformity_{uuid.uuid4().hex[:8]}.{conf_ext}"
            conf_path = os.path.join(UPLOAD_DIR, conf_name)
            with open(conf_path, "wb") as buffer:
                shutil.copyfileobj(conformity_file.file, buffer)
            srv.conformity_letter_file = f"/uploads/services/{conf_name}"

    elif status == "pagado":
        # Guardar comprobante de pago (opcional)
        if payment_file:
            pay_ext = payment_file.filename.split(".")[-1] if "." in payment_file.filename else "pdf"
            pay_name = f"{srv.id}_receipt_{uuid.uuid4().hex[:8]}.{pay_ext}"
            pay_path = os.path.join(UPLOAD_DIR, pay_name)
            with open(pay_path, "wb") as buffer:
                shutil.copyfileobj(payment_file.file, buffer)
            srv.payment_receipt_file = f"/uploads/services/{pay_name}"

    elif status == "cancelado":
        if not notes:
            raise HTTPException(status_code=400, detail="Es obligatorio registrar el motivo de la cancelación.")

    # Guardar estado y crear registro histórico
    srv.status = status
    event_date = date or datetime.now()
    srv.updated_at = event_date
    history = ServiceStageHistory(
        service_request_id=srv.id,
        stage=status,
        notes=notes or f"Transición a la etapa: '{status}'.",
        user_id=current_user.id,
        entered_at=event_date
    )
    db.add(history)
    
    db.commit()
    db.refresh(srv)

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="update",
        module="services",
        entity_type="ServiceRequest",
        entity_id=srv.id,
        description=f"Actualizó etapa de solicitud '{srv.internal_folio}' a '{status}'",
        ip_address=request.client.host if request and request.client else None
    )

    return map_service_response(srv)


@router.post("/{id}/observations", response_model=ServiceObservationResponse)
async def add_observation(
    id: int,
    data: ServiceObservationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("services", "edit")),
):
    """Registrar un comentario u observación en la bitácora de incidencias."""
    srv = db.query(ServiceRequest).filter(ServiceRequest.id == id).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Solicitud de servicio no encontrada.")

    obs_args = {
        "service_request_id": id,
        "notes": data.notes,
        "user_id": current_user.id
    }
    if data.created_at is not None:
        obs_args["created_at"] = data.created_at
    obs = ServiceObservation(**obs_args)
    db.add(obs)
    db.commit()
    db.refresh(obs)

    # Devolver mapeado con el nombre del usuario
    return {
        "id": obs.id,
        "notes": obs.notes,
        "created_at": obs.created_at,
        "user_id": obs.user_id,
        "user_name": current_user.full_name
    }


@router.put("/{id}/history/{history_id}", response_model=ServiceRequestResponse)
async def update_history_date(
    id: int,
    history_id: int,
    data: ServiceStageHistoryUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("services", "edit")),
):
    """Actualizar la fecha/hora y notas de un registro del historial de etapas."""
    srv = db.query(ServiceRequest).filter(ServiceRequest.id == id).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Solicitud de servicio no encontrada.")

    history = db.query(ServiceStageHistory).filter(
        ServiceStageHistory.id == history_id,
        ServiceStageHistory.service_request_id == id
    ).first()
    if not history:
        raise HTTPException(status_code=404, detail="Registro de historial no encontrado.")

    # Actualizar fecha y notas
    history.entered_at = data.entered_at
    if data.notes is not None:
        history.notes = data.notes

    # Si este registro de historial corresponde a la etapa inicial ("solicitado"), 
    # también actualizamos la fecha de creación del servicio para que coincida.
    if history.stage == "solicitado":
        srv.created_at = data.entered_at

    db.commit()
    db.refresh(srv)

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="update",
        module="services",
        entity_type="ServiceStageHistory",
        entity_id=history_id,
        description=f"Modificó la fecha de la etapa '{history.stage}' del servicio '{srv.internal_folio}' a '{data.entered_at}'",
        ip_address=request.client.host if request and request.client else None
    )

    return map_service_response(srv)

@router.put("/{id}/documents", response_model=ServiceRequestResponse)
async def replace_document(
    id: int,
    request: Request,
    document_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("services", "edit")),
):
    """Reemplazar un documento existente en el expediente de la solicitud o subir uno nuevo."""
    srv = db.query(ServiceRequest).filter(ServiceRequest.id == id).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Solicitud de servicio no encontrada.")

    valid_types = {
        "budget": ("budget_file", "budget", "pdf"),
        "authorization_email": ("authorization_email_file", "auth", "image/pdf"),
        "invoice_xml": ("invoice_xml_file", "invoice", "xml"),
        "invoice_pdf": ("invoice_pdf_file", "invoice", "pdf"),
        "conformity_letter": ("conformity_letter_file", "conformity", "image/pdf"),
        "payment_receipt": ("payment_receipt_file", "receipt", "image/pdf"),
    }

    if document_type not in valid_types:
        raise HTTPException(status_code=400, detail="Tipo de documento inválido.")

    col_name, prefix, file_type = valid_types[document_type]

    # Validar extensión del archivo
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if file_type == "pdf" and ext != "pdf":
        raise HTTPException(status_code=400, detail="El archivo debe ser un formato PDF.")
    elif file_type == "xml" and ext != "xml":
        raise HTTPException(status_code=400, detail="El archivo debe ser un formato XML.")
    elif file_type == "image/pdf" and ext not in ["pdf", "jpg", "jpeg", "png"]:
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF o imagen (JPG, PNG).")

    # Guardar archivo nuevo
    unique_filename = f"{srv.id}_{prefix}_{uuid.uuid4().hex[:8]}.{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Eliminar archivo anterior físicamente si existe
    old_file_path = getattr(srv, col_name)
    if old_file_path:
        rel_path = old_file_path.lstrip("/")
        if os.path.exists(rel_path):
            try:
                os.remove(rel_path)
            except Exception as e:
                print(f"⚠️ Error al eliminar archivo físico anterior: {e}")

    # Asignar nuevo path
    setattr(srv, col_name, f"/uploads/services/{unique_filename}")

    # Si es XML, intentar parsear y actualizar el proveedor
    if document_type == "invoice_xml":
        try:
            with open(file_path, "rb") as f:
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
                else:
                    if not provider.legal_name:
                        provider.legal_name = legal_name
                        db.flush()
                
                srv.provider_id = provider.id
        except Exception as e:
            print(f"⚠️ Error al parsear XML reemplazado: {e}")

    db.commit()
    db.refresh(srv)

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="update",
        module="services",
        entity_type="ServiceRequest",
        entity_id=srv.id,
        description=f"Reemplazó el documento '{document_type}' en la solicitud '{srv.internal_folio}'",
        ip_address=request.client.host if request and request.client else None
    )

    return map_service_response(srv)


@router.delete("/{id}")
async def delete_service(
    id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("services", "delete")),
):
    """Eliminar definitivamente un registro de servicio."""
    srv = db.query(ServiceRequest).filter(ServiceRequest.id == id).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Solicitud de servicio no encontrada.")

    folio = srv.internal_folio
    db.delete(srv)
    db.commit()

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="delete",
        module="services",
        entity_type="ServiceRequest",
        entity_id=id,
        description=f"Eliminó la solicitud de servicio '{folio}'",
        ip_address=request.client.host if request and request.client else None
    )

    return {"status": "ok", "message": f"Solicitud '{folio}' eliminada correctamente."}
