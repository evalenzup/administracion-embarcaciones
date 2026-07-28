"""
SIAE — Procesamiento de GRIB2 a JSON para el módulo de meteorología.

Convierte los GRIB2 descargados de GFS (viento) y WW3 (oleaje) al formato
que consume leaflet-velocity (viento) y a mallas escalares simples (oleaje).
"""
import json
import logging
import math
from pathlib import Path

import numpy as np
import xarray as xr
from global_land_mask import globe

logger = logging.getLogger("siae.weather")

PROCESSED_DIR = Path(__file__).resolve().parent.parent.parent / "weather_data" / "processed"

MS_TO_KNOTS = 1.9438


def _normalize_lon(lon: np.ndarray) -> np.ndarray:
    """Convierte longitudes de convención 0-360 (GFS) a -180/180."""
    return np.where(lon > 180, lon - 360, lon)


def _sort_north_to_south(ds: xr.Dataset, lat_name: str = "latitude") -> xr.Dataset:
    """leaflet-velocity espera la fila 0 = norte (la1 = latitud máxima)."""
    if ds[lat_name].values[0] < ds[lat_name].values[-1]:
        ds = ds.sortby(lat_name, ascending=False)
    return ds


def grib_to_velocity_json(grib_path: Path, forecast_hour: int) -> dict:
    """
    Lee un GRIB2 de viento GFS (UGRD/VGRD a 10m) y produce el formato
    leaflet-velocity: lista de 2 objetos (componente U y V).
    """
    ds_u = xr.open_dataset(
        grib_path, engine="cfgrib",
        backend_kwargs={"filter_by_keys": {"shortName": "10u"}, "indexpath": ""},
    )
    ds_v = xr.open_dataset(
        grib_path, engine="cfgrib",
        backend_kwargs={"filter_by_keys": {"shortName": "10v"}, "indexpath": ""},
    )

    ds_u = _sort_north_to_south(ds_u)
    ds_v = _sort_north_to_south(ds_v)

    lats = ds_u.latitude.values
    lons = _normalize_lon(ds_u.longitude.values)

    u_vals = ds_u["u10"].values
    v_vals = ds_v["v10"].values

    ref_time = str(ds_u.time.values) if "time" in ds_u.coords else None

    ny, nx = u_vals.shape
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
        "forecastTime": forecast_hour,
    }

    u_flat = np.nan_to_num(u_vals, nan=0.0).flatten().round(2).tolist()
    v_flat = np.nan_to_num(v_vals, nan=0.0).flatten().round(2).tolist()

    result = [
        {
            "header": {**header_common, "parameterCategory": 2, "parameterNumber": 2},
            "data": u_flat,
        },
        {
            "header": {**header_common, "parameterCategory": 2, "parameterNumber": 3},
            "data": v_flat,
        },
    ]

    ds_u.close()
    ds_v.close()
    return result


