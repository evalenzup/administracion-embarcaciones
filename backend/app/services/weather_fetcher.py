"""
SIAE — Descarga de modelos meteorológicos globales (GFS / WaveWatch III).

Descarga recortes regionales de GRIB2 desde NOMADS (NOAA), gratuitos y sin
autenticación. El backend actúa de proxy con caché: el frontend nunca llama
a NOMADS directamente.

Bounding box de recorte: lat 14–34, lon -122 a -85 (todos los mares mexicanos).
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

logger = logging.getLogger("siae.weather")

NOMADS_BASE = "https://nomads.ncep.noaa.gov/cgi-bin"

# Bounding box de la región de operación: todos los mares mexicanos
# (Pacífico/Baja California, Golfo de California, Golfo de México y Caribe,
# cubriendo las 43 estaciones mareográficas de CICESE).
BBOX = {"toplat": 34, "leftlon": -122, "rightlon": -85, "bottomlat": 14}

# Horas de pronóstico a descargar: 0 a 120 h en pasos de 3 h
FORECAST_HOURS = list(range(0, 121, 3))

RAW_DIR = Path(__file__).resolve().parent.parent.parent / "weather_data" / "raw"

RUN_HOURS = ("00", "06", "12", "18")

MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 2

# Pausa entre descargas de archivos. NOMADS limita a ~120 peticiones/minuto
# por IP y responde 302 (bloqueo temporal) si se excede — nos pasó al ampliar
# el dominio. Con ~82 archivos por corrida, 0.7 s mantiene el ritmo muy por
# debajo del límite sin alargar demasiado el pipeline (~1 min extra).
INTER_REQUEST_DELAY_SECONDS = 0.7


def _run_dir(run_date: str, run_hour: str) -> Path:
    d = RAW_DIR / f"{run_date}{run_hour}"
    d.mkdir(parents=True, exist_ok=True)
    return d


async def _download_with_retries(client: httpx.AsyncClient, url: str, dest: Path) -> bool:
    """Descarga con reintentos. Devuelve True si tuvo éxito."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = await client.get(url, timeout=60.0, follow_redirects=True)
            if resp.status_code == 200 and len(resp.content) > 0:
                dest.write_bytes(resp.content)
                return True
            logger.warning(
                "Descarga fallida (status=%s, intento %s/%s): %s",
                resp.status_code, attempt, MAX_RETRIES, url,
            )
        except httpx.HTTPError as exc:
            logger.warning(
                "Error de red (intento %s/%s) descargando %s: %s",
                attempt, MAX_RETRIES, url, exc,
            )
        if attempt < MAX_RETRIES:
            await asyncio.sleep(RETRY_BACKOFF_SECONDS * attempt)
    return False


async def download_gfs_wind(run_date: str, run_hour: str, forecast_hours: list[int] = FORECAST_HOURS) -> list[Path]:
    """
    Descarga los GRIB2 de viento (U/V a 10m + ráfaga) de GFS 0.25° para la corrida dada.
    Devuelve la lista de rutas descargadas exitosamente.
    """
    out_dir = _run_dir(run_date, run_hour)
    downloaded = []
    async with httpx.AsyncClient() as client:
        for fh in forecast_hours:
            fff = f"{fh:03d}"
            fname = f"gfs.t{run_hour}z.pgrb2.0p25.f{fff}"
            dest = out_dir / f"wind_f{fff}.grib2"
            if dest.exists() and dest.stat().st_size > 0:
                downloaded.append(dest)
                continue
            url = (
                f"{NOMADS_BASE}/filter_gfs_0p25.pl"
                f"?dir=%2Fgfs.{run_date}%2F{run_hour}%2Fatmos"
                f"&file={fname}"
                f"&var_UGRD=on&var_VGRD=on&var_GUST=on"
                f"&lev_10_m_above_ground=on&lev_surface=on"
                f"&subregion="
                f"&toplat={BBOX['toplat']}&leftlon={BBOX['leftlon']}"
                f"&rightlon={BBOX['rightlon']}&bottomlat={BBOX['bottomlat']}"
            )
            ok = await _download_with_retries(client, url, dest)
            if ok:
                downloaded.append(dest)
            else:
                logger.warning("No se pudo descargar viento GFS f%s de la corrida %s%s", fff, run_date, run_hour)
            await asyncio.sleep(INTER_REQUEST_DELAY_SECONDS)
    return downloaded


