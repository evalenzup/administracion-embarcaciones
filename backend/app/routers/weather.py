"""
SIAE — Router de Meteorología.
Sirve pronósticos de viento y oleaje (GFS/WaveWatch III) procesados por el
pipeline de descarga. El frontend consume únicamente estos endpoints, nunca
NOMADS directamente.
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, require_permission
from app.models.tide import TidePrediction, TideStation
from app.models.ema import EmaStation, EmaMeasurement
from app.models.user import User
from app.schemas.weather import (
    TideSeriesResponse,
    TideStationResponse,
    TideWindowItem,
    TideWindowsResponse,
    WeatherPointForecastResponse,
    WeatherStatusResponse,
    EmaStationResponse,
    EmaMeasurementResponse,
    RouteForecastRequest,
    RouteForecastResponse,
)
from app.services import weather_processor, weather_query, cyclone_tracker, enso_tracker, weather_ecmwf
from app.services.weather_scheduler import run_pipeline_if_new_run

logger = logging.getLogger("siae.weather")

router = APIRouter(prefix="/api/v1/weather", tags=["Meteorología"])


@router.get("/status", response_model=WeatherStatusResponse)
async def get_status():
    """Estado de la corrida meteorológica activa (viento/oleaje/temperatura GFS-WW3)."""
    manifest = weather_processor.get_latest_manifest()
    if manifest is None:
        return WeatherStatusResponse(available=False)

    processed_at = manifest.get("processed_at")
    hours_since_update = None
    if processed_at:
        try:
            dt = datetime.fromisoformat(processed_at)
            hours_since_update = round((datetime.now(timezone.utc) - dt).total_seconds() / 3600, 1)
        except ValueError:
            pass

    return WeatherStatusResponse(
        available=True,
        run_date=manifest.get("run_date"),
        run_hour=manifest.get("run_hour"),
        wind_hours=manifest.get("wind_hours", []),
        temp_hours=manifest.get("temp_hours", []),
        precip_hours=manifest.get("precip_hours", []),
        wave_hours=manifest.get("wave_hours", []),
        wind_bbox=manifest.get("wind_bbox"),
        wave_bbox=manifest.get("wave_bbox"),
        temp_bbox=manifest.get("temp_bbox") or manifest.get("wind_bbox"),
        precip_bbox=manifest.get("precip_bbox") or manifest.get("wind_bbox"),
        processed_at=processed_at,
        hours_since_update=hours_since_update,
    )


@router.get("/wind")
async def get_wind(
    hour: int = Query(..., description="Hora de pronóstico (0, 3, 6, ...)"),
    model: str = Query("gfs", description="Modelo meteorológico ('gfs' o 'ecmwf')"),
):
    """Malla de viento (formato leaflet-velocity) de la corrida más reciente para la hora dada."""
    if model.lower() == "ecmwf":
        data = await weather_ecmwf.get_or_fetch_ecmwf_wind(hour)
        if data is not None:
            return data

    manifest = weather_processor.get_latest_manifest()
    if manifest is None:
        raise HTTPException(status_code=404, detail="No hay datos meteorológicos disponibles todavía")

    data = weather_processor.load_wind_json(manifest["run_date"], manifest["run_hour"], hour)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No hay datos de viento para la hora de pronóstico {hour}")
    return data


@router.get("/temp")
async def get_temp(
    hour: int = Query(..., description="Hora de pronóstico (0, 3, 6, ...)"),
    model: str = Query("gfs", description="Modelo meteorológico ('gfs' o 'ecmwf')"),
):
    """Malla de temperatura superficial del mar y aire de la corrida más reciente para la hora dada."""
    if model.lower() == "ecmwf":
        data = await weather_ecmwf.get_or_fetch_ecmwf_temp_json(hour)
        if data is not None:
            return data

    manifest = weather_processor.get_latest_manifest()
    if manifest is None:
        raise HTTPException(status_code=404, detail="No hay datos meteorológicos disponibles todavía")

    data = weather_processor.load_temp_json(manifest["run_date"], manifest["run_hour"], hour)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No hay datos de temperatura para la hora de pronóstico {hour}")
    return data


@router.get("/precip")
async def get_precip(
    hour: int = Query(..., description="Hora de pronóstico (0, 1, 2, ...)"),
    model: str = Query("gfs", description="Modelo meteorológico ('gfs' o 'ecmwf')"),
):
    """Malla escalar de tasa de precipitación (mm/h) y acumulación (mm) para la hora dada."""
    if model.lower() == "ecmwf":
        data = await weather_ecmwf.get_or_fetch_ecmwf_precip_json(hour)
        if data is not None:
            return data

    manifest = weather_processor.get_latest_manifest()
    if manifest is None:
        raise HTTPException(status_code=404, detail="No hay datos meteorológicos disponibles todavía")

    data = weather_processor.load_precip_json(manifest["run_date"], manifest["run_hour"], hour)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No hay datos de precipitación para la hora de pronóstico {hour}")
    return data


@router.get("/precip-image")
async def get_precip_image(
    hour: int = Query(..., description="Hora de pronóstico (0, 1, 2, ...)"),
    model: str = Query("gfs", description="Modelo meteorológico ('gfs' o 'ecmwf')"),
):
    """
    PNG radar de precipitación / lluvia sobremuestreado,
    para montarse como imageOverlay con los bounds `precip_bbox` de /weather/status.
    """
    from fastapi.responses import FileResponse

    if model.lower() == "ecmwf":
        path = await weather_ecmwf.get_or_fetch_ecmwf_precip_image_path(hour)
        if path is not None and path.exists():
            return FileResponse(path, media_type="image/png")

    manifest = weather_processor.get_latest_manifest()
    if manifest is None:
        raise HTTPException(status_code=404, detail="No hay datos meteorológicos disponibles todavía")

    path = weather_processor.precip_png_path(manifest["run_date"], manifest["run_hour"], hour)
    if path is None:
        raise HTTPException(status_code=404, detail=f"No hay imagen de precipitación para la hora de pronóstico {hour}")
    return FileResponse(path, media_type="image/png")


@router.get("/temp-image")
async def get_temp_image(
    hour: int = Query(..., description="Hora de pronóstico (0, 3, 6, ...)"),
    model: str = Query("gfs", description="Modelo meteorológico ('gfs' o 'ecmwf')"),
):
    """
    PNG térmico de Temperatura Superficial del Mar (TSM) sobremuestreado,
    para montarse como imageOverlay con los bounds `temp_bbox` de /weather/status.
    """
    from fastapi.responses import FileResponse

    if model.lower() == "ecmwf":
        path = await weather_ecmwf.get_or_fetch_ecmwf_temp_image_path(hour)
        if path is not None and path.exists():
            return FileResponse(path, media_type="image/png")

    manifest = weather_processor.get_latest_manifest()
    if manifest is None:
        raise HTTPException(status_code=404, detail="No hay datos meteorológicos disponibles todavía")

    path = weather_processor.temp_png_path(manifest["run_date"], manifest["run_hour"], hour)
    if path is None:
        raise HTTPException(status_code=404, detail=f"No hay imagen de temperatura para la hora de pronóstico {hour}")
    return FileResponse(path, media_type="image/png")


@router.get("/air-temp-image")
async def get_air_temp_image(
    hour: int = Query(..., description="Hora de pronóstico (0, 3, 6, ...)"),
    model: str = Query("gfs", description="Modelo meteorológico ('gfs' o 'ecmwf')"),
):
    """
    PNG térmico de Temperatura del Aire a 2m sobremuestreado continuo (mar y tierra).
    """
    from fastapi.responses import FileResponse

    if model.lower() == "ecmwf":
        path = await weather_ecmwf.get_or_fetch_ecmwf_air_temp_image_path(hour)
        if path is not None and path.exists():
            return FileResponse(path, media_type="image/png")

    manifest = weather_processor.get_latest_manifest()
    if manifest is None:
        raise HTTPException(status_code=404, detail="No hay datos meteorológicos disponibles todavía")

    path = weather_processor.air_temp_png_path(manifest["run_date"], manifest["run_hour"], hour)
    if path is None:
        raise HTTPException(status_code=404, detail=f"No hay imagen de temperatura del aire para la hora de pronóstico {hour}")
    return FileResponse(path, media_type="image/png")


@router.get("/enso/status")
async def get_enso_status():
    """
    Estado actual y series históricas del fenómeno El Niño / Oscilación del Sur (ENSO)
    según índices oficiales semanales de la NOAA Climate Prediction Center (CPC).
    """
    try:
        data = await enso_tracker.fetch_enso_data()
        return data
    except Exception as exc:
        logger.exception("Error al consultar estado ENSO: %s", exc)
        raise HTTPException(status_code=500, detail="Error al consultar estado del fenómeno ENSO")


@router.get("/waves")
async def get_waves(
    hour: int = Query(..., description="Hora de pronóstico (0, 3, 6, ...)"),
):
    """Malla de oleaje (altura, periodo, dirección) de la corrida más reciente para la hora dada."""
    manifest = weather_processor.get_latest_manifest()
    if manifest is None:
        raise HTTPException(status_code=404, detail="No hay datos meteorológicos disponibles todavía")

    data = weather_processor.load_waves_json(manifest["run_date"], manifest["run_hour"], hour)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No hay datos de oleaje para la hora de pronóstico {hour}")
    return data


@router.get("/wind-image")
async def get_wind_image(
    hour: int = Query(..., description="Hora de pronóstico (0, 3, 6, ...)"),
    model: str = Query("gfs", description="Modelo meteorológico ('gfs' o 'ecmwf')"),
):
    """
    PNG de velocidad de viento sobremuestreado (paleta estilo Windy, sin
    máscara de costa — el viento es válido sobre tierra), para montarse como
    imageOverlay con los bounds `wind_bbox` de /weather/status.
    """
    from fastapi.responses import FileResponse

    if model.lower() == "ecmwf":
        path = await weather_ecmwf.get_or_fetch_ecmwf_wind_image_path(hour)
        if path is not None and path.exists():
            return FileResponse(path, media_type="image/png")

    manifest = weather_processor.get_latest_manifest()
    if manifest is None:
        raise HTTPException(status_code=404, detail="No hay datos meteorológicos disponibles todavía")

    path = weather_processor.wind_png_path(manifest["run_date"], manifest["run_hour"], hour)
    if path is None:
        raise HTTPException(status_code=404, detail=f"No hay imagen de viento para la hora de pronóstico {hour}")
    return FileResponse(path, media_type="image/png")


@router.get("/waves-velocity")
async def get_waves_velocity(
    hour: int = Query(..., description="Hora de pronóstico (0, 3, 6, ...)"),
):
    """
    Campo U/V sintético (formato leaflet-velocity) para animar partículas en
    la dirección de propagación del oleaje. Magnitud = altura de ola (m).
    """
    manifest = weather_processor.get_latest_manifest()
    if manifest is None:
        raise HTTPException(status_code=404, detail="No hay datos meteorológicos disponibles todavía")

    data = weather_processor.load_waves_velocity_json(manifest["run_date"], manifest["run_hour"], hour)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No hay animación de oleaje para la hora de pronóstico {hour}")
    return data


@router.get("/waves-image")
async def get_waves_image(
    hour: int = Query(..., description="Hora de pronóstico (0, 3, 6, ...)"),
):
    """
    PNG de altura de ola sobremuestreado (~2.7 km/píxel) y enmascarado por
    línea de costa real, listo para montarse como imageOverlay en Leaflet
    con los bounds `wave_bbox` de /weather/status.
    """
    from fastapi.responses import FileResponse

    manifest = weather_processor.get_latest_manifest()
    if manifest is None:
        raise HTTPException(status_code=404, detail="No hay datos meteorológicos disponibles todavía")

    path = weather_processor.waves_png_path(manifest["run_date"], manifest["run_hour"], hour)
    if path is None:
        raise HTTPException(status_code=404, detail=f"No hay imagen de oleaje para la hora de pronóstico {hour}")
    return FileResponse(path, media_type="image/png")


@router.get("/point", response_model=WeatherPointForecastResponse)
async def get_point_forecast(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    model: str = Query("gfs", description="Modelo meteorológico: 'gfs' o 'ecmwf'"),
):
    """Serie temporal de pronóstico (viento, ráfaga, oleaje) interpolada en un punto."""
    forecast, model_name = weather_query.get_point_forecast(lat, lon, model=model)
    if not forecast:
        raise HTTPException(
            status_code=404,
            detail="No hay datos meteorológicos disponibles para este punto todavía",
        )
    return WeatherPointForecastResponse(lat=lat, lon=lon, model_name=model_name, forecast=forecast)


@router.post("/route-forecast", response_model=RouteForecastResponse)
async def get_route_forecast(req: RouteForecastRequest):
    """
    Calcula la cronología de navegación de una ruta planificada (distancias, tiempos de tránsito,
    ETAs y ETDs a cada estación) e interpola las variables meteorológicas (viento, oleaje, etc.)
    en el momento de arribo estimado a cada punto según la corrida activa de GFS/WW3.
    """
    res = weather_query.calculate_route_forecast(req.model_dump())
    return res


@router.post("/refresh", response_model=WeatherStatusResponse)
async def refresh(
    current_user: User = Depends(require_permission("weather", "refresh")),
):
    """Dispara manualmente la descarga/procesamiento de la corrida más reciente (solo admin)."""
    manifest = await run_pipeline_if_new_run()
    if manifest is None:
        manifest = weather_processor.get_latest_manifest()
    if manifest is None:
        raise HTTPException(status_code=503, detail="No se pudo obtener ninguna corrida meteorológica")

    return WeatherStatusResponse(
        available=True,
        run_date=manifest.get("run_date"),
        run_hour=manifest.get("run_hour"),
        wind_hours=manifest.get("wind_hours", []),
        wave_hours=manifest.get("wave_hours", []),
        processed_at=manifest.get("processed_at"),
    )


# ── Mareas (predicciones red mareográfica CICESE) ─────────────

def _get_station(db: Session, code: str) -> TideStation:
    station = db.query(TideStation).filter(TideStation.code == code.upper()).first()
    if station is None:
        raise HTTPException(status_code=404, detail=f"Estación de marea '{code}' no encontrada")
    return station


@router.get("/tides/stations", response_model=list[TideStationResponse])
async def list_tide_stations(
    db: Session = Depends(get_db),
):
    """Estaciones mareográficas con predicciones ingeridas."""
    return db.query(TideStation).order_by(TideStation.name).all()


@router.get("/tides", response_model=TideSeriesResponse)
async def get_tide_series(
    station: str = Query(..., description="Código de estación, ej. ENS"),
    start: datetime = Query(..., description="Inicio (ISO, UTC si no trae zona)"),
    end: datetime = Query(..., description="Fin (ISO)"),
    db: Session = Depends(get_db),
):
    """Serie horaria de altura de marea (m sobre Bajamar Media Inferior)."""
    st = _get_station(db, station)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    rows = (
        db.query(TidePrediction)
        .filter(
            TidePrediction.station_id == st.id,
            TidePrediction.timestamp >= start,
            TidePrediction.timestamp <= end,
        )
        .order_by(TidePrediction.timestamp)
        .all()
    )
    return TideSeriesResponse(
        station=st,
        series=[{"time": r.timestamp.isoformat(), "height_m": r.height_m} for r in rows],
    )


@router.get("/tides/windows", response_model=TideWindowsResponse)
async def get_tide_windows(
    station: str = Query(..., description="Código de estación, ej. ENS"),
    min_height_m: float = Query(..., description="Marea mínima requerida (m sobre MLLW)"),
    start: datetime = Query(...),
    end: datetime = Query(...),
    db: Session = Depends(get_db),
):
    """
    Ventanas de operación: intervalos donde la marea ≥ min_height_m.
    Los cruces del umbral se interpolan linealmente entre las muestras
    horarias (precisión ~minutos, suficiente para planeación).
    """
    st = _get_station(db, station)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    rows = (
        db.query(TidePrediction.timestamp, TidePrediction.height_m)
        .filter(
            TidePrediction.station_id == st.id,
            TidePrediction.timestamp >= start,
            TidePrediction.timestamp <= end,
        )
        .order_by(TidePrediction.timestamp)
        .all()
    )

    windows: list[TideWindowItem] = []
    open_start = None
    prev = None
    for ts, h in rows:
        if prev is not None:
            pts, ph = prev
            # Cruce ascendente del umbral: interpolar el instante exacto
            if ph < min_height_m <= h and open_start is None:
                frac = (min_height_m - ph) / (h - ph)
                open_start = pts + (ts - pts) * frac
            # Cruce descendente: cerrar ventana
            elif h < min_height_m <= ph and open_start is not None:
                frac = (ph - min_height_m) / (ph - h)
                w_end = pts + (ts - pts) * frac
                windows.append(TideWindowItem(
                    start=open_start.isoformat(), end=w_end.isoformat(),
                    duration_hours=round((w_end - open_start).total_seconds() / 3600, 1),
                ))
                open_start = None
        elif h >= min_height_m:
            open_start = ts  # la serie ya arranca por encima del umbral
        prev = (ts, h)

    if open_start is not None and prev is not None:
        w_end = prev[0]
        windows.append(TideWindowItem(
            start=open_start.isoformat(), end=w_end.isoformat(),
            duration_hours=round((w_end - open_start).total_seconds() / 3600, 1),
        ))

    return TideWindowsResponse(station=st, min_height_m=min_height_m, windows=windows)


@router.post("/tides/refresh", response_model=list[TideStationResponse])
async def refresh_tides(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("weather", "refresh")),
):
    """Re-ingesta manual de las predicciones de marea (solo admin)."""
    from app.services.tide_ingester import ingest_missing

    await ingest_missing(db)
    return db.query(TideStation).order_by(TideStation.name).all()


# ── Estaciones Automáticas SMN (EMA) Endpoints ────────────────

@router.get("/smn/stations", response_model=list[EmaStationResponse])
async def list_ema_stations(
    db: Session = Depends(get_db),
):
    """Obtiene el listado completo de estaciones automáticas del SMN."""
    return db.query(EmaStation).order_by(EmaStation.state, EmaStation.name).all()


@router.get("/smn/stations/{id}/history", response_model=list[EmaMeasurementResponse])
async def get_ema_history(
    id: int,
    range: str = Query("24h", description="Rango de tiempo: 24h, 1w, 30d, 90d"),
    db: Session = Depends(get_db),
):
    """Obtiene el historial de mediciones de una estación del SMN para un rango de tiempo dado."""
    station = db.query(EmaStation).filter(EmaStation.id == id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Estación EMA no encontrada")
        
    now = datetime.now(timezone.utc)
    if range == "24h":
        start_time = now - timedelta(hours=24)
    elif range == "1w":
        start_time = now - timedelta(days=7)
    elif range == "30d":
        start_time = now - timedelta(days=30)
    elif range == "90d":
        start_time = now - timedelta(days=90)
    else:
        start_time = now - timedelta(hours=24)
        
    rows = (
        db.query(EmaMeasurement)
        .filter(EmaMeasurement.station_id == id, EmaMeasurement.timestamp >= start_time)
        .order_by(EmaMeasurement.timestamp.asc())
        .all()
    )
    
    return [
        EmaMeasurementResponse(
            time=r.timestamp.isoformat(),
            temperature=r.temperature,
            precipitation=r.precipitation,
            humidity=r.humidity,
            pressure=r.pressure,
            solar_radiation=r.solar_radiation,
            wind_direction=r.wind_direction,
            wind_speed=r.wind_speed,
            gust_direction=r.gust_direction,
            gust_speed=r.gust_speed
        )
        for r in rows
    ]


# ── Huracanes y Ciclones Tropicales (Windy-style Tracker) ──────

@router.get("/hurricanes/active")
async def get_active_hurricanes():
    """
    Retorna la lista de ciclones y tormentas tropicales activas (NOAA NHC)
    junto con ciclones históricos emblemáticos de México para demostración.
    """
    try:
        storms = await cyclone_tracker.get_active_cyclones_list()
        return {"storms": storms, "total": len(storms)}
    except Exception as e:
        logger.exception("Error al consultar ciclones activos: %s", e)
        raise HTTPException(status_code=500, detail="Error al consultar ciclones activos")


@router.get("/hurricanes/{storm_id}/track")
async def get_hurricane_track(storm_id: str):
    """
    Retorna la información completa de trayectoria, cono de incertidumbre y los 3
    modelos de probabilidad (NHC, ECMWF, UKM) para un ciclón específico.
    """
    try:
        track_data = await cyclone_tracker.get_cyclone_track_details(storm_id)
        if not track_data:
            raise HTTPException(status_code=404, detail=f"Ciclón con ID '{storm_id}' no encontrado")
        return track_data
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error al consultar trayectoria del ciclón %s: %s", storm_id, e)
        raise HTTPException(status_code=500, detail="Error al procesar trayectoria del ciclón")