def _land_mask(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """
    Máscara tierra/agua de alta resolución (~1 km, GSHHG vía global-land-mask),
    independiente de la bandera nativa del modelo. WW3 a 0.25° (~27 km/celda)
    a veces cuenta lagos/presas grandes de tierra firme como si fueran mar
    (ver PLAN_MODULO_METEOROLOGIA.md, hallazgo de Fase 2). Solo se usa para
    OLEAJE — viento/ráfaga sí son válidos y significativos sobre tierra, no
    se les aplica esta máscara.
    """
    lon_grid, lat_grid = np.meshgrid(lons, lats)
    return globe.is_land(lat_grid, lon_grid)


def _grid_from_values(values: np.ndarray, land_mask: np.ndarray | None = None) -> list:
    if land_mask is not None:
        values = np.where(land_mask, np.nan, values)
    flat = values.flatten()
    return [None if (v is None or math.isnan(v)) else round(float(v), 2) for v in flat]


def grib_waves_to_grid_json(grib_path: Path, forecast_hour: int) -> dict:
    """
    Lee un GRIB2 de oleaje WW3 (HTSGW/PERPW/DIRPW) y produce mallas escalares de
    altura significativa, periodo y dirección de ola, con null en tierra (NaN).

    Nota: se agrupan las tres variables en un solo archivo (en vez de uno por
    variable) porque el punto de consulta (`/weather/point`) necesita las tres
    para cada hora, y separar en 3 archivos por hora tripilcaría los reads sin
    beneficio real. La capa de mapa (Fase 2) solo usará el campo "height".
    """
    ds_h = xr.open_dataset(
        grib_path, engine="cfgrib",
        backend_kwargs={"filter_by_keys": {"shortName": "swh"}, "indexpath": ""},
    )
    ds_p = xr.open_dataset(
        grib_path, engine="cfgrib",
        backend_kwargs={"filter_by_keys": {"shortName": "perpw"}, "indexpath": ""},
    )
    ds_d = xr.open_dataset(
        grib_path, engine="cfgrib",
        backend_kwargs={"filter_by_keys": {"shortName": "dirpw"}, "indexpath": ""},
    )

    ds_h = _sort_north_to_south(ds_h)
    ds_p = _sort_north_to_south(ds_p)
    ds_d = _sort_north_to_south(ds_d)

    lats = ds_h.latitude.values
    lons = _normalize_lon(ds_h.longitude.values)
    ref_time = str(ds_h.time.values) if "time" in ds_h.coords else None
    ny, nx = ds_h["swh"].values.shape

    header = {
        "lo1": float(lons[0]),
        "la1": float(lats[0]),
        "lo2": float(lons[-1]),
        "la2": float(lats[-1]),
        "dx": float(abs(lons[1] - lons[0])) if nx > 1 else 0.25,
        "dy": float(abs(lats[1] - lats[0])) if ny > 1 else 0.25,
        "nx": int(nx),
        "ny": int(ny),
        "refTime": ref_time,
        "forecastTime": forecast_hour,
    }

    land = _land_mask(lats, lons)
    result = {
        "header": header,
        "height": _grid_from_values(ds_h["swh"].values, land),
        "period": _grid_from_values(ds_p["perpw"].values, land),
        "direction": _grid_from_values(ds_d["dirpw"].values, land),
    }

    ds_h.close()
    ds_p.close()
    ds_d.close()
    return result


def grib_gust_to_grid_json(grib_path: Path, forecast_hour: int) -> dict:
    """Lee la ráfaga de superficie (GUST) del GRIB2 de viento GFS como malla escalar."""
    ds = xr.open_dataset(
        grib_path, engine="cfgrib",
        backend_kwargs={"filter_by_keys": {"shortName": "gust"}, "indexpath": ""},
    )
    ds = _sort_north_to_south(ds)

    lats = ds.latitude.values
    lons = _normalize_lon(ds.longitude.values)
    values = ds["gust"].values
    ref_time = str(ds.time.values) if "time" in ds.coords else None
    ny, nx = values.shape

    header = {
        "lo1": float(lons[0]),
        "la1": float(lats[0]),
        "lo2": float(lons[-1]),
        "la2": float(lats[-1]),
        "dx": float(abs(lons[1] - lons[0])) if nx > 1 else 0.25,
        "dy": float(abs(lats[1] - lats[0])) if ny > 1 else 0.25,
        "nx": int(nx),
        "ny": int(ny),
        "refTime": ref_time,
        "forecastTime": forecast_hour,
    }

    ds.close()
    return {"header": header, "data": _grid_from_values(values)}


# ── Renderizado de PNG de oleaje (alta resolución, enmascarado por costa) ──
#
# Dibujar la malla cruda de 0.25° (~68×65 px) estirada en el mapa hace que
# cada celda de ~27 km se difumine sobre la costa ("sangrado" del color hacia
# tierra). El enfoque correcto (mismo que usa Windy) es: sobremuestrear la
# malla con interpolación bilineal a una resolución mucho más fina y aplicar
# la máscara de costa de ~1 km POR PÍXEL, de modo que el color corte
# exactamente en la línea de costa real. El backend genera el PNG una sola
# vez por corrida/hora; el frontend solo lo monta como imageOverlay.

WAVE_PNG_SCALE = 10  # factor de sobremuestreo: 0.25° → 0.025° (~2.7 km/píxel)
WAVE_PNG_ALPHA = 150  # opacidad del color sobre el mapa base (0-255)
WAVE_PNG_EDGE_FEATHER_PX = 30  # desvanecido del borde del recorte del modelo

# Escala de color azul (calma) → rojo (oleaje fuerte). Debe coincidir
# visualmente con la leyenda del frontend (WaveOverlay.jsx).
WAVE_MAX_M = 4.0
WAVE_COLOR_STOPS = [
    (0.00, (33, 102, 172)),
    (0.25, (103, 169, 207)),
    (0.50, (255, 237, 160)),
    (0.75, (253, 141, 60)),
    (1.00, (178, 24, 43)),
]


# Celdas de malla (0.25° ≈ 27 km) hasta las que se permite EXTRAPOLAR el
# oleaje hacia zonas que el modelo global enmascara como tierra pero que la
# máscara de costa fina reconoce como agua — típicamente bahías angostas
# (Ensenada, Todos Santos). El valor extrapolado es el oleaje de mar abierto
# más cercano "copiado" hacia adentro: ignora el abrigo real de la bahía
# (refracción/difracción), por lo que tiende a SOBREESTIMAR — sesgo
# conservador aceptable para planeación. 2 celdas ≈ 55 km máximo.
WAVE_EXTRAP_MAX_CELLS = 2


def _binary_dilate(mask: np.ndarray, iterations: int) -> np.ndarray:
    """Dilatación binaria 4-conectada (sin dependencia de scipy)."""
    out = mask.copy()
    for _ in range(iterations):
        padded = np.pad(out, 1, constant_values=False)
        out = (
            padded[1:-1, 1:-1] | padded[:-2, 1:-1] | padded[2:, 1:-1]
            | padded[1:-1, :-2] | padded[1:-1, 2:]
        )
    return out


def _fill_nan_nearest(arr: np.ndarray, max_iter: int = 30) -> np.ndarray:
    """
    Rellena NaNs iterativamente con el promedio de vecinos válidos (dilatación).
    Los valores rellenados solo se usan para que la interpolación bilineal no
    propague NaN cerca de la costa — la máscara de tierra de alta resolución
    decide después qué píxeles son visibles, así que el relleno nunca se
    muestra sobre tierra real.
    """
    import warnings

    filled = arr.astype(float).copy()
    for _ in range(max_iter):
        nan_mask = np.isnan(filled)
        if not nan_mask.any():
            break
        padded = np.pad(filled, 1, constant_values=np.nan)
        neighbors = np.stack([
            padded[:-2, 1:-1], padded[2:, 1:-1],
            padded[1:-1, :-2], padded[1:-1, 2:],
        ])
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=RuntimeWarning)
            neighbor_mean = np.nanmean(neighbors, axis=0)
        filled[nan_mask] = neighbor_mean[nan_mask]
    return filled


