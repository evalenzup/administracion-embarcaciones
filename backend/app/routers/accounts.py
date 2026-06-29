"""
SIAE — Endpoints para la gestión de Estados de Cuenta y Movimientos (Cargos/Abonos).
"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.dependencies import require_permission
from app.models.user import User
from app.models.account import Account, AccountTransaction, TransactionType
from app.models.audit_log import AuditLog
from app.schemas.account import (
    AccountCreate,
    AccountUpdate,
    AccountResponse,
    AccountTransactionCreate,
    AccountTransactionUpdate,
    AccountTransactionResponse,
)

router = APIRouter(prefix="/api/v1/accounts", tags=["Estados de Cuenta"])


def log_action(db: Session, user_id: int, username: str, action: str, entity_id: int, description: str, request: Request = None):
    """Registrar acción en la bitácora de auditoría."""
    audit = AuditLog(
        user_id=user_id,
        username=username,
        action=action,
        module="accounts",
        entity_type="Account",
        entity_id=entity_id,
        description=description,
        ip_address=request.client.host if request and request.client else None
    )
    db.add(audit)
    db.commit()


# ── ENDPOINTS DE CUENTAS ──

@router.get("", response_model=List[AccountResponse])
async def list_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("accounts", "view")),
):
    """Listar todas las cuentas con su saldo calculado al corriente."""
    accounts = db.query(Account).order_by(Account.name).all()
    
    for account in accounts:
        # Calcular saldo actual
        abonos = db.query(func.sum(AccountTransaction.amount)).filter(
            AccountTransaction.account_id == account.id,
            AccountTransaction.type == TransactionType.ABONO
        ).scalar() or 0.0
        
        cargos = db.query(func.sum(AccountTransaction.amount)).filter(
            AccountTransaction.account_id == account.id,
            AccountTransaction.type == TransactionType.CARGO
        ).scalar() or 0.0
        
        account.balance = round(abonos - cargos, 2)
        
    return accounts


@router.post("", response_model=AccountResponse, status_code=201)
async def create_account(
    data: AccountCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("accounts", "create")),
):
    """Crear una cuenta nueva y opcionalmente registrar un abono de saldo inicial."""
    # Verificar nombre único
    existing = db.query(Account).filter(Account.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe una cuenta con ese nombre.")
        
    account = Account(
        name=data.name,
        description=data.description,
        account_number=data.account_number,
        is_active=data.is_active
    )
    db.add(account)
    db.flush()
    
    # Crear saldo inicial si se especificó
    if data.initial_balance > 0:
        tx = AccountTransaction(
            account_id=account.id,
            type=TransactionType.ABONO,
            amount=data.initial_balance,
            concept="Saldo Inicial / Apertura",
            description="Abono de saldo inicial al crear la cuenta.",
            reference="Apertura",
            created_by_id=current_user.id
        )
        db.add(tx)
        db.flush()
        account.balance = data.initial_balance
    else:
        account.balance = 0.0
        
    db.commit()
    db.refresh(account)
    
    log_action(db, current_user.id, current_user.username, "create", account.id, f"Creó la cuenta '{account.name}' con saldo inicial de {data.initial_balance}", request)
    return account


@router.put("/{id}", response_model=AccountResponse)
async def update_account(
    id: int,
    data: AccountUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("accounts", "edit")),
):
    """Editar información general de una cuenta."""
    account = db.query(Account).filter(Account.id == id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada.")
        
    if data.name is not None and data.name != account.name:
        existing = db.query(Account).filter(Account.name == data.name, Account.id != id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe otra cuenta con ese nombre.")
        account.name = data.name
        
    if data.description is not None:
        account.description = data.description
    if data.account_number is not None:
        account.account_number = data.account_number
    if data.is_active is not None:
        account.is_active = data.is_active
        
    db.commit()
    db.refresh(account)
    
    # Recalcular saldo para la respuesta
    abonos = db.query(func.sum(AccountTransaction.amount)).filter(
        AccountTransaction.account_id == account.id,
        AccountTransaction.type == TransactionType.ABONO
    ).scalar() or 0.0
    cargos = db.query(func.sum(AccountTransaction.amount)).filter(
        AccountTransaction.account_id == account.id,
        AccountTransaction.type == TransactionType.CARGO
    ).scalar() or 0.0
    account.balance = round(abonos - cargos, 2)
    
    log_action(db, current_user.id, current_user.username, "update", account.id, f"Actualizó datos de la cuenta '{account.name}'", request)
    return account


# ── ENDPOINTS DE TRANSACCIONES ──

@router.get("/{id}/transactions")
async def list_transactions(
    id: int,
    type: Optional[str] = Query(None, description="Filtrar por tipo (cargo / abono)"),
    start_date: Optional[str] = Query(None, description="Fecha de inicio (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Fecha de fin (YYYY-MM-DD)"),
    search: Optional[str] = Query(None, description="Buscar en concepto o referencia"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, gt=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("accounts", "view")),
):
    """
    Listar transacciones con cálculo exacto de saldo al corriente por fecha.
    Soporta filtros y devuelve una lista paginada en orden descendente (más recientes primero).
    """
    account = db.query(Account).filter(Account.id == id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada.")

    # 1. Obtener TODOS los movimientos chronológicamente (ascendente) para calcular el saldo al corriente
    all_txs = db.query(AccountTransaction).filter(
        AccountTransaction.account_id == id
    ).order_by(
        AccountTransaction.transaction_date.asc(),
        AccountTransaction.id.asc()
    ).all()

    # 2. Calcular balance acumulado
    running_balance = 0.0
    tx_responses = []
    
    for tx in all_txs:
        if tx.type == TransactionType.ABONO:
            running_balance += tx.amount
        elif tx.type == TransactionType.CARGO:
            running_balance -= tx.amount
            
        # Armar modelo de respuesta
        tx_responses.append({
            "id": tx.id,
            "account_id": tx.account_id,
            "type": tx.type,
            "amount": tx.amount,
            "concept": tx.concept,
            "description": tx.description,
            "reference": tx.reference,
            "origin_dest_account": tx.origin_dest_account,
            "category_id": tx.category_id,
            "category_name": tx.category.name if tx.category else None,
            "category_icon": tx.category.icon if tx.category else None,
            "category_color": tx.category.color if tx.category else None,
            "transaction_date": tx.transaction_date,
            "petty_cash_invoice_id": tx.petty_cash_invoice_id,
            "petty_cash_reimbursement_id": tx.petty_cash_reimbursement_id,
            "created_by_id": tx.created_by_id,
            "created_by_name": tx.created_by.full_name if tx.created_by else "Sistema",
            "running_balance": round(running_balance, 2),
            "created_at": tx.created_at,
            "updated_at": tx.updated_at
        })

    # 3. Aplicar filtros en memoria
    filtered_txs = tx_responses
    
    if type:
        filtered_txs = [t for t in filtered_txs if t["type"] == type]
        
    if start_date:
        try:
            s_dt = datetime.strptime(start_date, "%Y-%m-%d")
            filtered_txs = [t for t in filtered_txs if t["transaction_date"].replace(tzinfo=None) >= s_dt]
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha de inicio inválido (debe ser YYYY-MM-DD)")
            
    if end_date:
        try:
            # Fin del día
            e_dt = datetime.strptime(f"{end_date} 23:59:59", "%Y-%m-%d %H:%M:%S")
            filtered_txs = [t for t in filtered_txs if t["transaction_date"].replace(tzinfo=None) <= e_dt]
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha de fin inválido (debe ser YYYY-MM-DD)")

    if search:
        search_lower = search.lower()
        filtered_txs = [
            t for t in filtered_txs 
            if search_lower in (t["concept"] or "").lower() or search_lower in (t["reference"] or "").lower()
        ]

    # 4. Ordenar descendente (más recientes primero)
    filtered_txs.reverse()

    # 5. Paginar
    total = len(filtered_txs)
    paginated = filtered_txs[skip : skip + limit]

    return {
        "total": total,
        "items": paginated,
        "account_name": account.name,
        "account_balance": round(running_balance, 2)
    }


@router.post("/{id}/transactions", response_model=AccountTransactionResponse, status_code=201)
async def create_transaction(
    id: int,
    data: AccountTransactionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("accounts", "create")),
):
    """Registrar un movimiento manual (cargo/abono) en una cuenta."""
    account = db.query(Account).filter(Account.id == id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada.")
        
    if not account.is_active:
        raise HTTPException(status_code=400, detail="La cuenta está inactiva y no admite nuevos movimientos.")
        
    name_lower = account.name.lower()
    if "fondo fijo" in name_lower or "caja chica" in name_lower:
        raise HTTPException(
            status_code=400,
            detail="No se pueden registrar movimientos manuales en Fondo Fijo. Estos provienen automáticamente del módulo de Fondo Fijo."
        )
        
    tx = AccountTransaction(
        account_id=id,
        type=data.type,
        amount=data.amount,
        concept=data.concept,
        reference=data.reference,
        origin_dest_account=data.origin_dest_account,
        category_id=data.category_id,
        transaction_date=data.transaction_date or datetime.now(),
        created_by_id=current_user.id
    )
    db.add(tx)
    db.flush()

    # Si se especificó una cuenta de transferencia, creamos la contrapartida
    if data.transfer_account_id:
        if data.transfer_account_id == id:
            raise HTTPException(status_code=400, detail="La cuenta de origen/destino no puede ser la misma cuenta.")
            
        transfer_acc = db.query(Account).filter(Account.id == data.transfer_account_id).first()
        if not transfer_acc:
            raise HTTPException(status_code=404, detail="Cuenta de transferencia no encontrada.")
            
        if not transfer_acc.is_active:
            raise HTTPException(status_code=400, detail="La cuenta de transferencia está inactiva.")
            
        # El tipo en la otra cuenta es el opuesto
        counter_type = TransactionType.CARGO if data.type == TransactionType.ABONO else TransactionType.ABONO
        
        counter_tx = AccountTransaction(
            account_id=data.transfer_account_id,
            type=counter_type,
            amount=data.amount,
            concept=f"Transferencia: {data.concept}",
            description=f"Movimiento de contrapartida vinculado a la cuenta '{account.name}'.",
            reference=data.reference,
            transaction_date=tx.transaction_date,
            transfer_transaction_id=tx.id,
            created_by_id=current_user.id
        )
        db.add(counter_tx)
        db.flush()
        
        # Vincular la transacción original con la de contrapartida
        tx.transfer_transaction_id = counter_tx.id
        
    db.commit()
    db.refresh(tx)
    
    log_action(db, current_user.id, current_user.username, "create", id, f"Registró movimiento manual: {tx.type.value} - {tx.concept} por ${tx.amount}", request)
    return tx


@router.put("/{id}/transactions/{tx_id}", response_model=AccountTransactionResponse)
async def update_transaction(
    id: int,
    tx_id: int,
    data: AccountTransactionUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("accounts", "edit")),
):
    """Editar un movimiento manual. Los movimientos enlazados a caja chica no se pueden editar aquí."""
    tx = db.query(AccountTransaction).filter(
        AccountTransaction.id == tx_id,
        AccountTransaction.account_id == id
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado.")
        
    if tx.petty_cash_invoice_id or tx.petty_cash_reimbursement_id:
        raise HTTPException(
            status_code=400,
            detail="No se pueden editar manualmente movimientos integrados automáticamente con Caja Chica. Por favor adminístralos desde el módulo de Fondo Fijo."
        )
        
    # Si tiene una transacción vinculada por transferencia, la actualizamos también
    linked_tx = None
    if tx.transfer_transaction_id:
        linked_tx = db.query(AccountTransaction).filter(AccountTransaction.id == tx.transfer_transaction_id).first()

    if data.concept is not None:
        tx.concept = data.concept
        if linked_tx:
            linked_tx.concept = f"Transferencia: {data.concept}" if not data.concept.startswith("Transferencia:") else data.concept
            
    if data.amount is not None:
        tx.amount = data.amount
        if linked_tx:
            linked_tx.amount = data.amount
            
    if data.description is not None:
        tx.description = data.description
        
    if data.reference is not None:
        tx.reference = data.reference
        if linked_tx:
            linked_tx.reference = data.reference
            
    if data.origin_dest_account is not None:
        tx.origin_dest_account = data.origin_dest_account
        if linked_tx:
            linked_tx.origin_dest_account = data.origin_dest_account
            
    if data.category_id is not None:
        tx.category_id = data.category_id
        if linked_tx:
            linked_tx.category_id = data.category_id
            
    if data.transaction_date is not None:
        tx.transaction_date = data.transaction_date
        if linked_tx:
            linked_tx.transaction_date = data.transaction_date
        
    db.commit()
    db.refresh(tx)
    
    log_action(db, current_user.id, current_user.username, "update", id, f"Editó movimiento manual (ID: {tx.id}) en cuenta '{tx.account.name}'", request)
    return tx


@router.delete("/{id}/transactions/{tx_id}")
async def delete_transaction(
    id: int,
    tx_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("accounts", "delete")),
):
    """Eliminar un movimiento manual. Los movimientos enlazados a caja chica no se pueden eliminar aquí."""
    tx = db.query(AccountTransaction).filter(
        AccountTransaction.id == tx_id,
        AccountTransaction.account_id == id
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado.")
        
    if tx.petty_cash_invoice_id or tx.petty_cash_reimbursement_id:
        raise HTTPException(
            status_code=400,
            detail="No se pueden eliminar manualmente movimientos integrados automáticamente con Caja Chica. Por favor adminístralos desde el módulo de Fondo Fijo."
        )
        
    # Si tiene una transacción vinculada por transferencia, la eliminamos también
    if tx.transfer_transaction_id:
        linked_tx = db.query(AccountTransaction).filter(AccountTransaction.id == tx.transfer_transaction_id).first()
        if linked_tx:
            db.delete(linked_tx)

    db.delete(tx)
    db.commit()
    
    log_action(db, current_user.id, current_user.username, "delete", id, f"Eliminó movimiento manual (ID: {tx_id})", request)
    return {"status": "ok", "message": "Movimiento eliminado correctamente."}
