"""
SIAE — Router de gestión de usuarios (admin).
CRUD completo + asignación de roles.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.dependencies import get_db, require_permission, get_current_user
from app.models.user import User, UserRole
from app.models.role import Role
from app.models.personnel import Personnel
from app.models.participant_profile import ParticipantProfile
from app.schemas.user import UserCreate, UserUpdate, UserResponse, UserList
from app.utils.security import hash_password

router = APIRouter(prefix="/api/v1/users", tags=["Usuarios"])


@router.get("", response_model=UserList)
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: str = Query(None),
    is_active: bool = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users", "view")),
):
    """Listar usuarios con paginación y filtros."""
    query = db.query(User)

    if search:
        query = query.filter(
            (User.username.ilike(f"%{search}%")) |
            (User.full_name.ilike(f"%{search}%")) |
            (User.email.ilike(f"%{search}%"))
        )

    if is_active is not None:
        query = query.filter(User.is_active == is_active)

    total = query.count()
    items = query.order_by(User.id).offset(skip).limit(limit).all()

    # Resolver roles para la respuesta
    response_items = []
    for user in items:
      user_data = UserResponse(
          id=user.id,
          username=user.username,
          email=user.email,
          full_name=user.full_name,
          is_active=user.is_active,
          is_superadmin=user.is_superadmin,
          personnel_id=user.personnel_record.id if user.personnel_record else None,
          participant_profile_id=user.participant_profile_id,
          created_at=user.created_at,
          updated_at=user.updated_at,
          roles=[{"id": r.id, "name": r.name, "description": r.description} for r in user.roles],
      )
      response_items.append(user_data)

    return UserList(total=total, items=response_items)


@router.get("/options")
async def list_user_options(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Listar opciones básicas de usuarios activos (id, username, full_name) para selectores."""
    users = db.query(User).filter(User.is_active == True).order_by(User.username).all()
    return [{"id": u.id, "username": u.username, "full_name": u.full_name} for u in users]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users", "view")),
):
    """Obtener un usuario por ID."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_superadmin=user.is_superadmin,
        personnel_id=user.personnel_record.id if user.personnel_record else None,
        participant_profile_id=user.participant_profile_id,
        created_at=user.created_at,
        updated_at=user.updated_at,
        roles=[{"id": r.id, "name": r.name, "description": r.description} for r in user.roles],
    )


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users", "create")),
):
    """Crear un nuevo usuario."""
    # Verificar unicidad
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail="El nombre de usuario ya existe")
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="El email ya está registrado")

    p_id = data.participant_profile_id
    pers_id = data.personnel_id
    if p_id and pers_id:
        raise HTTPException(status_code=400, detail="Un usuario no puede estar vinculado a un participante y a un tripulante a la vez")

    user = User(
        username=data.username,
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        is_active=data.is_active,
        participant_profile_id=p_id,
        personnel_id=pers_id,
    )
    db.add(user)
    db.flush()

    # Asignar roles
    if data.role_ids:
        roles = db.query(Role).filter(Role.id.in_(data.role_ids)).all()
        for role in roles:
            db.add(UserRole(user_id=user.id, role_id=role.id))

    # Sincronización al crear:
    if pers_id:
        person = db.query(Personnel).filter(Personnel.id == pers_id).first()
        if person:
            db.query(Personnel).filter(Personnel.user_id == user.id, Personnel.id != person.id).update({Personnel.user_id: None})
            person.user_id = user.id
            db.add(person)
    elif p_id:
        db.query(Personnel).filter(Personnel.user_id == user.id).update({Personnel.user_id: None})

    db.commit()
    db.refresh(user)

    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_superadmin=user.is_superadmin,
        personnel_id=user.personnel_id,
        participant_profile_id=user.participant_profile_id,
        created_at=user.created_at,
        updated_at=user.updated_at,
        roles=[{"id": r.id, "name": r.name, "description": r.description} for r in user.roles],
    )


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users", "edit")),
):
    """Actualizar un usuario existente."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # No permitir desactivar al superadmin
    if user.is_superadmin and data.is_active is False:
        raise HTTPException(status_code=400, detail="No se puede desactivar al superadmin")

    if data.email is not None:
        existing = db.query(User).filter(User.email == data.email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="El email ya está registrado")
        user.email = data.email

    if data.full_name is not None:
        user.full_name = data.full_name

    if data.is_active is not None:
        user.is_active = data.is_active

    # Manejar campos mutuamente excluyentes personnel_id y participant_profile_id
    exclude_unset = data.model_dump(exclude_unset=True)
    if "personnel_id" in exclude_unset or "participant_profile_id" in exclude_unset:
        p_id = data.participant_profile_id
        pers_id = data.personnel_id
        
        if p_id and pers_id:
            raise HTTPException(status_code=400, detail="Un usuario no puede estar vinculado a un participante y a un tripulante a la vez")
            
        if pers_id:
            user.personnel_id = pers_id
            user.participant_profile_id = None
            
            # Sincronizar Personnel.user_id
            person = db.query(Personnel).filter(Personnel.id == pers_id).first()
            if person:
                db.query(Personnel).filter(Personnel.user_id == user.id, Personnel.id != person.id).update({Personnel.user_id: None})
                person.user_id = user.id
                db.add(person)
        elif p_id:
            user.personnel_id = None
            user.participant_profile_id = p_id
            
            # Desvincular personal previamente enlazado a este usuario
            db.query(Personnel).filter(Personnel.user_id == user.id).update({Personnel.user_id: None})
        else:
            # Ambos son None
            user.personnel_id = None
            user.participant_profile_id = None
            db.query(Personnel).filter(Personnel.user_id == user.id).update({Personnel.user_id: None})

    # Actualizar roles si se proporcionan
    if data.role_ids is not None:
        # Eliminar roles actuales
        db.query(UserRole).filter(UserRole.user_id == user_id).delete()
        # Asignar nuevos roles
        roles = db.query(Role).filter(Role.id.in_(data.role_ids)).all()
        for role in roles:
            db.add(UserRole(user_id=user.id, role_id=role.id))

    db.commit()
    db.refresh(user)

    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_superadmin=user.is_superadmin,
        personnel_id=user.personnel_id,
        participant_profile_id=user.participant_profile_id,
        created_at=user.created_at,
        updated_at=user.updated_at,
        roles=[{"id": r.id, "name": r.name, "description": r.description} for r in user.roles],
    )


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users", "delete")),
):
    """Eliminar un usuario."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user.is_superadmin:
        raise HTTPException(status_code=400, detail="No se puede eliminar al superadmin")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")

    db.delete(user)
    db.commit()

    return {"message": "Usuario eliminado correctamente"}