def _mercator_lat_rows(lat_north: float, lat_south: float, n: int) -> np.ndarray:
    """
    Devuelve n latitudes espaciadas uniformemente en Y de Web Mercator
    (no en grados). L.imageOverlay estira la imagen linealmente en
    coordenadas Mercator entre sus bounds; si las filas del PNG fueran
    uniformes en latitud (equirrectangular, como la malla del modelo), la
    imagen quedaría desplazada decenas de km norte-sur en las latitudes
    intermedias del dominio — se notaba como una "máscara movida" respecto
    a la costa. Generar las filas ya en espaciado Mercator elimina el
    desajuste de proyección.
    """
    def merc(lat_deg):
        return np.log(np.tan(np.pi / 4 + np.radians(lat_deg) / 2))

    def inv_merc(y):
        return np.degrees(2 * np.arctan(np.exp(y)) - np.pi / 2)

    y = np.linspace(merc(lat_north), merc(lat_south), n)
    return inv_merc(y)


def _sample_bilinear(arr: np.ndarray, lats: np.ndarray, lons: np.ndarray,
                     lat_pts: np.ndarray, lon_pts: np.ndarray) -> np.ndarray:
    """
    Muestrea bilinealmente la malla `arr` (definida sobre lats descendentes /
    lons ascendentes, uniformes) en las coordenadas lat_pts × lon_pts.
    """
    ny, nx = arr.shape
    dy = lats[0] - lats[1] if ny > 1 else 1.0
    dx = lons[1] - lons[0] if nx > 1 else 1.0

    row_f = np.clip((lats[0] - lat_pts) / dy, 0, ny - 1)
    col_f = np.clip((lon_pts - lons[0]) / dx, 0, nx - 1)

    r0 = np.floor(row_f).astype(int)
    c0 = np.floor(col_f).astype(int)
    r1 = np.clip(r0 + 1, 0, ny - 1)
    c1 = np.clip(c0 + 1, 0, nx - 1)
    fr = (row_f - r0)[:, None]
    fc = (col_f - c0)[None, :]

    top = arr[np.ix_(r0, c0)] * (1 - fc) + arr[np.ix_(r0, c1)] * fc
    bottom = arr[np.ix_(r1, c0)] * (1 - fc) + arr[np.ix_(r1, c1)] * fc
    return top * (1 - fr) + bottom * fr


