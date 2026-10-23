import json
import logging
import math
import urllib.request
from datetime import datetime, timedelta, timezone

from app.services.weather_processor import (
    get_latest_manifest,
    load_gust_json,
    load_precip_json,
    load_temp_json,
    load_waves_json,
    load_wind_json,
)

logger = logging.getLogger("siae.weather_query")

MS_TO_KNOTS = 1.9438

# Radio máximo (en celdas de malla) para buscar un dato de oleaje válido cercano
# cuando el punto exacto cae en una celda costera enmascarada (puerto/bahía angosta).
MAX_FALLBACK_SEARCH_CELLS = 2


def _fetch_ecmwf_data(coords: list[tuple[float, float]], timeout: float = 7.0) -> tuple[list[dict], list[dict]]:
    """
    Consulta pronóstico de viento, ráfagas, temperatura, lluvia y oleaje marino
    del modelo ECMWF (IFS Open Data 0.25°) vía API de Open-Meteo para una lista
    de coordenadas [(lat, lon), ...].
    Retorna (atmo_list, marine_list) donde cada elemento corresponde a una coordenada.
    """
    if not coords:
        return [], []

    atmo_all = []
    marine_all = []

    # Procesar en bloques de hasta 30 coordenadas para no exceder límites de URL
    batch_size = 30
    for i in range(0, len(coords), batch_size):
        batch = coords[i:i + batch_size]
        lats_str = ",".join(f"{c[0]:.4f}" for c in batch)
        lons_str = ",".join(f"{c[1]:.4f}" for c in batch)

        # 1. Atmosférico ECMWF IFS
        atmo_url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lats_str}&longitude={lons_str}&"
            f"hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation&"
            f"models=ecmwf_ifs025&wind_speed_unit=kn&timezone=UTC"
        )
        req_atmo = urllib.request.Request(atmo_url, headers={"User-Agent": "SIAE-CICESE/1.0"})
        with urllib.request.urlopen(req_atmo, timeout=timeout) as resp:
            data_atmo = json.loads(resp.read().decode())

        if isinstance(data_atmo, list):
            atmo_all.extend(data_atmo)
        else:
            atmo_all.append(data_atmo)

        # 2. Oleaje Marino
        marine_url = (
            f"https://marine-api.open-meteo.com/v1/marine?"
            f"latitude={lats_str}&longitude={lons_str}&"
            f"hourly=wave_height,wave_period,wave_direction&timezone=UTC"
        )
        try:
            req_marine = urllib.request.Request(marine_url, headers={"User-Agent": "SIAE-CICESE/1.0"})
            with urllib.request.urlopen(req_marine, timeout=timeout) as resp:
                data_marine = json.loads(resp.read().decode())
            if isinstance(data_marine, list):
                marine_all.extend(data_marine)
            else:
                marine_all.append(data_marine)
        except Exception as e_marine:
            logger.warning("Fallo al consultar oleaje marino ECMWF: %s", e_marine)
            for _ in batch:
                marine_all.append(None)

    return atmo_all, marine_all


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


