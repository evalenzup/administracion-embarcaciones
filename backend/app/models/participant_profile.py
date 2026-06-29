"""
SIAE — Modelo de Perfil de Participante.

Catálogo reutilizable de todas las personas que han embarcado en
embarcaciones de CICESE, sean empleados internos o externos.

Un participante se registra UNA SOLA VEZ en este catálogo y puede
asignarse a cualquier número de cruceros con diferentes roles.

Si la persona es empleado de CICESE, se vincula opcionalmente a
su registro de Personnel. Si es externo, se capturan sus datos directamente.
"""

from sqlalchemy import (
    Column, Integer, String, Date, DateTime, Boolean,
    ForeignKey, Enum as SAEnum, Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class ParticipantIdDocumentType(str, enum.Enum):
    """Tipo de documento de identificación oficial para PIS."""
    INE       = "ine"
    PASAPORTE = "pasaporte"
    OTRO      = "otro"


class ParticipantProfile(Base):
    """
    Perfil reutilizable de participante de crucero.
    Puede ser personal CICESE (con enlace a Personnel) o externo.
    """

    __tablename__ = "participant_profiles"

    id = Column(Integer, primary_key=True, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # Vínculo opcional al catálogo interno de Personal (solo CICESE)
    personnel_id = Column(
        Integer,
        ForeignKey("personnel.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,  # un registro de Personnel → un solo perfil
    )

    # ── Datos personales ───────────────────────────────────────
    first_name   = Column(String(100), nullable=False)
    last_name    = Column(String(100), nullable=False)
    curp         = Column(String(20), nullable=True, unique=True)
    institution  = Column(String(200), nullable=True, default="CICESE")
    nationality  = Column(String(100), nullable=True, default="Mexicana")
    email        = Column(String(200), nullable=True)
    phone        = Column(String(30), nullable=True)

    # ── Documentos PIS / ASIPONAV ─────────────────────────────
    id_document_type   = Column(SAEnum(ParticipantIdDocumentType), nullable=True)
    id_document_number = Column(String(80), nullable=True)
    id_document_expiry = Column(Date, nullable=True)
    id_document_url    = Column(String(500), nullable=True)  # escaneo del doc
    photo_url          = Column(String(500), nullable=True)  # foto carnet

    notes     = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(),
                        onupdate=func.now())

    # ── Relaciones ─────────────────────────────────────────────
    personnel = relationship(
        "Personnel",
        backref="participant_profile",
        lazy="selectin",
        foreign_keys=[personnel_id],
    )
    created_by = relationship(
        "User",
        foreign_keys=[created_by_id],
        backref="created_participant_profiles",
        lazy="selectin",
    )
    linked_user = relationship(
        "User",
        foreign_keys="[User.participant_profile_id]",
        back_populates="participant_profile",
        uselist=False,
    )
    cruise_assignments = relationship(
        "CruiseParticipant",
        back_populates="participant",
        lazy="dynamic",  # lazy dynamic para no cargar todos los cruceros al consultar el catálogo
    )

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @property
    def is_cicese_staff(self) -> bool:
        """True si está vinculado a un registro de Personal CICESE."""
        return self.personnel_id is not None

    @property
    def cruise_count(self) -> int:
        """Número de cruceros en los que ha participado."""
        return self.cruise_assignments.count()

    def __repr__(self):
        return f"<ParticipantProfile {self.full_name} ({'CICESE' if self.is_cicese_staff else 'Externo'})>"