# Paleta de velocidad de viento estilo Windy (m/s → color). Calma en
# azul-morado, brisa en verdes/teal, fuerte en naranjas/rojos, extremo en
# magenta — aproximación de la escala pública de windy.com.
WIND_MAX_MS = 30.0
WIND_COLOR_STOPS = [
    (0.000, (98, 113, 183)),   # 0 m/s
    (0.100, (61, 110, 163)),   # 3
    (0.200, (74, 148, 169)),   # 6
    (0.300, (74, 146, 148)),   # 9
    (0.400, (77, 142, 124)),   # 12
    (0.500, (76, 164, 76)),    # 15
    (0.600, (103, 164, 54)),   # 18
    (0.700, (162, 135, 64)),   # 21
    (0.800, (199, 62, 29)),    # 24
    (0.900, (183, 7, 133)),    # 27
    (1.000, (241, 1, 255)),    # 30+
]
WIND_PNG_ALPHA = 140


def _colormap(values: np.ndarray, stops: list, vmax: float) -> np.ndarray:
    """Mapea valores a RGB interpolando linealmente sobre una lista de stops."""
    t = np.clip(np.nan_to_num(values, nan=0.0) / vmax, 0.0, 1.0)
    stops_t = np.array([s[0] for s in stops])
    rgb = np.zeros((*t.shape, 3), dtype=np.uint8)
    for ch in range(3):
        stops_c = np.array([s[1][ch] for s in stops], dtype=float)
        rgb[..., ch] = np.interp(t, stops_t, stops_c).astype(np.uint8)
    return rgb


