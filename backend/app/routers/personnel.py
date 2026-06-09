"""
SIAE — Router de Personal.
CRUD con semáforo de documentos vigentes.
"""
import os
from fastapi import APIRouter, Depends, HTTPException, Query, Request, File, UploadFile
from sqlalchemy.orm import Session

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.participant_profile import ParticipantProfile
from app.models.personnel import Personnel, PersonnelRole, PersonnelStatus
from app.schemas.personnel import PersonnelCreate, PersonnelUpdate, PersonnelResponse, PersonnelList
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/personnel", tags=["Personal"])


@router.get("", response_model=PersonnelList)
async def list_personnel(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=500),
    role: PersonnelRole = Query(None),
    status: PersonnelStatus = Query(None),
    search: str = Query(None),
    with_alerts: bool = Query(False, description="Solo personal con documentos por vencer o vencidos"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("personnel", "view")),
):
    query = db.query(Personnel).filter(Personnel.is_active == True)
    if role:
        query = query.filter(Personnel.role == role)
    if status:
        query = query.filter(Personnel.status == status)
    if search:
        query = query.filter(
            (Personnel.first_name.ilike(f"%{search}%")) |
            (Personnel.last_name.ilike(f"%{search}%")) |
            (Personnel.employee_number.ilike(f"%{search}%"))
        )

    all_items = query.order_by(Personnel.last_name, Personnel.first_name).all()

    if with_alerts:
        all_items = [p for p in all_items if len(p.document_alerts) > 0]

    total = len(all_items)
    items = all_items[skip:skip + limit]
    return PersonnelList(total=total, items=items)


@router.get("/summary")
async def personnel_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("personnel", "view")),
):
    people = db.query(Personnel).filter(Personnel.is_active == True).all()
    return {
        "total": len(people),
        "activo": sum(1 for p in people if p.status == PersonnelStatus.ACTIVO),
        "con_alertas": sum(1 for p in people if len(p.document_alerts) > 0),
        "vencidos": sum(1 for p in people if any(a["status"] == "vencido" for a in p.document_alerts)),
    }


@router.get("/{personnel_id}", response_model=PersonnelResponse)
async def get_person(
    personnel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("personnel", "view")),
):
    person = db.query(Personnel).filter(Personnel.id == personnel_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personal no encontrado")
    return person


@router.post("", response_model=PersonnelResponse, status_code=201)
async def create_person(
    data: PersonnelCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("personnel", "create")),
):
    if data.employee_number:
        existing = db.query(Personnel).filter(Personnel.employee_number == data.employee_number).first()
        if existing:
            raise HTTPException(status_code=400, detail="El número de empleado ya está registrado")

    person = Personnel(**data.model_dump())
    db.add(person)
    db.commit()
    db.refresh(person)

    # Sincronización al crear (si se vinculó un user_id al crearlo)
    if person.user_id:
        profile = db.query(ParticipantProfile).filter(ParticipantProfile.personnel_id == person.id).first()
        if profile:
            user = db.query(User).filter(User.id == person.user_id).first()
            if user:
                user.participant_profile_id = profile.id
                db.add(user)
                db.commit()

    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="create", module="personnel", entity_type="Personnel",
               entity_id=person.id, description=f"Registró personal: {person.full_name}",
               ip_address=request.client.host if request.client else None)
    return person


@router.put("/{personnel_id}", response_model=PersonnelResponse)
async def update_person(
    personnel_id: int,
    data: PersonnelUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("personnel", "edit")),
):
    person = db.query(Personnel).filter(Personnel.id == personnel_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personal no encontrado")

    # Guardar user_id previo para saber si cambió
    old_user_id = person.user_id

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(person, key, value)

    db.commit()
    db.refresh(person)

    # Sincronización al actualizar si el user_id cambió
    if "user_id" in data.model_dump(exclude_unset=True) and person.user_id != old_user_id:
        profile = db.query(ParticipantProfile).filter(ParticipantProfile.personnel_id == person.id).first()
        
        # Desvincular usuario anterior
        if old_user_id:
            old_user = db.query(User).filter(User.id == old_user_id).first()
            if old_user and profile and old_user.participant_profile_id == profile.id:
                old_user.participant_profile_id = None
                db.add(old_user)
        
        # Vincular nuevo usuario
        if person.user_id and profile:
            new_user = db.query(User).filter(User.id == person.user_id).first()
            if new_user:
                new_user.participant_profile_id = profile.id
                db.add(new_user)
                
        db.commit()
        db.refresh(person)

    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="update", module="personnel", entity_type="Personnel",
               entity_id=person.id, description=f"Actualizó personal: {person.full_name}",
               ip_address=request.client.host if request.client else None)
    return person


