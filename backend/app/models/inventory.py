"""
SIAE — Modelos de Inventario.
Ítems de insumos con stock, alertas de mínimo y vínculo opcional a sistema/motor.
"""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class InventoryUnit(str, enum.Enum):
    """Unidades de medida para inventario."""
    LITRO = "litro"
    GALON = "galon"
    KILOGRAMO = "kg"
    GRAMO = "gramo"
    PIEZA = "pieza"
    CAJA = "caja"
    ROLLO = "rollo"
    METRO = "metro"
    JUEGO = "juego"
    OTRO = "otro"


class InventoryCategory(str, enum.Enum):
    """Categorías de inventario."""
    LUBRICANTE = "lubricante"
    FILTRO = "filtro"
    HERRAMIENTA = "herramienta"
    REPUESTO = "repuesto"
    ELECTRONICO = "electronico"
    SEGURIDAD = "seguridad"
    LIMPIEZA = "limpieza"
    COMBUSTIBLE = "combustible"
    CONSUMIBLE = "consumible"
    OTRO = "otro"


class InventoryItem(Base):
    """Ítem de inventario de insumos."""

    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    vessel_id = Column(Integer, ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True)
    maintenance_category_id = Column(Integer, ForeignKey("maintenance_categories.id", ondelete="SET NULL"), nullable=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="SET NULL"), nullable=True, index=True)

    name = Column(String(200), nullable=False, index=True)
    part_number = Column(String(100), nullable=True)  # Número de parte
    category = Column(SAEnum(InventoryCategory), nullable=False, default=InventoryCategory.CONSUMIBLE)
    unit = Column(SAEnum(InventoryUnit), nullable=False, default=InventoryUnit.PIEZA)
    description = Column(Text, nullable=True)

    # Stock
    quantity = Column(Float, nullable=False, default=0)
    min_quantity = Column(Float, nullable=False, default=0)   # Stock mínimo (alerta)
    max_quantity = Column(Float, nullable=True)               # Stock máximo recomendado
    location = Column(String(200), nullable=True)             # Ubicación a bordo
    unit_cost = Column(Float, nullable=True)                  # Costo unitario referencia

    # Vínculo opcional a sistema
    linked_system = Column(String(200), nullable=True)  # ej: "Motor CAT C32", "Sistema Eléctrico"

    is_active = Column(Boolean, default=True, nullable=False)
    notes = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    vessel = relationship("Vessel", backref="inventory_items", lazy="selectin")
    maintenance_category = relationship("MaintenanceCategory", backref="inventory_items", lazy="selectin")
    equipment = relationship("Equipment", backref="inventory_items", lazy="selectin")

    @property
    def stock_status(self) -> str:
        """Estado del stock: ok, bajo, agotado."""
        if self.quantity <= 0:
            return "agotado"
        if self.quantity <= self.min_quantity:
            return "bajo"
        return "ok"

    @property
    def total_value(self) -> float | None:
        """Valor total del stock."""
        if self.unit_cost is not None:
            return round(self.quantity * self.unit_cost, 2)
        return None

    def __repr__(self):
        return f"<InventoryItem {self.name} ({self.quantity} {self.unit.value})>"


class InventoryMovement(Base):
    """Movimiento de inventario (entrada/salida)."""

    __tablename__ = "inventory_movements"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    movement_type = Column(String(20), nullable=False)  # entrada, salida, ajuste
    quantity = Column(Float, nullable=False)
    quantity_before = Column(Float, nullable=False)
    quantity_after = Column(Float, nullable=False)
    reason = Column(String(300), nullable=True)
    reference = Column(String(100), nullable=True)  # No. de orden, factura, etc.

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    item = relationship("InventoryItem", backref="movements", lazy="selectin")
    user = relationship("User", backref="inventory_movements", lazy="selectin")
