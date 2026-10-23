"""
Script de precarga / Seeding: Parámetros de Estabilidad e Inventario de 22 Tanques del B/O Alpha Helix.
Fuente: Estudio de Estabilidad x Pesos en Cubiertas (UNI Group, Abril 2024 / Cuadernillo oficial).
"""

from app.database import SessionLocal
from app.models.vessel import Vessel
from app.models.vessel_tank import VesselTank, TankFluidType


ALPHA_HELIX_HYDROSTATICS = {
    "lpp_m": 35.154,
    "lightship_weight_tons": 429.826,
    "lightship_kg_m": 4.674,
    "main_deck_height_m": 4.95,
    "upper_deck_height_m": 7.04,
    "max_displacement_tons": 635.0,
}

ALPHA_HELIX_TANKS = [
    {
        "order_index": 2,
        "tank_code": "DF1",
        "name": "Doble Fdo. No.1 -comb.-",
        "fluid_type": TankFluidType.COMBUSTIBLE,
        "capacity_m3": 12.94,
        "design_density": 0.85,
        "max_weight_tons": 10.999,
        "zg_m": 2.28,
        "fsm_inertia_i": 21.23,
        "sounding_pipe_location": "Cuaderna 12 - Crujía",
        "notes": "Tanque de combustible en doble fondo proa"
    },
    {
        "order_index": 3,
        "tank_code": "TK4_BR_DIARIO",
        "name": "Tq. No.4, Br. Uso diario -comb.-",
        "fluid_type": TankFluidType.COMBUSTIBLE,
        "capacity_m3": 6.50,
        "design_density": 0.85,
        "max_weight_tons": 5.525,
        "zg_m": 3.68,
        "fsm_inertia_i": 0.56,
        "sounding_pipe_location": "Sala de máquinas - Babor",
        "notes": "Tanque de servicio diario de combustible babor"
    },
    {
        "order_index": 4,
        "tank_code": "TK4_ER_DIARIO",
        "name": "Tq. No.4, Er. Uso diario -comb.-",
        "fluid_type": TankFluidType.COMBUSTIBLE,
        "capacity_m3": 6.50,
        "design_density": 0.85,
        "max_weight_tons": 5.525,
        "zg_m": 3.68,
        "fsm_inertia_i": 0.56,
        "sounding_pipe_location": "Sala de máquinas - Estribor",
        "notes": "Tanque de servicio diario de combustible estribor"
    },
    {
        "order_index": 5,
        "tank_code": "DF5_BR",
        "name": "Doble Fdo. No.5 Br. -comb.-",
        "fluid_type": TankFluidType.COMBUSTIBLE,
        "capacity_m3": 24.40,
        "design_density": 0.85,
        "max_weight_tons": 20.74,
        "zg_m": 1.70,
        "fsm_inertia_i": 29.72,
        "sounding_pipe_location": "Doble fondo - Babor",
        "notes": "Tanque de almacenamiento de combustible"
    },
    {
        "order_index": 6,
        "tank_code": "DF5_ER",
        "name": "Doble Fdo. No.5 Er. -comb.-",
        "fluid_type": TankFluidType.COMBUSTIBLE,
        "capacity_m3": 24.40,
        "design_density": 0.85,
        "max_weight_tons": 20.74,
        "zg_m": 1.70,
        "fsm_inertia_i": 29.72,
        "sounding_pipe_location": "Doble fondo - Estribor",
        "notes": "Tanque de almacenamiento de combustible"
    },
    {
        "order_index": 7,
        "tank_code": "DF6_BR",
        "name": "Doble Fdo. No.6 Br. -comb.-",
        "fluid_type": TankFluidType.COMBUSTIBLE,
        "capacity_m3": 40.52,
        "design_density": 0.85,
        "max_weight_tons": 34.442,
        "zg_m": 2.16,
        "fsm_inertia_i": 32.69,
        "sounding_pipe_location": "Doble fondo popa - Babor",
        "notes": "Tanque principal de almacenamiento de combustible"
    },
    {
        "order_index": 8,
        "tank_code": "DF6_ER",
        "name": "Doble Fdo. No.6 Er. -comb.-",
        "fluid_type": TankFluidType.COMBUSTIBLE,
        "capacity_m3": 41.80,
        "design_density": 0.85,
        "max_weight_tons": 35.53,
        "zg_m": 2.16,
        "fsm_inertia_i": 34.59,
        "sounding_pipe_location": "Doble fondo popa - Estribor",
        "notes": "Tanque principal de almacenamiento de combustible"
    },
    {
        "order_index": 9,
        "tank_code": "DF3_BR_AGUA",
        "name": "Doble Fdo. No.3 Br. -Ag. Dulce-",
        "fluid_type": TankFluidType.AGUA_DULCE,
        "capacity_m3": 10.75,
        "design_density": 1.00,
        "max_weight_tons": 10.75,
        "zg_m": 2.15,
        "fsm_inertia_i": 5.57,
        "sounding_pipe_location": "Doble fondo - Babor",
        "notes": "Tanque de agua potable/dulce"
    },
    {
        "order_index": 10,
        "tank_code": "DF3_ER_AGUA",
        "name": "Doble Fdo. No.3 Er. -Ag. Dulce-",
        "fluid_type": TankFluidType.AGUA_DULCE,
        "capacity_m3": 10.75,
        "design_density": 1.00,
        "max_weight_tons": 10.75,
        "zg_m": 2.15,
        "fsm_inertia_i": 5.57,
        "sounding_pipe_location": "Doble fondo - Estribor",
        "notes": "Tanque de agua potable/dulce"
    },
    {
        "order_index": 11,
        "tank_code": "PP1_LASTRE",
        "name": "Pique de Proa No.1 -Ag. Lastre-",
        "fluid_type": TankFluidType.AGUA_LASTRE,
        "capacity_m3": 6.79,
        "design_density": 1.03,
        "max_weight_tons": 6.994,
        "zg_m": 4.80,
        "fsm_inertia_i": 1.50,
        "sounding_pipe_location": "Pique de proa (Forepeak)",
        "notes": "Tanque de lastre en proa"
    },
    {
        "order_index": 12,
        "tank_code": "TK2_LASTRE",
        "name": "Tq. No.2. -Ag. Lastre-",
        "fluid_type": TankFluidType.AGUA_LASTRE,
        "capacity_m3": 53.04,
        "design_density": 1.03,
        "max_weight_tons": 54.631,
        "zg_m": 4.30,
        "fsm_inertia_i": 19.64,
        "sounding_pipe_location": "Casco proa",
        "notes": "Tanque mayor de lastre"
    },
    {
        "order_index": 13,
        "tank_code": "DF2_BR_LASTRE",
        "name": "Doble Fdo. No.2 Br. -Ag. Lastre-",
        "fluid_type": TankFluidType.AGUA_LASTRE,
        "capacity_m3": 14.24,
        "design_density": 1.03,
        "max_weight_tons": 14.667,
        "zg_m": 2.15,
        "fsm_inertia_i": 8.36,
        "sounding_pipe_location": "Doble fondo - Babor",
        "notes": "Tanque de lastre"
    },
    {
        "order_index": 14,
        "tank_code": "DF2_ER_LASTRE",
        "name": "Doble Fdo. No.2 Er. -Ag. Lastre-",
        "fluid_type": TankFluidType.AGUA_LASTRE,
        "capacity_m3": 14.24,
        "design_density": 1.03,
        "max_weight_tons": 14.667,
        "zg_m": 2.15,
        "fsm_inertia_i": 8.36,
        "sounding_pipe_location": "Doble fondo - Estribor",
        "notes": "Tanque de lastre"
    },
    {
        "order_index": 15,
        "tank_code": "DF4_BR_LASTRE",
        "name": "Doble Fdo. No.4 Br. -Ag. Lastre-",
        "fluid_type": TankFluidType.AGUA_LASTRE,
        "capacity_m3": 21.90,
        "design_density": 1.03,
        "max_weight_tons": 22.557,
        "zg_m": 1.74,
        "fsm_inertia_i": 25.69,
        "sounding_pipe_location": "Doble fondo centro - Babor",
        "notes": "Tanque de lastre"
    },
    {
        "order_index": 16,
        "tank_code": "DF4_ER_LASTRE",
        "name": "Doble Fdo. No.4 Er. -Ag. Lastre-",
        "fluid_type": TankFluidType.AGUA_LASTRE,
        "capacity_m3": 21.90,
        "design_density": 1.03,
        "max_weight_tons": 22.557,
        "zg_m": 1.74,
        "fsm_inertia_i": 25.69,
        "sounding_pipe_location": "Doble fondo centro - Estribor",
        "notes": "Tanque de lastre"
    },
    {
        "order_index": 17,
        "tank_code": "TK5_BR_LASTRE",
        "name": "Tq. No.5 Br. -Ag. Lastre-",
        "fluid_type": TankFluidType.AGUA_LASTRE,
        "capacity_m3": 9.95,
        "design_density": 1.03,
        "max_weight_tons": 10.248,
        "zg_m": 4.08,
        "fsm_inertia_i": 0.93,
        "sounding_pipe_location": "Costado - Babor",
        "notes": "Tanque lateral de lastre"
    },
    {
        "order_index": 18,
        "tank_code": "TK5_ER_LASTRE",
        "name": "Tq. No.5 Er. -Ag. Lastre-",
        "fluid_type": TankFluidType.AGUA_LASTRE,
        "capacity_m3": 9.95,
        "design_density": 1.03,
        "max_weight_tons": 10.248,
        "zg_m": 4.08,
        "fsm_inertia_i": 0.93,
        "sounding_pipe_location": "Costado - Estribor",
        "notes": "Tanque lateral de lastre"
    },
    {
        "order_index": 19,
        "tank_code": "TK6_BR_LASTRE",
        "name": "Tq. No.6 Br. -Ag. Lastre-",
        "fluid_type": TankFluidType.AGUA_LASTRE,
        "capacity_m3": 16.61,
        "design_density": 1.03,
        "max_weight_tons": 17.108,
        "zg_m": 4.23,
        "fsm_inertia_i": 7.76,
        "sounding_pipe_location": "Costado popa - Babor",
        "notes": "Tanque lateral de lastre"
    },
    {
        "order_index": 20,
        "tank_code": "TK6_ER_LASTRE",
        "name": "Tq. No.6 Er. -Ag. Lastre-",
        "fluid_type": TankFluidType.AGUA_LASTRE,
        "capacity_m3": 16.61,
        "design_density": 1.03,
        "max_weight_tons": 17.108,
        "zg_m": 4.23,
        "fsm_inertia_i": 7.76,
        "sounding_pipe_location": "Costado popa - Estribor",
        "notes": "Tanque lateral de lastre"
    },
    {
        "order_index": 21,
        "tank_code": "DF7_BR_LASTRE",
        "name": "Doble Fdo. No.7 Br. -Ag. Lastre-",
        "fluid_type": TankFluidType.AGUA_LASTRE,
        "capacity_m3": 12.96,
        "design_density": 1.03,
        "max_weight_tons": 13.349,
        "zg_m": 2.53,
        "fsm_inertia_i": 13.84,
        "sounding_pipe_location": "Doble fondo popa - Babor",
        "notes": "Tanque de lastre en doble fondo"
    },
    {
        "order_index": 22,
        "tank_code": "DF7_ER_LASTRE",
        "name": "Doble Fdo. No.7 Er. -Ag. Lastre-",
        "fluid_type": TankFluidType.AGUA_LASTRE,
        "capacity_m3": 12.96,
        "design_density": 1.03,
        "max_weight_tons": 13.349,
        "zg_m": 2.53,
        "fsm_inertia_i": 13.84,
        "sounding_pipe_location": "Doble fondo popa - Estribor",
        "notes": "Tanque de lastre en doble fondo"
    },
    {
        "order_index": 23,
        "tank_code": "TK7_PIQUE_POP_LASTRE",
        "name": "Tq, No.7 Pique  Pp. -Ag. Lastre-",
        "fluid_type": TankFluidType.AGUA_LASTRE,
        "capacity_m3": 10.20,
        "design_density": 1.03,
        "max_weight_tons": 10.506,
        "zg_m": 4.60,
        "fsm_inertia_i": 20.78,
        "sounding_pipe_location": "Pique de popa (Aftpeak)",
        "notes": "Tanque de lastre en pique de popa"
    }
]


