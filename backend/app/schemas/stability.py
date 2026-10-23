"""
SIAE — Schemas Pydantic para Evaluación de Estabilidad y Pesos en Cubiertas.
Basado en el Cuadernillo de Estabilidad y Estudio UNI Group (2024) para B/O Alpha Helix.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from app.models.stability_condition import EvaluationType, ComplianceStatus, DeckLocation


# ── Items de Carga en Cubierta ────────────────────────────────

class DeckCargoItemCreate(BaseModel):
    equipment_id: Optional[int] = None
    deck: DeckLocation = DeckLocation.CUBIERTA_PRINCIPAL
    zone_code: Optional[str] = None          # ej. "A1", "A2", "Popa Babor", etc.
    item_name: str
    weight_tons: float = Field(..., ge=0)
    zg_above_deck_m: float = Field(1.0, ge=0) # Altura del C.G. sobre la cubierta
    notes: Optional[str] = None


class DeckCargoItemResponse(BaseModel):
    id: int
    stability_condition_id: int
    equipment_id: Optional[int] = None
    deck: DeckLocation
    zone_code: Optional[str] = None
    item_name: str
    weight_tons: float
    zg_above_deck_m: float
    deck_base_height_m: float
    zg_total_m: float
    mom_z: float
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


# ── Evaluación / Simulación de Estabilidad ─────────────────────

class StabilityEvaluationRequest(BaseModel):
    vessel_id: Optional[int] = None
    cruise_id: Optional[int] = None
    sounding_id: Optional[int] = None        # ID del sondeo oficial a usar (opcional)
    condition_name: str = "Evaluación de Estabilidad"
    evaluation_type: EvaluationType = EvaluationType.SALIDA_PUERTO

    # Parámetros manuales de líquidos (si no se especifica sounding_id)
    manual_liquids_weight_tons: Optional[float] = None
    manual_liquids_mom_z: Optional[float] = None
    manual_total_fsm: Optional[float] = None

    # Calados observados o asumidos (para determinar Trim)
    draft_fwd_m: Optional[float] = None
    draft_aft_m: Optional[float] = None

    # Pesos en cubiertas
    cargo_items: List[DeckCargoItemCreate] = []
    notes: Optional[str] = None


class DeckLimitsCheck(BaseModel):
    main_deck_weight_tons: float
    main_deck_limit_tons: float
    main_deck_compliant: bool
    upper_deck_weight_tons: float
    upper_deck_limit_tons: float
    upper_deck_compliant: bool


class StabilityConditionResponse(BaseModel):
    id: Optional[int] = None
    vessel_id: int
    cruise_id: Optional[int] = None
    sounding_id: Optional[int] = None
    created_by_id: Optional[int] = None

    condition_name: str
    evaluation_type: EvaluationType

    # Rosca
    lightship_weight_tons: float
    lightship_kg_m: float
    lightship_mom_z: float

    # Líquidos
    liquids_weight_tons: float
    liquids_mom_z: float
    total_fsm_moments: float

    # Pesos en cubiertas
    cargo_weight_main_deck_tons: float
    cargo_weight_upper_deck_tons: float
    total_cargo_weight_tons: float
    total_cargo_mom_z: float

    # Síntesis
    displacement_tons: float
    kg_uncorrected_m: float
    csl_m: float
    kg_corrected_m: float

    # Hidrostática y Trim
    draft_fwd_m: Optional[float] = None
    draft_aft_m: Optional[float] = None
    trim_m: float
    mean_draft_est_m: float

    # Criterios y Cumplimiento
    kg_max_m: float
    stability_margin_m: float
    is_compliant: bool
    status_level: ComplianceStatus

    # Verificación de límites de cubiertas (Anexo 3 / 4)
    deck_limits: Optional[DeckLimitsCheck] = None

    # Recomendaciones generadas por el motor
    recommendations: List[Dict[str, Any]] = []

    notes: Optional[str] = None
    cargo_items: List[DeckCargoItemResponse] = []
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
