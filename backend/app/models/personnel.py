"""
SIAE — Modelo de Personal.
Datos del personal con documentos de vigencia y vínculo opcional a usuario.
"""

from sqlalchemy import Column, Integer, String, Date, DateTime, Text, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func
from app.database import Base
import enum
from datetime import date


class PersonnelRole(str, enum.Enum):
    """Rol / puesto del personal."""
    CAPITAN          = "capitan"
    PRIMER_OFICIAL   = "primer_oficial"
    JEFE_MAQUINAS    = "jefe_maquinas"
    MARINERO         = "marinero"
    MECANICO         = "mecanico"
    ELECTRONICO      = "electronico"
    INVESTIGADOR     = "investigador"
    ASISTENTE        = "asistente"
    ADMINISTRATIVO   = "administrativo"
    OTRO             = "otro"


class PersonnelStatus(str, enum.Enum):
    """Estado del personal."""
    ACTIVO   = "activo"
    INACTIVO = "inactivo"
    BAJA     = "baja"


class Personnel(Base):
    """Registro de personal."""

    __tablename__ = "personnel"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, unique=True)

    # Datos personales
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    employee_number = Column(String(50), nullable=True, unique=True)
    curp = Column(String(20), nullable=True)
    rfc = Column(String(15), nullable=True)
    nationality = Column(String(100), nullable=True, default="Mexicana")

    # Datos de contacto
    phone = Column(String(30), nullable=True)
    email = Column(String(200), nullable=True)
    emergency_contact = Column(String(200), nullable=True)
    emergency_phone = Column(String(30), nullable=True)

    # Datos laborales
    role = Column(SAEnum(PersonnelRole), nullable=False, default=PersonnelRole.MARINERO)
    status = Column(SAEnum(PersonnelStatus), nullable=False, default=PersonnelStatus.ACTIVO)
    hire_date = Column(Date, nullable=True)
    birth_date = Column(Date, nullable=True)
    blood_type = Column(String(5), nullable=True)

    # Documentos clave (campos directos para acceso rápido)
    passport_number = Column(String(50), nullable=True)
    passport_expiry = Column(Date, nullable=True)
    seamans_book = Column(String(50), nullable=True)       # Libreta de mar
    seamans_book_expiry = Column(Date, nullable=True)
    medical_cert_expiry = Column(Date, nullable=True)      # Certificado médico
    stcw_expiry = Column(Date, nullable=True)              # Certificado STCW

    # URLs de documentos y foto
    photo_url = Column(String(500), nullable=True)
    id_document_url = Column(String(500), nullable=True)
    seamans_book_url = Column(String(500), nullable=True)

    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    system_user = relationship("User", backref=backref("personnel_record", uselist=False), lazy="selectin", foreign_keys=[user_id])

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @property
    def document_alerts(self) -> list[dict]:
        """Lista de documentos próximos a vencer o ya vencidos."""
        today = date.today()
        alerts = []
        docs = [
            ("Pasaporte", self.passport_expiry),
            ("Libreta de Mar", self.seamans_book_expiry),
            ("Cert. Médico", self.medical_cert_expiry),
            ("STCW", self.stcw_expiry),
        ]
        for name, expiry in docs:
            if not expiry:
                continue
            days = (expiry - today).days
            if days < 0:
                alerts.append({"doc": name, "status": "vencido", "days": days})
            elif days <= 60:
                alerts.append({"doc": name, "status": "por_vencer", "days": days})
        return alerts

    def __repr__(self):
        return f"<Personnel {self.full_name} ({self.role.value})>"
