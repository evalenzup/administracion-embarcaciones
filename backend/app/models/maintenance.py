"""
SIAE — Modelos de Mantenimiento.
Categorías configurables + registros de mantenimiento por embarcación.
"""

from sqlalchemy import Column, Integer, String, Date, DateTime, Text, Boolean, Float, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class MaintenancePriority(str, enum.Enum):
    """Prioridad del mantenimiento."""
    BAJA = "baja"
    MEDIA = "media"
    ALTA = "alta"
    CRITICA = "critica"


class MaintenanceStatus(str, enum.Enum):
    """Estado del mantenimiento."""
    PENDIENTE = "pendiente"
    EN_PROGRESO = "en_progreso"
    COMPLETADO = "completado"
    CANCELADO = "cancelado"


class MaintenanceType(str, enum.Enum):
    """Tipo de mantenimiento."""
    PREVENTIVO = "preventivo"
    CORRECTIVO = "correctivo"
    PREDICTIVO = "predictivo"


class MaintenanceCategory(Base):
    """Categoría de mantenimiento configurable por el usuario."""

    __tablename__ = "maintenance_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(String(300), nullable=True)
    icon = Column(String(50), nullable=True)  # ícono para la UI
    color = Column(String(20), nullable=True)  # color hex para la UI
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<MaintenanceCategory {self.name}>"


class MaintenanceRecord(Base):
    """Registro de mantenimiento de una embarcación."""

    __tablename__ = "maintenance_records"

    id = Column(Integer, primary_key=True, index=True)
    vessel_id = Column(Integer, ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("maintenance_categories.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_to = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="SET NULL"), nullable=True, index=True)
    routine_id = Column(Integer, ForeignKey("equipment_routines.id", ondelete="SET NULL"), nullable=True, index=True)

    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    maintenance_type = Column(SAEnum(MaintenanceType), nullable=False, default=MaintenanceType.CORRECTIVO)
    priority = Column(SAEnum(MaintenancePriority), nullable=False, default=MaintenancePriority.MEDIA)
    status = Column(SAEnum(MaintenanceStatus), nullable=False, default=MaintenanceStatus.PENDIENTE)

    # Fechas
    scheduled_date = Column(Date, nullable=True)
    started_date = Column(Date, nullable=True)
    completed_date = Column(Date, nullable=True)

    # Costos
    estimated_cost = Column(Float, nullable=True)
    actual_cost = Column(Float, nullable=True)

    # Detalles técnicos
    system_component = Column(String(200), nullable=True)  # sistema/componente afectado
    work_performed = Column(Text, nullable=True)  # trabajo realizado
    parts_used = Column(Text, nullable=True)  # refacciones utilizadas
    hours_worked = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    vessel = relationship("Vessel", backref="maintenance_records", lazy="selectin")
    category = relationship("MaintenanceCategory", backref="records", lazy="selectin")
    assigned_user = relationship("User", backref="assigned_maintenance", lazy="selectin")
    equipment = relationship("Equipment", backref="maintenance_records", lazy="selectin")
    routine = relationship("EquipmentRoutine", backref="maintenance_records", lazy="selectin")

    def __repr__(self):
        return f"<MaintenanceRecord {self.title} ({self.status.value})>"
