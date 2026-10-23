"""
SIAE — Extractor Numérico de Vórtices Ciclónicos para Modelo GFS 0.25°.

Analiza los campos vectoriales de viento (U/V a 10m) descargados y procesados
en el servidor para detectar y rastrear la trayectoria del ojo del ciclón
en cada paso temporal de pronóstico (0h a 120h), calculando vientos máximos,
suavizado dinámico de trayectoria y el cono de incertidumbre correspondiente.
"""
import json
import logging
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

from app.services.cyclone_tracker import generate_cone_polygon, get_sshws_category
from app.services.weather_processor import PROCESSED_DIR, get_latest_manifest

logger = logging.getLogger("siae.weather")

FORECAST_TRACK_HOURS = [0, 6, 12, 18, 24, 36, 48, 60, 72, 84, 96, 108, 120]


def _smooth_2d(a: np.ndarray, window: int = 5) -> np.ndarray:
    """Suavizado espacial 2D (convolución uniforme) para eliminar ruido de malla de alta frecuencia."""
    pad = window // 2
    padded = np.pad(a, pad, mode="edge")
    from numpy.lib.stride_tricks import sliding_window_view
    windows = sliding_window_view(padded, (window, window))
    kernel = np.ones((window, window), dtype=float) / float(window * window)
    return np.einsum("ijkl,kl->ij", windows, kernel)


def _compute_circulation(u: np.ndarray, v: np.ndarray, r_c: int, c_c: int, radius_grid: int = 4) -> float:
    """
    Calcula la circulación ciclónica tangencial media (integral de línea)
    a lo largo de un radio aproximado de ~100 km alrededor del centro candidato (r_c, c_c).
    En el hemisferio norte, una circulación ciclónica positiva es antihoraria.
    """
    ny, nx = u.shape
    angles = np.linspace(0, 2.0 * math.pi, 16, endpoint=False)
    total_circ = 0.0
    valid_count = 0
    for ang in angles:
        rr = int(round(r_c - radius_grid * math.sin(ang)))
        cc = int(round(c_c + radius_grid * math.cos(ang)))
        if 0 <= rr < ny and 0 <= cc < nx:
            u_pt = u[rr, cc]
            v_pt = v[rr, cc]
            # Componente tangencial antihoraria
            v_tangent = -u_pt * math.sin(ang) + v_pt * math.cos(ang)
            total_circ += v_tangent
            valid_count += 1
    return (total_circ / valid_count) if valid_count > 0 else 0.0


