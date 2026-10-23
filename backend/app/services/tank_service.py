"""
SIAE — Servicio TankService.
Lógica de cálculo hidrostático para sondeos de tanques y balances de líquidos.
"""

from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.vessel import Vessel
from app.models.vessel_tank import VesselTank, TankFluidType
from app.models.tank_sounding import TankSounding, TankSoundingItem, SoundingType
from app.schemas.tank_sounding import TankSoundingCreate, TankSoundingUpdate, TankSoundingItemCreate


class TankService:

    @staticmethod
    def calculate_item_values(tank: VesselTank, item_in: TankSoundingItemCreate) -> dict:
        """Calcula el volumen, peso, momento vertical y momento de superficie libre de un tanque."""
        density = item_in.density_applied if item_in.density_applied and item_in.density_applied > 0 else tank.design_density
        pct = max(0.0, min(100.0, float(item_in.fill_percentage)))

        volume_m3 = round(tank.capacity_m3 * (pct / 100.0), 3)
        weight_tons = round(volume_m3 * density, 3)
        zg_m = float(tank.zg_m)
        mom_z = round(weight_tons * zg_m, 3)

        # Superficie libre: activa si el tanque no está completamente lleno ni vacío
        is_slack = 0.5 < pct < 98.0

        # Momento FSM = i * e * (F / CapMax) según fórmula naval de la Tabla A
        fsm_applied = 0.0
        if is_slack and tank.fsm_inertia_i > 0 and tank.max_weight_tons > 0:
            fsm_applied = round(density * tank.fsm_inertia_i * (weight_tons / tank.max_weight_tons), 3)
        elif pct >= 98.0:
            # Presurizado o totalmente lleno: superficie libre despreciable
            fsm_applied = 0.0

        return {
            "sounding_cm": item_in.sounding_cm,
            "fill_percentage": pct,
            "volume_m3": volume_m3,
            "density_applied": density,
            "weight_tons": weight_tons,
            "zg_m": zg_m,
            "mom_z": mom_z,
            "is_slack": is_slack,
            "fsm_applied": fsm_applied,
            "notes": item_in.notes
        }

    @classmethod
    def create_sounding(cls, db: Session, vessel_id: int, sounding_in: TankSoundingCreate, user_id: Optional[int] = None) -> TankSounding:
        """Crea una nueva ronda de sondeos con el cálculo de todos los tanques."""
        vessel = db.query(Vessel).filter(Vessel.id == vessel_id).first()
        if not vessel:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Embarcación no encontrada")

        tanks = db.query(VesselTank).filter(VesselTank.vessel_id == vessel_id, VesselTank.is_active.is_(True)).all()
        tank_map = {t.id: t for t in tanks}

        # Calcular Trim si se proporcionaron ambos calados
        trim_m = None
        if sounding_in.draft_fwd_m is not None and sounding_in.draft_aft_m is not None:
            trim_m = round(sounding_in.draft_aft_m - sounding_in.draft_fwd_m, 3)

        sounding = TankSounding(
            vessel_id=vessel_id,
            cruise_id=sounding_in.cruise_id,
            performed_by_id=user_id,
            sounding_datetime=sounding_in.sounding_datetime,
            sounding_type=sounding_in.sounding_type,
            draft_fwd_m=sounding_in.draft_fwd_m,
            draft_aft_m=sounding_in.draft_aft_m,
            trim_m=trim_m,
            notes=sounding_in.notes,
            is_official=sounding_in.is_official
        )

        # Si se marca como oficial, desmarcar los anteriores de esta embarcación
        if sounding_in.is_official:
            db.query(TankSounding).filter(
                TankSounding.vessel_id == vessel_id,
                TankSounding.is_official.is_(True)
            ).update({"is_official": False})

        db.add(sounding)
        db.flush()

        # Totales agregados
        tot_fuel_m3, tot_fuel_t = 0.0, 0.0
        tot_water_m3, tot_water_t = 0.0, 0.0
        tot_ballast_m3, tot_ballast_t = 0.0, 0.0
        tot_liq_t = 0.0
        tot_mom_z = 0.0
        tot_fsm = 0.0

        # Procesar items ingresados
        provided_tank_ids = set()
        for item_in in sounding_in.items:
            tank = tank_map.get(item_in.tank_id)
            if not tank:
                continue
            provided_tank_ids.add(tank.id)
            calc = cls.calculate_item_values(tank, item_in)
            
            item_obj = TankSoundingItem(
                sounding_id=sounding.id,
                tank_id=tank.id,
                **calc
            )
            db.add(item_obj)

            # Sumas por tipo de fluido
            w = calc["weight_tons"]
            v = calc["volume_m3"]
            tot_liq_t += w
            tot_mom_z += calc["mom_z"]
            tot_fsm += calc["fsm_applied"]

            if tank.fluid_type == TankFluidType.COMBUSTIBLE:
                tot_fuel_m3 += v
                tot_fuel_t += w
            elif tank.fluid_type == TankFluidType.AGUA_DULCE:
                tot_water_m3 += v
                tot_water_t += w
            elif tank.fluid_type == TankFluidType.AGUA_LASTRE:
                tot_ballast_m3 += v
                tot_ballast_t += w

        # Para tanques del buque no provistos en la lista, guardarlos como vacíos (0%)
        for tank in tanks:
            if tank.id not in provided_tank_ids:
                empty_calc = cls.calculate_item_values(tank, TankSoundingItemCreate(tank_id=tank.id, fill_percentage=0.0))
                item_obj = TankSoundingItem(
                    sounding_id=sounding.id,
                    tank_id=tank.id,
                    **empty_calc
                )
                db.add(item_obj)

        sounding.total_fuel_m3 = round(tot_fuel_m3, 3)
        sounding.total_fuel_tons = round(tot_fuel_t, 3)
        sounding.total_fresh_water_m3 = round(tot_water_m3, 3)
        sounding.total_fresh_water_tons = round(tot_water_t, 3)
        sounding.total_ballast_m3 = round(tot_ballast_m3, 3)
        sounding.total_ballast_tons = round(tot_ballast_t, 3)
        sounding.total_liquids_tons = round(tot_liq_t, 3)
        sounding.total_liquids_mom_z = round(tot_mom_z, 3)
        sounding.total_fsm_moments = round(tot_fsm, 3)

        db.commit()
        db.refresh(sounding)
        return sounding

    @classmethod
    def get_latest_sounding(cls, db: Session, vessel_id: int) -> Optional[TankSounding]:
        """Obtiene el último sondeo oficial o más reciente de la embarcación."""
        official = db.query(TankSounding).filter(
            TankSounding.vessel_id == vessel_id,
            TankSounding.is_official.is_(True)
        ).order_by(TankSounding.sounding_datetime.desc()).first()

        if official:
            return official

        return db.query(TankSounding).filter(
            TankSounding.vessel_id == vessel_id
        ).order_by(TankSounding.sounding_datetime.desc()).first()
