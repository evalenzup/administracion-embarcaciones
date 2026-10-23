"""
SIAE — Modelos StabilityCondition y DeckCargoItem.
Evaluación de estabilidad naval y estiba de pesos en cubiertas según Criterios OMI.
"""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Enum as SAEnum, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class EvaluationType(str, enum.Enum):
    """Condición de viaje para la evaluación de estabilidad."""
    SALIDA_PUERTO = "SALIDA_PUERTO"      # Consumibles al 95-100%, lastre de salida
    LLEGADA_PUERTO = "LLEGADA_PUERTO"    # Consumibles al 10%, condición crítica
    SIMULACION = "SIMULACION"            # Escenario personalizado


class ComplianceStatus(str, enum.Enum):
    """Nivel de cumplimiento de los criterios de estabilidad."""
    APROBADO = "APROBADO"                # KGc <= KGmax con margen adecuado
    ADVERTENCIA = "ADVERTENCIA"          # Cumple en el límite o con tanques muy slack
    NO_CUMPLE = "NO_CUMPLE"              # KGc > KGmax o peso en cubierta excedido


class DeckLocation(str, enum.Enum):
    """Cubiertas autorizadas para carga de pesos."""
    CUBIERTA_PRINCIPAL = "CUBIERTA_PRINCIPAL"  # Base 4.95 m sobre Línea Base
    CUBIERTA_SUPERIOR = "CUBIERTA_SUPERIOR"    # Base 7.04 m sobre Línea Base


class StabilityCondition(Base):
    """Condición de carga y evaluación de estabilidad para un buque o crucero."""

    __tablename__ = "stability_conditions"

    id = Column(Integer, primary_key=True, index=True)
    vessel_id = Column(Integer, ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True)
    cruise_id = Column(Integer, ForeignKey("cruise_plans.id", ondelete="SET NULL"), nullable=True, index=True)
    sounding_id = Column(Integer, ForeignKey("tank_soundings.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    condition_name = Column(String(200), nullable=False)
    evaluation_type = Column(SAEnum(EvaluationType), nullable=False, default=EvaluationType.SALIDA_PUERTO)

    # 1. Peso en Rosca (Lightship)
    lightship_weight_tons = Column(Float, nullable=False, default=429.826)
    lightship_kg_m = Column(Float, nullable=False, default=4.674)
    lightship_mom_z = Column(Float, nullable=False, default=2009.007)

    # 2. Líquidos (Provenientes del sondeo de tanques)
    liquids_weight_tons = Column(Float, nullable=False, default=0.0)
    liquids_mom_z = Column(Float, nullable=False, default=0.0)
    total_fsm_moments = Column(Float, nullable=False, default=0.0)

    # 3. Pesos en Cubiertas
    cargo_weight_main_deck_tons = Column(Float, nullable=False, default=0.0)
    cargo_weight_upper_deck_tons = Column(Float, nullable=False, default=0.0)
    total_cargo_weight_tons = Column(Float, nullable=False, default=0.0)
    total_cargo_mom_z = Column(Float, nullable=False, default=0.0)

    # 4. Síntesis de Estabilidad
    displacement_tons = Column(Float, nullable=False)           # Desplazamiento total Δ (ton)
    kg_uncorrected_m = Column(Float, nullable=False)            # KG sin corregir (m)
    csl_m = Column(Float, nullable=False, default=0.0)          # Corrección Superficie Libre = ΣFSM / Δ (m)
    kg_corrected_m = Column(Float, nullable=False)              # KGc = KG + CSL (m)

    # 5. Hidrostática y Trim
    draft_fwd_m = Column(Float, nullable=True)                  # Calado proa estimado (m)
    draft_aft_m = Column(Float, nullable=True)                  # Calado popa estimado (m)
    trim_m = Column(Float, nullable=False, default=0.0)         # Asiento considerado (m)

    # 6. Criterios OMI y Verificación
    kg_max_m = Column(Float, nullable=False)                    # KG máximo admisible según curva Gráfica No. 1
    stability_margin_m = Column(Float, nullable=False)          # Margen = kg_max_m - kg_corrected_m
    is_compliant = Column(Boolean, nullable=False, default=True)
    status_level = Column(SAEnum(ComplianceStatus), nullable=False, default=ComplianceStatus.APROBADO)

    # Recomendaciones y alertas emitidas automáticamente
    recommendations = Column(JSON, nullable=True)               # Lista de recomendaciones generadas por el motor

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    vessel = relationship("Vessel", back_populates="stability_conditions")
    cruise = relationship("CruisePlan", backref="stability_conditions")
    sounding = relationship("TankSounding", back_populates="stability_conditions")
    created_by = relationship("User", backref="created_stability_conditions")
    cargo_items = relationship("DeckCargoItem", back_populates="stability_condition", cascade="all, delete-orphan", order_by="DeckCargoItem.id")

    def __repr__(self):
        return f"<StabilityCondition id={self.id} name='{self.condition_name}' compliant={self.is_compliant}>"


class DeckCargoItem(Base):
    """Equipo o peso individual estibado en cubierta principal o superior."""

    __tablename__ = "deck_cargo_items"

    id = Column(Integer, primary_key=True, index=True)
    stability_condition_id = Column(Integer, ForeignKey("stability_conditions.id", ondelete="CASCADE"), nullable=False, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="SET NULL"), nullable=True, index=True)

    deck = Column(SAEnum(DeckLocation), nullable=False, default=DeckLocation.CUBIERTA_PRINCIPAL)
    zone_code = Column(String(50), nullable=True)               # ej. 'A1', 'A2', 'A3', 'A4' (según planos)
    item_name = Column(String(200), nullable=False)             # ej. 'Roseta CTD', 'Winche auxiliar'

    weight_tons = Column(Float, nullable=False)                 # Peso en toneladas métricas
    zg_above_deck_m = Column(Float, nullable=False, default=1.0) # Altura del C.G. sobre el piso de cubierta (m)
    deck_base_height_m = Column(Float, nullable=False)          # Altura de la cubierta desde L.B. (4.95m o 7.04m)
    zg_total_m = Column(Float, nullable=False)                  # ZG total desde L.B. = deck_base_height_m + zg_above_deck_m
    mom_z = Column(Float, nullable=False)                       # Momento vertical = weight_tons * zg_total_m

    notes = Column(String(250), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    stability_condition = relationship("StabilityCondition", back_populates="cargo_items")
    equipment = relationship("Equipment", backref="cargo_placements")

    def __repr__(self):
        return f"<DeckCargoItem {self.item_name} on {self.deck.value} {self.weight_tons}t>"