def render_wind_png(grib_path: Path, out_path: Path) -> None:
    """
    Genera el PNG de velocidad de viento sobremuestreado, estilo Windy.
    A diferencia del oleaje, NO se aplica máscara de costa: el viento a 10 m
    es una variable válida y significativa también sobre tierra.
    """
    from PIL import Image

    ds_u = xr.open_dataset(
        grib_path, engine="cfgrib",
        backend_kwargs={"filter_by_keys": {"shortName": "10u"}, "indexpath": ""},
    )
    ds_v = xr.open_dataset(
        grib_path, engine="cfgrib",
        backend_kwargs={"filter_by_keys": {"shortName": "10v"}, "indexpath": ""},
    )
    ds_u = _sort_north_to_south(ds_u)
    ds_v = _sort_north_to_south(ds_v)
    lats = ds_u.latitude.values
    lons = _normalize_lon(ds_u.longitude.values)
    speed = np.hypot(ds_u["u10"].values, ds_v["v10"].values)
    ds_u.close()
    ds_v.close()

    ny, nx = speed.shape
    new_ny, new_nx = ny * WAVE_PNG_SCALE, nx * WAVE_PNG_SCALE
    lat_hi = _mercator_lat_rows(lats[0], lats[-1], new_ny)
    lon_hi = np.linspace(lons[0], lons[-1], new_nx)
    hi = _sample_bilinear(np.nan_to_num(speed, nan=0.0), lats, lons, lat_hi, lon_hi)

    alpha = np.full((new_ny, new_nx), WIND_PNG_ALPHA, dtype=float)
    rows = np.arange(new_ny)[:, None]
    cols = np.arange(new_nx)[None, :]
    edge_dist = np.minimum(
        np.minimum(rows, new_ny - 1 - rows),
        np.minimum(cols, new_nx - 1 - cols),
    )
    alpha *= np.clip(edge_dist / WAVE_PNG_EDGE_FEATHER_PX, 0, 1)

    rgba = np.dstack([_colormap(hi, WIND_COLOR_STOPS, WIND_MAX_MS), alpha.astype(np.uint8)])
    Image.fromarray(rgba, mode="RGBA").save(out_path, optimize=True)


def render_waves_png(grib_path: Path, out_path: Path) -> None:
    """Genera el PNG de altura de ola sobremuestreado y enmascarado por costa real."""
    from PIL import Image

    ds = xr.open_dataset(
        grib_path, engine="cfgrib",
        backend_kwargs={"filter_by_keys": {"shortName": "swh"}, "indexpath": ""},
    )
    ds = _sort_north_to_south(ds)
    lats = ds.latitude.values
    lons = _normalize_lon(ds.longitude.values)
    height = ds["swh"].values
    ds.close()

    ny, nx = height.shape
    new_ny, new_nx = ny * WAVE_PNG_SCALE, nx * WAVE_PNG_SCALE

    valid_anywhere = ~np.isnan(height)
    filled = _fill_nan_nearest(height)

    # Filas en espaciado Mercator (ver _mercator_lat_rows) para que la costa
    # no quede desplazada al estirar el PNG en el mapa.
    lat_hi = _mercator_lat_rows(lats[0], lats[-1], new_ny)
    lon_hi = np.linspace(lons[0], lons[-1], new_nx)
    hi = _sample_bilinear(filled, lats, lons, lat_hi, lon_hi)

    lon_grid, lat_grid = np.meshgrid(lon_hi, lat_hi)
    land = globe.is_land(lat_grid, lon_grid)

    # Mostrar datos donde el modelo los tiene, MÁS una franja extrapolada de
    # WAVE_EXTRAP_MAX_CELLS celdas para cubrir bahías que el modelo global
    # enmascara (ver comentario de la constante). Más allá de esa franja
    # (ej. mar fuera del dominio de WW3), transparente aunque sea océano.
    allowed = _binary_dilate(valid_anywhere, WAVE_EXTRAP_MAX_CELLS)
    had_data = _sample_bilinear(allowed.astype(float), lats, lons, lat_hi, lon_hi) > 0.4

    alpha = np.where(land | ~had_data, 0, WAVE_PNG_ALPHA).astype(float)

    # Desvanecer el borde del recorte del modelo para no ver un rectángulo duro
    rows = np.arange(new_ny)[:, None]
    cols = np.arange(new_nx)[None, :]
    edge_dist = np.minimum(
        np.minimum(rows, new_ny - 1 - rows),
        np.minimum(cols, new_nx - 1 - cols),
    )
    alpha *= np.clip(edge_dist / WAVE_PNG_EDGE_FEATHER_PX, 0, 1)

    rgba = np.dstack([_colormap(hi, WAVE_COLOR_STOPS, WAVE_MAX_M), alpha.astype(np.uint8)])
    Image.fromarray(rgba, mode="RGBA").save(out_path, optimize=True)


