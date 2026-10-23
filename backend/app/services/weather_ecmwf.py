"""
SIAE — Integración completa de mallas espaciales ECMWF IFS (Open Data).

Descarga y procesa en una sola operación todas las variables del modelo ECMWF IFS:
- Viento (10u / 10v): JSON vectorial leaflet-velocity y PNG térmico Windy.
- Temperatura del Aire (2t): PNG continuo mar y tierra.
- Temperatura del Mar (skt): PNG térmico de TSM marina enmascarado por costa.
- Precipitación (tp): PNG radar de lluvia en mm.
- Mallas escalares JSON para lectura bajo el cursor (temp y precip).
"""
import asyncio
import json
import logging
from pathlib import Path
from typing import Optional

import numpy as np
import xarray as xr
from PIL import Image
from global_land_mask import globe

from app.services.weather_processor import (
    _sort_north_to_south,
    _normalize_lon,
    _mercator_lat_rows,
    _sample_bilinear,
    _colormap,
    _fill_nan_nearest,
    _grid_from_values,
    get_latest_manifest,
    PROCESSED_DIR,
    WAVE_PNG_SCALE,
    WIND_PNG_ALPHA,
    WIND_COLOR_STOPS,
    WIND_MAX_MS,
    TEMP_PNG_ALPHA,
    TEMP_COLOR_STOPS,
    TEMP_MIN_C,
    TEMP_MAX_C,
    PRECIP_PNG_ALPHA,
    PRECIP_COLOR_STOPS,
    PRECIP_MAX_MMH,
    WAVE_PNG_EDGE_FEATHER_PX,
)

logger = logging.getLogger("siae.weather.ecmwf")

RAW_ECMWF_DIR = Path(__file__).resolve().parent.parent.parent / "weather_data" / "raw_ecmwf"

ECMWF_STEPS = [
    0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48,
    54, 60, 66, 72, 78, 84, 90, 96, 102, 108, 114, 120
]

_step_locks: dict[int, asyncio.Lock] = {}
_global_lock = asyncio.Lock()


def find_closest_ecmwf_step(hour: int) -> int:
    """Encuentra el paso de pronóstico ECMWF más cercano a la hora solicitada."""
    return min(ECMWF_STEPS, key=lambda s: abs(s - hour))


def get_ecmwf_dir(run_date: str, run_hour: str) -> Path:
    return PROCESSED_DIR / f"{run_date}{run_hour}"


