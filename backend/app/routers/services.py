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
    ServiceRequestBudgetAccountUpdate,
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
        "currency": req.currency,
        "exchange_rate": req.exchange_rate,
        "tentative_exchange_rate": req.tentative_exchange_rate,
        "account_id": req.account_id,
        "account_name": req.account.name if req.account else None,
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
    currency: str = Form("MXN"),
    tentative_exchange_rate: Optional[float] = Form(None),
    account_id: Optional[int] = Form(None),
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

    existing_folios = db.query(ServiceRequest.internal_folio).filter(
        ServiceRequest.created_at >= year_start,
        ServiceRequest.created_at <= year_end
    ).all()

    max_num = 0
    for row in existing_folios:
        folio_str = row[0]
        if folio_str and folio_str.startswith(f"SRV-{current_year}-"):
            try:
                num = int(folio_str.split("-")[-1])
                if num > max_num:
                    max_num = num
            except ValueError:
                pass

    internal_folio = f"SRV-{current_year}-{max_num + 1:04d}"

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
        currency=currency,
        tentative_exchange_rate=tentative_exchange_rate,
        account_id=account_id,
        created_by_id=current_user.id,
        created_at=event_date,
        updated_at=event_date
    )
    db.add(srv)
    db.flush()

    # Crear pre-cargo de dinero comprometido si se seleccionó una cuenta
    if account_id:
        pre_amount = budget_amount
        if currency == "USD":
            if not tentative_exchange_rate:
                raise HTTPException(status_code=400, detail="Se requiere ingresar el tipo de cambio tentativo para cotizaciones en USD.")
            pre_amount = budget_amount * tentative_exchange_rate

        from app.models.account import AccountTransaction, TransactionType
        committed_tx = AccountTransaction(
            account_id=account_id,
            type=TransactionType.CARGO,
            amount=pre_amount,
            concept=f"Comprometido: {internal_folio}",
            description=f"Presupuesto apartado para la solicitud de servicio {internal_folio} - {provider_name or ''}",
            reference=episa_folio,
            status="comprometido",
            service_request_id=srv.id,
            transaction_date=event_date,
            created_by_id=current_user.id
        )
        db.add(committed_tx)
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
    exchange_rate: Optional[float] = Form(None),
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

    # Ajustar transacciones financieras de cuentas según transición
    from app.models.account import AccountTransaction, TransactionType
    
    if status == "pagado":
        if srv.currency == "USD":
            if not exchange_rate:
                raise HTTPException(status_code=400, detail="Se requiere ingresar el tipo de cambio real para realizar el pago en USD.")
            srv.exchange_rate = exchange_rate
        else:
            srv.exchange_rate = 1.0

        tx_amount = srv.budget_amount * srv.exchange_rate if srv.currency == "USD" else srv.budget_amount

        # Buscar pre-cargo comprometido para completarlo
        tx = db.query(AccountTransaction).filter(
            AccountTransaction.service_request_id == srv.id
        ).first()

        if tx:
            tx.status = "completado"
            tx.amount = tx_amount
            tx.concept = f"Pago de Servicio: {srv.internal_folio}"
            tx.transaction_date = event_date
        elif srv.account_id:
            new_tx = AccountTransaction(
                account_id=srv.account_id,
                type=TransactionType.CARGO,
                amount=tx_amount,
                concept=f"Pago de Servicio: {srv.internal_folio}",
                description=f"Pago de la solicitud de servicio {srv.internal_folio} - {srv.provider_name or ''}",
                reference=srv.episa_folio,
                status="completado",
                service_request_id=srv.id,
                transaction_date=event_date,
                created_by_id=current_user.id
            )
            db.add(new_tx)

    elif status == "cancelado":
        # Liberar fondos
        db.query(AccountTransaction).filter(AccountTransaction.service_request_id == srv.id).delete()

    else:
        # Revertir a pre-cargo comprometido
        tx = db.query(AccountTransaction).filter(
            AccountTransaction.service_request_id == srv.id
        ).first()

        tx_amount = srv.budget_amount * (srv.tentative_exchange_rate or 1.0) if srv.currency == "USD" else srv.budget_amount

        if tx:
            tx.status = "comprometido"
            tx.amount = tx_amount
            tx.concept = f"Comprometido: {srv.internal_folio}"
            tx.transaction_date = event_date
        elif srv.account_id:
            new_tx = AccountTransaction(
                account_id=srv.account_id,
                type=TransactionType.CARGO,
                amount=tx_amount,
                concept=f"Comprometido: {srv.internal_folio}",
                description=f"Presupuesto apartado para la solicitud de servicio {srv.internal_folio} - {srv.provider_name or ''}",
                reference=srv.episa_folio,
                status="comprometido",
                service_request_id=srv.id,
                transaction_date=event_date,
                created_by_id=current_user.id
            )
            db.add(new_tx)
        
        srv.exchange_rate = None
    
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
    notes: str = Form(...),
    created_at: Optional[datetime] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("services", "edit")),
):
    """Registrar un comentario u observación en la bitácora de incidencias con archivo adjunto opcional."""
    srv = db.query(ServiceRequest).filter(ServiceRequest.id == id).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Solicitud de servicio no encontrada.")

    attachment_path = None
    if file:
        ext = file.filename.split(".")[-1].lower() if "." in file.filename else "pdf"
        unique_filename = f"{srv.id}_obs_{uuid.uuid4().hex[:8]}.{ext}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        attachment_path = f"/uploads/services/{unique_filename}"

    obs_args = {
        "service_request_id": id,
        "notes": notes,
        "attachment_file": attachment_path,
        "user_id": current_user.id
    }
    if created_at is not None:
        obs_args["created_at"] = created_at
    obs = ServiceObservation(**obs_args)
    db.add(obs)
    db.commit()
    db.refresh(obs)

    # Devolver mapeado con el nombre del usuario
    return {
        "id": obs.id,
        "notes": obs.notes,
        "attachment_file": obs.attachment_file,
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
    date: Optional[datetime] = Form(None),
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

    # Si se proporciona una fecha, actualizar el registro histórico de la etapa correspondiente
    if date:
        doc_stage_map = {
            "budget": "solicitado",
            "authorization_email": "aprobado_hacienda",
            "invoice_xml": "en_proceso_pago",
            "invoice_pdf": "en_proceso_pago",
            "conformity_letter": "en_proceso_pago",
            "payment_receipt": "pagado"
        }
        target_stage = doc_stage_map.get(document_type)
        if target_stage:
            hist = db.query(ServiceStageHistory).filter(
                ServiceStageHistory.service_request_id == srv.id,
                ServiceStageHistory.stage == target_stage
            ).first()
            if hist:
                hist.entered_at = date
                srv.updated_at = date

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
    from app.models.account import AccountTransaction
    db.query(AccountTransaction).filter(AccountTransaction.service_request_id == id).delete()
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


@router.put("/{id}/budget-account", response_model=ServiceRequestResponse)
async def update_budget_account(
    id: int,
    data: ServiceRequestBudgetAccountUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("services", "edit")),
):
    """Actualizar retroactivamente o editar la cuenta bancaria, moneda y tipo de cambio de la solicitud."""
    srv = db.query(ServiceRequest).filter(ServiceRequest.id == id).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Solicitud de servicio no encontrada.")

    old_currency = srv.currency
    old_account_id = srv.account_id

    srv.currency = data.currency
    srv.tentative_exchange_rate = data.tentative_exchange_rate
    if data.exchange_rate is not None:
        srv.exchange_rate = data.exchange_rate
    srv.account_id = data.account_id
    db.flush()

    # Sincronizar transacciones en cuenta
    from app.models.account import AccountTransaction, TransactionType

    # 1. Eliminar transacciones antiguas si la cuenta cambió o se quitó la cuenta
    if old_account_id and old_account_id != data.account_id:
        db.query(AccountTransaction).filter(
            AccountTransaction.service_request_id == id,
            AccountTransaction.account_id == old_account_id
        ).delete()

    # Si se canceló la solicitud, no debe haber transacciones
    if srv.status == "cancelado":
        db.query(AccountTransaction).filter(AccountTransaction.service_request_id == id).delete()
    elif data.account_id:
        # 2. Buscar si ya existe una transacción para la nueva cuenta
        tx = db.query(AccountTransaction).filter(
            AccountTransaction.service_request_id == id,
            AccountTransaction.account_id == data.account_id
        ).first()

        # Determinar el estado y monto
        if srv.status == "pagado":
            tx_status = "completado"
            tc = data.exchange_rate or srv.exchange_rate or data.tentative_exchange_rate or 1.0
            tx_amount = srv.budget_amount * tc if data.currency == "USD" else srv.budget_amount
            tx_concept = f"Pago de Servicio: {srv.internal_folio}"
        else:
            tx_status = "comprometido"
            tc = data.tentative_exchange_rate or 1.0
            tx_amount = srv.budget_amount * tc if data.currency == "USD" else srv.budget_amount
            tx_concept = f"Comprometido: {srv.internal_folio}"

        if tx:
            tx.status = tx_status
            tx.amount = tx_amount
            tx.concept = tx_concept
        else:
            new_tx = AccountTransaction(
                account_id=data.account_id,
                type=TransactionType.CARGO,
                amount=tx_amount,
                concept=tx_concept,
                description=f"Movimiento financiero de la solicitud de servicio {srv.internal_folio} - {srv.provider_name or ''}",
                reference=srv.episa_folio,
                status=tx_status,
                service_request_id=srv.id,
                created_by_id=current_user.id
            )
            db.add(new_tx)

    db.commit()
    db.refresh(srv)

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="update",
        module="services",
        entity_type="ServiceRequest",
        entity_id=id,
        description=f"Actualizó asignación de cuenta/moneda en solicitud '{srv.internal_folio}'",
        ip_address=request.client.host if request and request.client else None
    )

    return map_service_response(srv)
