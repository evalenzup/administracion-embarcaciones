"""
SIAE — Router de Finanzas: Fondo Fijo (Caja Chica).
Implementa todas las APIs para la gestión del Fondo Fijo, categorías financieras,
gastos manuales, vinculación de XML CFDI 4.0, arqueos y configuraciones.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
import os
import shutil
import uuid
from datetime import datetime

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.financial_category import FinancialCategory
from app.models.finance_setting import FinanceSetting
from app.models.petty_cash_invoice import PettyCashInvoice, InvoiceStatus
from app.models.petty_cash_reimbursement import PettyCashReimbursement, ReimbursementStatus
from app.models.petty_cash_count import PettyCashCount

from app.schemas.financial_category import (
    FinancialCategoryCreate, FinancialCategoryUpdate, FinancialCategoryResponse
)
from app.schemas.finance_setting import (
    FinanceSettingUpdate, FinanceSettingResponse
)
from app.schemas.petty_cash_invoice import (
    PettyCashInvoiceCreate, PettyCashInvoiceResponse, PettyCashInvoiceList, XMLValidationResult,
    PettyCashInvoiceUpdate, PettyCashInvoiceManualCreate
)
from app.schemas.petty_cash_reimbursement import (
    ReimbursementCreate, ReimbursementUpdate, ReimbursementStatusUpdate, ReimbursementResponse, ReimbursementList
)
from app.schemas.petty_cash_count import (
    CashCountCreate, CashCountResponse, CashCountList
)
from app.utils.xml_parser import parse_and_validate_cfdi
from app.utils.sat_validator import query_sat_cfdi_status
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/petty-cash", tags=["Finanzas — Fondo Fijo"])


# Helper para obtener el saldo del fondo asignado desde configuraciones
def get_petty_cash_assigned(db: Session) -> float:
    setting = db.query(FinanceSetting).filter(FinanceSetting.key == "petty_cash_assigned").first()
    if setting:
        try:
            return float(setting.value)
        except ValueError:
            pass
    return 80000.00


# ──────────────────────────────────────────────────────────────
# CONFIGURACIONES DE FINANZAS
# ──────────────────────────────────────────────────────────────

@router.get("/settings", response_model=dict)
async def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "view")),
):
    """Obtener configuraciones del área de finanzas (ej. petty_cash_assigned)."""
    assigned = get_petty_cash_assigned(db)
    return {"petty_cash_assigned": assigned}


@router.put("/settings", response_model=dict)
async def update_settings(
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "edit")),
):
    """Actualizar configuraciones del área de finanzas."""
    if "petty_cash_assigned" in data:
        val_str = str(data["petty_cash_assigned"])
        try:
            val_float = float(val_str)
            if val_float <= 0:
                raise ValueError()
        except ValueError:
            raise HTTPException(status_code=400, detail="El monto asignado debe ser un número positivo válido.")

        setting = db.query(FinanceSetting).filter(FinanceSetting.key == "petty_cash_assigned").first()
        if not setting:
            setting = FinanceSetting(key="petty_cash_assigned", value=val_str)
            db.add(setting)
        else:
            setting.value = val_str
            
        db.commit()
        
        log_action(
            db=db, user_id=current_user.id, username=current_user.username,
            action="update", module="petty_cash", entity_type="FinanceSetting",
            entity_id=0,
            description=f"Actualizó saldo asignado de caja chica a ${val_float:.2f} MXN",
            ip_address=request.client.host if request.client else None,
        )

    assigned = get_petty_cash_assigned(db)
    return {"petty_cash_assigned": assigned}


# ──────────────────────────────────────────────────────────────
# CATEGORÍAS DE GASTO (GENERALES)
# ──────────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[FinancialCategoryResponse])
async def list_categories(
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "view")),
):
    """Listar todas las categorías de gasto generales de finanzas."""
    query = db.query(FinancialCategory)
    if active_only:
        query = query.filter(FinancialCategory.is_active == True)
    return query.order_by(FinancialCategory.group, FinancialCategory.name).all()


@router.post("/categories", response_model=FinancialCategoryResponse, status_code=201)
async def create_category(
    data: FinancialCategoryCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "create")),
):
    """Crear una nueva categoría de gasto general."""
    existing = db.query(FinancialCategory).filter(FinancialCategory.name.ilike(data.name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe una categoría con este nombre")

    category = FinancialCategory(**data.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="create", module="petty_cash", entity_type="FinancialCategory",
        entity_id=category.id,
        description=f"Creó categoría de gasto general '{category.name}'",
        ip_address=request.client.host if request.client else None,
    )
    return category


@router.put("/categories/{id}", response_model=FinancialCategoryResponse)
async def update_category(
    id: int,
    data: FinancialCategoryUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "edit")),
):
    """Editar una categoría de gasto general."""
    category = db.query(FinancialCategory).filter(FinancialCategory.id == id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    update_data = data.model_dump(exclude_unset=True)
    if "name" in update_data:
        existing = db.query(FinancialCategory).filter(
            and_(FinancialCategory.name.ilike(update_data["name"]), FinancialCategory.id != id)
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe otra categoría con este nombre")

    for key, val in update_data.items():
        setattr(category, key, val)

    db.commit()
    db.refresh(category)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="update", module="petty_cash", entity_type="FinancialCategory",
        entity_id=category.id,
        description=f"Actualizó categoría de gasto '{category.name}'",
        ip_address=request.client.host if request.client else None,
    )
    return category


@router.delete("/categories/{id}")
async def delete_category(
    id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "delete")),
):
    """Desactivar una categoría de gasto general (borrado lógico)."""
    category = db.query(FinancialCategory).filter(FinancialCategory.id == id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    category.is_active = False
    db.commit()

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="delete", module="petty_cash", entity_type="FinancialCategory",
        entity_id=category.id,
        description=f"Desactivó categoría de gasto '{category.name}'",
        ip_address=request.client.host if request.client else None,
    )
    return {"message": f"Categoría '{category.name}' desactivada correctamente"}


# ──────────────────────────────────────────────────────────────
# FACTURAS Y GASTOS (CON O SIN XML)
# ──────────────────────────────────────────────────────────────

@router.get("/invoices", response_model=PettyCashInvoiceList)
async def list_invoices(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: InvoiceStatus = Query(None),
    category_id: int = Query(None),
    emisor_rfc: str = Query(None),
    start_date: str = Query(None, description="Format: YYYY-MM-DD"),
    end_date: str = Query(None, description="Format: YYYY-MM-DD"),
    search: str = Query(None),
    is_manual: bool = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "view")),
):
    """Listar facturas y gastos registrados en el fondo fijo con filtros."""
    query = db.query(PettyCashInvoice)

    if status:
        query = query.filter(PettyCashInvoice.status == status)
    if category_id:
        query = query.filter(PettyCashInvoice.category_id == category_id)
    if emisor_rfc:
        query = query.filter(PettyCashInvoice.emisor_rfc.ilike(f"%{emisor_rfc}%"))
    if is_manual is not None:
        query = query.filter(PettyCashInvoice.is_manual == is_manual)
        
    if start_date:
        try:
            sd = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(PettyCashInvoice.fecha_emision >= sd)
        except ValueError:
            pass
    if end_date:
        try:
            ed = datetime.strptime(f"{end_date} 23:59:59", "%Y-%m-%d %H:%M:%S")
            query = query.filter(PettyCashInvoice.fecha_emision <= ed)
        except ValueError:
            pass

    if search:
        query = query.filter(
            or_(
                PettyCashInvoice.uuid.ilike(f"%{search}%"),
                PettyCashInvoice.folio.ilike(f"%{search}%"),
                PettyCashInvoice.emisor_nombre.ilike(f"%{search}%"),
                PettyCashInvoice.description.ilike(f"%{search}%")
            )
        )

    total = query.count()
    items = query.order_by(PettyCashInvoice.fecha_emision.desc().nullslast(), PettyCashInvoice.created_at.desc()).offset(skip).limit(limit).all()
    
    return PettyCashInvoiceList(total=total, items=items)


@router.post("/invoices/validate-xml", response_model=XMLValidationResult)
async def validate_xml(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "create")),
):
    """Subir un archivo XML de factura CFDI para parsear y validar fiscalmente (sin guardar)."""
    if not file.filename.lower().endswith(".xml"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un XML válido")
        
    content = await file.read()
    result = parse_and_validate_cfdi(content)
    
    # Validar duplicados de UUID en la base de datos de forma temprana
    uuid_str = result.get("uuid")
    if uuid_str:
        existing = db.query(PettyCashInvoice).filter(PettyCashInvoice.uuid == uuid_str).first()
        if existing:
            result["is_valid"] = False
            error_msg = f"La factura con UUID {uuid_str} ya está registrada en el sistema."
            if "errors" not in result:
                result["errors"] = []
            if error_msg not in result["errors"]:
                result["errors"].append(error_msg)
                
    # Consultar el estado en el SAT de forma temprana si pasó las validaciones básicas locales
    if result["is_valid"] and uuid_str:
        try:
            sat_res = query_sat_cfdi_status(
                emisor_rfc=result["emisor_rfc"],
                receptor_rfc=result["receptor_rfc"],
                total=result["total"],
                uuid_str=uuid_str
            )
            result["sat_status"] = sat_res["status"]
            result["sat_verified_at"] = datetime.now()
            
            # Si el SAT reporta que no está vigente, invalidar la factura
            if sat_res["status"] != "Vigente":
                result["is_valid"] = False
                if "errors" not in result:
                    result["errors"] = []
                result["errors"].append(
                    f"El comprobante no está vigente en el SAT (Estado actual: {sat_res['status']})"
                )
        except Exception:
            result["sat_status"] = "Error de Conexión"
            result["sat_verified_at"] = datetime.now()
            
    return result


@router.post("/invoices", response_model=PettyCashInvoiceResponse, status_code=201)
async def register_invoice(
    request: Request,
    xml_file: UploadFile = File(...),
    pdf_file: UploadFile = File(None),
    category_id: int = Form(...),
    description: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "create")),
):
    """Subir y registrar una factura formal amparada por un archivo XML y PDF."""
    if not xml_file.filename.lower().endswith(".xml"):
        raise HTTPException(status_code=400, detail="El archivo principal debe ser un XML válido")

    # Validar categoría
    category = db.query(FinancialCategory).filter(FinancialCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría de gasto no encontrada")

    # Leer y parsear XML
    xml_content = await xml_file.read()
    parsed = parse_and_validate_cfdi(xml_content)

    if not parsed["is_valid"]:
        raise HTTPException(
            status_code=400, 
            detail=f"XML de factura no cumple con las reglas fiscales o límites: {', '.join(parsed['errors'])}"
        )

    # Verificar duplicado por UUID
    uuid_str = parsed["uuid"]
    existing = db.query(PettyCashInvoice).filter(PettyCashInvoice.uuid == uuid_str).first()
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"La factura con UUID {uuid_str} ya está registrada en el sistema."
        )

    # Crear directorios
    xml_dir = "uploads/petty_cash/xml"
    pdf_dir = "uploads/petty_cash/pdf"
    os.makedirs(xml_dir, exist_ok=True)
    os.makedirs(pdf_dir, exist_ok=True)

    # Guardar archivo XML
    xml_filename = f"{uuid_str}.xml"
    xml_path = os.path.join(xml_dir, xml_filename)
    with open(xml_path, "wb") as f:
        f.write(xml_content)

    # Guardar archivo PDF si existe
    pdf_filename = None
    if pdf_file:
        if not pdf_file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="El archivo secundario debe ser un PDF válido")
        pdf_filename = f"{uuid_str}.pdf"
        pdf_path = os.path.join(pdf_dir, pdf_filename)
        with open(pdf_path, "wb") as f:
            shutil.copyfileobj(pdf_file.file, f)

    # Consultar estado SAT
    sat_status = "Desconocido"
    sat_verified_at = datetime.now()
    try:
        sat_res = query_sat_cfdi_status(
            emisor_rfc=parsed["emisor_rfc"],
            receptor_rfc=parsed["receptor_rfc"],
            total=parsed["total"],
            uuid_str=uuid_str
        )
        sat_status = sat_res["status"]
        if sat_res["status"] != "Vigente":
            raise HTTPException(
                status_code=400,
                detail=f"La factura no está vigente en el SAT (Estado: {sat_res['status']})"
            )
    except HTTPException:
        raise
    except Exception:
        sat_status = "Error de Conexión"

    # Crear modelo
    invoice = PettyCashInvoice(
        uuid=uuid_str,
        folio=parsed["folio"],
        serie=parsed["serie"],
        emisor_rfc=parsed["emisor_rfc"],
        emisor_nombre=parsed["emisor_nombre"],
        emisor_regimen_fiscal=parsed["emisor_regimen_fiscal"],
        receptor_rfc=parsed["receptor_rfc"],
        receptor_nombre=parsed["receptor_nombre"],
        receptor_regimen_fiscal=parsed["receptor_regimen_fiscal"],
        receptor_cp=parsed["receptor_cp"],
        subtotal=parsed["subtotal"],
        iva=parsed["iva"],
        total=parsed["total"],
        moneda=parsed["moneda"],
        metodo_pago=parsed["metodo_pago"],
        forma_pago=parsed["forma_pago"],
        uso_cfdi=parsed["uso_cfdi"],
        fecha_emision=parsed["fecha_emision"],
        fecha_timbrado=parsed["fecha_timbrado"],
        sat_status=sat_status,
        sat_verified_at=sat_verified_at,
        xml_filename=f"/uploads/petty_cash/xml/{xml_filename}",
        pdf_filename=f"/uploads/petty_cash/pdf/{pdf_filename}" if pdf_filename else None,
        is_manual=False,
        category_id=category_id,
        description=description,
        status=InvoiceStatus.PENDIENTE,
        registered_by_id=current_user.id
    )

    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="create", module="petty_cash", entity_type="PettyCashInvoice",
        entity_id=invoice.id,
        description=f"Registró factura XML UUID '{uuid_str}' por ${invoice.total:.2f} MXN",
        ip_address=request.client.host if request.client else None,
    )

    return invoice


@router.post("/invoices/manual", response_model=PettyCashInvoiceResponse, status_code=201)
async def register_invoice_manual(
    data: PettyCashInvoiceManualCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "create")),
):
    """Registrar un gasto manualmente de caja chica sin XML inicial (pendiente de factura)."""
    # Validar categoría
    category = db.query(FinancialCategory).filter(FinancialCategory.id == data.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría de gasto no encontrada")

    # Limite total
    if data.total > 5000.00:
        raise HTTPException(status_code=400, detail="El monto máximo permitido de un gasto de caja chica es de $5,000.00 MXN")

    subt = data.subtotal if data.subtotal is not None else round(data.total / 1.16, 2)
    iva_val = data.iva if data.iva is not None else round(data.total - subt, 2)

    invoice = PettyCashInvoice(
        uuid=None,
        folio=None,
        serie=None,
        emisor_rfc=data.emisor_rfc.upper(),
        emisor_nombre=data.emisor_nombre,
        emisor_regimen_fiscal=None,
        receptor_rfc=None,
        receptor_nombre=None,
        receptor_regimen_fiscal=None,
        receptor_cp=None,
        subtotal=subt,
        iva=iva_val,
        total=data.total,
        moneda="MXN",
        metodo_pago="PUE",
        forma_pago="01", # Efectivo por defecto
        uso_cfdi="G03",
        fecha_emision=data.fecha_emision,
        fecha_timbrado=None,
        xml_filename=None,
        pdf_filename=None,
        is_manual=True,
        category_id=data.category_id,
        description=data.description,
        status=InvoiceStatus.PENDIENTE,
        registered_by_id=current_user.id
    )

    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="create", module="petty_cash", entity_type="PettyCashInvoice",
        entity_id=invoice.id,
        description=f"Registró gasto manual sin XML: '{invoice.description}' por ${invoice.total:.2f} MXN",
        ip_address=request.client.host if request.client else None,
    )

    return invoice


@router.post("/invoices/{id}/link-xml", response_model=PettyCashInvoiceResponse)
async def link_xml_to_invoice(
    id: int,
    request: Request,
    xml_file: UploadFile = File(...),
    pdf_file: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "edit")),
):
    """Vincular una factura XML (y PDF opcional) a un gasto manual previamente registrado."""
    invoice = db.query(PettyCashInvoice).filter(PettyCashInvoice.id == id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Registro de gasto no encontrado")

    if not invoice.is_manual:
        raise HTTPException(status_code=400, detail="Esta factura ya tiene un archivo XML vinculado.")

    if not xml_file.filename.lower().endswith(".xml"):
        raise HTTPException(status_code=400, detail="El archivo principal debe ser un XML válido")

    # Parsear y validar XML
    xml_content = await xml_file.read()
    parsed = parse_and_validate_cfdi(xml_content)

    if not parsed["is_valid"]:
        raise HTTPException(
            status_code=400, 
            detail=f"XML de factura no cumple con las reglas fiscales o límites: {', '.join(parsed['errors'])}"
        )

    # Verificar duplicado de UUID (excluyendo este mismo registro si por casualidad coincidiera)
    uuid_str = parsed["uuid"]
    existing = db.query(PettyCashInvoice).filter(
        and_(PettyCashInvoice.uuid == uuid_str, PettyCashInvoice.id != id)
    ).first()
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"La factura con UUID {uuid_str} ya está registrada en el sistema."
        )

    # Validar que los montos coincidan razonablemente (+- 5 pesos por redondeos manuales)
    if abs(parsed["total"] - invoice.total) > 5.0:
        raise HTTPException(
            status_code=400,
            detail=f"El total de la factura XML (${parsed['total']:.2f}) difiere del gasto manual registrado (${invoice.total:.2f})."
        )

    # Guardar archivos
    xml_dir = "uploads/petty_cash/xml"
    pdf_dir = "uploads/petty_cash/pdf"
    os.makedirs(xml_dir, exist_ok=True)
    os.makedirs(pdf_dir, exist_ok=True)

    xml_filename = f"{uuid_str}.xml"
    xml_path = os.path.join(xml_dir, xml_filename)
    with open(xml_path, "wb") as f:
        f.write(xml_content)

    pdf_filename = None
    if pdf_file:
        if not pdf_file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="El archivo secundario debe ser un PDF válido")
        pdf_filename = f"{uuid_str}.pdf"
        pdf_path = os.path.join(pdf_dir, pdf_filename)
        with open(pdf_path, "wb") as f:
            shutil.copyfileobj(pdf_file.file, f)

    # Consultar estado SAT
    sat_status = "Desconocido"
    sat_verified_at = datetime.now()
    try:
        sat_res = query_sat_cfdi_status(
            emisor_rfc=parsed["emisor_rfc"],
            receptor_rfc=parsed["receptor_rfc"],
            total=parsed["total"],
            uuid_str=uuid_str
        )
        sat_status = sat_res["status"]
        if sat_res["status"] != "Vigente":
            raise HTTPException(
                status_code=400,
                detail=f"La factura no está vigente en el SAT (Estado: {sat_res['status']})"
            )
    except HTTPException:
        raise
    except Exception:
        sat_status = "Error de Conexión"

    # Actualizar los datos del gasto con los valores fiscales reales de la factura
    invoice.uuid = uuid_str
    invoice.folio = parsed["folio"]
    invoice.serie = parsed["serie"]
    invoice.emisor_rfc = parsed["emisor_rfc"]
    invoice.emisor_nombre = parsed["emisor_nombre"]
    invoice.emisor_regimen_fiscal = parsed["emisor_regimen_fiscal"]
    invoice.receptor_rfc = parsed["receptor_rfc"]
    invoice.receptor_nombre = parsed["receptor_nombre"]
    invoice.receptor_regimen_fiscal = parsed["receptor_regimen_fiscal"]
    invoice.receptor_cp = parsed["receptor_cp"]
    invoice.subtotal = parsed["subtotal"]
    invoice.iva = parsed["iva"]
    invoice.total = parsed["total"] # Usar el total exacto del XML
    invoice.moneda = parsed["moneda"]
    invoice.metodo_pago = parsed["metodo_pago"]
    invoice.forma_pago = parsed["forma_pago"]
    invoice.uso_cfdi = parsed["uso_cfdi"]
    invoice.fecha_emision = parsed["fecha_emision"]
    invoice.fecha_timbrado = parsed["fecha_timbrado"]
    invoice.sat_status = sat_status
    invoice.sat_verified_at = sat_verified_at
    invoice.xml_filename = f"/uploads/petty_cash/xml/{xml_filename}"
    if pdf_filename:
        invoice.pdf_filename = f"/uploads/petty_cash/pdf/{pdf_filename}"
    invoice.is_manual = False # Ya no es manual puro, está soportado por XML!

    db.commit()
    db.refresh(invoice)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="update", module="petty_cash", entity_type="PettyCashInvoice",
        entity_id=invoice.id,
        description=f"Vinculó factura XML UUID '{uuid_str}' al gasto ID {id}",
        ip_address=request.client.host if request.client else None,
    )

    return invoice


@router.get("/invoices/{id}", response_model=PettyCashInvoiceResponse)
async def get_invoice(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "view")),
):
    """Obtener detalle de una factura o gasto manual."""
    invoice = db.query(PettyCashInvoice).filter(PettyCashInvoice.id == id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return invoice


@router.post("/invoices/{id}/verify-sat", response_model=PettyCashInvoiceResponse)
async def verify_sat_invoice(
    id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "edit")),
):
    """Consultar al WS del SAT el estado actual de la factura y actualizarlo en base de datos."""
    invoice = db.query(PettyCashInvoice).filter(PettyCashInvoice.id == id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    if invoice.is_manual or not invoice.uuid:
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden verificar ante el SAT comprobantes que cuenten con archivo XML y UUID fiscal."
        )

    try:
        sat_res = query_sat_cfdi_status(
            emisor_rfc=invoice.emisor_rfc,
            receptor_rfc=invoice.receptor_rfc,
            total=invoice.total,
            uuid_str=invoice.uuid
        )
        invoice.sat_status = sat_res["status"]
        invoice.sat_verified_at = datetime.now()
        
        db.commit()
        db.refresh(invoice)
        
        log_action(
            db=db, user_id=current_user.id, username=current_user.username,
            action="update", module="petty_cash", entity_type="PettyCashInvoice",
            entity_id=invoice.id,
            description=f"Consultó estado SAT de factura ID {invoice.id} ({invoice.uuid}). Resultado: {invoice.sat_status}",
            ip_address=request.client.host if request.client else None,
        )
        
        return invoice
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al conectar con el servicio web del SAT: {str(e)}"
        )


@router.put("/invoices/{id}", response_model=PettyCashInvoiceResponse)
async def update_invoice(
    id: int,
    data: PettyCashInvoiceUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "edit")),
):
    """Actualizar datos de una factura o gasto manual."""
    invoice = db.query(PettyCashInvoice).filter(PettyCashInvoice.id == id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    # 1. Validar que la factura esté PENDIENTE
    if invoice.status != InvoiceStatus.PENDIENTE:
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden editar facturas/gastos en estado 'pendiente' (que no formen parte de una reposición)."
        )

    # 2. Manejar edición según si es manual o formal con XML
    if invoice.is_manual:
        # Es gasto manual: permitir editar campos de texto y montos
        if data.fecha_emision is not None:
            invoice.fecha_emision = data.fecha_emision

        if data.emisor_rfc is not None:
            rfc = data.emisor_rfc.upper().strip()
            if not (12 <= len(rfc) <= 13):
                raise HTTPException(status_code=400, detail="El RFC del emisor debe tener 12 o 13 caracteres.")
            invoice.emisor_rfc = rfc

        if data.emisor_nombre is not None:
            invoice.emisor_nombre = data.emisor_nombre.strip()

        if data.total is not None:
            if data.total <= 0 or data.total > 5000.00:
                raise HTTPException(status_code=400, detail="El monto total de un gasto de caja chica debe estar entre 0.01 y 5000.00 MXN.")
            invoice.total = data.total
            
            # Ajustar subtotal e iva según se proporcionen o no
            if data.subtotal is not None:
                invoice.subtotal = data.subtotal
            else:
                invoice.subtotal = data.total
                
            if data.iva is not None:
                invoice.iva = data.iva
            else:
                invoice.iva = 0.0
        else:
            # Si no cambia el total pero sí subtotal/iva
            if data.subtotal is not None:
                invoice.subtotal = data.subtotal
            if data.iva is not None:
                invoice.iva = data.iva
    else:
        # Es factura formal con XML: prohibir cambiar datos fiscales
        has_fiscal_changes = False
        if data.fecha_emision is not None and data.fecha_emision != invoice.fecha_emision:
            has_fiscal_changes = True
        if data.emisor_rfc is not None and data.emisor_rfc.upper().strip() != invoice.emisor_rfc:
            has_fiscal_changes = True
        if data.emisor_nombre is not None and data.emisor_nombre.strip() != invoice.emisor_nombre:
            has_fiscal_changes = True
        if data.total is not None and data.total != invoice.total:
            has_fiscal_changes = True
        if data.subtotal is not None and data.subtotal != invoice.subtotal:
            has_fiscal_changes = True
        if data.iva is not None and data.iva != invoice.iva:
            has_fiscal_changes = True
            
        if has_fiscal_changes:
            raise HTTPException(
                status_code=400,
                detail="No está permitido editar los datos fiscales de una factura formal XML. Solo se puede cambiar la categoría o la descripción."
            )

    # 3. Campos comunes permitidos para todos
    if data.category_id is not None:
        category = db.query(FinancialCategory).filter(FinancialCategory.id == data.category_id).first()
        if not category:
            raise HTTPException(status_code=404, detail="Categoría no encontrada")
        invoice.category_id = data.category_id

    if data.description is not None:
        invoice.description = data.description

    db.commit()
    db.refresh(invoice)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="update", module="petty_cash", entity_type="PettyCashInvoice",
        entity_id=invoice.id,
        description=f"Actualizó gasto ID {invoice.id} ({'manual' if invoice.is_manual else 'XML'})",
        ip_address=request.client.host if request.client else None,
    )
    return invoice


@router.delete("/invoices/{id}")
async def delete_invoice(
    id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "delete")),
):
    """Eliminar una factura del fondo fijo (solo si está en estado 'pendiente')."""
    invoice = db.query(PettyCashInvoice).filter(PettyCashInvoice.id == id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    if invoice.status != InvoiceStatus.PENDIENTE:
        raise HTTPException(
            status_code=400, 
            detail=f"No se puede eliminar la factura porque está asociada a una reposición (estado: {invoice.status.value})"
        )

    # Eliminar archivos físicos
    if invoice.xml_filename:
        xml_path = invoice.xml_filename.lstrip("/")
        if os.path.exists(xml_path):
            try:
                os.remove(xml_path)
            except Exception:
                pass
                
    if invoice.pdf_filename:
        pdf_path = invoice.pdf_filename.lstrip("/")
        if os.path.exists(pdf_path):
            try:
                os.remove(pdf_path)
            except Exception:
                pass

    total = invoice.total
    desc = invoice.description
    db.delete(invoice)
    db.commit()

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="delete", module="petty_cash", entity_type="PettyCashInvoice",
        entity_id=id,
        description=f"Eliminó factura/gasto '{desc}' por ${total:.2f} MXN",
        ip_address=request.client.host if request.client else None,
    )
    return {"message": "Factura/gasto eliminado correctamente"}


# ──────────────────────────────────────────────────────────────
# REPOSICIONES DE FONDO FIJO
# ──────────────────────────────────────────────────────────────

@router.get("/reimbursements", response_model=ReimbursementList)
async def list_reimbursements(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: ReimbursementStatus = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "view")),
):
    """Listar todas las reposiciones creadas."""
    query = db.query(PettyCashReimbursement)
    if status:
        query = query.filter(PettyCashReimbursement.status == status)

    total = query.count()
    items = query.order_by(PettyCashReimbursement.created_at.desc()).offset(skip).limit(limit).all()
    return ReimbursementList(total=total, items=items)


@router.post("/reimbursements", response_model=ReimbursementResponse, status_code=201)
async def create_reimbursement(
    data: ReimbursementCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "create")),
):
    """
    Crear una solicitud de reposición agrupando facturas con estado 'pendiente'.
    Valida: max 15 facturas.
    """
    if len(data.invoice_ids) > 15:
        raise HTTPException(
            status_code=400,
            detail=f"No se pueden incluir más de 15 facturas por reposición (seleccionadas: {len(data.invoice_ids)})"
        )

    # Cargar facturas
    invoices = db.query(PettyCashInvoice).filter(
        and_(PettyCashInvoice.id.in_(data.invoice_ids), PettyCashInvoice.status == InvoiceStatus.PENDIENTE)
    ).all()

    if len(invoices) != len(data.invoice_ids):
        raise HTTPException(
            status_code=400,
            detail="Algunas de las facturas seleccionadas no existen o ya se encuentran asociadas a otra reposición."
        )

    total_amount = sum(inv.total for inv in invoices)

    # Generar Folio: RFF-YYYY-NNN
    year = datetime.now().year
    prefix = f"RFF-{year}-"
    latest_reimb = db.query(PettyCashReimbursement).filter(
        PettyCashReimbursement.folio.like(f"{prefix}%")
    ).order_by(PettyCashReimbursement.folio.desc()).first()

    next_num = 1
    if latest_reimb:
        try:
            latest_num_str = latest_reimb.folio.split("-")[-1]
            next_num = int(latest_num_str) + 1
        except Exception:
            pass
            
    folio = f"{prefix}{next_num:03d}"

    # Crear reposición
    reimbursement = PettyCashReimbursement(
        folio=folio,
        total_amount=total_amount,
        invoice_count=len(invoices),
        status=ReimbursementStatus.EN_PROCESO,
        submitted_date=datetime.now(),
        notes=data.notes,
        created_by_id=current_user.id
    )

    db.add(reimbursement)
    db.flush()

    for inv in invoices:
        inv.status = InvoiceStatus.EN_REPOSICION
        inv.reimbursement_id = reimbursement.id

    db.commit()
    db.refresh(reimbursement)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="create", module="petty_cash", entity_type="PettyCashReimbursement",
        entity_id=reimbursement.id,
        description=f"Creó reposición {reimbursement.folio} con {reimbursement.invoice_count} facturas por ${reimbursement.total_amount:.2f} MXN",
        ip_address=request.client.host if request.client else None,
    )

    return reimbursement


@router.get("/reimbursements/{id}", response_model=ReimbursementResponse)
async def get_reimbursement(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "view")),
):
    """Obtener detalle completo de una reposición."""
    reimbursement = db.query(PettyCashReimbursement).filter(PettyCashReimbursement.id == id).first()
    if not reimbursement:
        raise HTTPException(status_code=404, detail="Reposición no encontrada")
    return reimbursement


@router.get("/reimbursements/{id}/zip")
async def download_reimbursement_zip(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "view")),
):
    """Generar y descargar un archivo ZIP conteniendo todos los XMLs y PDFs de las facturas del paquete de reposición."""
    import io
    import zipfile
    from fastapi.responses import StreamingResponse

    reimbursement = db.query(PettyCashReimbursement).filter(PettyCashReimbursement.id == id).first()
    if not reimbursement:
        raise HTTPException(status_code=404, detail="Reposición no encontrada")

    # Crear un buffer en memoria para almacenar el archivo ZIP
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        added_files = set()
        for invoice in reimbursement.invoices:
            # Archivo XML
            if invoice.xml_filename:
                relative_path = invoice.xml_filename.lstrip("/")
                if os.path.exists(relative_path):
                    filename = os.path.basename(relative_path)
                    if filename not in added_files:
                        zip_file.write(relative_path, arcname=f"xml/{filename}")
                        added_files.add(filename)
            
            # Archivo PDF
            if invoice.pdf_filename:
                relative_path = invoice.pdf_filename.lstrip("/")
                if os.path.exists(relative_path):
                    filename = os.path.basename(relative_path)
                    if filename not in added_files:
                        zip_file.write(relative_path, arcname=f"pdf/{filename}")
                        added_files.add(filename)
                        
        # También incluir el escaneado de la reposición si existe
        if reimbursement.scan_filename:
            relative_path = reimbursement.scan_filename.lstrip("/")
            if os.path.exists(relative_path):
                filename = os.path.basename(relative_path)
                zip_file.write(relative_path, arcname=filename)

    zip_buffer.seek(0)
    
    # Formatear nombre del archivo
    filename = f"reposicion_cajachica_{reimbursement.id}_{reimbursement.created_at.strftime('%Y%m%d')}.zip"
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/x-zip-compressed",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.put("/reimbursements/{id}/status", response_model=ReimbursementResponse)
async def update_reimbursement_status(
    id: int,
    data: ReimbursementStatusUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "edit")),
):
    """Actualizar el estado de una reposición."""
    reimbursement = db.query(PettyCashReimbursement).filter(PettyCashReimbursement.id == id).first()
    if not reimbursement:
        raise HTTPException(status_code=404, detail="Reposición no encontrada")

    old_status = reimbursement.status.value
    new_status = data.status

    if old_status == ReimbursementStatus.PAGADO:
        raise HTTPException(
            status_code=400,
            detail="No se puede modificar el estado de una reposición que ya ha sido pagada."
        )

    reimbursement.status = new_status
    if new_status == ReimbursementStatus.APROBADO:
        reimbursement.approved_date = datetime.now()
    elif new_status == ReimbursementStatus.PAGADO:
        reimbursement.paid_date = datetime.now()
        db.query(PettyCashInvoice).filter(PettyCashInvoice.reimbursement_id == id).update(
            {"status": InvoiceStatus.REPUESTA}
        )

    db.commit()
    db.refresh(reimbursement)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="update", module="petty_cash", entity_type="PettyCashReimbursement",
        entity_id=reimbursement.id,
        description=f"Cambió estado de reposición {reimbursement.folio} de '{old_status}' a '{new_status.value}'",
        ip_address=request.client.host if request.client else None,
    )

    return reimbursement


@router.post("/reimbursements/{id}/upload-scan", response_model=ReimbursementResponse)
async def upload_reimbursement_scan(
    id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "edit")),
):
    """Subir PDF escaneado con firmas de recibido."""
    reimbursement = db.query(PettyCashReimbursement).filter(PettyCashReimbursement.id == id).first()
    if not reimbursement:
        raise HTTPException(status_code=404, detail="Reposición no encontrada")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="El archivo escaneado debe ser un PDF válido")

    scan_dir = "uploads/petty_cash/scans"
    os.makedirs(scan_dir, exist_ok=True)

    filename = f"{reimbursement.folio}_{uuid.uuid4().hex[:8]}.pdf"
    file_path = os.path.join(scan_dir, filename)

    if reimbursement.scan_filename:
        old_path = reimbursement.scan_filename.lstrip("/")
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except Exception:
                pass

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    reimbursement.scan_filename = f"/uploads/petty_cash/scans/{filename}"
    db.commit()
    db.refresh(reimbursement)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="update", module="petty_cash", entity_type="PettyCashReimbursement",
        entity_id=reimbursement.id,
        description=f"Subió escaneado de firmas para reposición {reimbursement.folio}",
        ip_address=request.client.host if request.client else None,
    )

    return reimbursement


@router.delete("/reimbursements/{id}")
async def delete_reimbursement(
    id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "delete")),
):
    """Cancelar reposición y liberar facturas asociadas a pendientes."""
    reimbursement = db.query(PettyCashReimbursement).filter(PettyCashReimbursement.id == id).first()
    if not reimbursement:
        raise HTTPException(status_code=404, detail="Reposición no encontrada")

    if reimbursement.status == ReimbursementStatus.PAGADO:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar una reposición que ya ha sido pagada."
        )

    db.query(PettyCashInvoice).filter(PettyCashInvoice.reimbursement_id == id).update(
        {"status": InvoiceStatus.PENDIENTE, "reimbursement_id": None}
    )

    if reimbursement.scan_filename:
        scan_path = reimbursement.scan_filename.lstrip("/")
        if os.path.exists(scan_path):
            try:
                os.remove(scan_path)
            except Exception:
                pass

    folio = reimbursement.folio
    db.delete(reimbursement)
    db.commit()

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="delete", module="petty_cash", entity_type="PettyCashReimbursement",
        entity_id=id,
        description=f"Eliminó/canceló la reposición {folio}",
        ip_address=request.client.host if request.client else None,
    )

    return {"message": f"Reposición '{folio}' eliminada y facturas liberadas correctamente"}


# ──────────────────────────────────────────────────────────────
# ARQUEOS DE CAJA (SIN MONEDAS DE 50 CENTAVOS)
# ──────────────────────────────────────────────────────────────

@router.get("/cash-counts", response_model=CashCountList)
async def list_cash_counts(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "view")),
):
    """Listar historial de arqueos de caja."""
    query = db.query(PettyCashCount)
    total = query.count()
    items = query.order_by(PettyCashCount.count_date.desc()).offset(skip).limit(limit).all()
    return CashCountList(total=total, items=items)


@router.get("/cash-counts/latest", response_model=CashCountResponse)
async def get_latest_cash_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "view")),
):
    """Obtener último arqueo."""
    latest = db.query(PettyCashCount).order_by(PettyCashCount.count_date.desc()).first()
    if not latest:
        raise HTTPException(status_code=404, detail="No se han registrado arqueos.")
    return latest


@router.post("/cash-counts", response_model=CashCountResponse, status_code=201)
async def create_cash_count(
    data: CashCountCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "create")),
):
    """Registrar arqueo físico de caja (excluyendo monedas de 50c)."""
    # Calcular sumatoria física
    total_counted = (
        data.bills_1000 * 1000.0 +
        data.bills_500 * 500.0 +
        data.bills_200 * 200.0 +
        data.bills_100 * 100.0 +
        data.bills_50 * 50.0 +
        data.bills_20 * 20.0 +
        data.coins_10 * 10.0 +
        data.coins_5 * 5.0 +
        data.coins_2 * 2.0 +
        data.coins_1 * 1.0
    )

    # Calcular esperado en base al saldo asignado configurado
    petty_cash_assigned = get_petty_cash_assigned(db)

    spent_pending = db.query(func.sum(PettyCashInvoice.total)).filter(
        PettyCashInvoice.status != InvoiceStatus.REPUESTA
    ).scalar() or 0.0

    expected_balance = petty_cash_assigned - spent_pending
    difference = total_counted - expected_balance

    count = PettyCashCount(
        bills_1000=data.bills_1000,
        bills_500=data.bills_500,
        bills_200=data.bills_200,
        bills_100=data.bills_100,
        bills_50=data.bills_50,
        bills_20=data.bills_20,
        coins_10=data.coins_10,
        coins_5=data.coins_5,
        coins_2=data.coins_2,
        coins_1=data.coins_1,
        total_counted=total_counted,
        expected_balance=expected_balance,
        difference=difference,
        notes=data.notes,
        counted_by_id=current_user.id
    )

    db.add(count)
    db.commit()
    db.refresh(count)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="create", module="petty_cash", entity_type="PettyCashCount",
        entity_id=count.id,
        description=f"Registró arqueo: Contado ${total_counted:.2f} MXN vs Esperado ${expected_balance:.2f} MXN (Diferencia: ${difference:.2f} MXN)",
        ip_address=request.client.host if request.client else None,
    )

    return count


# ──────────────────────────────────────────────────────────────
# RESUMEN (DASHBOARD)
# ──────────────────────────────────────────────────────────────

@router.get("/summary")
async def get_petty_cash_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("petty_cash", "view")),
):
    """Obtener resumen financiero del fondo fijo."""
    total_assigned = get_petty_cash_assigned(db)

    pending_reimbursement = db.query(func.sum(PettyCashInvoice.total)).filter(
        PettyCashInvoice.status != InvoiceStatus.REPUESTA
    ).scalar() or 0.0

    available_balance = total_assigned - pending_reimbursement

    total_reimbursed = db.query(func.sum(PettyCashInvoice.total)).filter(
        PettyCashInvoice.status == InvoiceStatus.REPUESTA
    ).scalar() or 0.0

    total_spent = db.query(func.sum(PettyCashInvoice.total)).scalar() or 0.0

    # Gastos agrupados por categoría general
    category_expenses = db.query(
        FinancialCategory.name,
        FinancialCategory.group,
        FinancialCategory.color,
        func.sum(PettyCashInvoice.total).label("amount")
    ).join(
        PettyCashInvoice, PettyCashInvoice.category_id == FinancialCategory.id
    ).group_by(
        FinancialCategory.id, FinancialCategory.name, FinancialCategory.group, FinancialCategory.color
    ).all()

    by_category = [
        {"name": row[0], "group": row[1], "color": row[2], "amount": float(row[3] or 0)}
        for row in category_expenses
    ]

    # Gastos agrupados por grupo
    group_expenses = db.query(
        FinancialCategory.group,
        func.sum(PettyCashInvoice.total).label("amount")
    ).join(
        PettyCashInvoice, PettyCashInvoice.category_id == FinancialCategory.id
    ).group_by(
        FinancialCategory.group
    ).all()

    by_group = {row[0]: float(row[1] or 0) for row in group_expenses}
    for grp in ["materiales", "servicios", "otros"]:
        if grp not in by_group:
            by_group[grp] = 0.0

    recent_invoices = db.query(PettyCashInvoice).order_by(
        PettyCashInvoice.created_at.desc()
    ).limit(5).all()

    recent_invoices_resp = [
        {
            "id": inv.id,
            "uuid": inv.uuid,
            "emisor_nombre": inv.emisor_nombre,
            "total": inv.total,
            "status": inv.status,
            "created_at": inv.created_at,
            "is_manual": inv.is_manual,
            "category_name": inv.category.name if inv.category else "Sin categoría"
        }
        for inv in recent_invoices
    ]

    recent_counts = db.query(PettyCashCount).order_by(
        PettyCashCount.count_date.desc()
    ).limit(3).all()

    recent_counts_resp = [
        {
            "id": cnt.id,
            "count_date": cnt.count_date,
            "total_counted": cnt.total_counted,
            "difference": cnt.difference,
            "counted_by": cnt.counted_by.username if cnt.counted_by else "Desconocido"
        }
        for cnt in recent_counts
    ]

    count_pending = db.query(PettyCashInvoice).filter(PettyCashInvoice.status == InvoiceStatus.PENDIENTE).count()
    amount_pending = db.query(func.sum(PettyCashInvoice.total)).filter(PettyCashInvoice.status == InvoiceStatus.PENDIENTE).scalar() or 0.0

    # Generar historial diario de los últimos 30 días para la gráfica
    from datetime import timedelta
    today = datetime.now().date()
    start_date = today - timedelta(days=29)

    invoices = db.query(PettyCashInvoice.created_at, PettyCashInvoice.total).order_by(PettyCashInvoice.created_at).all()
    reimbursements = db.query(PettyCashReimbursement.paid_date, PettyCashReimbursement.total_amount).filter(
        PettyCashReimbursement.status == ReimbursementStatus.PAGADO,
        PettyCashReimbursement.paid_date.isnot(None)
    ).order_by(PettyCashReimbursement.paid_date).all()

    invoice_data = [(inv.created_at.date(), inv.total) for inv in invoices if inv.created_at]
    reimb_data = [(r.paid_date.date(), r.total_amount) for r in reimbursements if r.paid_date]

    # Calcular sumas acumuladas anteriores a start_date
    running_invoices = sum(amount for dt, amount in invoice_data if dt < start_date)
    running_reimbursements = sum(amount for dt, amount in reimb_data if dt < start_date)

    daily_history = []
    for i in range(30):
        current_day = start_date + timedelta(days=i)
        
        # Transacciones específicas del día
        day_invoices = sum(amount for dt, amount in invoice_data if dt == current_day)
        day_reimbursements = sum(amount for dt, amount in reimb_data if dt == current_day)
        
        running_invoices += day_invoices
        running_reimbursements += day_reimbursements
        
        avail_bal = total_assigned - running_invoices + running_reimbursements
        spent_accum = running_invoices - running_reimbursements
        
        daily_history.append({
            "date": current_day.isoformat(),
            "available_balance": round(max(0.0, avail_bal), 2),
            "spent_accumulated": round(max(0.0, spent_accum), 2),
            "daily_spent": round(day_invoices, 2)
        })

    # Generar historial de gastos mensuales por categoría para los últimos 6 meses
    months = []
    current_date = today
    for _ in range(6):
        months.insert(0, current_date.strftime("%Y-%m"))
        # Retroceder al mes anterior
        first_of_month = current_date.replace(day=1)
        prev_month_last_day = first_of_month - timedelta(days=1)
        current_date = prev_month_last_day

    # Consultar facturas de los últimos 6 meses
    six_months_ago = today - timedelta(days=180)
    invoices_sem = db.query(
        PettyCashInvoice.created_at,
        PettyCashInvoice.total,
        FinancialCategory.name.label("cat_name"),
        FinancialCategory.color.label("cat_color")
    ).join(
        FinancialCategory, PettyCashInvoice.category_id == FinancialCategory.id
    ).filter(
        PettyCashInvoice.created_at >= six_months_ago
    ).all()

    # Agrupar por mes y categoría
    monthly_cat_map = {m: {} for m in months}
    category_colors = {}
    for inv in invoices_sem:
        if not inv.created_at:
            continue
        m_str = inv.created_at.strftime("%Y-%m")
        if m_str in monthly_cat_map:
            cat_name = inv.cat_name
            cat_color = inv.cat_color or "#7f8c8d"
            category_colors[cat_name] = cat_color
            monthly_cat_map[m_str][cat_name] = monthly_cat_map[m_str].get(cat_name, 0.0) + inv.total

    monthly_category_expenses = []
    for m in months:
        cats_spent = [{"name": name, "amount": round(amount, 2), "color": category_colors.get(name, "#7f8c8d")}
                      for name, amount in monthly_cat_map[m].items()]
        total_m = sum(c["amount"] for c in cats_spent)
        monthly_category_expenses.append({
            "month": m,
            "categories": cats_spent,
            "total": round(total_m, 2)
        })

    return {
        "total_assigned": total_assigned,
        "pending_reimbursement": float(pending_reimbursement),
        "available_balance": float(available_balance),
        "total_reimbursed": float(total_reimbursed),
        "total_spent": float(total_spent),
        "expenses_by_category": by_category,
        "expenses_by_group": by_group,
        "recent_invoices": recent_invoices_resp,
        "recent_counts": recent_counts_resp,
        "invoices_pending_count": count_pending,
        "invoices_pending_amount": float(amount_pending),
        "daily_history": daily_history,
        "monthly_category_expenses": monthly_category_expenses
    }