def _smooth_trajectory_points(points: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Aplica un filtro de suavizado cinemático y spline a las coordenadas de la trayectoria,
    preservando estrictamente el punto inicial (f000 / posición observada).
    """
    if len(points) <= 2:
        return points

    lats = [p["lat"] for p in points]
    lons = [p["lon"] for p in points]
    n = len(points)

    # Suavizado ponderado estilo Savitzky-Golay / Gaussiano ligero (preservando extremos)
    smoothed_lats = list(lats)
    smoothed_lons = list(lons)

    for i in range(1, n - 1):
        # Ponderación 1:2:1 entre punto anterior, actual y siguiente
        # Ajustar longitud considerando curvatura
        w_prev, w_cur, w_next = 0.25, 0.50, 0.25
        smoothed_lats[i] = round(w_prev * lats[i - 1] + w_cur * lats[i] + w_next * lats[i + 1], 2)
        smoothed_lons[i] = round(w_prev * lons[i - 1] + w_cur * lons[i] + w_next * lons[i + 1], 2)

    for i, p in enumerate(points):
        p["lat"] = smoothed_lats[i]
        p["lon"] = smoothed_lons[i]

    return points


def track_gfs_cyclone(
    seed_lat: float,
    seed_lon: float,
    run_date: Optional[str] = None,
    run_hour: Optional[str] = None,
    initial_dir_deg: Optional[float] = None,
    initial_speed_kts: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    """
    Rastrea el centro ciclónico en los datos procesados de GFS a partir de una posición inicial,
    utilizando pasos continuos de alta resolución temporal (cada 3 horas) para mantener
    la inercia cinemática y la continuidad espacial, evitando saltos numéricos o retrocesos.
    """
    manifest = get_latest_manifest()
    if not manifest and (not run_date or not run_hour):
        return None

    r_date = run_date or manifest.get("run_date")
    r_hour = run_hour or manifest.get("run_hour")
    run_dir = PROCESSED_DIR / f"{r_date}{r_hour}"

    if not run_dir.exists():
        return None

    try:
        ref_dt = datetime.strptime(f"{r_date}{r_hour}", "%Y%m%d%H").replace(tzinfo=timezone.utc)
    except Exception:
        ref_dt = datetime.now(timezone.utc)

    cur_lat = seed_lat
    cur_lon = seed_lon
    prev_lat = seed_lat
    prev_lon = seed_lon

    raw_track: List[Dict[str, Any]] = []
    
    # Rastrear a resolución completa de 3 horas (0h a 120h)
    ALL_3H_STEPS = list(range(0, 121, 3))

    for idx, fh in enumerate(ALL_3H_STEPS):
        p = run_dir / f"wind_f{fh:03d}.json"
        if not p.exists():
            continue

        try:
            raw_content = json.loads(p.read_text())
            if not raw_content or len(raw_content) < 2:
                continue

            h = raw_content[0]["header"]
            nx, ny = h["nx"], h["ny"]
            dx, dy = h["dx"], h["dy"]
            la1, lo1 = h["la1"], h["lo1"]

            u = np.array(raw_content[0]["data"]).reshape((ny, nx))
            v = np.array(raw_content[1]["data"]).reshape((ny, nx))

            # Velocidad del viento en nudos (1 m/s = 1.94384 kt)
            wind_speed_kt = np.sqrt(u**2 + v**2) * 1.94384

            # Filtrado espacial 2D
            u_sm = _smooth_2d(u, window=5)
            v_sm = _smooth_2d(v, window=5)

            # Vorticidad relativa 2D
            vort = np.zeros((ny, nx), dtype=float)
            for r in range(1, ny - 1):
                lat_deg = la1 - r * dy
                dx_m = 2.0 * dx * 111320.0 * max(0.1, math.cos(math.radians(lat_deg)))
                dy_m = 2.0 * dy * 111320.0
                dv_dx = (v_sm[r, 2:] - v_sm[r, :-2]) / max(1.0, dx_m)
                du_dy = -(u_sm[r - 1, 1:-1] - u_sm[r + 1, 1:-1]) / max(1.0, dy_m)
                vort[r, 1:-1] = dv_dx - du_dy

            vort_sm = _smooth_2d(np.maximum(0.0, vort), window=5)

            # Posición esperada basada en inercia de 3 horas
            if idx == 0:
                pred_lat, pred_lon = cur_lat, cur_lon
            elif idx == 1:
                if initial_dir_deg is not None and initial_speed_kts is not None and initial_speed_kts > 0:
                    rad = math.radians(initial_dir_deg)
                    dist_nm = initial_speed_kts * 3.0
                    dist_deg = (dist_nm * 1.852) / 111.0
                    pred_lat = cur_lat + dist_deg * math.cos(rad)
                    pred_lon = cur_lon + dist_deg * math.sin(rad) / max(0.2, math.cos(math.radians(cur_lat)))
                else:
                    pred_lat = cur_lat + (cur_lat - prev_lat)
                    pred_lon = cur_lon + (cur_lon - prev_lon)
            else:
                # Vector de velocidad instantánea por paso de 3 horas
                v_lat = (cur_lat - prev_lat) / 3.0
                v_lon = (cur_lon - prev_lon) / 3.0
                pred_lat = cur_lat + v_lat * 3.0
                pred_lon = cur_lon + v_lon * 3.0

            r_pred = int(round((la1 - pred_lat) / dy))
            c_pred = int(round((pred_lon - lo1) / dx))

            # Ventana de búsqueda adaptativa (~1.5° alrededor de la proyección)
            search_window = 6
            r_min = max(2, r_pred - search_window)
            r_max = min(ny - 3, r_pred + search_window)
            c_min = max(2, c_pred - search_window)
            c_max = min(nx - 3, c_pred + search_window)

            if r_min >= r_max or c_min >= c_max:
                continue

            best_score = -1e9
            best_r, best_c = r_pred, c_pred

            for r in range(r_min, r_max + 1):
                lat_k = la1 - r * dy
                for c in range(c_min, c_max + 1):
                    lon_k = lo1 + c * dx
                    dist_deg = math.hypot(lat_k - pred_lat, (lon_k - pred_lon) * math.cos(math.radians(lat_k)))
                    dist_penalty = math.exp(-0.5 * (dist_deg / 1.0) ** 2)

                    circ = _compute_circulation(u, v, r, c, radius_grid=4)
                    vort_val = vort_sm[r, c]

                    candidate_score = (vort_val * 1e5 + max(0.0, circ) * 0.5) * dist_penalty
                    if candidate_score > best_score:
                        best_score = candidate_score
                        best_r, best_c = r, c

            # Refinamiento submalla
            patch_scores = np.zeros((3, 3), dtype=float)
            for dr in range(-1, 2):
                for dc in range(-1, 2):
                    rr = best_r + dr
                    cc = best_c + dc
                    if 0 <= rr < ny and 0 <= cc < nx:
                        lat_k = la1 - rr * dy
                        lon_k = lo1 + cc * dx
                        dist_deg = math.hypot(lat_k - pred_lat, (lon_k - pred_lon) * math.cos(math.radians(lat_k)))
                        dist_penalty = math.exp(-0.5 * (dist_deg / 1.0) ** 2)
                        circ = _compute_circulation(u, v, rr, cc, radius_grid=4)
                        patch_scores[dr + 1, dc + 1] = max(
                            0.0, (vort_sm[rr, cc] * 1e5 + max(0.0, circ) * 0.5) * dist_penalty
                        )

            total_patch = float(np.sum(patch_scores))
            if total_patch > 0:
                weights = patch_scores / total_patch
                dr_sub = float(np.sum(weights * np.array([[-1, -1, -1], [0, 0, 0], [1, 1, 1]])))
                dc_sub = float(np.sum(weights * np.array([[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]])))
            else:
                dr_sub, dc_sub = 0.0, 0.0

            sub_r = best_r + dr_sub
            sub_c = best_c + dc_sub

            vortex_lat = round(float(la1 - sub_r * dy), 2)
            vortex_lon = round(float(lo1 + sub_c * dx), 2)

            eye_radius = 5
            r_eye_min = max(0, best_r - eye_radius)
            r_eye_max = min(ny, best_r + eye_radius + 1)
            c_eye_min = max(0, best_c - eye_radius)
            c_eye_max = min(nx, best_c + eye_radius + 1)

            max_wind = float(np.max(wind_speed_kt[r_eye_min:r_eye_max, c_eye_min:c_eye_max]))
            circ_center = _compute_circulation(u, v, best_r, best_c, radius_grid=4)

            step_dt = ref_dt + timedelta(hours=fh)
            date_str = f"{step_dt.strftime('%d/%H00Z')}"

            # Evaluación de disipación ciclónica:
            # 1. Sobre tierra continental (is_land): tras el impacto en tierra (idx >= 6), si el viento decae < 35 kt
            #    o la circulación colapsa (< 5.0), el ciclón se declara disipado en tierra (criterio oficial NHC/SMN).
            # 2. Sobre mar: si el viento decae < 20 kt o la circulación se vuelve negativa.
            from global_land_mask import globe
            is_over_land = bool(globe.is_land(vortex_lat, vortex_lon))
            is_dissipated_low = False

            if is_over_land and idx >= 6:
                if max_wind < 35.0 or circ_center < 5.0:
                    is_dissipated_low = True
            elif not is_over_land and idx >= 6:
                if max_wind < 20.0 or (max_wind < 25.0 and circ_center <= 0.0):
                    is_dissipated_low = True

            cat_info = get_sshws_category(max_wind)
            if is_dissipated_low:
                cat_info = {
                    "code": "REM",
                    "label": "Baja Remanente / Disipado en Tierra",
                    "name": "Baja Remanente",
                    "category": 0,
                    "color": "#94a3b8",
                }

            raw_track.append({
                "hours_ahead": fh,
                "date_str": date_str,
                "lat": vortex_lat,
                "lon": vortex_lon,
                "wind_kts": round(max_wind, 1),
                "pressure_hpa": None,
                "cat_info": cat_info,
                "model": "GFS",
            })

            # Concluir de forma limpia en el punto de disipación
            if is_dissipated_low:
                logger.info(
                    "Ciclón GFS disipado a las +%sh (%s kt, circ=%s, tierra=%s). Finalizando pronóstico.",
                    fh,
                    round(max_wind, 1),
                    round(circ_center, 1),
                    is_over_land,
                )
                break

            prev_lat, prev_lon = cur_lat, cur_lon
            cur_lat, cur_lon = vortex_lat, vortex_lon

        except Exception as e:
            logger.warning(f"Error procesando paso GFS f{fh:03d} para vórtice: {e}")
            continue

    if not raw_track:
        return None

    # Muestreo a intervalos de 6 horas para los waypoints
    sampled_track = [pt for pt in raw_track if pt["hours_ahead"] % 6 == 0]
    if raw_track and (not sampled_track or raw_track[-1]["hours_ahead"] != sampled_track[-1]["hours_ahead"]):
        sampled_track.append(raw_track[-1])

    # Suavizado cinemático
    final_track = _smooth_trajectory_points(sampled_track)
    cone = generate_cone_polygon(final_track)

    return {
        "model_id": "GFS",
        "name": "GFS 0.25° (Numérico SIAE)",
        "short_name": "GFS Numérico",
        "source_desc": "Cálculo de vórtice numérico sobre campos de viento GFS procesados en el SIAE",
        "color": "#0284c7",
        "forecast_track": final_track,
        "cone_polygon": cone,
    }


