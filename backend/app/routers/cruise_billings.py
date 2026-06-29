"""
SIAE — Router de Facturación y Cobros (CruiseBilling).
Endpoints CRUD y estadísticas financieras para los cruceros del DEO.
"""

import os
import shutil
import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.cruise import CruisePlan
from app.models.cruise_billing import CruiseBilling, BillingStatus
from app.models.vessel import Vessel
from app.schemas.cruise_billing import (
    CruiseBillingCreate, CruiseBillingUpdate,
    CruiseBillingResponse, CruiseBillingList, CruiseBillingStats,
    CruiseBillingBatchTransfer
)
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/cruise-billings", tags=["Facturación"])


# Helper para calcular totales del cobro
def _calculate_billing_totals(data_dict: dict, vessel_type: str) -> dict:
    """Calcula subtotal, impuestos y total en base a la embarcación y cargos."""
    # Inicializar campos
    days_navigated = data_dict.get("days_navigated", 0.0) or 0.0
    rate_per_day = data_dict.get("rate_per_day", 0.0) or 0.0
    days_mobilization = data_dict.get("days_mobilization", 0.0) or 0.0
    rate_mobilization = data_dict.get("rate_mobilization", 0.0) or 0.0

    vessel_rent_cost = data_dict.get("vessel_rent_cost", 0.0) or 0.0
    vehicle_rent_cost = data_dict.get("vehicle_rent_cost", 0.0) or 0.0
    
    fuel_liters = data_dict.get("fuel_liters", 0.0) or 0.0
    fuel_price_per_liter = data_dict.get("fuel_price_per_liter", 0.0) or 0.0
    fuel_cost = round(fuel_liters * fuel_price_per_liter, 2)
    data_dict["fuel_cost"] = fuel_cost

    vehicle_fuel_liters = data_dict.get("vehicle_fuel_liters", 0.0) or 0.0
    vehicle_fuel_price_per_liter = data_dict.get("vehicle_fuel_price_per_liter", 0.0) or 0.0
    vehicle_fuel_cost = round(vehicle_fuel_liters * vehicle_fuel_price_per_liter, 2)
    data_dict["vehicle_fuel_cost"] = vehicle_fuel_cost

    other_costs = data_dict.get("other_costs", 0.0) or 0.0
    discount = data_dict.get("discount", 0.0) or 0.0
    tax_pct = data_dict.get("tax_pct", 0.0) or 0.0

    # Subtotal depende de la embarcación (Barco = Mayor/Días, Otro = Menor/Fijo+Vehículo+Combustibles)
    if vessel_type == "barco":
        subtotal = (days_navigated * rate_per_day) + (days_mobilization * rate_mobilization)
    else:
        subtotal = vessel_rent_cost + vehicle_rent_cost + fuel_cost + vehicle_fuel_cost

    subtotal = round(subtotal + other_costs, 2)
    
    # Impuestos y Total
    tax_amount = round(subtotal * (tax_pct / 100.0), 2)
    total = round(subtotal - discount + tax_amount, 2)

    data_dict["subtotal"] = subtotal
    data_dict["tax_amount"] = tax_amount
    data_dict["total"] = total
    
    return data_dict


