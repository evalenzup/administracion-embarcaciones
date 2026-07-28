"""
SIAE — Consulta puntual de pronóstico (interpolación bilineal sobre las mallas
procesadas de viento/oleaje) para el endpoint /weather/point.
"""
import math
from datetime import datetime, timedelta, timezone

from app.services.weather_processor import (
    get_latest_manifest,
    load_gust_json,
    load_waves_json,
    load_wind_json,
)

MS_TO_KNOTS = 1.9438

# Radio máximo (en celdas de malla) para buscar un dato válido cercano cuando
# el punto exacto cae en una celda enmascarada (tierra/bahía angosta). A 0.25°
# de resolución, 12 celdas equivalen a ~3° (~330 km) — suficiente para
# "salir" de cualquier bahía de la costa de Baja California sin alejarse
# tanto que el dato deje de ser representativo.
MAX_FALLBACK_SEARCH_CELLS = 12


def _grid_indices(header: dict, lat: float, lon: float) -> tuple[int, int, int, int, float, float] | None:
    """
    Calcula los índices de fila/columna vecinos y los pesos de interpolación
    bilineal para (lat, lon) dentro de una malla. Devuelve None si el punto
    está fuera del bounding box de la malla.
    """
    lo1, la1 = header["lo1"], header["la1"]
    dx, dy = header["dx"], header["dy"]
    nx, ny = header["nx"], header["ny"]

    col_f = (lon - lo1) / dx
    row_f = (la1 - lat) / dy  # fila 0 = norte (la1)

    if col_f < 0 or col_f > nx - 1 or row_f < 0 or row_f > ny - 1:
        return None

    col0 = min(int(math.floor(col_f)), nx - 2) if nx > 1 else 0
    row0 = min(int(math.floor(row_f)), ny - 2) if ny > 1 else 0
    col1 = min(col0 + 1, nx - 1)
    row1 = min(row0 + 1, ny - 1)

    wx = col_f - col0 if nx > 1 else 0.0
    wy = row_f - row0 if ny > 1 else 0.0

    return row0, row1, col0, col1, wx, wy


def _nearest_valid_value(values: list, nx: int, ny: int, row0: int, col0: int) -> float | None:
    """
    Busca en anillos concéntricos crecientes alrededor de (row0, col0) la
    celda con dato válido (no None) más cercana. Se usa cuando el punto
    consultado cae en una celda enmascarada (tierra) pero hay mar navegable
    a corta distancia — típico en bahías angostas a la resolución del
    modelo global (ver nota en Fase 1 del plan: Ensenada/El Sauzal quedan
    enmascarados en WW3 0.25° aunque son puntos de operación reales).
    """
    def at(r, c):
        if 0 <= r < ny and 0 <= c < nx:
            return values[r * nx + c]
        return None

    v = at(row0, col0)
    if v is not None:
        return v

    for radius in range(1, MAX_FALLBACK_SEARCH_CELLS + 1):
        candidates = []
        for dr in range(-radius, radius + 1):
            for dc in range(-radius, radius + 1):
                if max(abs(dr), abs(dc)) != radius:
                    continue  # solo el borde del anillo; radios menores ya se revisaron
                val = at(row0 + dr, col0 + dc)
                if val is not None:
                    candidates.append(val)
        if candidates:
            return sum(candidates) / len(candidates)
    return None