def process_ecmwf_grib(
    grib_path: Path, step: int, out_dir: Path, tp_grib_override: Optional[Path] = None
) -> dict:
    """
    Lee el GRIB2 con 10u, 10v, 2t, tp y skt, recorta al dominio de México/Pacífico
    y genera todos los archivos visuales (PNG) y de datos (JSON) para el mapa.
    """
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. VIENTO (10u / 10v)
    ds_u = xr.open_dataset(
        grib_path, engine="cfgrib",
        backend_kwargs={"filter_by_keys": {"shortName": "10u"}, "indexpath": ""},
    )
    ds_v = xr.open_dataset(
        grib_path, engine="cfgrib",
        backend_kwargs={"filter_by_keys": {"shortName": "10v"}, "indexpath": ""},
    )
    ds_u = ds_u.sel(latitude=slice(34, 8), longitude=slice(-130, -80))
    ds_v = ds_v.sel(latitude=slice(34, 8), longitude=slice(-130, -80))
    ds_u = _sort_north_to_south(ds_u)
    ds_v = _sort_north_to_south(ds_v)

    lats = ds_u.latitude.values
    lons = _normalize_lon(ds_u.longitude.values)
    u_vals = ds_u["u10"].values
    v_vals = ds_v["v10"].values
    ref_time = str(ds_u.time.values) if "time" in ds_u.coords else None
    ny, nx = u_vals.shape
    ds_u.close()
    ds_v.close()

    header_common = {
        "lo1": float(lons[0]),
        "la1": float(lats[0]),
        "lo2": float(lons[-1]),
        "la2": float(lats[-1]),
        "dx": float(abs(lons[1] - lons[0])) if nx > 1 else 0.25,
        "dy": float(abs(lats[1] - lats[0])) if ny > 1 else 0.25,
        "nx": int(nx),
        "ny": int(ny),
        "refTime": ref_time,
        "forecastTime": step,
    }

    # Guardar JSON partículas de viento
    u_flat = np.nan_to_num(u_vals, nan=0.0).flatten().round(2).tolist()
    v_flat = np.nan_to_num(v_vals, nan=0.0).flatten().round(2).tolist()
    wind_json_data = [
        {"header": {**header_common, "parameterCategory": 2, "parameterNumber": 2}, "data": u_flat},
        {"header": {**header_common, "parameterCategory": 2, "parameterNumber": 3}, "data": v_flat},
    ]
    (out_dir / f"wind_ecmwf_f{step:03d}.json").write_text(json.dumps(wind_json_data))

    # Geometría Mercator común para PNGs
    new_ny, new_nx = ny * WAVE_PNG_SCALE, nx * WAVE_PNG_SCALE
    lat_hi = _mercator_lat_rows(lats[0], lats[-1], new_ny)
    lon_hi = np.linspace(lons[0], lons[-1], new_nx)
    rows = np.arange(new_ny)[:, None]
    cols = np.arange(new_nx)[None, :]
    edge_dist = np.minimum(
        np.minimum(rows, new_ny - 1 - rows),
        np.minimum(cols, new_nx - 1 - cols),
    )
    edge_feather = np.clip(edge_dist / WAVE_PNG_EDGE_FEATHER_PX, 0, 1)

    # Guardar PNG viento
    speed = np.hypot(u_vals, v_vals)
    hi_wind = _sample_bilinear(np.nan_to_num(speed, nan=0.0), lats, lons, lat_hi, lon_hi)
    alpha_wind = (np.full((new_ny, new_nx), WIND_PNG_ALPHA, dtype=float) * edge_feather).astype(np.uint8)
    rgba_wind = np.dstack([_colormap(hi_wind, WIND_COLOR_STOPS, WIND_MAX_MS), alpha_wind])
    Image.fromarray(rgba_wind, mode="RGBA").save(out_dir / f"wind_ecmwf_f{step:03d}.png", optimize=True)

    # 2. TEMPERATURA DEL AIRE (2t)
    try:
        ds_2t = xr.open_dataset(
            grib_path, engine="cfgrib",
            backend_kwargs={"filter_by_keys": {"shortName": "2t"}, "indexpath": ""},
        )
        ds_2t = ds_2t.sel(latitude=slice(34, 8), longitude=slice(-130, -80))
        ds_2t = _sort_north_to_south(ds_2t)
        air_c = ds_2t["t2m"].values - 273.15
        ds_2t.close()

        filled_air = _fill_nan_nearest(air_c)
        hi_air = _sample_bilinear(filled_air, lats, lons, lat_hi, lon_hi)
        norm_air = np.clip((hi_air - TEMP_MIN_C) / (TEMP_MAX_C - TEMP_MIN_C), 0.0, 1.0)
        alpha_air = (np.full((new_ny, new_nx), TEMP_PNG_ALPHA, dtype=float) * edge_feather).astype(np.uint8)

        rgb_air = np.zeros((new_ny, new_nx, 3), dtype=np.uint8)
        stops_t = np.array([s[0] for s in TEMP_COLOR_STOPS])
        for ch in range(3):
            stops_c = np.array([s[1][ch] for s in TEMP_COLOR_STOPS], dtype=float)
            rgb_air[..., ch] = np.interp(norm_air, stops_t, stops_c).astype(np.uint8)

        rgba_air = np.dstack([rgb_air, alpha_air])
        Image.fromarray(rgba_air, mode="RGBA").save(out_dir / f"air_temp_ecmwf_f{step:03d}.png", optimize=True)
    except Exception as e_2t:
        logger.warning("Fallo al procesar 2t de ECMWF f%03d: %s", step, e_2t)
        air_c = np.full((ny, nx), np.nan)

    # 3. TEMPERATURA DEL MAR (skt)
    try:
        ds_skt = xr.open_dataset(
            grib_path, engine="cfgrib",
            backend_kwargs={"filter_by_keys": {"shortName": "skt"}, "indexpath": ""},
        )
        ds_skt = ds_skt.sel(latitude=slice(34, 8), longitude=slice(-130, -80))
        ds_skt = _sort_north_to_south(ds_skt)
        sea_c = ds_skt["skt"].values - 273.15
        ds_skt.close()

        filled_sea = _fill_nan_nearest(sea_c)
        hi_sea = _sample_bilinear(filled_sea, lats, lons, lat_hi, lon_hi)
        norm_sea = np.clip((hi_sea - TEMP_MIN_C) / (TEMP_MAX_C - TEMP_MIN_C), 0.0, 1.0)

        lon_grid, lat_grid = np.meshgrid(lon_hi, lat_hi)
        land = globe.is_land(lat_grid, lon_grid)

        alpha_sea = np.where(land, 0, float(TEMP_PNG_ALPHA)).astype(float)
        alpha_sea = (alpha_sea * edge_feather).astype(np.uint8)

        rgb_sea = np.zeros((new_ny, new_nx, 3), dtype=np.uint8)
        for ch in range(3):
            stops_c = np.array([s[1][ch] for s in TEMP_COLOR_STOPS], dtype=float)
            rgb_sea[..., ch] = np.interp(norm_sea, stops_t, stops_c).astype(np.uint8)

        rgba_sea = np.dstack([rgb_sea, alpha_sea])
        Image.fromarray(rgba_sea, mode="RGBA").save(out_dir / f"temp_ecmwf_f{step:03d}.png", optimize=True)
    except Exception as e_skt:
        logger.warning("Fallo al procesar skt de ECMWF f%03d: %s", step, e_skt)
        sea_c = np.full((ny, nx), np.nan)

    # Guardar JSON de temperatura (mar y aire) para lectura de cursor
    temp_json_data = {
        "header": header_common,
        "sea_temp": _grid_from_values(sea_c),
        "air_temp": _grid_from_values(air_c),
    }
    (out_dir / f"temp_ecmwf_f{step:03d}.json").write_text(json.dumps(temp_json_data))

    # 4. PRECIPITACIÓN (tp)
    try:
        tp_source = tp_grib_override or grib_path
        ds_tp = xr.open_dataset(
            tp_source, engine="cfgrib",
            backend_kwargs={"filter_by_keys": {"shortName": "tp"}, "indexpath": ""},
        )
        ds_tp = ds_tp.sel(latitude=slice(34, 8), longitude=slice(-130, -80))
        ds_tp = _sort_north_to_south(ds_tp)

        # En ECMWF, tp es acumulación en metros desde t=0.
        # Para obtener tasa horaria en mm/h: (tp * 1000) / horas_acumuladas
        hours_div = 3.0 if (step == 0 or step == 3) else max(1.0, float(step))
        raw_tp_mm = np.maximum(0.0, np.nan_to_num(ds_tp["tp"].values, nan=0.0) * 1000.0 / hours_div)
        accum_mm = raw_tp_mm * hours_div
        ds_tp.close()

        hi_pr = _sample_bilinear(raw_tp_mm, lats, lons, lat_hi, lon_hi)
        # Umbral visible a partir de lloviznas (> 0.05 mm/h)
        alpha_pr = np.where(hi_pr < 0.05, 0.0, np.clip(hi_pr / 1.0, 0.45, 1.0) * PRECIP_PNG_ALPHA)
        alpha_pr = (alpha_pr * edge_feather).astype(np.uint8)

        norm_pr = np.clip(hi_pr / PRECIP_MAX_MMH, 0.0, 1.0)
        rgb_pr = np.zeros((new_ny, new_nx, 3), dtype=np.uint8)
        stops_pr_t = np.array([s[0] for s in PRECIP_COLOR_STOPS])
        for ch in range(3):
            stops_pr_c = np.array([s[1][ch] for s in PRECIP_COLOR_STOPS], dtype=float)
            rgb_pr[..., ch] = np.interp(norm_pr, stops_pr_t, stops_pr_c).astype(np.uint8)

        rgba_pr = np.dstack([rgb_pr, alpha_pr])
        Image.fromarray(rgba_pr, mode="RGBA").save(out_dir / f"precip_ecmwf_f{step:03d}.png", optimize=True)

        # JSON de precipitación
        precip_json_data = {
            "header": header_common,
            "prate_mmh": _grid_from_values(raw_tp_mm),
            "precip_accum_mm": _grid_from_values(accum_mm),
        }
        (out_dir / f"precip_ecmwf_f{step:03d}.json").write_text(json.dumps(precip_json_data))
    except Exception as e_tp:
        logger.warning("Fallo al procesar tp de ECMWF f%03d: %s", step, e_tp)

    logger.info("Paso ECMWF f%03d procesado exitosamente (Viento, Temp Aire, Temp Mar, Precip)", step)
    return wind_json_data