def sync_billing_transfer_to_accounts(db: Session, billing: CruiseBilling) -> None:
    """Registra o actualiza el abono (credit) de una facturación de crucero en la cuenta de autogenerados (624602) cuando cambia a Transferido."""
    from app.models.account import Account, AccountTransaction, TransactionType

    # Solo registrar/mantener el abono si el estado es TRANSFERIDO
    if billing.status != BillingStatus.TRANSFERIDO:
        # Si el estado cambió de TRANSFERIDO a otra cosa, deberíamos eliminar la transacción si existía
        db.query(AccountTransaction).filter(
            AccountTransaction.cruise_billing_id == billing.id
        ).delete()
        db.flush()
        return

    # Obtener o crear Cuenta de Recursos Autogenerados (624602)
    ra_account = db.query(Account).filter(Account.account_number == "624602").first()
    if not ra_account:
        ra_account = Account(
            name="Recursos autogenerados del Departamento de embarcaciones oceanográficas",
            description="Cuenta de control para recursos autogenerados (Proyecto D1A313).",
            account_number="624602",
            is_active=True
        )
        db.add(ra_account)
        db.flush()

    # Buscar transacción existente para este cobro
    tx = db.query(AccountTransaction).filter(
        AccountTransaction.cruise_billing_id == billing.id
    ).first()

    amount = billing.total
    if billing.currency == "USD" and billing.exchange_rate:
        amount = round(billing.total * billing.exchange_rate, 2)

    concept = f"Ingreso Crucero: {billing.cruise.cruise_number if billing.cruise else billing.id}"
    description = f"Monto transferido por concepto de cobro de crucero '{billing.cruise.name if billing.cruise else ''}'."

    if not tx:
        # Registrar abono
        tx = AccountTransaction(
            account_id=ra_account.id,
            type=TransactionType.ABONO,
            amount=amount,
            concept=concept,
            description=description,
            reference=billing.payment_reference or f"BILL-{billing.id}",
            transaction_date=billing.transfer_date or billing.payment_date or datetime.now(),
            cruise_billing_id=billing.id
        )
        db.add(tx)
    else:
        # Actualizar abono
        tx.amount = amount
        tx.concept = concept
        tx.description = description
        tx.reference = billing.payment_reference or f"BILL-{billing.id}"
        tx.transaction_date = billing.transfer_date or billing.payment_date or tx.transaction_date

    db.flush()


def delete_billing_transaction(db: Session, billing_id: int) -> None:
    """Elimina la transacción asociada a un cobro cuando se elimina."""
    from app.models.account import AccountTransaction
    db.query(AccountTransaction).filter(
        AccountTransaction.cruise_billing_id == billing_id
    ).delete()
    db.flush()


# ── GET lista paginada ────────────────────────────────────────

@router.get("", response_model=CruiseBillingList)
async def list_cruise_billings(
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    vessel_id: Optional[int] = Query(None),
    status: Optional[BillingStatus] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("billing", "view")),
):
    """Listar cobros de cruceros con paginación y filtros."""
    query = db.query(CruiseBilling).join(CruisePlan, CruisePlan.id == CruiseBilling.cruise_id)

    if vessel_id is not None:
        query = query.filter(CruisePlan.vessel_id == vessel_id)
    if status is not None:
        query = query.filter(CruiseBilling.status == status)
    if date_from is not None:
        query = query.filter(CruisePlan.departure_date >= datetime.combine(date_from, datetime.min.time()))
    if date_to is not None:
        query = query.filter(CruisePlan.departure_date <= datetime.combine(date_to, datetime.max.time()))

    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            (CruiseBilling.billing_entity.ilike(search_filter)) |
            (CruiseBilling.billing_contact.ilike(search_filter)) |
            (CruiseBilling.payment_reference.ilike(search_filter)) |
            (CruisePlan.name.ilike(search_filter)) |
            (CruisePlan.cruise_number.ilike(search_filter))
        )

    total = query.count()
    items = query.order_by(CruisePlan.departure_date.desc()).offset(skip).limit(limit).all()

    return CruiseBillingList(total=total, items=items)


# ── GET estadísticas ──────────────────────────────────────────

@router.get("/stats", response_model=CruiseBillingStats)
async def get_billing_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("billing", "view")),
):
    """Resumen de estadísticas financieras globales."""
    all_billings = db.query(CruiseBilling).all()

    total_by_status = {"por_cobrar": 0.0, "cobrado": 0.0, "transferido": 0.0}
    count_by_status = {"por_cobrar": 0, "cobrado": 0, "transferido": 0}
    total_by_currency = {"MXN": 0.0, "USD": 0.0}

    monthly_map = {}

    for b in all_billings:
        status_val = b.status.value
        total_by_status[status_val] += b.total
        count_by_status[status_val] += 1
        
        curr_val = b.currency
        total_by_currency[curr_val] += b.total

        # Agrupar mensualmente por fecha de cobro o creación
        date_val = b.payment_date or b.created_at.date()
        month_str = date_val.strftime("%Y-%m")
        if month_str not in monthly_map:
            monthly_map[month_str] = {"total_mxn": 0.0, "total_usd": 0.0}
        
        if b.currency == "MXN":
            monthly_map[month_str]["total_mxn"] += b.total
        elif b.currency == "USD":
            monthly_map[month_str]["total_usd"] += b.total

    monthly_billing = [
        {"month": m, "total_mxn": round(v["total_mxn"], 2), "total_usd": round(v["total_usd"], 2)}
        for m, v in sorted(monthly_map.items())
    ]

    # Redondear totales
    for k in total_by_status:
        total_by_status[k] = round(total_by_status[k], 2)
    for k in total_by_currency:
        total_by_currency[k] = round(total_by_currency[k], 2)

    return CruiseBillingStats(
        summary={
            "total_by_status": total_by_status,
            "total_by_currency": total_by_currency,
            "count_by_status": count_by_status,
        },
        monthly_billing=monthly_billing
    )


