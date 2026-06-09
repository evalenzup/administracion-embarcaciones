"""
SIAE — Router de Documentación.
CRUD de documentos vinculados a embarcaciones con semáforo de vigencia.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from sqlalchemy.orm import Session
import os
import shutil
import uuid

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.vessel import Vessel
from app.models.document import Document, DocumentCategory
from app.schemas.document import DocumentCreate, DocumentUpdate, DocumentResponse, DocumentList
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/documents", tags=["Documentación"])


@router.get("", response_model=DocumentList)
async def list_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    vessel_id: int = Query(None),
    category: DocumentCategory = Query(None),
    vigency: str = Query(None, description="vigente, por_vencer, vencido"),
    search: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("documents", "view")),
):
    """Listar documentos con filtros por embarcación, categoría y vigencia."""
    query = db.query(Document).filter(Document.is_active == True)

    if vessel_id:
        query = query.filter(Document.vessel_id == vessel_id)
    if category:
        query = query.filter(Document.category == category)
    if search:
        query = query.filter(
            (Document.title.ilike(f"%{search}%")) |
            (Document.document_number.ilike(f"%{search}%"))
        )

    # Obtener todos y filtrar por vigencia en Python (es una propiedad calculada)
    all_items = query.order_by(Document.expiry_date.asc().nullslast(), Document.title).all()

    if vigency:
        all_items = [doc for doc in all_items if doc.vigency_status == vigency]

    total = len(all_items)
    items = all_items[skip:skip + limit]

    return DocumentList(total=total, items=items)


@router.get("/summary")
async def documents_summary(
    vessel_id: int = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("documents", "view")),
):
    """Resumen de vigencias de documentos (para dashboard)."""
    query = db.query(Document).filter(Document.is_active == True)
    if vessel_id:
        query = query.filter(Document.vessel_id == vessel_id)

    docs = query.all()
    summary = {"vigente": 0, "por_vencer": 0, "vencido": 0, "sin_vigencia": 0, "total": len(docs)}
    for doc in docs:
        summary[doc.vigency_status] += 1

    return summary


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("documents", "view")),
):
    """Obtener un documento por ID."""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return doc


@router.post("", response_model=DocumentResponse, status_code=201)
async def create_document(
    data: DocumentCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("documents", "create")),
):
    """Crear un nuevo documento."""
    vessel = db.query(Vessel).filter(Vessel.id == data.vessel_id).first()
    if not vessel:
        raise HTTPException(status_code=404, detail="Embarcación no encontrada")

    doc = Document(**data.model_dump())
    db.add(doc)
    db.commit()
    db.refresh(doc)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="create", module="documents", entity_type="Document",
        entity_id=doc.id,
        description=f"Creó documento '{doc.title}' para {vessel.name}",
        ip_address=request.client.host if request.client else None,
    )

    return doc


@router.put("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: int,
    data: DocumentUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("documents", "edit")),
):
    """Actualizar un documento."""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    update_data = data.model_dump(exclude_unset=True)
    changes = {}
    for key, value in update_data.items():
        old = getattr(doc, key)
        if old != value:
            changes[key] = {"antes": str(old), "después": str(value)}
        setattr(doc, key, value)

    db.commit()
    db.refresh(doc)

    if changes:
        log_action(
            db=db, user_id=current_user.id, username=current_user.username,
            action="update", module="documents", entity_type="Document",
            entity_id=doc.id,
            description=f"Actualizó documento '{doc.title}'",
            details=changes,
            ip_address=request.client.host if request.client else None,
        )

    return doc


@router.post("/{document_id}/upload", response_model=DocumentResponse)
async def upload_document_file(
    document_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("documents", "edit")),
):
    """Subir un archivo digitalizado para un documento existente."""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    upload_dir = "uploads/documents"
    os.makedirs(upload_dir, exist_ok=True)

    ext = file.filename.split(".")[-1] if "." in file.filename else ""
    unique_filename = f"{document_id}_{uuid.uuid4().hex[:8]}.{ext}"
    file_location = os.path.join(upload_dir, unique_filename)

    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    if doc.file_path and os.path.exists(doc.file_path.lstrip("/")):
        try:
            os.remove(doc.file_path.lstrip("/"))
        except Exception:
            pass

    doc.file_name = file.filename
    doc.file_path = f"/uploads/documents/{unique_filename}"
    doc.file_type = file.content_type
    doc.file_size_bytes = os.path.getsize(file_location)

    db.commit()
    db.refresh(doc)

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="update", module="documents", entity_type="Document",
        entity_id=doc.id,
        description=f"Subió archivo '{file.filename}' al documento '{doc.title}'",
        ip_address=request.client.host if request.client else None,
    )

    return doc


@router.delete("/{document_id}")
async def delete_document(
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("documents", "delete")),
):
    """Eliminar un documento."""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    title = doc.title
    db.delete(doc)
    db.commit()

    log_action(
        db=db, user_id=current_user.id, username=current_user.username,
        action="delete", module="documents", entity_type="Document",
        entity_id=document_id,
        description=f"Eliminó documento '{title}'",
        ip_address=request.client.host if request.client else None,
    )

    return {"message": f"Documento '{title}' eliminado correctamente"}