def _fetch_and_process_sync(step: int, run_date: str, run_hour: str) -> bool:
    """Descarga de forma síncrona el GRIB2 multivariable de ECMWF y genera todos los mapas."""
    from ecmwf.opendata import Client

    out_dir = get_ecmwf_dir(run_date, run_hour)
    wind_png = out_dir / f"wind_ecmwf_f{step:03d}.png"
    air_png = out_dir / f"air_temp_ecmwf_f{step:03d}.png"
    precip_png = out_dir / f"precip_ecmwf_f{step:03d}.png"

    if wind_png.exists() and air_png.exists() and precip_png.exists():
        return True

    RAW_ECMWF_DIR.mkdir(parents=True, exist_ok=True)
    raw_target = RAW_ECMWF_DIR / f"ecmwf_{run_date}{run_hour}_f{step:03d}.grib2"
    tp_step3_target = None

    try:
        client = Client(source="azure")
        client.retrieve(
            param=["10u", "10v", "2t", "tp", "skt"],
            step=step,
            type="fc",
            target=str(raw_target),
        )
        tp_grib = None
        # En paso 0, ECMWF tp es 0.0 por ser análisis; usar step 3 para la tasa inicial
        if step == 0:
            tp_step3_target = RAW_ECMWF_DIR / f"ecmwf_{run_date}{run_hour}_tp_step3.grib2"
            try:
                client.retrieve(param="tp", step=3, type="fc", target=str(tp_step3_target))
                tp_grib = tp_step3_target
            except Exception as e_tp3:
                logger.warning("No se pudo obtener tp step 3 para hora 0: %s", e_tp3)

        process_ecmwf_grib(raw_target, step, out_dir, tp_grib_override=tp_grib)
        return True
    except Exception as e:
        logger.error("Error descargando/procesando ECMWF step %d: %s", step, e)
        return False
    finally:
        for t in [raw_target, tp_step3_target]:
            if t and t.exists():
                try:
                    t.unlink()
                except Exception:
                    pass