# ── GET por ID ────────────────────────────────────────────────

@router.get("/{billing_id}", response_model=CruiseBillingResponse)
async def get_cruise_billing(
    billing_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("billing", "view")),
):
    """Obtener un registro de cobro por su ID."""
    billing = db.query(CruiseBilling).filter(CruiseBilling.id == billing_id).first()
    if not billing:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")
    return billing


# ── GET por ID de Crucero ──────────────────────────────────────

@router.get("/cruise/{cruise_id}", response_model=CruiseBillingResponse)
async def get_cruise_billing_by_cruise(
    cruise_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("billing", "view")),
):
    """Obtener el cobro asociado a un crucero específico."""
    billing = db.query(CruiseBilling).filter(CruiseBilling.cruise_id == cruise_id).first()
    if not billing:
        raise HTTPException(status_code=404, detail="Este crucero aún no tiene cobro registrado")
    return billing


# ── POST crear ────────────────────────────────────────────────

@router.post("", response_model=CruiseBillingResponse, status_code=201)
async def create_cruise_billing(
    data: CruiseBillingCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("billing", "create")),
):
    """Registrar el cobro de un crucero completado."""
    # Verificar si el crucero existe y ya tiene cobro
    cruise = db.query(CruisePlan).filter(CruisePlan.id == data.cruise_id).first()
    if not cruise:
        raise HTTPException(status_code=404, detail="Crucero no encontrado")
    
    existing = db.query(CruiseBilling).filter(CruiseBilling.cruise_id == data.cruise_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Este crucero ya tiene un cobro registrado")

    # Obtener tipo de embarcación para cálculos
    vessel_type = cruise.vessel.vessel_type.value if cruise.vessel else "lancha"

    billing_data = data.model_dump()
    billing_data = _calculate_billing_totals(billing_data, vessel_type)

    billing = CruiseBilling(**billing_data)
    db.add(billing)
    db.commit()
    db.refresh(billing)

    try:
        sync_billing_transfer_to_accounts(db, billing)
        db.commit()
    except Exception as ex:
        print(f"⚠️ Error al sincronizar cobro con cuentas: {ex}")

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="create",
        module="billing",
        entity_type="CruiseBilling",
        entity_id=billing.id,
        description=f"Registró cobro de {billing.total} {billing.currency} para el crucero '{cruise.name}'",
        ip_address=request.client.host if request.client else None,
    )

    return billing


# ── PUT actualizar ────────────────────────────────────────────