def seed_alpha_helix_data():
    """Ejecuta la actualización del B/O Alpha Helix y siembra de sus 22 tanques."""
    db = SessionLocal()
    try:
        # 1. Buscar o identificar el B/O Alpha Helix
        vessel = db.query(Vessel).filter(Vessel.name.ilike("%alpha%helix%")).first()
        if not vessel:
            vessel = db.query(Vessel).filter(Vessel.id == 1).first()

        if not vessel:
            print("ERROR: No se encontró la embarcación B/O Alpha Helix en la base de datos.")
            return

        print(f"-> Embarcación encontrada: id={vessel.id}, name='{vessel.name}'")

        # 2. Actualizar constantes de estabilidad en el buque
        for k, v in ALPHA_HELIX_HYDROSTATICS.items():
            setattr(vessel, k, v)
        db.commit()
        db.refresh(vessel)
        print(f"-> Constantes hidrostáticas actualizadas en '{vessel.name}':")
        print(f"   LPP: {vessel.lpp_m} m, Rosca: {vessel.lightship_weight_tons} t, KG rosca: {vessel.lightship_kg_m} m")
        print(f"   Cubierta Principal: {vessel.main_deck_height_m} m, Cubierta Superior: {vessel.upper_deck_height_m} m, Desp. Máx: {vessel.max_displacement_tons} t")

        # 3. Sembrar o actualizar los 22 tanques
        created_count = 0
        updated_count = 0
        for t_data in ALPHA_HELIX_TANKS:
            existing = db.query(VesselTank).filter(
                VesselTank.vessel_id == vessel.id,
                VesselTank.tank_code == t_data["tank_code"]
            ).first()

            if existing:
                for k, v in t_data.items():
                    setattr(existing, k, v)
                updated_count += 1
            else:
                new_tank = VesselTank(vessel_id=vessel.id, **t_data)
                db.add(new_tank)
                created_count += 1

        db.commit()
        total_tanks = db.query(VesselTank).filter(VesselTank.vessel_id == vessel.id).count()
        print(f"-> Proceso completado exitosamente:")
        print(f"   Tanques creados: {created_count}, actualizados: {updated_count}, total en buque: {total_tanks}")

    except Exception as e:
        db.rollback()
        print(f"ERROR durante el seeding: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_alpha_helix_data()