async def download_ww3_waves(run_date: str, run_hour: str, forecast_hours: list[int] = FORECAST_HOURS) -> list[Path]:
    """
    Descarga los GRIB2 de oleaje (altura sig., periodo, dirección) de GFS-Wave 0.25°.
    Devuelve la lista de rutas descargadas exitosamente.
    """
    out_dir = _run_dir(run_date, run_hour)
    downloaded = []
    async with httpx.AsyncClient() as client:
        for fh in forecast_hours:
            fff = f"{fh:03d}"
            fname = f"gfswave.t{run_hour}z.global.0p25.f{fff}.grib2"
            dest = out_dir / f"waves_f{fff}.grib2"
            if dest.exists() and dest.stat().st_size > 0:
                downloaded.append(dest)
                continue
            url = (
                f"{NOMADS_BASE}/filter_gfswave.pl"
                f"?dir=%2Fgfs.{run_date}%2F{run_hour}%2Fwave%2Fgridded"
                f"&file={fname}"
                f"&var_HTSGW=on&var_PERPW=on&var_DIRPW=on"
                f"&subregion="
                f"&toplat={BBOX['toplat']}&leftlon={BBOX['leftlon']}"
                f"&rightlon={BBOX['rightlon']}&bottomlat={BBOX['bottomlat']}"
            )
            ok = await _download_with_retries(client, url, dest)
            if ok:
                downloaded.append(dest)
            else:
                logger.warning("No se pudo descargar oleaje WW3 f%s de la corrida %s%s", fff, run_date, run_hour)
            await asyncio.sleep(INTER_REQUEST_DELAY_SECONDS)
    return downloaded


def _candidate_runs(n: int = 8):
    """Genera las últimas n corridas nominales (date, hour) de más reciente a más antigua,
    asumiendo disponibilidad ~4.5h después de la hora nominal."""
    now = datetime.now(timezone.utc) - timedelta(hours=4, minutes=30)
    # Redondear hacia abajo a la hora de corrida más cercana (00/06/12/18)
    run_hour_int = (now.hour // 6) * 6
    current = now.replace(hour=run_hour_int, minute=0, second=0, microsecond=0)
    for i in range(n):
        run_dt = current - timedelta(hours=6 * i)
        yield run_dt.strftime("%Y%m%d"), f"{run_dt.hour:02d}"


async def latest_available_run() -> tuple[str, str] | None:
    """
    Determina la corrida más reciente con datos disponibles en NOMADS,
    verificando con una petición HEAD/GET liviana al índice del directorio.
    Devuelve (run_date, run_hour) o None si ninguna candidata está disponible.
    """
    async with httpx.AsyncClient() as client:
        for run_date, run_hour in _candidate_runs():
            fff = "000"
            fname = f"gfs.t{run_hour}z.pgrb2.0p25.f{fff}"
            url = (
                f"{NOMADS_BASE}/filter_gfs_0p25.pl"
                f"?dir=%2Fgfs.{run_date}%2F{run_hour}%2Fatmos"
                f"&file={fname}&var_UGRD=on&lev_10_m_above_ground=on"
                f"&subregion=&toplat={BBOX['toplat']}&leftlon={BBOX['leftlon']}"
                f"&rightlon={BBOX['rightlon']}&bottomlat={BBOX['bottomlat']}"
            )
            try:
                resp = await client.get(url, timeout=20.0, follow_redirects=True)
                if resp.status_code == 200 and len(resp.content) > 1000:
                    return run_date, run_hour
            except httpx.HTTPError:
                continue
    return None


def cleanup_old_runs(max_age_hours: int = 48) -> None:
    """Elimina corridas crudas con más de max_age_hours de antigüedad."""
    if not RAW_DIR.exists():
        return
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    for run_folder in RAW_DIR.iterdir():
        if not run_folder.is_dir():
            continue
        try:
            run_date, run_hour = run_folder.name[:8], run_folder.name[8:10]
            run_dt = datetime.strptime(run_date + run_hour, "%Y%m%d%H").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if run_dt < cutoff:
            import shutil
            shutil.rmtree(run_folder, ignore_errors=True)
            logger.info("Corrida antigua eliminada: %s", run_folder.name)