def get_point_forecast(lat: float, lon: float, model: str = "gfs") -> tuple[list[dict], str]:
    """
    Devuelve la serie temporal de pronóstico en un punto.
    Soporta 'gfs' (mallas locales GFS/WW3) y 'ecmwf' (ECMWF IFS Open Data vía Open-Meteo).
    Retorna (series, model_name).
    """
    if model.lower() == "ecmwf":
        try:
            atmo_list, marine_list = _fetch_ecmwf_data([(lat, lon)], timeout=6.0)
            if atmo_list and "hourly" in atmo_list[0]:
                atmo = atmo_list[0]["hourly"]
                marine = marine_list[0]["hourly"] if (marine_list and marine_list[0] and "hourly" in marine_list[0]) else None

                times = atmo.get("time", [])
                wind_speeds = atmo.get("wind_speed_10m", [])
                wind_gusts = atmo.get("wind_gusts_10m", [])
                wind_dirs = atmo.get("wind_direction_10m", [])
                air_temps = atmo.get("temperature_2m", [])
                precips = atmo.get("precipitation", [])

                wave_heights = marine.get("wave_height", []) if marine else []
                wave_periods = marine.get("wave_period", []) if marine else []
                wave_dirs = marine.get("wave_direction", []) if marine else []

                series = []
                for idx, t_iso in enumerate(times):
                    if idx >= 168:  # 7 días
                        break
                    w_spd = wind_speeds[idx] if idx < len(wind_speeds) else None
                    w_gst = wind_gusts[idx] if idx < len(wind_gusts) else None
                    w_dir = wind_dirs[idx] if idx < len(wind_dirs) else None
                    a_tmp = air_temps[idx] if idx < len(air_temps) else None
                    prate = precips[idx] if idx < len(precips) else None

                    w_h = wave_heights[idx] if idx < len(wave_heights) else None
                    w_p = wave_periods[idx] if idx < len(wave_periods) else None
                    w_d = wave_dirs[idx] if idx < len(wave_dirs) else None

                    series.append({
                        "time": t_iso if ("Z" in t_iso or "+" in t_iso) else f"{t_iso}Z",
                        "forecast_hour": idx,
                        "wind_speed_kt": round(w_spd, 1) if w_spd is not None else None,
                        "wind_gust_kt": round(w_gst, 1) if w_gst is not None else None,
                        "wind_dir_deg": round(w_dir, 0) if w_dir is not None else None,
                        "wave_height_m": round(w_h, 2) if w_h is not None else None,
                        "wave_period_s": round(w_p, 1) if w_p is not None else None,
                        "wave_dir_deg": round(w_d, 0) if w_d is not None else None,
                        "sea_temp_c": None,
                        "air_temp_c": round(a_tmp, 1) if a_tmp is not None else None,
                        "precip_rate_mmh": round(prate, 2) if prate is not None else None,
                        "precip_accum_mm": None,
                    })
                return series, "ECMWF (IFS Europeo 0.25°)"
        except Exception as err:
            logger.warning("Fallo al consultar ECMWF puntual (%s). Aplicando fallback a GFS.", err)

    manifest = get_latest_manifest()
    if manifest is None:
        return [], "GFS (NOAA 0.25°)"

    run_date = manifest["run_date"]
    run_hour = manifest["run_hour"]
    wind_hours = manifest.get("wind_hours", [])
    gust_hours = set(manifest.get("gust_hours", []))
    wave_hours = set(manifest.get("wave_hours", []))
    temp_hours = set(manifest.get("temp_hours", []))
    precip_hours = set(manifest.get("precip_hours", []))

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

        sea_temp_c = air_temp_c = None
        if fh in temp_hours:
            temp_grid = load_temp_json(run_date, run_hour, fh)
            if temp_grid is not None:
                st = interpolate_grid(temp_grid, lat, lon, field="sea_temp")
                at = interpolate_grid(temp_grid, lat, lon, field="air_temp")
                sea_temp_c = round(st, 1) if st is not None else None
                air_temp_c = round(at, 1) if at is not None else None

        precip_rate_mmh = precip_accum_mm = None
        if fh in precip_hours:
            precip_grid = load_precip_json(run_date, run_hour, fh)
            if precip_grid is not None:
                pr = interpolate_grid(precip_grid, lat, lon, field="prate_mmh")
                pa = interpolate_grid(precip_grid, lat, lon, field="accum_mm")
                precip_rate_mmh = round(pr, 2) if pr is not None else None
                precip_accum_mm = round(pa, 2) if pa is not None else None

        series.append({
            "time": (ref_dt + timedelta(hours=fh)).isoformat(),
            "forecast_hour": fh,
            "wind_speed_kt": wind_speed_kt,
            "wind_gust_kt": wind_gust_kt,
            "wind_dir_deg": wind_dir_deg,
            "wave_height_m": wave_height_m,
            "wave_period_s": wave_period_s,
            "wave_dir_deg": wave_dir_deg,
            "sea_temp_c": sea_temp_c,
            "air_temp_c": air_temp_c,
            "precip_rate_mmh": precip_rate_mmh,
            "precip_accum_mm": precip_accum_mm,
        })

    model_label = "GFS (NOAA 0.25°)"
    if model.lower() == "ecmwf":
        model_label = "GFS (NOAA 0.25°) [Fallback por error de conexión ECMWF]"
    return series, model_label