def interpolate_grid(grid: dict, lat: float, lon: float, field: str = "data") -> float | None:
    """Interpola bilinealmente un valor de una malla escalar {header, data|<field>}."""
    header = grid["header"]
    values = grid[field]
    idx = _grid_indices(header, lat, lon)
    if idx is None:
        return None
    row0, row1, col0, col1, wx, wy = idx
    nx, ny = header["nx"], header["ny"]

    def at(r, c):
        v = values[r * nx + c]
        return v if v is not None else None

    v00, v10, v01, v11 = at(row0, col0), at(row0, col1), at(row1, col0), at(row1, col1)
    vals = [v for v in (v00, v10, v01, v11) if v is not None]
    if not vals:
        # Los 4 vecinos están enmascarados: usar el dato válido más cercano
        # en vez de devolver null (ver docstring de _nearest_valid_value).
        nearest_row = row0 if wy < 0.5 else row1
        nearest_col = col0 if wx < 0.5 else col1
        return _nearest_valid_value(values, nx, ny, nearest_row, nearest_col)

    # Si falta algún vecino (borde de tierra/mar), usar el promedio de los disponibles
    if v00 is None:
        v00 = sum(vals) / len(vals)
    if v10 is None:
        v10 = sum(vals) / len(vals)
    if v01 is None:
        v01 = sum(vals) / len(vals)
    if v11 is None:
        v11 = sum(vals) / len(vals)

    top = v00 * (1 - wx) + v10 * wx
    bottom = v01 * (1 - wx) + v11 * wx
    return top * (1 - wy) + bottom * wy


def _wind_dir_from_uv(u: float, v: float) -> float:
    """Dirección meteorológica (de dónde viene el viento), en grados 0-360."""
    return (270 - math.degrees(math.atan2(v, u))) % 360


def get_point_forecast(lat: float, lon: float) -> list[dict]:
    """
    Devuelve la serie temporal de pronóstico en un punto, combinando viento,
    ráfaga y oleaje de la corrida procesada más reciente.
    """
    manifest = get_latest_manifest()
    if manifest is None:
        return []

    run_date = manifest["run_date"]
    run_hour = manifest["run_hour"]
    wind_hours = manifest.get("wind_hours", [])
    gust_hours = set(manifest.get("gust_hours", []))
    wave_hours = set(manifest.get("wave_hours", []))

    ref_dt = datetime.strptime(run_date + run_hour, "%Y%m%d%H").replace(tzinfo=timezone.utc)

    series = []
    for fh in wind_hours:
        wind_grid = load_wind_json(run_date, run_hour, fh)
        if wind_grid is None:
            continue
        u_grid, v_grid = wind_grid[0], wind_grid[1]
        u = interpolate_grid(u_grid, lat, lon)
        v = interpolate_grid(v_grid, lat, lon)
        if u is None or v is None:
            continue

        speed_ms = math.hypot(u, v)
        wind_speed_kt = round(speed_ms * MS_TO_KNOTS, 1)
        wind_dir_deg = round(_wind_dir_from_uv(u, v), 0)

        wind_gust_kt = None
        if fh in gust_hours:
            gust_grid = load_gust_json(run_date, run_hour, fh)
            if gust_grid is not None:
                gust_ms = interpolate_grid(gust_grid, lat, lon)
                if gust_ms is not None:
                    # GUST de GFS es un diagnóstico de turbulencia independiente
                    # del viento a 10 m; en capa límite marina estable puede
                    # salir ligeramente MENOR que el sostenido (~38% de las
                    # celdas de la región), lo cual confunde al usuario. Se
                    # acota al sostenido: nunca inventa más que el empate.
                    wind_gust_kt = round(max(gust_ms * MS_TO_KNOTS, wind_speed_kt), 1)

        wave_height_m = wave_period_s = wave_dir_deg = None
        if fh in wave_hours:
            wave_grid = load_waves_json(run_date, run_hour, fh)
            if wave_grid is not None:
                h = interpolate_grid(wave_grid, lat, lon, field="height")
                p = interpolate_grid(wave_grid, lat, lon, field="period")
                d = interpolate_grid(wave_grid, lat, lon, field="direction")
                wave_height_m = round(h, 2) if h is not None else None
                wave_period_s = round(p, 1) if p is not None else None
                wave_dir_deg = round(d, 0) if d is not None else None

        series.append({
            "time": (ref_dt + timedelta(hours=fh)).isoformat(),
            "forecast_hour": fh,
            "wind_speed_kt": wind_speed_kt,
            "wind_gust_kt": wind_gust_kt,
            "wind_dir_deg": wind_dir_deg,
            "wave_height_m": wave_height_m,
            "wave_period_s": wave_period_s,
            "wave_dir_deg": wave_dir_deg,
        })

    return series