@router.put("/{billing_id}", response_model=CruiseBillingResponse)
async def update_cruise_billing(
    billing_id: int,
    data: CruiseBillingUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("billing", "edit")),
):
    """Actualizar datos o cambiar el estado del cobro."""
    billing = db.query(CruiseBilling).filter(CruiseBilling.id == billing_id).first()
    if not billing:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")

    update_data = data.model_dump(exclude_unset=True)

    # Si se actualiza algún dato de cálculo, recalculamos los totales
    # (vessel_rent_cost, other_costs, days_navigated, etc.)
    # Combinamos lo nuevo con lo existente
    full_billing_data = {
        c.name: getattr(billing, c.name) for c in CruiseBilling.__table__.columns
    }
    full_billing_data.update(update_data)

    vessel_type = billing.cruise.vessel.vessel_type.value if (billing.cruise and billing.cruise.vessel) else "lancha"
    full_billing_data = _calculate_billing_totals(full_billing_data, vessel_type)

    # Actualizar campos en el modelo
    changes = {}
    for key, value in full_billing_data.items():
        # Saltar id, cruise_id, creados, etc.
        if key in [
            "id", "cruise_id", "created_at", "updated_at",
            "receipt_filename", "receipt_uploaded_at",
            "vessel_order_filename", "vessel_order_uploaded_at",
            "signed_vessel_order_filename", "signed_vessel_order_uploaded_at"
        ]:
            continue
        old_val = getattr(billing, key)
        if old_val != value:
            changes[key] = {"antes": str(old_val), "después": str(value)}
            setattr(billing, key, value)

    db.commit()
    db.refresh(billing)

    try:
        sync_billing_transfer_to_accounts(db, billing)
        db.commit()
    except Exception as ex:
        print(f"⚠️ Error al sincronizar cobro actualizado con cuentas: {ex}")

    if changes:
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="update",
            module="billing",
            entity_type="CruiseBilling",
            entity_id=billing_id,
            description=f"Actualizó cobro #{billing_id}",
            details=changes,
            ip_address=request.client.host if request.client else None,
        )

    return billing


# ── POST subir recibo escaneado ────────────────────────────────

@router.post("/{billing_id}/upload-receipt", response_model=CruiseBillingResponse)
async def upload_billing_receipt(
    billing_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("billing", "edit")),
):
    """Subir recibo o factura escaneado en PDF o imagen."""
    billing = db.query(CruiseBilling).filter(CruiseBilling.id == billing_id).first()
    if not billing:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")

    upload_dir = "uploads/receipts"
    os.makedirs(upload_dir, exist_ok=True)

    # Nombre único para el archivo
    ext = file.filename.split(".")[-1] if "." in file.filename else "pdf"
    unique_filename = f"recibo_{billing_id}_{uuid.uuid4().hex[:8]}.{ext}"
    file_location = os.path.join(upload_dir, unique_filename)

    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Eliminar archivo anterior si existe
    if billing.receipt_filename and os.path.exists(billing.receipt_filename.lstrip("/")):
        try:
            os.remove(billing.receipt_filename.lstrip("/"))
        except Exception:
            pass

    billing.receipt_filename = f"/uploads/receipts/{unique_filename}"
    billing.receipt_uploaded_at = func.now()

    db.commit()
    db.refresh(billing)

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="update",
        module="billing",
        entity_type="CruiseBilling",
        entity_id=billing_id,
        description=f"Subió recibo '{file.filename}' para el cobro #{billing_id}",
        ip_address=request.client.host if request.client else None,
    )

    return billing


# ── POST subir orden de embarcación ────────────────────────────

@router.post("/{billing_id}/upload-vessel-order", response_model=CruiseBillingResponse)
async def upload_billing_vessel_order(
    billing_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("billing", "edit")),
):
    """Subir orden de embarcación en PDF."""
    billing = db.query(CruiseBilling).filter(CruiseBilling.id == billing_id).first()
    if not billing:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")

    upload_dir = "uploads/vessel_orders"
    os.makedirs(upload_dir, exist_ok=True)

    ext = file.filename.split(".")[-1] if "." in file.filename else "pdf"
    unique_filename = f"orden_{billing_id}_{uuid.uuid4().hex[:8]}.{ext}"
    file_location = os.path.join(upload_dir, unique_filename)

    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    if billing.vessel_order_filename and os.path.exists(billing.vessel_order_filename.lstrip("/")):
        try:
            os.remove(billing.vessel_order_filename.lstrip("/"))
        except Exception:
            pass

    billing.vessel_order_filename = f"/uploads/vessel_orders/{unique_filename}"
    billing.vessel_order_uploaded_at = func.now()

    db.commit()
    db.refresh(billing)

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="update",
        module="billing",
        entity_type="CruiseBilling",
        entity_id=billing_id,
        description=f"Subió orden de embarcación '{file.filename}' para el cobro #{billing_id}",
        ip_address=request.client.host if request.client else None,
    )

    return billing