def haversine_distance_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcula la distancia ortodrómica en millas náuticas entre dos puntos geográficos."""
    R_NM = 3440.065  # Radio terrestre en millas náuticas (6371 km)
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R_NM * c, 2)


def get_beaufort_info(wind_kt: float) -> tuple[int, str]:
    """Retorna el número de escala Beaufort y descripción náutica a partir de nudos."""
    if wind_kt < 1:
        return 0, "Calma"
    elif wind_kt < 4:
        return 1, "Ventolina"
    elif wind_kt < 7:
        return 2, "Flojito (Brisa muy débil)"
    elif wind_kt < 11:
        return 3, "Flojo (Brisa ligera)"
    elif wind_kt < 17:
        return 4, "Bonancible (Brisa moderada)"
    elif wind_kt < 22:
        return 5, "Fresquito (Brisa fresca)"
    elif wind_kt < 28:
        return 6, "Fresco (Viento fuerte)"
    elif wind_kt < 34:
        return 7, "Frescachón (Viento muy fuerte)"
    elif wind_kt < 41:
        return 8, "Temporal (Temporal moderado)"
    elif wind_kt < 48:
        return 9, "Temporal fuerte"
    elif wind_kt < 56:
        return 10, "Temporal duro"
    elif wind_kt < 64:
        return 11, "Temporal muy duro"
    else:
        return 12, "Huracán"


def calculate_route_forecast(req_data: dict) -> dict:
    """
    Calcula cronología de navegación de una ruta de cruceros (distancias, tránsitos, ETAs y ETDs)
    e interpola las variables meteorológicas (viento, oleaje, temperatura, lluvia) para el
    instante exacto de arribo a cada estación según el modelo seleccionado:
    - 'gfs': GFS/WW3 (mallas locales de 0.25° procesadas por SIAE)
    - 'ecmwf': ECMWF IFS Open Data (0.25° con orografía costera y oleaje de alta fidelidad)
    """
    dep_str = req_data.get("departure_datetime")
    try:
        if dep_str and dep_str.endswith("Z"):
            dep_str = dep_str[:-1] + "+00:00"
        departure_dt = datetime.fromisoformat(dep_str) if dep_str else datetime.now(timezone.utc)
        if departure_dt.tzinfo is None:
            departure_dt = departure_dt.replace(tzinfo=timezone.utc)
    except Exception:
        departure_dt = datetime.now(timezone.utc)

    default_speed = float(req_data.get("default_speed_knots") or 10.0)
    default_duration = float(req_data.get("default_duration_hours") or 1.0)
    raw_waypoints = req_data.get("waypoints") or []
    requested_model = str(req_data.get("model") or "gfs").lower()

    # 1. Calcular cinemática de navegación (coordenadas, distancias, tránsitos y horas de arribo/salida)
    cum_dist = 0.0
    total_transit_h = 0.0
    total_station_h = 0.0
    current_time = departure_dt
    coords = []
    waypoint_timings = []

    for i, wp in enumerate(raw_waypoints):
        lat = float(wp.get("latitude"))
        lon = float(wp.get("longitude"))
        name = wp.get("name") or f"Estación {i + 1}"
        speed = float(wp.get("speed_knots") or default_speed)
        if speed <= 0:
            speed = 10.0
        duration = float(wp.get("duration_hours") if wp.get("duration_hours") is not None else default_duration)
        activity = wp.get("activity")

        if i == 0:
            dist_from_prev = 0.0
            transit_time = 0.0
            eta = current_time
        else:
            prev_wp = raw_waypoints[i - 1]
            dist_from_prev = haversine_distance_nm(
                float(prev_wp.get("latitude")),
                float(prev_wp.get("longitude")),
                lat,
                lon,
            )
            transit_time = dist_from_prev / speed
            eta = current_time + timedelta(hours=transit_time)

        etd = eta + timedelta(hours=duration)
        current_time = etd

        cum_dist += dist_from_prev
        total_transit_h += transit_time
        total_station_h += duration
        coords.append((lat, lon))
        waypoint_timings.append({
            "order_index": i,
            "name": name,
            "lat": lat,
            "lon": lon,
            "speed": speed,
            "dist_from_prev": dist_from_prev,
            "cum_dist": round(cum_dist, 2),
            "transit_time": round(transit_time, 2),
            "duration": round(duration, 2),
            "eta": eta,
            "etd": etd,
            "activity": activity,
        })

    total_duration_h = total_transit_h + total_station_h
    arrival_dt = departure_dt + timedelta(hours=total_duration_h)

    # 2. Si se solicitó ECMWF, intentar consulta directa a la API IFS Open Data
    if requested_model == "ecmwf":
        try:
            atmo_list, marine_list = _fetch_ecmwf_data(coords, timeout=7.0)
            ecmwf_waypoints = []
            for i, item in enumerate(waypoint_timings):
                eta = item["eta"]
                rounded_eta = eta + timedelta(minutes=30)
                eta_str = rounded_eta.strftime("%Y-%m-%dT%H:00")

                has_weather = False
                wind_speed_kt = None
                wind_gust_kt = None
                wind_dir_deg = None
                air_temp_c = None
                precip_rate_mmh = None
                wave_height_m = None
                wave_period_s = None
                wave_dir_deg = None
                beaufort_scale = None
                beaufort_desc = None
                is_warning = False
                warning_reasons = []

                if i < len(atmo_list) and atmo_list[i] and "hourly" in atmo_list[i]:
                    atmo_h = atmo_list[i]["hourly"]
                    times = atmo_h.get("time", [])
                    if eta_str in times:
                        idx = times.index(eta_str)
                        has_weather = True
                        w_spd = atmo_h.get("wind_speed_10m", [])[idx]
                        w_gst = atmo_h.get("wind_gusts_10m", [])[idx]
                        w_dir = atmo_h.get("wind_direction_10m", [])[idx]
                        a_tmp = atmo_h.get("temperature_2m", [])[idx]
                        prate = atmo_h.get("precipitation", [])[idx]

                        wind_speed_kt = round(w_spd, 1) if w_spd is not None else None
                        wind_gust_kt = round(w_gst, 1) if w_gst is not None else None
                        wind_dir_deg = round(w_dir, 0) if w_dir is not None else None
                        air_temp_c = round(a_tmp, 1) if a_tmp is not None else None
                        precip_rate_mmh = round(prate, 2) if prate is not None else None

                        if wind_speed_kt is not None:
                            b_scale, b_text = get_beaufort_info(wind_speed_kt)
                            beaufort_scale = b_scale
                            beaufort_desc = b_text

                        # Oleaje marino
                        if i < len(marine_list) and marine_list[i] and "hourly" in marine_list[i]:
                            mar_h = marine_list[i]["hourly"]
                            m_times = mar_h.get("time", [])
                            if eta_str in m_times:
                                m_idx = m_times.index(eta_str)
                                w_h = mar_h.get("wave_height", [])[m_idx]
                                w_p = mar_h.get("wave_period", [])[m_idx]
                                w_d = mar_h.get("wave_direction", [])[m_idx]
                                wave_height_m = round(w_h, 2) if w_h is not None else None
                                wave_period_s = round(w_p, 1) if w_p is not None else None
                                wave_dir_deg = round(w_d, 0) if w_d is not None else None

                        # Alertas de operación náutica
                        if wind_speed_kt is not None and wind_speed_kt >= 22.0:
                            is_warning = True
                            warning_reasons.append(f"Viento fuerte: {wind_speed_kt} kt ({beaufort_desc})")
                        elif wind_gust_kt is not None and wind_gust_kt >= 28.0:
                            is_warning = True
                            warning_reasons.append(f"Ráfagas fuertes de viento: {wind_gust_kt} kt")

                        if wave_height_m is not None and wave_height_m >= 2.2:
                            is_warning = True
                            warning_reasons.append(f"Oleaje elevado: Hs {wave_height_m} m (maniobra CTD comprometida)")

                        if precip_rate_mmh is not None and precip_rate_mmh >= 4.0:
                            is_warning = True
                            warning_reasons.append(f"Lluvia activa: {precip_rate_mmh} mm/h")

                ecmwf_waypoints.append({
                    "order_index": item["order_index"],
                    "name": item["name"],
                    "latitude": item["lat"],
                    "longitude": item["lon"],
                    "speed_knots": item["speed"],
                    "distance_from_prev_nm": item["dist_from_prev"],
                    "cumulative_distance_nm": item["cum_dist"],
                    "transit_time_hours": item["transit_time"],
                    "station_duration_hours": item["duration"],
                    "eta": item["eta"].isoformat(),
                    "etd": item["etd"].isoformat(),
                    "activity": item["activity"],
                    "has_weather": has_weather,
                    "forecast_hour": None,
                    "weather_time": eta_str if has_weather else None,
                    "wind_speed_kt": wind_speed_kt,
                    "wind_gust_kt": wind_gust_kt,
                    "wind_dir_deg": wind_dir_deg,
                    "wave_height_m": wave_height_m,
                    "wave_period_s": wave_period_s,
                    "wave_dir_deg": wave_dir_deg,
                    "sea_temp_c": None,
                    "air_temp_c": air_temp_c,
                    "precip_rate_mmh": precip_rate_mmh,
                    "beaufort_scale": beaufort_scale,
                    "beaufort_description": beaufort_desc,
                    "is_warning": is_warning,
                    "warning_reasons": warning_reasons,
                })

            return {
                "departure_datetime": departure_dt.isoformat(),
                "arrival_datetime": arrival_dt.isoformat(),
                "total_distance_nm": round(cum_dist, 2),
                "total_transit_hours": round(total_transit_h, 2),
                "total_station_hours": round(total_station_h, 2),
                "total_duration_hours": round(total_duration_h, 2),
                "model_name": "ECMWF (IFS Europeo 0.25°)",
                "model_run_date": datetime.now(timezone.utc).strftime("%Y%m%d"),
                "model_run_hour": "00",
                "waypoints": ecmwf_waypoints,
            }
        except Exception as err:
            logger.warning("Fallo en cálculo de ruta con ECMWF (%s). Aplicando fallback a GFS.", err)
            fallback_label = "GFS (NOAA 0.25°) [Fallback por error de conexión ECMWF]"
    else:
        fallback_label = "GFS (NOAA 0.25°)"

    # 3. Pronóstico GFS/WW3 (corrida activa descargada localmente)
    manifest = get_latest_manifest()
    ref_dt = None
    wind_hours = []
    gust_hours = []
    wave_hours = []
    temp_hours = []
    precip_hours = []
    run_date = None
    run_hour = None

    if manifest:
        run_date = manifest.get("run_date")
        run_hour = manifest.get("run_hour")
        wind_hours = manifest.get("wind_hours", [])
        gust_hours = manifest.get("gust_hours", wind_hours)
        wave_hours = manifest.get("wave_hours", [])
        temp_hours = manifest.get("temp_hours", [])
        precip_hours = manifest.get("precip_hours", [])
        if run_date and run_hour:
            try:
                ref_dt = datetime.strptime(f"{run_date} {run_hour}:00", "%Y%m%d %H:%M").replace(tzinfo=timezone.utc)
            except Exception:
                ref_dt = None

    waypoints_output = []
    for item in waypoint_timings:
        i = item["order_index"]
        lat = item["lat"]
        lon = item["lon"]
        eta = item["eta"]

        has_weather = False
        target_fh = None
        weather_time = None
        wind_speed_kt = None
        wind_gust_kt = None
        wind_dir_deg = None
        wave_height_m = None
        wave_period_s = None
        wave_dir_deg = None
        sea_temp_c = None
        air_temp_c = None
        precip_rate_mmh = None
        beaufort_scale = None
        beaufort_desc = None
        is_warning = False
        warning_reasons = []

        if ref_dt and wind_hours:
            diff_hours = (eta - ref_dt).total_seconds() / 3600.0
            if -3.0 <= diff_hours <= (max(wind_hours) + 6.0):
                nearest_fh = min(wind_hours, key=lambda h: abs(h - diff_hours))
                target_fh = nearest_fh
                weather_time = (ref_dt + timedelta(hours=nearest_fh)).isoformat()

                # Viento
                wind_grid = load_wind_json(run_date, run_hour, nearest_fh)
                if wind_grid is not None:
                    u_grid, v_grid = wind_grid[0], wind_grid[1]
                    u = interpolate_grid(u_grid, lat, lon)
                    v = interpolate_grid(v_grid, lat, lon)
                    if u is not None and v is not None:
                        has_weather = True
                        speed_ms = math.hypot(u, v)
                        wind_speed_kt = round(speed_ms * MS_TO_KNOTS, 1)
                        wind_dir_deg = round(_wind_dir_from_uv(u, v), 0)
                        b_scale, b_text = get_beaufort_info(wind_speed_kt)
                        beaufort_scale = b_scale
                        beaufort_desc = b_text

                        if nearest_fh in gust_hours:
                            gust_grid = load_gust_json(run_date, run_hour, nearest_fh)
                            if gust_grid is not None:
                                g_ms = interpolate_grid(gust_grid, lat, lon)
                                if g_ms is not None:
                                    wind_gust_kt = round(max(g_ms * MS_TO_KNOTS, wind_speed_kt), 1)

                # Oleaje
                if nearest_fh in wave_hours:
                    wave_grid = load_waves_json(run_date, run_hour, nearest_fh)
                    if wave_grid is not None:
                        h = interpolate_grid(wave_grid, lat, lon, field="height")
                        p = interpolate_grid(wave_grid, lat, lon, field="period")
                        d = interpolate_grid(wave_grid, lat, lon, field="direction")
                        if h is not None:
                            has_weather = True
                            wave_height_m = round(h, 2)
                            wave_period_s = round(p, 1) if p is not None else None
                            wave_dir_deg = round(d, 0) if d is not None else None

                # Temperaturas
                if nearest_fh in temp_hours:
                    temp_grid = load_temp_json(run_date, run_hour, nearest_fh)
                    if temp_grid is not None:
                        st = interpolate_grid(temp_grid, lat, lon, field="sea_temp")
                        at = interpolate_grid(temp_grid, lat, lon, field="air_temp")
                        sea_temp_c = round(st, 1) if st is not None else None
                        air_temp_c = round(at, 1) if at is not None else None

                # Lluvia
                if nearest_fh in precip_hours:
                    precip_grid = load_precip_json(run_date, run_hour, nearest_fh)
                    if precip_grid is not None:
                        pr = interpolate_grid(precip_grid, lat, lon, field="prate_mmh")
                        precip_rate_mmh = round(pr, 2) if pr is not None else None

                if wind_speed_kt is not None and wind_speed_kt >= 22.0:
                    is_warning = True
                    warning_reasons.append(f"Viento fuerte: {wind_speed_kt} kt ({beaufort_desc})")
                elif wind_gust_kt is not None and wind_gust_kt >= 28.0:
                    is_warning = True
                    warning_reasons.append(f"Ráfagas fuertes de viento: {wind_gust_kt} kt")

                if wave_height_m is not None and wave_height_m >= 2.2:
                    is_warning = True
                    warning_reasons.append(f"Oleaje elevado: Hs {wave_height_m} m (maniobra CTD comprometida)")

                if precip_rate_mmh is not None and precip_rate_mmh >= 4.0:
                    is_warning = True
                    warning_reasons.append(f"Lluvia activa: {precip_rate_mmh} mm/h")

        waypoints_output.append({
            "order_index": item["order_index"],
            "name": item["name"],
            "latitude": item["lat"],
            "longitude": item["lon"],
            "speed_knots": item["speed"],
            "distance_from_prev_nm": item["dist_from_prev"],
            "cumulative_distance_nm": item["cum_dist"],
            "transit_time_hours": item["transit_time"],
            "station_duration_hours": item["duration"],
            "eta": item["eta"].isoformat(),
            "etd": item["etd"].isoformat(),
            "activity": item["activity"],
            "has_weather": has_weather,
            "forecast_hour": target_fh,
            "weather_time": weather_time,
            "wind_speed_kt": wind_speed_kt,
            "wind_gust_kt": wind_gust_kt,
            "wind_dir_deg": wind_dir_deg,
            "wave_height_m": wave_height_m,
            "wave_period_s": wave_period_s,
            "wave_dir_deg": wave_dir_deg,
            "sea_temp_c": sea_temp_c,
            "air_temp_c": air_temp_c,
            "precip_rate_mmh": precip_rate_mmh,
            "beaufort_scale": beaufort_scale,
            "beaufort_description": beaufort_desc,
            "is_warning": is_warning,
            "warning_reasons": warning_reasons,
        })

    return {
        "departure_datetime": departure_dt.isoformat(),
        "arrival_datetime": arrival_dt.isoformat(),
        "total_distance_nm": round(cum_dist, 2),
        "total_transit_hours": round(total_transit_h, 2),
        "total_station_hours": round(total_station_h, 2),
        "total_duration_hours": round(total_duration_h, 2),
        "model_name": fallback_label,
        "model_run_date": run_date,
        "model_run_hour": run_hour,
        "waypoints": waypoints_output,
    }

