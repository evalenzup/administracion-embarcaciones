"""
SIAE — Orquestación del pipeline meteorológico (descarga + procesamiento) y
su programación periódica con APScheduler.
"""
import asyncio
import logging

from apscheduler.executors.pool import ThreadPoolExecutor as APSThreadPoolExecutor
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.services import weather_fetcher, weather_processor

logger = logging.getLogger("siae.weather")

_pipeline_lock = asyncio.Lock()
_scheduler: AsyncIOScheduler | None = None


async def run_pipeline_if_new_run(force: bool = False) -> dict | None:
    """
    Verifica si hay una corrida nueva disponible en NOMADS distinta a la ya
    procesada; si es así, la descarga y procesa. Protegido por lock para no
    solapar ejecuciones concurrentes (llamada del scheduler + disparo manual).
    Devuelve el manifest procesado, o None si no había corrida nueva o falló.
    """
    if _pipeline_lock.locked():
        logger.info("Pipeline meteorológico ya en ejecución, se omite esta invocación.")
        return None

    async with _pipeline_lock:
        try:
            latest = await weather_fetcher.latest_available_run()
            if latest is None:
                logger.warning("No se encontró ninguna corrida GFS/WW3 disponible en NOMADS.")
                return None

            run_date, run_hour = latest
            current_manifest = weather_processor.get_latest_manifest()
            if (
                not force
                and current_manifest is not None
                and current_manifest.get("run_date") == run_date
                and current_manifest.get("run_hour") == run_hour
                and len(current_manifest.get("wind_hours", [])) >= len(weather_fetcher.FORECAST_HOURS)
            ):
                logger.debug("La corrida %s%s ya está procesada con todas las horas, nada que hacer.", run_date, run_hour)
                return current_manifest

            logger.info("Nueva corrida detectada: %s%sZ. Descargando...", run_date, run_hour)
            await weather_fetcher.download_gfs_wind(run_date, run_hour)
            await weather_fetcher.download_ww3_waves(run_date, run_hour)

            loop = asyncio.get_running_loop()
            manifest = await loop.run_in_executor(
                None, weather_processor.process_run, run_date, run_hour
            )

            weather_fetcher.cleanup_old_runs()

            # Pre-generar pasos clave de ECMWF (0-48h) en segundo plano
            try:
                from app.services import weather_ecmwf
                asyncio.create_task(weather_ecmwf.pregenerate_ecmwf_steps())
            except Exception as e:
                logger.warning("No se pudo iniciar la pregeneración de ECMWF: %s", e)

            return manifest
        except Exception:
            logger.exception("Error ejecutando el pipeline meteorológico.")
            return None


async def run_tide_ingest() -> None:
    """Ingesta de predicciones de marea faltantes (estaciones activas)."""
    from app.database import SessionLocal
    from app.services.tide_ingester import ingest_missing

    db = SessionLocal()
    try:
        await ingest_missing(db)
    except Exception:
        logger.exception("Error en la ingesta de mareas.")
        db.rollback()
    finally:
        db.close()


async def run_smn_ingest() -> None:
    """Descarga e ingesta los datos de las estaciones automáticas (EMA) del SMN."""
    from app.database import SessionLocal
    from app.services.smn_fetcher import ingest_smn_data

    db = SessionLocal()
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, ingest_smn_data, db)
    except Exception:
        logger.exception("Error en la ingesta de datos del SMN.")
        db.rollback()
    finally:
        db.close()


