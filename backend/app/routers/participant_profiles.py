"""
SIAE — Router del Catálogo de Participantes.

CRUD del catálogo reutilizable de personas que han embarcado.
Incluye uploads de foto y documento de identificación para PIS.
"""
import os
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from sqlalchemy.orm import Session

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.participant_profile import ParticipantProfile
from app.models.personnel import Personnel
from app.schemas.participant_profile import (
    ParticipantProfileCreate,
    ParticipantProfileUpdate,
    ParticipantProfileResponse,
    ParticipantProfileList,
    ParticipantProfileOption,
)
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/participants", tags=["Catálogo de Participantes"])

ALLOWED_PHOTO_EXTS    = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_DOCUMENT_EXTS = {".jpg", ".jpeg", ".png", ".pdf"}
MAX_PHOTO_SIZE        = 2 * 1024 * 1024   # 2 MB
MAX_DOCUMENT_SIZE     = 5 * 1024 * 1024   # 5 MB


def _get_or_404(pid: int, db: Session) -> ParticipantProfile:
    p = db.query(ParticipantProfile).filter(ParticipantProfile.id == pid).first()
    if not p:
        raise HTTPException(status_code=404, detail="Participante no encontrado")
    return p


# ── Listar / buscar ────────────────────────────────────────────

@router.get("", response_model=ParticipantProfileList)
async def list_participants(
    skip:       int = Query(0, ge=0),
    limit:      int = Query(20, ge=1, le=100),
    search:     str = Query(None),
    only_active: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("participants", "view")),
):
    """Lista paginada del catálogo de participantes con búsqueda por nombre."""
    q = db.query(ParticipantProfile)
    if only_active:
        q = q.filter(ParticipantProfile.is_active == True)
    if search:
        term = f"%{search}%"
        q = q.filter(
            (ParticipantProfile.first_name.ilike(term)) |
            (ParticipantProfile.last_name.ilike(term)) |
            (ParticipantProfile.institution.ilike(term))
        )
    total = q.count()
    items = q.order_by(ParticipantProfile.last_name, ParticipantProfile.first_name)\
             .offset(skip).limit(limit).all()

    # Enmascarar información sensible para usuarios no administradores y que no son creadores/dueños del perfil
    is_admin = current_user.is_superadmin or any(r.name == "Administrador" for r in current_user.roles)
    response_items = []
    for item in items:
        p_res = ParticipantProfileResponse.model_validate(item)
        is_self = (current_user.participant_profile_id == item.id)
        if not is_admin and item.created_by_id != current_user.id and not is_self:
            if item.id_document_number or item.id_document_url:
                p_res.id_document_number = "PROTEGIDO"
            else:
                p_res.id_document_number = None
            p_res.id_document_url = None
        response_items.append(p_res)

    return ParticipantProfileList(total=total, items=response_items)


@router.get("/options", response_model=list[ParticipantProfileOption])
async def participant_options(
    search: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("participants", "view")),
):
    """Lista simplificada para selects de formulario (sin paginación)."""
    q = db.query(ParticipantProfile).filter(ParticipantProfile.is_active == True)
    if search:
        term = f"%{search}%"
        q = q.filter(
            (ParticipantProfile.first_name.ilike(term)) |
            (ParticipantProfile.last_name.ilike(term))
        )
    return q.order_by(ParticipantProfile.last_name).limit(100).all()


@router.get("/{pid}", response_model=ParticipantProfileResponse)
async def get_participant(
    pid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("participants", "view")),
):
    profile = _get_or_404(pid, db)
    is_admin = current_user.is_superadmin or any(r.name == "Administrador" for r in current_user.roles)
    is_self = (current_user.participant_profile_id == profile.id)
    
    p_res = ParticipantProfileResponse.model_validate(profile)
    if not is_admin and profile.created_by_id != current_user.id and not is_self:
        if profile.id_document_number or profile.id_document_url:
            p_res.id_document_number = "PROTEGIDO"
        else:
            p_res.id_document_number = None
        p_res.id_document_url = None
        
    return p_res


# ── Crear perfil ───────────────────────────────────────────────

