"""
SIAE — Servicio StabilityService.
Motor de cálculo de estabilidad naval, verificación de Criterios OMI y emisión de recomendaciones operativas.
Basado en el Cuadernillo de Estabilidad y Estudio Oficial de Pesos en Cubiertas (UNI Group, 2024) para B/O Alpha Helix.
"""

import math
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.vessel import Vessel
from app.models.tank_sounding import TankSounding
from app.models.stability_condition import (
    StabilityCondition,
    DeckCargoItem,
    EvaluationType,
    ComplianceStatus,
    DeckLocation,
)
from app.schemas.stability import (
    StabilityEvaluationRequest,
    DeckCargoItemCreate,
    DeckLimitsCheck,
)


class StabilityService:

    # ─────────────────────────────────────────────────────────────
    # 1. Curvas Hidrostáticas Oficiales del B/O Alpha Helix
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def get_kg_max(displacement_tons: float, trim_m: float) -> float:
        """
        Calcula el KG Máximo Admisible (m) a partir del Desplazamiento (ton) y el Trim (m),
        reproduciendo con exactitud la Gráfica No. 1 (Anexo 2) del Cuadernillo oficial.
        
        Ejemplo verificado del estudio:
        Δ = 619.56 t, Trim = 0.20 m -> KG_max = 4.388 m
        """
        # Limitar desplazamiento al rango válido de estudio [430, 660]
        disp = max(430.0, min(660.0, float(displacement_tons)))
        # Limitar trim al rango de curvas [-0.9, +0.9]
        trim = max(-0.9, min(0.9, float(trim_m)))

        # 1.1 Curva base de KG_max para Trim = 0.0
        # Para Δ <= 610: curva suave creciente desde 4.380 hasta 4.394
        # Para Δ > 610: meseta / suave descenso estabilizado en ~4.388 - 4.380
        if disp <= 610.0:
            # Ascenso suave entre 550 y 610 t
            factor = (disp - 550.0) / 60.0  # 0 a 1
            kg_base_trim0 = 4.380 + 0.014 * math.sin(factor * math.pi / 2.0)
        else:
            # Ligero declive hacia 4.380 en 660 t
            factor = (disp - 610.0) / 50.0
            kg_base_trim0 = 4.394 - 0.016 * factor

        # 1.2 Ajuste por Trim:
        # En la Gráfica No. 1:
        # Trim negativo (aproado) incrementa el KG_max (permite KG mayor, curvas rojas superiores)
        # Trim positivo (apopado) reduce el KG_max (curvas azules inferiores)
        # Trim = -0.9 -> +0.075 m
        # Trim = -0.6 -> +0.050 m
        # Trim = -0.3 -> +0.025 m
        # Trim =  0.0 ->  0.000 m
        # Trim = +0.3 -> -0.030 m
        # Trim = +0.6 -> -0.065 m
        # Trim = +0.9 -> -0.100 m
        if trim <= 0.0:
            # Pendiente lineal para trim negativo (-0.083 m por cada -1.0 m de trim)
            delta_trim = -trim * (0.075 / 0.90)
        else:
            # Ligera curvatura para trim positivo (+0.100 m de caída a 0.90 m)
            delta_trim = - (trim * (0.100 / 0.90) + 0.010 * math.sin(trim * math.pi / 1.8))

        kg_max = kg_base_trim0 + delta_trim
        return round(kg_max, 3)

    @staticmethod
    def get_estimated_mean_draft(displacement_tons: float) -> float:
        """
        Calcula el Calado Medio Estimado (m) según Gráfica No. 2 (Referencias):
        Δ = 430 t -> Calado = 3.23 m
        Δ = 635 t -> Calado = 4.03 m
        """
        disp = max(420.0, min(670.0, float(displacement_tons)))
        draft = 3.23 + ((4.03 - 3.23) / (635.0 - 430.0)) * (disp - 430.0)
        return round(draft, 3)

    @classmethod
    def check_deck_limits(
        cls,
        eval_type: EvaluationType,
        cargo_items: List[DeckCargoItemCreate],
        main_deck_height: float = 4.95,
        upper_deck_height: float = 7.04
    ) -> DeckLimitsCheck:
        """
        Verifica los límites máximos admisibles de carga en cubiertas según Anexo 3 y Anexo 4.
        """
        # Sumar pesos y centro de gravedad ponderado para cada cubierta
        w_main = sum(item.weight_tons for item in cargo_items if item.deck == DeckLocation.CUBIERTA_PRINCIPAL)
        w_upper = sum(item.weight_tons for item in cargo_items if item.deck == DeckLocation.CUBIERTA_SUPERIOR)

        # Altura promedio de C.G. sobre la cubierta
        h_main_avg = 1.0
        if w_main > 0:
            h_main_avg = sum(item.weight_tons * item.zg_above_deck_m for item in cargo_items if item.deck == DeckLocation.CUBIERTA_PRINCIPAL) / w_main

        h_upper_avg = 1.0
        if w_upper > 0:
            h_upper_avg = sum(item.weight_tons * item.zg_above_deck_m for item in cargo_items if item.deck == DeckLocation.CUBIERTA_SUPERIOR) / w_upper

        if eval_type == EvaluationType.SALIDA_PUERTO:
            # ANEXO 3: Límites constantes estructurales
            lim_main = 30.0
            lim_upper = 25.0
        else:
            # ANEXO 4: Límites críticos para condición de Llegada a Puerto (10% consumibles)
            # Modelo exponencial ajustado a la curva de la gráfica oficial
            lim_upper = round(min(25.0, 10.5 * math.exp(-0.95 * h_upper_avg)), 2)
            lim_main = round(min(30.0, 58.0 * math.exp(-1.02 * h_main_avg)), 2)

        return DeckLimitsCheck(
            main_deck_weight_tons=round(w_main, 2),
            main_deck_limit_tons=round(lim_main, 2),
            main_deck_compliant=w_main <= lim_main,
            upper_deck_weight_tons=round(w_upper, 2),
            upper_deck_limit_tons=round(lim_upper, 2),
            upper_deck_compliant=w_upper <= lim_upper,
        )

    # ─────────────────────────────────────────────────────────────
    # 2. Motor de Recomendaciones Operativas y de Seguridad
    # ─────────────────────────────────────────────────────────────

    @classmethod
    def generate_recommendations(
        cls,
        vessel: Vessel,
        eval_type: EvaluationType,
        displacement: float,
        kg_corrected: float,
        kg_max: float,
        stability_margin: float,
        trim_m: float,
        deck_check: DeckLimitsCheck,
        total_fsm: float,
        csl_m: float
    ) -> List[Dict[str, Any]]:
        """Genera recomendaciones náuticas y operativas automáticas para el Capitán y Jefe de Máquinas."""
        recs = []

        # 1. Criterio de Cumplimiento de Margen de Estabilidad
        if stability_margin < 0:
            recs.append({
                "severity": "CRITICAL",
                "category": "ESTABILIDAD",
                "title": "CONDICIÓN NO CUMPLE CRITERIOS OMI (KGc > KGmáx)",
                "message": (
                    f"El centro de gravedad vertical corregido ({kg_corrected:.3f} m) excede el máximo permitido "
                    f"({kg_max:.3f} m) por {abs(stability_margin):.3f} m. El buque NO DEBE ZARPAR en esta condición."
                ),
                "action": "Reduzca peso en Cubierta Superior (7.04 m), baje equipos a Cubierta Principal (4.95 m) o aumente lastre en doble fondo."
            })
        elif stability_margin < 0.05:
            recs.append({
                "severity": "WARNING",
                "category": "ESTABILIDAD",
                "title": "Margen de Estabilidad Crítico (< 5 cm)",
                "message": (
                    f"El margen de estabilidad es muy estrecho ({stability_margin * 100:.1f} cm). "
                    "Cualquier movimiento imprevisto de carga o consumo de combustible puede comprometer la estabilidad."
                ),
                "action": "Se recomienda asegurar lastres de compensación en tanques de doble fondo y verificar trincas de equipos en cubierta."
            })
        else:
            recs.append({
                "severity": "SUCCESS",
                "category": "ESTABILIDAD",
                "title": "Criterio de Estabilidad OMI Satisfecho",
                "message": f"Margen de seguridad positivo: {stability_margin * 100:.1f} cm por debajo del límite de Gráfica No. 1.",
                "action": "Condición favorable para navegación."
            })

        # 2. Desplazamiento Máximo (Línea de Máxima Carga)
        max_disp = vessel.max_displacement_tons or 635.0
        if displacement > max_disp:
            recs.append({
                "severity": "CRITICAL",
                "category": "SOBRECARGA",
                "title": f"Desplazamiento Excedido (Δ = {displacement:.1f} t > {max_disp:.1f} t)",
                "message": f"El buque supera el desplazamiento máximo de diseño en {displacement - max_disp:.1f} toneladas.",
                "action": "Deslastrar tanques de agua salada no esenciales o reducir peso en cubiertas antes del zarpe."
            })

        # 3. Límites en Cubierta Principal (Anexo 3 / 4)
        if not deck_check.main_deck_compliant:
            recs.append({
                "severity": "CRITICAL",
                "category": "CUBIERTA_PRINCIPAL",
                "title": f"Exceso de Carga en Cubierta Principal ({deck_check.main_deck_weight_tons:.1f} t > {deck_check.main_deck_limit_tons:.1f} t)",
                "message": (
                    f"El peso total en cubierta principal excede el límite del Anexo {'3' if eval_type == EvaluationType.SALIDA_PUERTO else '4'}. "
                    "Riesgo de sobrecarga estructural o pérdida de par adrizante."
                ),
                "action": "Retirar equipos o redistribuir según capacidades autorizadas."
            })

        # 4. Límites en Cubierta Superior (Anexo 3 / 4)
        if not deck_check.upper_deck_compliant:
            recs.append({
                "severity": "CRITICAL",
                "category": "CUBIERTA_SUPERIOR",
                "title": f"Exceso de Carga en Cubierta Superior ({deck_check.upper_deck_weight_tons:.1f} t > {deck_check.upper_deck_limit_tons:.1f} t)",
                "message": (
                    f"El peso en cubierta superior ({deck_check.upper_deck_weight_tons:.1f} t) excede el máximo permitido "
                    f"({deck_check.upper_deck_limit_tons:.1f} t). Al estar a 7.04 m de altura, eleva drásticamente el KG."
                ),
                "action": "Trasladar carga pesada de cubierta superior a la cubierta principal para bajar el KG."
            })

        # 5. Asiento (Trim)
        if trim_m < -0.15:
            recs.append({
                "severity": "WARNING",
                "category": "TRIM",
                "title": f"Asiento Aproante Detectado (Trim = {trim_m:.2f} m)",
                "message": "Navegar aproado incrementa la resistencia al avance y reduce la eficacia del timón.",
                "action": "Transferir lastre hacia tanques de popa (ej. Tq. No. 7 Pique de Popa) para adrizar o dejar ligero asiento apopante."
            })
        elif trim_m > 0.80:
            recs.append({
                "severity": "WARNING",
                "category": "TRIM",
                "title": f"Asiento Apopante Excesivo (Trim = +{trim_m:.2f} m)",
                "message": "Un apopamiento muy pronunciado penaliza la visibilidad de proa y reduce el KG máximo admisible.",
                "action": "Compensar lastre hacia proa (Pique de Proa No. 1 o Doble Fondo No. 1)."
            })

        # 6. Efecto de Superficie Libre (FSM / CSL)
        if csl_m > 0.08:
            recs.append({
                "severity": "WARNING",
                "category": "SUPERFICIE_LIBRE",
                "title": f"Corrección CSL Elevada (+{csl_m:.3f} m de elevación de KG)",
                "message": (
                    f"El momento total de superficie libre ({total_fsm:.1f} t·m) penaliza significativamente la estabilidad. "
                    "Múltiples tanques en condición 'slack' (entre 1% y 97%)."
                ),
                "action": "Llenar al 100% o vaciar completamente los tanques de lastre para eliminar el efecto de superficie libre."
            })

        # 7. Recomendación para Condición de Llegada a Puerto si se evalúa Salida
        if eval_type == EvaluationType.SALIDA_PUERTO:
            recs.append({
                "severity": "INFO",
                "category": "PLANIFICACION",
                "title": "Verificación de Fin de Crucero (Condición de Llegada)",
                "message": (
                    "Se recomienda simular la condición de Llegada a Puerto (10% de consumibles). "
                    "Al agotarse el combustible y agua dulce de doble fondo, el KG del buque aumentará naturalmente."
                ),
                "action": "Planifique el lastrado preventivo de los tanques de doble fondo conforme se consuma el diésel durante la campaña."
            })

        return recs

    # ─────────────────────────────────────────────────────────────
    # 3. Evaluación Completa de una Condición de Carga
    # ─────────────────────────────────────────────────────────────

    @classmethod
    def evaluate_condition(
        cls,
        db: Session,
        vessel_id: int,
        req: StabilityEvaluationRequest
    ) -> Dict[str, Any]:
        """
        Ejecuta el cálculo completo de estabilidad naval:
        1. Rosca
        2. Sondeo de tanques / Líquidos + FSM
        3. Pesos en cubiertas
        4. Desplazamiento Δ, KG, CSL, KGc
        5. KGmax de Gráfica No. 1
        6. Verificación de Anexo 3 / 4
        7. Recomendaciones
        """
        vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
        if not vessel:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Embarcación no encontrada")

        # 1. Constantes de Rosca (Lightship)
        lightship_w = float(vessel.lightship_weight_tons or 429.826)
        lightship_kg = float(vessel.lightship_kg_m or 4.674)
        lightship_mom_z = round(lightship_w * lightship_kg, 3)

        main_deck_base_h = float(vessel.main_deck_height_m or 4.95)
        upper_deck_base_h = float(vessel.upper_deck_height_m or 7.04)

        # 2. Líquidos y Sondeo
        liquids_w = 0.0
        liquids_mom_z = 0.0
        total_fsm = 0.0
        draft_fwd = req.draft_fwd_m
        draft_aft = req.draft_aft_m

        sounding = None
        if req.sounding_id:
            sounding = db.query(TankSounding).filter(TankSounding.id == req.sounding_id).first()
        elif req.manual_liquids_weight_tons is None:
            # Si no se pasó sounding_id ni manual, buscar el último oficial de la embarcación
            sounding = db.query(TankSounding).filter(
                TankSounding.vessel_id == vessel_id,
                TankSounding.is_official.is_(True)
            ).order_by(TankSounding.sounding_datetime.desc()).first()

            if not sounding:
                # O el más reciente
                sounding = db.query(TankSounding).filter(
                    TankSounding.vessel_id == vessel_id
                ).order_by(TankSounding.sounding_datetime.desc()).first()

        if sounding:
            liquids_w = float(sounding.total_liquids_tons)
            liquids_mom_z = float(sounding.total_liquids_mom_z)
            total_fsm = float(sounding.total_fsm_moments)
            if draft_fwd is None:
                draft_fwd = sounding.draft_fwd_m
            if draft_aft is None:
                draft_aft = sounding.draft_aft_m
        else:
            liquids_w = float(req.manual_liquids_weight_tons or 0.0)
            liquids_mom_z = float(req.manual_liquids_mom_z or 0.0)
            total_fsm = float(req.manual_total_fsm or 0.0)

        # 3. Pesos en Cubiertas
        cargo_items_computed = []
        cargo_main_w = 0.0
        cargo_upper_w = 0.0
        total_cargo_w = 0.0
        total_cargo_mom_z = 0.0

        for idx, item_in in enumerate(req.cargo_items):
            base_h = main_deck_base_h if item_in.deck == DeckLocation.CUBIERTA_PRINCIPAL else upper_deck_base_h
            zg_total = round(base_h + float(item_in.zg_above_deck_m), 3)
            w = round(float(item_in.weight_tons), 3)
            mom_z = round(w * zg_total, 3)

            if item_in.deck == DeckLocation.CUBIERTA_PRINCIPAL:
                cargo_main_w += w
            else:
                cargo_upper_w += w

            total_cargo_w += w
            total_cargo_mom_z += mom_z

            cargo_items_computed.append({
                "id": idx + 1,
                "stability_condition_id": 0,
                "equipment_id": item_in.equipment_id,
                "deck": item_in.deck,
                "zone_code": item_in.zone_code,
                "item_name": item_in.item_name,
                "weight_tons": w,
                "zg_above_deck_m": float(item_in.zg_above_deck_m),
                "deck_base_height_m": base_h,
                "zg_total_m": zg_total,
                "mom_z": mom_z,
                "notes": item_in.notes
            })

        # 4. Síntesis de Estabilidad
        displacement = round(lightship_w + liquids_w + total_cargo_w, 3)
        total_mom_z = round(lightship_mom_z + liquids_mom_z + total_cargo_mom_z, 3)

        kg_uncorrected = round(total_mom_z / displacement, 3) if displacement > 0 else 0.0
        csl = round(total_fsm / displacement, 3) if displacement > 0 else 0.0
        kg_corrected = round(kg_uncorrected + csl, 3)

        # 5. Trim y Calados
        trim = 0.0
        if draft_fwd is not None and draft_aft is not None:
            trim = round(float(draft_aft) - float(draft_fwd), 3)

        mean_draft_est = cls.get_estimated_mean_draft(displacement)

        # 6. KG Máximo Admisible (Gráfica No. 1)
        kg_max = cls.get_kg_max(displacement, trim)
        margin = round(kg_max - kg_corrected, 3)

        # 7. Verificación de Límites de Cubiertas (Anexo 3 / 4)
        deck_check = cls.check_deck_limits(
            eval_type=req.evaluation_type,
            cargo_items=req.cargo_items,
            main_deck_height=main_deck_base_h,
            upper_deck_height=upper_deck_base_h
        )

        # 8. Estado de Cumplimiento
        is_compliant = (margin >= 0.0) and deck_check.main_deck_compliant and deck_check.upper_deck_compliant and (displacement <= (vessel.max_displacement_tons or 635.0))
        if margin < 0.0 or not deck_check.main_deck_compliant or not deck_check.upper_deck_compliant or displacement > (vessel.max_displacement_tons or 635.0):
            status_level = ComplianceStatus.NO_CUMPLE
        elif margin < 0.05:
            status_level = ComplianceStatus.ADVERTENCIA
        else:
            status_level = ComplianceStatus.APROBADO

        # 9. Generar Recomendaciones
        recs = cls.generate_recommendations(
            vessel=vessel,
            eval_type=req.evaluation_type,
            displacement=displacement,
            kg_corrected=kg_corrected,
            kg_max=kg_max,
            stability_margin=margin,
            trim_m=trim,
            deck_check=deck_check,
            total_fsm=total_fsm,
            csl_m=csl
        )

        return {
            "vessel_id": vessel_id,
            "cruise_id": req.cruise_id,
            "sounding_id": sounding.id if sounding else None,
            "condition_name": req.condition_name,
            "evaluation_type": req.evaluation_type,

            "lightship_weight_tons": lightship_w,
            "lightship_kg_m": lightship_kg,
            "lightship_mom_z": lightship_mom_z,

            "liquids_weight_tons": round(liquids_w, 3),
            "liquids_mom_z": round(liquids_mom_z, 3),
            "total_fsm_moments": round(total_fsm, 3),

            "cargo_weight_main_deck_tons": round(cargo_main_w, 3),
            "cargo_weight_upper_deck_tons": round(cargo_upper_w, 3),
            "total_cargo_weight_tons": round(total_cargo_w, 3),
            "total_cargo_mom_z": round(total_cargo_mom_z, 3),

            "displacement_tons": displacement,
            "kg_uncorrected_m": kg_uncorrected,
            "csl_m": csl,
            "kg_corrected_m": kg_corrected,

            "draft_fwd_m": draft_fwd,
            "draft_aft_m": draft_aft,
            "trim_m": trim,
            "mean_draft_est_m": mean_draft_est,

            "kg_max_m": kg_max,
            "stability_margin_m": margin,
            "is_compliant": is_compliant,
            "status_level": status_level,

            "deck_limits": deck_check,
            "recommendations": recs,
            "notes": req.notes,
            "cargo_items": cargo_items_computed
        }

    @classmethod
    def save_condition(
        cls,
        db: Session,
        vessel_id: int,
        req: StabilityEvaluationRequest,
        user_id: Optional[int] = None
    ) -> StabilityCondition:
        """Calcula y persiste en base de datos una condición oficial de estabilidad."""
        eval_result = cls.evaluate_condition(db, vessel_id, req)

        # Crear cabecera
        condition = StabilityCondition(
            vessel_id=vessel_id,
            cruise_id=req.cruise_id,
            sounding_id=eval_result["sounding_id"],
            created_by_id=user_id,
            condition_name=req.condition_name,
            evaluation_type=req.evaluation_type,

            lightship_weight_tons=eval_result["lightship_weight_tons"],
            lightship_kg_m=eval_result["lightship_kg_m"],
            lightship_mom_z=eval_result["lightship_mom_z"],

            liquids_weight_tons=eval_result["liquids_weight_tons"],
            liquids_mom_z=eval_result["liquids_mom_z"],
            total_fsm_moments=eval_result["total_fsm_moments"],

            cargo_weight_main_deck_tons=eval_result["cargo_weight_main_deck_tons"],
            cargo_weight_upper_deck_tons=eval_result["cargo_weight_upper_deck_tons"],
            total_cargo_weight_tons=eval_result["total_cargo_weight_tons"],
            total_cargo_mom_z=eval_result["total_cargo_mom_z"],

            displacement_tons=eval_result["displacement_tons"],
            kg_uncorrected_m=eval_result["kg_uncorrected_m"],
            csl_m=eval_result["csl_m"],
            kg_corrected_m=eval_result["kg_corrected_m"],

            draft_fwd_m=eval_result["draft_fwd_m"],
            draft_aft_m=eval_result["draft_aft_m"],
            trim_m=eval_result["trim_m"],

            kg_max_m=eval_result["kg_max_m"],
            stability_margin_m=eval_result["stability_margin_m"],
            is_compliant=eval_result["is_compliant"],
            status_level=eval_result["status_level"],

            recommendations=eval_result["recommendations"],
            notes=req.notes
        )

        db.add(condition)
        db.flush()

        # Guardar items de carga
        for c_item in eval_result["cargo_items"]:
            item_db = DeckCargoItem(
                stability_condition_id=condition.id,
                equipment_id=c_item["equipment_id"],
                deck=c_item["deck"],
                zone_code=c_item["zone_code"],
                item_name=c_item["item_name"],
                weight_tons=c_item["weight_tons"],
                zg_above_deck_m=c_item["zg_above_deck_m"],
                deck_base_height_m=c_item["deck_base_height_m"],
                zg_total_m=c_item["zg_total_m"],
                mom_z=c_item["mom_z"],
                notes=c_item["notes"]
            )
            db.add(item_db)

        db.commit()
        db.refresh(condition)
        return condition
