"""
SIAE — Modelos de Equipos y Sistemas.
Gestión de motores, generadores, y sistemas a bordo.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class EquipmentCategory(str, enum.Enum):
    """Categoría principal del equipo."""
    MOTOR_PRINCIPAL = "motor_principal"
    GENERADOR = "generador"
    SISTEMA_HIDRAULICO = "sistema_hidraulico"
    SISTEMA_ELECTRICO = "sistema_electrico"
    BOMBA = "bomba"
    GRUA_WINCHE = "grua_winche"
    NAVEGACION = "navegacion"
    REFRIGERACION = "refrigeracion"
    OTRO = "otro"


class EquipmentStatus(str, enum.Enum):
    """Estado operativo del equipo."""
    OPERATIVO = "operativo"
    MANTENIMIENTO = "mantenimiento"
    REPARACION = "reparacion"
    FUERA_SERVICIO = "fuera_servicio"


class Equipment(Base):
    """Equipo o sistema físico instalado en una embarcación."""

    __tablename__ = "equipment"

    id = Column(Integer, primary_key=True, index=True)
    vessel_id = Column(Integer, ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Datos generales
    name = Column(String(200), nullable=False)
    category = Column(SAEnum(EquipmentCategory), nullable=False, default=EquipmentCategory.OTRO)
    brand = Column(String(100), nullable=True)
    model = Column(String(100), nullable=True)
    serial_number = Column(String(100), nullable=True, index=True)
    year_installed = Column(Integer, nullable=True)
    
    # Detalles
    location = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    characteristics = Column(Text, nullable=True)
    
    # Estado y Horómetro
    status = Column(SAEnum(EquipmentStatus), nullable=False, default=EquipmentStatus.OPERATIVO)
    hour_meter = Column(Float, nullable=False, default=0.0)
    
    # Documentación (Manual)
    manual_file_name = Column(String(300), nullable=True)
    manual_file_path = Column(String(500), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    vessel = relationship("Vessel", backref="equipment_list", lazy="selectin")
    routines = relationship("EquipmentRoutine", backref="equipment", cascade="all, delete-orphan", lazy="selectin")
    
    def __repr__(self):
        return f"<Equipment {self.name} ({self.brand} {self.model})>"


class EquipmentRoutine(Base):
    """Rutina de mantenimiento específica para un equipo (ej. Cambio de aceite, Overhaul)."""
    __tablename__ = "equipment_routines"

    id = Column(Integer, primary_key=True, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True)
    
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    
    interval_hours = Column(Float, nullable=True)  # Cada cuántas horas
    interval_months = Column(Integer, nullable=True) # Cada cuántos meses
    
    last_performed_hours = Column(Float, nullable=True) # Horómetro en el último servicio
    last_performed_date = Column(DateTime, nullable=True) # Fecha del último servicio
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    parts = relationship("EquipmentRoutinePart", backref="routine", cascade="all, delete-orphan", lazy="selectin")

    def __repr__(self):
        return f"<EquipmentRoutine {self.name}>"


class EquipmentRoutinePart(Base):
    """Insumo/Refacción requerida para una rutina de mantenimiento."""
    __tablename__ = "equipment_routine_parts"

    id = Column(Integer, primary_key=True, index=True)
    routine_id = Column(Integer, ForeignKey("equipment_routines.id", ondelete="CASCADE"), nullable=False, index=True)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False, index=True)
    
    quantity_required = Column(Float, nullable=False, default=1.0)
    
    # Relationship with InventoryItem will be mapped via inventory.py or just here
    inventory_item = relationship("InventoryItem", lazy="selectin")

    def __repr__(self):
        return f"<EquipmentRoutinePart routine={self.routine_id} item={self.inventory_item_id} q={self.quantity_required}>"