def waves_velocity_from_grid(wave_json: dict) -> list:
    """
    Sintetiza un campo U/V en formato leaflet-velocity a partir del oleaje,
    para animar partículas en la dirección de PROPAGACIÓN del swell (como la
    capa de olas de Windy). DIRPW usa convención meteorológica (dirección DE
    DONDE viene el oleaje, grados desde el norte, horario), así que el vector
    de propagación es el opuesto. La magnitud es la altura significativa (m):
    las partículas se mueven más rápido donde el mar está más grande. En
    tierra/sin datos el vector es (0, 0) — una partícula sin desplazamiento
    dibuja un trazo de longitud cero, es decir, invisible.
    """
    header = wave_json["header"]
    ny, nx = header["ny"], header["nx"]

    heights = np.array([np.nan if v is None else v for v in wave_json["height"]]).reshape(ny, nx)
    dirs = np.array([np.nan if v is None else v for v in wave_json["direction"]]).reshape(ny, nx)

    # Propagación = opuesto a "viene de": u = -sin(d), v = -cos(d).
    # La dirección se extrapola hacia bahías vía componentes U/V (promediar
    # grados directamente fallaría en el cruce 0°/360°: media(350°,10°)=180°).
    rad = np.radians(dirs)
    u = -heights * np.sin(rad)
    v = -heights * np.cos(rad)

    # Misma franja de extrapolación limitada que el PNG (ver WAVE_EXTRAP_MAX_CELLS)
    valid = ~np.isnan(heights)
    allowed = _binary_dilate(valid, WAVE_EXTRAP_MAX_CELLS)
    u = np.where(allowed, _fill_nan_nearest(u, max_iter=WAVE_EXTRAP_MAX_CELLS), np.nan)
    v = np.where(allowed, _fill_nan_nearest(v, max_iter=WAVE_EXTRAP_MAX_CELLS), np.nan)

    # Tierra/sin datos → (0,0): trazo de longitud cero, invisible
    u_data = [0 if math.isnan(val) else round(float(val), 2) for val in u.flatten()]
    v_data = [0 if math.isnan(val) else round(float(val), 2) for val in v.flatten()]

    return [
        {"header": {**header, "parameterCategory": 2, "parameterNumber": 2}, "data": u_data},
        {"header": {**header, "parameterCategory": 2, "parameterNumber": 3}, "data": v_data},
    ]