@router.post("", response_model=ParticipantProfileResponse, status_code=201)
async def create_participant(
    data: ParticipantProfileCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("participants", "create")),
):
    """Crea un nuevo perfil en el catálogo. Si se provee personnel_id, auto-completa datos."""
    payload = data.model_dump()

    # Verificar que el personnel_id existe si se provee
    if data.personnel_id:
        person = db.query(Personnel).filter(Personnel.id == data.personnel_id).first()
        if not person:
            raise HTTPException(status_code=404, detail="Registro de personal no encontrado")
        # Verificar que no haya ya un perfil para este registro de Personal
        existing = db.query(ParticipantProfile)\
                     .filter(ParticipantProfile.personnel_id == data.personnel_id).first()
        if existing:
            raise HTTPException(status_code=409,
                                detail=f"Ya existe un perfil de participante para este registro de personal (ID: {existing.id})")
        # Auto-completar desde Personnel si campos vacíos
        if not payload.get("first_name"):   payload["first_name"]  = person.first_name
        if not payload.get("last_name"):    payload["last_name"]   = person.last_name
        if not payload.get("institution"):  payload["institution"] = "CICESE"
        if not payload.get("nationality"):  payload["nationality"] = person.nationality or "Mexicana"
        if not payload.get("email"):        payload["email"]       = person.email
        if not payload.get("phone"):        payload["phone"]       = person.phone
        if not payload.get("id_document_number") and person.passport_number:
            payload["id_document_number"] = person.passport_number
            payload["id_document_type"]   = "pasaporte"
            payload["id_document_expiry"] = person.passport_expiry
        if not payload.get("curp") and person.curp:
            payload["curp"] = person.curp

    # Verificar que el CURP sea único si se provee
    if payload.get("curp"):
        existing_curp = db.query(ParticipantProfile).filter(
            ParticipantProfile.curp == payload["curp"]
        ).first()
        if existing_curp:
            raise HTTPException(status_code=400, detail="Ya existe un participante registrado con este CURP")

    profile = ParticipantProfile(created_by_id=current_user.id, **payload)
    db.add(profile)
    db.flush()

    # Sincronización inteligente de relaciones
    if profile.personnel_id:
        # Si está vinculado a personal de la institución, buscar el usuario del sistema de ese personal
        person = db.query(Personnel).filter(Personnel.id == profile.personnel_id).first()
        if person and person.user_id:
            user = db.query(User).filter(User.id == person.user_id).first()
            if user:
                user.participant_profile_id = profile.id
                db.add(user)
    else:
        # Si es un perfil externo (sin personnel_id), solo asociar al creador si es su autoregistro (mismo email)
        if current_user.participant_profile_id is None:
            if profile.email and current_user.email and profile.email.strip().lower() == current_user.email.strip().lower():
                current_user.participant_profile_id = profile.id
                db.add(current_user)

    db.commit()
    db.refresh(profile)

    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="create", module="participants", entity_type="ParticipantProfile",
               entity_id=profile.id,
               description=f"Creó perfil de participante '{profile.full_name}'",
               ip_address=request.client.host if request.client else None)
    return profile


@router.put("/{pid}", response_model=ParticipantProfileResponse)
async def update_participant(
    pid: int,
    data: ParticipantProfileUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("participants", "edit")),
):
    profile = _get_or_404(pid, db)
    
    # Validar propiedad
    is_admin = current_user.is_superadmin or any(r.name == "Administrador" for r in current_user.roles)
    is_self = (current_user.participant_profile_id == profile.id)
    if not is_admin and profile.created_by_id != current_user.id and not is_self:
        raise HTTPException(status_code=403, detail="No tienes permiso para modificar este perfil (pertenece a otro creador)")

    update_data = data.model_dump(exclude_unset=True)
    if "curp" in update_data and update_data["curp"]:
        existing_curp = db.query(ParticipantProfile).filter(
            ParticipantProfile.curp == update_data["curp"],
            ParticipantProfile.id != pid
        ).first()
        if existing_curp:
            raise HTTPException(status_code=400, detail="Ya existe un participante registrado con este CURP")

    for key, value in update_data.items():
        setattr(profile, key, value)
    db.commit()
    db.refresh(profile)
    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="update", module="participants", entity_type="ParticipantProfile",
               entity_id=pid,
               description=f"Actualizó perfil '{profile.full_name}'",
               ip_address=request.client.host if request.client else None)
    return profile


