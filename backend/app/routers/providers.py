"""
SIAE — Endpoints para la gestión de Proveedores.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.dependencies import require_permission
from app.models.user import User
from app.models.provider import Provider
from app.models.service_request import ServiceRequest
from app.models.petty_cash_invoice import PettyCashInvoice
from app.schemas.provider import ProviderResponse, ProviderCreate, ProviderUpdate
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/providers", tags=["Finanzas — Catálogo de Proveedores"])


@router.get("", response_model=List[ProviderResponse])
async def list_providers(
    search: Optional[str] = Query(None, description="Buscar por RFC, Razón Social o Nombre Comercial"),
    active_only: bool = Query(True, description="Filtrar solo proveedores activos"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("providers", "view")),
):
    """Listar todos los proveedores con filtros y buscadores."""
    query = db.query(Provider)
    
    if active_only:
        query = query.filter(Provider.is_active == True)
        
    if search:
        search_like = f"%{search}%"
        query = query.filter(
            (Provider.rfc.ilike(search_like)) |
            (Provider.legal_name.ilike(search_like)) |
            (Provider.commercial_name.ilike(search_like))
        )
        
    return query.order_by(Provider.commercial_name.asc(), Provider.legal_name.asc()).all()


@router.get("/{id}")
async def get_provider_detail(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("providers", "view")),
):
    """Obtener el detalle de un proveedor junto con estadísticas e historial de gastos."""
    provider = db.query(Provider).filter(Provider.id == id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
        
    # Calcular estadísticas de gastos asociados
    # 1. Servicios
    services = db.query(ServiceRequest).filter(ServiceRequest.provider_id == id).all()
    services_total = sum(s.budget_amount for s in services if s.status != "cancelado")
    
    # 2. Caja chica
    petty_cash = db.query(PettyCashInvoice).filter(PettyCashInvoice.provider_id == id).all()
    petty_cash_total = sum(p.total for p in petty_cash)
    
    # Mapear respuesta detallada
    services_data = []
    for s in services:
        services_data.append({
            "id": s.id,
            "internal_folio": s.internal_folio,
            "episa_folio": s.episa_folio,
            "budget_amount": s.budget_amount,
            "status": s.status,
            "invoice_pdf_file": s.invoice_pdf_file,
            "created_at": s.created_at
        })
        
    petty_cash_data = []
    for p in petty_cash:
        petty_cash_data.append({
            "id": p.id,
            "uuid": p.uuid,
            "folio": p.folio,
            "total": p.total,
            "description": p.description,
            "category_name": p.category.name if p.category else "General",
            "pdf_filename": p.pdf_filename,
            "created_at": p.created_at
        })

    return {
        "id": provider.id,
        "rfc": provider.rfc,
        "legal_name": provider.legal_name,
        "commercial_name": provider.commercial_name,
        "is_active": provider.is_active,
        "created_at": provider.created_at,
        "updated_at": provider.updated_at,
        "stats": {
            "services_count": len(services),
            "services_total": services_total,
            "petty_cash_count": len(petty_cash),
            "petty_cash_total": petty_cash_total,
            "total_spent": services_total + petty_cash_total
        },
        "services": services_data,
        "petty_cash": petty_cash_data
    }


@router.post("", response_model=ProviderResponse, status_code=201)
async def create_provider(
    data: ProviderCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("providers", "create")),
):
    """Crear manualmente un proveedor en el catálogo."""
    # Verificar si el RFC ya existe
    existing = db.query(Provider).filter(Provider.rfc == data.rfc.upper().strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Ya existe un proveedor con el RFC '{data.rfc.upper().strip()}'.")
        
    provider = Provider(
        rfc=data.rfc.upper().strip(),
        legal_name=data.legal_name.strip() if data.legal_name else None,
        commercial_name=data.commercial_name.strip() if data.commercial_name else None
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    
    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="create",
        module="providers",
        entity_type="Provider",
        entity_id=provider.id,
        description=f"Creó el proveedor '{provider.rfc}' - '{provider.commercial_name or provider.legal_name}'",
        ip_address=request.client.host if request and request.client else None
    )
    
    return provider


@router.put("/{id}", response_model=ProviderResponse)
async def update_provider(
    id: int,
    data: ProviderUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("providers", "edit")),
):
    """Actualizar datos de un proveedor (ej. Nombre Comercial o estado de activo)."""
    provider = db.query(Provider).filter(Provider.id == id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
        
    if data.commercial_name is not None:
        provider.commercial_name = data.commercial_name.strip() or None
        
    if data.is_active is not None:
        provider.is_active = data.is_active
        
    db.commit()
    db.refresh(provider)
    
    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="update",
        module="providers",
        entity_type="Provider",
        entity_id=provider.id,
        description=f"Actualizó el proveedor '{provider.rfc}' (Nombre comercial: '{provider.commercial_name}', Activo: {provider.is_active})",
        ip_address=request.client.host if request and request.client else None
    )
    
    return provider


@router.delete("/{id}")
async def delete_provider(
    id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("providers", "delete")),
):
    """Eliminar físicamente un proveedor si no tiene gastos asociados, o desactivarlo en su defecto."""
    provider = db.query(Provider).filter(Provider.id == id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
        
    # Verificar gastos asociados
    services_count = db.query(ServiceRequest).filter(ServiceRequest.provider_id == id).count()
    petty_cash_count = db.query(PettyCashInvoice).filter(PettyCashInvoice.provider_id == id).count()
    
    rfc = provider.rfc
    name = provider.commercial_name or provider.legal_name
    
    if services_count > 0 or petty_cash_count > 0:
        # No eliminar, solo desactivar por integridad referencial
        provider.is_active = False
        db.commit()
        
        log_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action="update",
            module="providers",
            entity_type="Provider",
            entity_id=id,
            description=f"Desactivó el proveedor '{rfc}' (no se eliminó por tener {services_count} servicios y {petty_cash_count} facturas asociadas)",
            ip_address=request.client.host if request and request.client else None
        )
        return {"status": "deactivated", "message": f"El proveedor '{name}' tiene gastos asociados. Se ha desactivado en lugar de eliminar."}
        
    db.delete(provider)
    db.commit()
    
    log_action(
        db=db,
        user_id=current_user.id,
        username=current_user.username,
        action="delete",
        module="providers",
        entity_type="Provider",
        entity_id=id,
        description=f"Eliminó permanentemente al proveedor '{rfc}' - '{name}'",
        ip_address=request.client.host if request and request.client else None
    )
    
    return {"status": "deleted", "message": f"Proveedor '{name}' eliminado correctamente."}