def process_run(run_date: str, run_hour: str) -> dict:
    """
    Procesa todos los GRIB descargados de una corrida (viento y oleaje) y
    escribe los JSON resultantes en weather_data/processed/{run_date}{run_hour}/.
    Devuelve el manifest con las horas disponibles.
    """
    from app.services.weather_fetcher import RAW_DIR

    raw_dir = RAW_DIR / f"{run_date}{run_hour}"
    out_dir = PROCESSED_DIR / f"{run_date}{run_hour}"
    out_dir.mkdir(parents=True, exist_ok=True)

    wind_hours: list[int] = []
    gust_hours: list[int] = []
    wave_hours: list[int] = []

    wind_bbox = None
    for grib_path in sorted(raw_dir.glob("wind_f*.grib2")):
        fff = grib_path.stem.replace("wind_f", "")
        fh = int(fff)
        try:
            velocity_json = grib_to_velocity_json(grib_path, fh)
            (out_dir / f"wind_f{fff}.json").write_text(json.dumps(velocity_json))
            render_wind_png(grib_path, out_dir / f"wind_f{fff}.png")
            wind_hours.append(fh)
            if wind_bbox is None:
                h = velocity_json[0]["header"]
                # [[lat_sur, lon_oeste], [lat_norte, lon_este]] — formato bounds de Leaflet
                wind_bbox = [[h["la2"], h["lo1"]], [h["la1"], h["lo2"]]]
        except Exception as exc:
            logger.warning("Error procesando viento f%s de %s%s: %s", fff, run_date, run_hour, exc)

        try:
            gust_json = grib_gust_to_grid_json(grib_path, fh)
            (out_dir / f"gust_f{fff}.json").write_text(json.dumps(gust_json))
            gust_hours.append(fh)
        except Exception as exc:
            logger.warning("Error procesando ráfaga f%s de %s%s: %s", fff, run_date, run_hour, exc)

    wave_bbox = None
    for grib_path in sorted(raw_dir.glob("waves_f*.grib2")):
        fff = grib_path.stem.replace("waves_f", "")
        fh = int(fff)
        try:
            wave_json = grib_waves_to_grid_json(grib_path, fh)
            (out_dir / f"waves_f{fff}.json").write_text(json.dumps(wave_json))
            (out_dir / f"waves_vel_f{fff}.json").write_text(json.dumps(waves_velocity_from_grid(wave_json)))
            render_waves_png(grib_path, out_dir / f"waves_f{fff}.png")
            wave_hours.append(fh)
            if wave_bbox is None:
                h = wave_json["header"]
                # [[lat_sur, lon_oeste], [lat_norte, lon_este]] — formato bounds de Leaflet
                wave_bbox = [[h["la2"], h["lo1"]], [h["la1"], h["lo2"]]]
        except Exception as exc:
            logger.warning("Error procesando oleaje f%s de %s%s: %s", fff, run_date, run_hour, exc)

    manifest = {
        "run_date": run_date,
        "run_hour": run_hour,
        "wind_hours": sorted(wind_hours),
        "gust_hours": sorted(gust_hours),
        "wave_hours": sorted(wave_hours),
        "wind_bbox": wind_bbox,
        "wave_bbox": wave_bbox,
        "processed_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    logger.info(
        "Corrida %s%s procesada: %d horas de viento, %d de oleaje",
        run_date, run_hour, len(wind_hours), len(wave_hours),
    )
    return manifest


def get_latest_manifest() -> dict | None:
    """Devuelve el manifest de la corrida procesada más reciente, o None si no hay ninguna."""
    if not PROCESSED_DIR.exists():
        return None
    run_dirs = sorted(
        [d for d in PROCESSED_DIR.iterdir() if d.is_dir() and (d / "manifest.json").exists()],
        reverse=True,
    )
    if not run_dirs:
        return None
    return json.loads((run_dirs[0] / "manifest.json").read_text())


def load_wind_json(run_date: str, run_hour: str, forecast_hour: int) -> dict | None:
    path = PROCESSED_DIR / f"{run_date}{run_hour}" / f"wind_f{forecast_hour:03d}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def load_gust_json(run_date: str, run_hour: str, forecast_hour: int) -> dict | None:
    path = PROCESSED_DIR / f"{run_date}{run_hour}" / f"gust_f{forecast_hour:03d}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def load_waves_json(run_date: str, run_hour: str, forecast_hour: int) -> dict | None:
    path = PROCESSED_DIR / f"{run_date}{run_hour}" / f"waves_f{forecast_hour:03d}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def waves_png_path(run_date: str, run_hour: str, forecast_hour: int) -> Path | None:
    path = PROCESSED_DIR / f"{run_date}{run_hour}" / f"waves_f{forecast_hour:03d}.png"
    return path if path.exists() else None


def wind_png_path(run_date: str, run_hour: str, forecast_hour: int) -> Path | None:
    path = PROCESSED_DIR / f"{run_date}{run_hour}" / f"wind_f{forecast_hour:03d}.png"
    return path if path.exists() else None


def load_waves_velocity_json(run_date: str, run_hour: str, forecast_hour: int) -> list | None:
    path = PROCESSED_DIR / f"{run_date}{run_hour}" / f"waves_vel_f{forecast_hour:03d}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())
