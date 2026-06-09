"""
SIAE — Schemas Pydantic para asignaciones Participante → Crucero.
"""
from datetime import date, datetime
from pydantic import BaseModel, Field
from app.models.cruise_participant import ParticipantRole


# ── Embed del perfil para mostrar en la asignación ────────────
class ParticipantProfileEmbed(BaseModel):
    id: int
    full_name:   str
    institution: str | None = None
    nationality: str | None = None
    photo_url:   str | None = None
    id_document_type:   str | None = None
    id_document_number: str | None = None
    id_document_expiry: date | None = None
    id_document_url:    str | None = None
    is_cicese_staff: bool = False
    model_config = {"from_attributes": True}


# ── Crear asignación ──────────────────────────────────────────
class CruiseParticipantCreate(BaseModel):
    participant_id:            int
    role_in_cruise:            ParticipantRole = ParticipantRole.INVESTIGADOR_PRINCIPAL
    is_principal_investigator: bool = False
    is_cruise_leader:          bool = False
    notes:                     str | None = None


# ── Actualizar asignación ─────────────────────────────────────
class CruiseParticipantUpdate(BaseModel):
    role_in_cruise:            ParticipantRole | None = None
    is_principal_investigator: bool | None = None
    is_cruise_leader:          bool | None = None
    notes:                     str | None = None


# ── Respuesta ─────────────────────────────────────────────────
class CruiseParticipantResponse(BaseModel):
    id:            int
    cruise_id:     int
    participant_id: int

    role_in_cruise:            ParticipantRole
    is_principal_investigator: bool
    is_cruise_leader:          bool
    notes:                     str | None = None

    participant: ParticipantProfileEmbed

    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