# ── POST subir orden de embarcación firmada ────────────────────

@router.post("/{billing_id}/upload-signed-vessel-order", response_model=CruiseBillingResponse)
async def upload_billing_signed_vessel_order(
    billing_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("billing", "edit")),
):
    """Subir orden de embarcación firmada en PDF."""
    billing = db.query(CruiseBilling).filter(CruiseBilling.id == billing_id).first()
    if not billing:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")

    upload_dir = "uploads/vessel_orders"
    os.makedirs(upload_dir, exist_ok=True)

    ext = file.filename.split(".")[-1] if "." in file.filename else "pdf"
    unique_filename = f"orden_firmada_{billing_id}_{uuid.uuid4().hex[:8]}.{ext}"
    file_location = os.path.join(upload_dir, unique_filename)

    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    if billing.signed_vessel_order_filename and os.path.exists(billing.signed_vessel_order_filename.lstrip("/")):
        try:
            os.remove(billing.signed_vessel_order_filename.lstrip("/"))
        except Exception:
            pass

    billing.signed_vessel_order_filename = f"/uploads/vessel_orders/{unique_filename}"
    billing.signed_vessel_order_uploaded_at = func.now()

    db.commit()
    db.refresh(billing)

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="update",
        module="billing",
        entity_type="CruiseBilling",
        entity_id=billing_id,
        description=f"Subió orden de embarcación firmada '{file.filename}' para el cobro #{billing_id}",
        ip_address=request.client.host if request.client else None,
    )

    return billing


@router.post("/batch-transfer")
async def batch_transfer_cruise_billings(
    data: CruiseBillingBatchTransfer,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("billing", "edit")),
):
    """Registrar transferencia de cobros masiva (cambiar estado a transferido de varios cobros)."""
    if not data.billing_ids:
        raise HTTPException(status_code=400, detail="Debe seleccionar al menos un cobro.")

    billings = db.query(CruiseBilling).filter(CruiseBilling.id.in_(data.billing_ids)).all()
    if len(billings) != len(data.billing_ids):
        raise HTTPException(status_code=404, detail="Uno o más cobros no fueron encontrados.")

    for billing in billings:
        billing.status = BillingStatus.TRANSFERIDO
        billing.payment_reference = data.payment_reference
        billing.transfer_date = data.transfer_date
        
        # Sincronizar abono en la cuenta de Recursos Autogenerados (624602)
        try:
            sync_billing_transfer_to_accounts(db, billing)
        except Exception as ex:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Error al sincronizar cuentas contables para el cobro ID {billing.id}: {str(ex)}")

    db.commit()

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="update",
        module="billing",
        entity_type="CruiseBilling",
        entity_id=None,
        description=f"Registró transferencia masiva con folio '{data.payment_reference}' para {len(billings)} cobros.",
        ip_address=request.client.host if request.client else None,
    )

    return {"message": f"Se registraron {len(billings)} cobros como transferidos correctamente."}


# ── DELETE eliminar ────────────────────────────────────────────

@router.delete("/{billing_id}")
async def delete_cruise_billing(
    billing_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("billing", "delete")),
):
    """Eliminar un registro de cobro del sistema."""
    billing = db.query(CruiseBilling).filter(CruiseBilling.id == billing_id).first()
    if not billing:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")

    # Eliminar archivos asociados del disco
    for field in ["receipt_filename", "vessel_order_filename", "signed_vessel_order_filename"]:
        path = getattr(billing, field)
        if path and os.path.exists(path.lstrip("/")):
            try:
                os.remove(path.lstrip("/"))
            except Exception:
                pass

    cruise_name = billing.cruise.name if billing.cruise else f"crucero_id={billing.cruise_id}"
    try:
        delete_billing_transaction(db, billing_id)
    except Exception as ex:
        print(f"⚠️ Error al eliminar transacción vinculada al cobro: {ex}")

    db.delete(billing)
    db.commit()

    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="delete",
        module="billing",
        entity_type="CruiseBilling",
        entity_id=billing_id,
        description=f"Eliminó cobro de '{cruise_name}'",
        ip_address=request.client.host if request.client else None,
    )

    return {"message": "Cobro eliminado correctamente"}