# ── Eliminar (soft delete) ─────────────────────────────────────

@router.delete("/{pid}")
async def delete_participant(
    pid: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("participants", "delete")),
):
    """Desactiva el perfil (soft delete). Preserva el historial de cruceros."""
    profile = _get_or_404(pid, db)
    
    # Validar propiedad
    is_admin = current_user.is_superadmin or any(r.name == "Administrador" for r in current_user.roles)
    is_self = (current_user.participant_profile_id == profile.id)
    if not is_admin and profile.created_by_id != current_user.id and not is_self:
        raise HTTPException(status_code=403, detail="No tienes permiso para desactivar este perfil (pertenece a otro creador)")

    name = profile.full_name
    profile.is_active = False
    db.commit()
    log_action(db=db, user_id=current_user.id, username=current_user.username,
               action="delete", module="participants", entity_type="ParticipantProfile",
               entity_id=pid,
               description=f"Desactivó perfil '{name}'",
               ip_address=request.client.host if request.client else None)
    return {"message": f"Perfil '{name}' desactivado"}


# ── Upload de foto ─────────────────────────────────────────────

@router.post("/{pid}/photo", response_model=ParticipantProfileResponse)
async def upload_photo(
    pid: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("participants", "edit")),
):
    """Sube o reemplaza la foto tipo carnet del participante."""
    profile = _get_or_404(pid, db)
    
    # Validar propiedad
    is_admin = current_user.is_superadmin or any(r.name == "Administrador" for r in current_user.roles)
    is_self = (current_user.participant_profile_id == profile.id)
    if not is_admin and profile.created_by_id != current_user.id and not is_self:
        raise HTTPException(status_code=403, detail="No tienes permiso para modificar este perfil (pertenece a otro creador)")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_PHOTO_EXTS:
        raise HTTPException(status_code=400,
                            detail=f"Formato no permitido. Use: {', '.join(ALLOWED_PHOTO_EXTS)}")
    content = await file.read()
    if len(content) > MAX_PHOTO_SIZE:
        raise HTTPException(status_code=400, detail="La foto no debe superar 2 MB")

    upload_dir = f"uploads/participants/{pid}"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = f"{upload_dir}/photo{ext}"
    with open(file_path, "wb") as f:
        f.write(content)

    profile.photo_url = f"/{file_path}"
    db.commit()
    db.refresh(profile)
    return profile


# ── Upload de documento de identificación ─────────────────────

@router.post("/{pid}/document", response_model=ParticipantProfileResponse)
async def upload_document(
    pid: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("participants", "edit")),
):
    """Sube o reemplaza el documento escaneado (INE / Pasaporte) del participante."""
    profile = _get_or_404(pid, db)
    
    # Validar propiedad y reglas especiales de documento (permitir si es el propio perfil, o si no tiene documento o está vencido)
    is_admin = current_user.is_superadmin or any(r.name == "Administrador" for r in current_user.roles)
    is_self = (current_user.participant_profile_id == profile.id)
    if not is_admin and profile.created_by_id != current_user.id and not is_self:
        from datetime import date
        is_missing = not profile.id_document_url
        is_expired = profile.id_document_expiry is not None and profile.id_document_expiry < date.today()
        if not (is_missing or is_expired):
            raise HTTPException(
                status_code=403,
                detail="No tienes permiso para subir documentos a este perfil (pertenece a otro creador y cuenta con un documento vigente)"
            )

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_DOCUMENT_EXTS:
        raise HTTPException(status_code=400,
                            detail=f"Formato no permitido. Use: {', '.join(ALLOWED_DOCUMENT_EXTS)}")
    content = await file.read()
    if len(content) > MAX_DOCUMENT_SIZE:
        raise HTTPException(status_code=400, detail="El documento no debe superar 5 MB")

    upload_dir = f"uploads/participants/{pid}"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = f"{upload_dir}/id_document{ext}"
    with open(file_path, "wb") as f:
        f.write(content)

    profile.id_document_url = f"/{file_path}"
    db.commit()
    db.refresh(profile)
    return profile