@router.delete("/{personnel_id}")
async def delete_person(
    personnel_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("personnel", "delete")),
):
    person = db.query(Personnel).filter(Personnel.id == personnel_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personal no encontrado")
    name = person.full_name
    db.delete(person)
    db.commit()
    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="delete", module="personnel", entity_type="Personnel",
               entity_id=personnel_id, description=f"Eliminó personal: {name}",
               ip_address=request.client.host if request.client else None)
    return {"message": f"Personal '{name}' eliminado"}


# ── Upload de documentos y foto para Personal ──────────────────

ALLOWED_PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_DOC_EXTS   = {".jpg", ".jpeg", ".png", ".pdf"}
MAX_PHOTO_SIZE = 2 * 1024 * 1024  # 2 MB
MAX_DOC_SIZE   = 5 * 1024 * 1024  # 5 MB


@router.post("/{personnel_id}/photo", response_model=PersonnelResponse)
async def upload_person_photo(
    personnel_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("personnel", "edit")),
):
    """Sube o reemplaza la foto del miembro del personal."""
    person = db.query(Personnel).filter(Personnel.id == personnel_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personal no encontrado")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_PHOTO_EXTS:
        raise HTTPException(status_code=400, detail=f"Formato no permitido. Use: {', '.join(ALLOWED_PHOTO_EXTS)}")
    
    content = await file.read()
    if len(content) > MAX_PHOTO_SIZE:
        raise HTTPException(status_code=400, detail="La foto no debe superar 2 MB")

    upload_dir = f"uploads/personnel/{personnel_id}"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = f"{upload_dir}/photo{ext}"
    with open(file_path, "wb") as f:
        f.write(content)

    person.photo_url = f"/{file_path}"
    db.commit()
    db.refresh(person)
    return person


@router.post("/{personnel_id}/id-document", response_model=PersonnelResponse)
async def upload_person_id_document(
    personnel_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("personnel", "edit")),
):
    """Sube o reemplaza la identificación del miembro del personal."""
    person = db.query(Personnel).filter(Personnel.id == personnel_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personal no encontrado")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_DOC_EXTS:
        raise HTTPException(status_code=400, detail=f"Formato no permitido. Use: {', '.join(ALLOWED_DOC_EXTS)}")
    
    content = await file.read()
    if len(content) > MAX_DOC_SIZE:
        raise HTTPException(status_code=400, detail="El documento no debe superar 5 MB")

    upload_dir = f"uploads/personnel/{personnel_id}"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = f"{upload_dir}/id_document{ext}"
    with open(file_path, "wb") as f:
        f.write(content)

    person.id_document_url = f"/{file_path}"
    db.commit()
    db.refresh(person)
    return person


@router.post("/{personnel_id}/seamans-book", response_model=PersonnelResponse)
async def upload_person_seamans_book(
    personnel_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("personnel", "edit")),
):
    """Sube o reemplaza la libreta de mar escaneada del miembro del personal."""
    person = db.query(Personnel).filter(Personnel.id == personnel_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personal no encontrado")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_DOC_EXTS:
        raise HTTPException(status_code=400, detail=f"Formato no permitido. Use: {', '.join(ALLOWED_DOC_EXTS)}")
    
    content = await file.read()
    if len(content) > MAX_DOC_SIZE:
        raise HTTPException(status_code=400, detail="El documento no debe superar 5 MB")

    upload_dir = f"uploads/personnel/{personnel_id}"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = f"{upload_dir}/seamans_book{ext}"
    with open(file_path, "wb") as f:
        f.write(content)

    person.seamans_book_url = f"/{file_path}"
    db.commit()
    db.refresh(person)
    return person