async def prune_old_ema_data() -> None:
    """Archiva en archivos CSV individuales por estación y mes, luego elimina las mediciones de EMA con más de 365 días (1 año) de antigüedad."""
    import os
    import csv
    import re
    from collections import defaultdict
    from app.database import SessionLocal
    from app.models.ema import EmaMeasurement
    from datetime import datetime, timedelta, timezone

    def sanitize_filename(name: str) -> str:
        n = name.upper().strip()
        n = re.sub(r'[ÁÉÍÓÚÜ]', lambda m: {'Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U','Ü':'U'}[m.group(0)], n)
        n = re.sub(r'[^A-Z0-9_]', '_', n.replace(' ', '_'))
        return n

    archive_dir = "uploads/weather_archive"
    db = SessionLocal()
    try:
        # Límite de retención: 365 días (1 año)
        cutoff = datetime.now(timezone.utc) - timedelta(days=365)
        
        # Consultar registros obsoletos ordenados por fecha ascendente
        old_records = (
            db.query(EmaMeasurement)
            .filter(EmaMeasurement.timestamp < cutoff)
            .order_by(EmaMeasurement.timestamp.asc())
            .all()
        )
        
        if old_records:
            # Agrupar por (nombre_estacion_limpio, mes)
            records_by_group = defaultdict(list)
            for r in old_records:
                st_name = r.station.name if r.station else f"STATION_{r.station_id}"
                st_clean = sanitize_filename(st_name)
                month_key = r.timestamp.strftime("%Y_%m")
                group_key = (st_clean, month_key)
                records_by_group[group_key].append(r)
                
            # Archivar en CSVs por estación y mes en un volumen persistente
            os.makedirs(archive_dir, exist_ok=True)
            for (st_clean, month_key), records in records_by_group.items():
                csv_path = os.path.join(archive_dir, f"{st_clean}_{month_key}.csv")
                file_exists = os.path.exists(csv_path)
                
                with open(csv_path, "a", newline="", encoding="utf-8") as csvfile:
                    writer = csv.writer(csvfile)
                    if not file_exists:
                        # Escribir encabezado si el archivo es nuevo
                        writer.writerow([
                            "station_id", "station_name", "timestamp_utc", 
                            "temperature", "precipitation", "humidity", "pressure", 
                            "solar_radiation", "wind_direction", "wind_speed", 
                            "gust_direction", "gust_speed"
                        ])
                    
                    for r in records:
                        writer.writerow([
                            r.station_id,
                            r.station.name if r.station else "",
                            r.timestamp.isoformat(),
                            r.temperature,
                            r.precipitation,
                            r.humidity,
                            r.pressure,
                            r.solar_radiation,
                            r.wind_direction,
                            r.wind_speed,
                            r.gust_direction,
                            r.gust_speed
                        ])
            
            # Borrar exactamente los registros procesados en la misma transacción atómica
            deleted_ids = [r.id for r in old_records]
            db.query(EmaMeasurement).filter(EmaMeasurement.id.in_(deleted_ids)).delete(synchronize_session=False)
            db.commit()
            logger.info("Archivado y depuración de EMA: se archivaron y eliminaron %d registros anteriores a %s", len(old_records), cutoff.isoformat())
    except Exception:
        logger.exception("Error durante el archivado y depuración de datos obsoletos de EMA.")
        db.rollback()
    finally:
        db.close()


async def run_enso_refresh() -> None:
    """Descarga e indexa en segundo plano los índices semanales de El Niño (NOAA CPC)."""
    from app.services import enso_tracker
    try:
        await enso_tracker.fetch_enso_data()
        logger.info("Índices de El Niño (ENSO) de la NOAA sincronizados con éxito.")
    except Exception:
        logger.exception("Error en la sincronización periódica de ENSO.")


async def run_cyclones_refresh() -> None:
    """Consulta en segundo plano la lista de ciclones activos en vivo de NOAA NHC."""
    from app.services import cyclone_tracker
    try:
        await cyclone_tracker.get_active_cyclones_list()
    except Exception:
        logger.exception("Error en la consulta periódica de ciclones.")


def start_scheduler() -> AsyncIOScheduler:
    """Inicia el scheduler que revisa cada hora si hay una corrida nueva."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    scheduler = AsyncIOScheduler()
    # OJO: no usar next_run_time=None — en APScheduler eso significa "job
    # PAUSADO para siempre", no "sin ejecución inicial" (bug que dejó el
    # pipeline sin actualizar por ~22 h). La primera corrida del arranque la
    # dispara main.py con asyncio.create_task; el lock de
    # run_pipeline_if_new_run evita el traslape si ambas coinciden.
    scheduler.add_job(
        run_pipeline_if_new_run,
        trigger="interval",
        hours=1,
        id="weather_pipeline",
        max_instances=1,
        coalesce=True,
    )
    # Mareas: CICESE publica archivos anuales por adelantado; revisar una vez
    # al día basta (cubre el alta del año siguiente hacia octubre).
    scheduler.add_job(
        run_tide_ingest,
        trigger="interval",
        hours=24,
        id="tide_ingest",
        max_instances=1,
        coalesce=True,
    )
    # Estaciones SMN: descargar reportes de 24h cada 6 horas
    scheduler.add_job(
        run_smn_ingest,
        trigger="interval",
        hours=6,
        id="smn_ingest",
        max_instances=1,
        coalesce=True,
    )
    # Depuración diaria de datos antiguos de EMA (>90 días)
    scheduler.add_job(
        prune_old_ema_data,
        trigger="interval",
        hours=24,
        id="ema_prune",
        max_instances=1,
        coalesce=True,
    )
    # ENSO (El Niño): NOAA CPC publica índices semanales; revisar cada 6 horas
    scheduler.add_job(
        run_enso_refresh,
        trigger="interval",
        hours=6,
        id="enso_refresh",
        max_instances=1,
        coalesce=True,
    )
    # Ciclones Tropicales: revisar el feed de NOAA NHC cada 15 minutos
    scheduler.add_job(
        run_cyclones_refresh,
        trigger="interval",
        minutes=15,
        id="cyclones_refresh",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info("Scheduler de meteorología iniciado (revisión periódica de GFS, mareas, SMN, huracanes y ENSO).")
    return scheduler


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
