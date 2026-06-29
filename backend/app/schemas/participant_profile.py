"""
SIAE — Schemas Pydantic para el Catálogo de Participantes.
"""
from datetime import date, datetime
from pydantic import BaseModel, Field
from app.models.participant_profile import ParticipantIdDocumentType


# ── Embed mínimo de Personnel ──────────────────────────────────
class PersonnelMiniEmbed(BaseModel):
    id: int
    full_name: str
    employee_number: str | None = None
    role: str
    model_config = {"from_attributes": True}


# ── Crear perfil ───────────────────────────────────────────────
class ParticipantProfileCreate(BaseModel):
    personnel_id: int | None = None  # Solo si es CICESE

    first_name:  str = Field(..., min_length=1, max_length=100)
    last_name:   str = Field(..., min_length=1, max_length=100)
    institution: str | None = Field("CICESE", max_length=200)
    nationality: str | None = Field("Mexicana", max_length=100)
    email:       str | None = Field(None, max_length=200)
    phone:       str | None = Field(None, max_length=30)
    curp:        str | None = Field(None, max_length=20, pattern=r"^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$")

    id_document_type:   ParticipantIdDocumentType | None = None
    id_document_number: str | None = Field(None, max_length=80)
    id_document_expiry: date | None = None

    notes: str | None = None


# ── Actualizar perfil ──────────────────────────────────────────
class ParticipantProfileUpdate(BaseModel):
    personnel_id: int | None = None
    first_name:   str | None = Field(None, min_length=1, max_length=100)
    last_name:    str | None = Field(None, min_length=1, max_length=100)
    institution:  str | None = Field(None, max_length=200)
    nationality:  str | None = Field(None, max_length=100)
    email:        str | None = Field(None, max_length=200)
    phone:        str | None = Field(None, max_length=30)
    curp:         str | None = Field(None, max_length=20, pattern=r"^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$")

    id_document_type:   ParticipantIdDocumentType | None = None
    id_document_number: str | None = Field(None, max_length=80)
    id_document_expiry: date | None = None

    notes:     str | None = None
    is_active: bool | None = None


# ── Respuesta completa ─────────────────────────────────────────
class ParticipantProfileResponse(BaseModel):
    id: int
    personnel_id:  int | None = None
    created_by_id: int | None = None
    is_cicese_staff: bool

    first_name:  str
    last_name:   str
    full_name:   str
    institution: str | None = None
    nationality: str | None = None
    email:       str | None = None
    phone:       str | None = None
    curp:        str | None = None

    id_document_type:   ParticipantIdDocumentType | None = None
    id_document_number: str | None = None
    id_document_expiry: date | None = None
    id_document_url:    str | None = None
    photo_url:          str | None = None

    notes:        str | None = None
    is_active:    bool
    cruise_count: int = 0

    personnel: PersonnelMiniEmbed | None = None

    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ── Respuesta simplificada para selects / listas ───────────────
class ParticipantProfileOption(BaseModel):
    id: int
    full_name:   str
    institution: str | None = None
    is_cicese_staff: bool
    photo_url:   str | None = None
    model_config = {"from_attributes": True}


# ── Lista paginada ─────────────────────────────────────────────
class ParticipantProfileList(BaseModel):
    total: int
    items: list[ParticipantProfileResponse]