async def ensure_ecmwf_step_processed(hour: int) -> tuple[Optional[str], Optional[str], int]:
    """Asegura que el paso horario de ECMWF esté descargado y procesado."""
    manifest = get_latest_manifest()
    if not manifest:
        return None, None, 0

    run_date = manifest["run_date"]
    run_hour = manifest["run_hour"]
    step = find_closest_ecmwf_step(hour)
    out_dir = get_ecmwf_dir(run_date, run_hour)

    wind_png = out_dir / f"wind_ecmwf_f{step:03d}.png"
    air_png = out_dir / f"air_temp_ecmwf_f{step:03d}.png"

    if wind_png.exists() and air_png.exists():
        return run_date, run_hour, step

    if step not in _step_locks:
        async with _global_lock:
            if step not in _step_locks:
                _step_locks[step] = asyncio.Lock()

    async with _step_locks[step]:
        if wind_png.exists() and air_png.exists():
            return run_date, run_hour, step

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _fetch_and_process_sync, step, run_date, run_hour)
        return run_date, run_hour, step


# --- Endpoints de Datos y Mapas ---

async def get_or_fetch_ecmwf_wind(hour: int) -> Optional[dict]:
    run_date, run_hour, step = await ensure_ecmwf_step_processed(hour)
    if not run_date:
        return None
    p = get_ecmwf_dir(run_date, run_hour) / f"wind_ecmwf_f{step:03d}.json"
    return json.loads(p.read_text()) if p.exists() else None


async def get_or_fetch_ecmwf_wind_image_path(hour: int) -> Optional[Path]:
    run_date, run_hour, step = await ensure_ecmwf_step_processed(hour)
    if not run_date:
        return None
    p = get_ecmwf_dir(run_date, run_hour) / f"wind_ecmwf_f{step:03d}.png"
    return p if p.exists() else None


async def get_or_fetch_ecmwf_air_temp_image_path(hour: int) -> Optional[Path]:
    run_date, run_hour, step = await ensure_ecmwf_step_processed(hour)
    if not run_date:
        return None
    p = get_ecmwf_dir(run_date, run_hour) / f"air_temp_ecmwf_f{step:03d}.png"
    return p if p.exists() else None


async def get_or_fetch_ecmwf_temp_image_path(hour: int) -> Optional[Path]:
    run_date, run_hour, step = await ensure_ecmwf_step_processed(hour)
    if not run_date:
        return None
    p = get_ecmwf_dir(run_date, run_hour) / f"temp_ecmwf_f{step:03d}.png"
    return p if p.exists() else None


async def get_or_fetch_ecmwf_precip_image_path(hour: int) -> Optional[Path]:
    run_date, run_hour, step = await ensure_ecmwf_step_processed(hour)
    if not run_date:
        return None
    p = get_ecmwf_dir(run_date, run_hour) / f"precip_ecmwf_f{step:03d}.png"
    return p if p.exists() else None


async def get_or_fetch_ecmwf_temp_json(hour: int) -> Optional[dict]:
    run_date, run_hour, step = await ensure_ecmwf_step_processed(hour)
    if not run_date:
        return None
    p = get_ecmwf_dir(run_date, run_hour) / f"temp_ecmwf_f{step:03d}.json"
    return json.loads(p.read_text()) if p.exists() else None


async def get_or_fetch_ecmwf_precip_json(hour: int) -> Optional[dict]:
    run_date, run_hour, step = await ensure_ecmwf_step_processed(hour)
    if not run_date:
        return None
    p = get_ecmwf_dir(run_date, run_hour) / f"precip_ecmwf_f{step:03d}.json"
    return json.loads(p.read_text()) if p.exists() else None


async def pregenerate_ecmwf_steps(steps: Optional[list[int]] = None) -> None:
    """Pre-genera en segundo plano los pasos horarios principales de ECMWF."""
    if steps is None:
        steps = [0, 3, 6, 9, 12, 18, 24, 30, 36, 42, 48]
    for s in steps:
        try:
            await ensure_ecmwf_step_processed(s)
        except Exception as e:
            logger.warning("Error pregenerando paso ECMWF %d: %s", s, e)
