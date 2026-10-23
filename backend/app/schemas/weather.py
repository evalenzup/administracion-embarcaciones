"""
SIAE — Schemas del módulo de Meteorología.
"""
from pydantic import BaseModel


class WeatherStatusResponse(BaseModel):
    available: bool
    run_date: str | None = None
    run_hour: str | None = None
    wind_hours: list[int] = []
    temp_hours: list[int] = []
    precip_hours: list[int] = []
    wave_hours: list[int] = []
    # Bounds Leaflet de cada malla: [[lat_sur, lon_oeste], [lat_norte, lon_este]]
    wind_bbox: list[list[float]] | None = None
    wave_bbox: list[list[float]] | None = None
    temp_bbox: list[list[float]] | None = None
    precip_bbox: list[list[float]] | None = None
    processed_at: str | None = None
    hours_since_update: float | None = None


class WeatherPointForecastItem(BaseModel):
    time: str
    forecast_hour: int
    wind_speed_kt: float | None = None
    wind_gust_kt: float | None = None
    wind_dir_deg: float | None = None
    wave_height_m: float | None = None
    wave_period_s: float | None = None
    wave_dir_deg: float | None = None
    sea_temp_c: float | None = None
    air_temp_c: float | None = None
    precip_rate_mmh: float | None = None
    precip_accum_mm: float | None = None


class WeatherPointForecastResponse(BaseModel):
    lat: float
    lon: float
    model_name: str | None = "GFS (NOAA 0.25°)"
    forecast: list[WeatherPointForecastItem]


# ── Mareas ────────────────────────────────────────────────────

class TideStationResponse(BaseModel):
    id: int
    code: str
    name: str
    latitude: float | None = None
    longitude: float | None = None
    ingested_years: str

    class Config:
        from_attributes = True


class TidePointItem(BaseModel):
    time: str
    height_m: float


class TideSeriesResponse(BaseModel):
    station: TideStationResponse
    series: list[TidePointItem]


class TideWindowItem(BaseModel):
    start: str
    end: str
    duration_hours: float


class TideWindowsResponse(BaseModel):
    station: TideStationResponse
    min_height_m: float
    windows: list[TideWindowItem]


# ── Estaciones Automáticas SMN (EMA) ──────────────────────────

class EmaStationResponse(BaseModel):
    id: int
    name: str
    state: str
    latitude: float
    longitude: float
    altitude: float | None = None
    installation_date: str | None = None
    smn_name: str

    class Config:
        from_attributes = True


class EmaMeasurementResponse(BaseModel):
    time: str
    temperature: float | None = None
    precipitation: float | None = None
    humidity: float | None = None
    pressure: float | None = None
    solar_radiation: float | None = None
    wind_direction: float | None = None
    wind_speed: float | None = None
    gust_direction: float | None = None
    gust_speed: float | None = None

    class Config:
        from_attributes = True


# ── Ruteo Meteorológico de Cruceros ───────────────────────────

class RouteWaypointInput(BaseModel):
    order_index: int | None = None
    name: str
    latitude: float
    longitude: float
    speed_knots: float | None = None
    duration_hours: float | None = None
    activity: str | None = None


class RouteForecastRequest(BaseModel):
    departure_datetime: str  # ISO string
    default_speed_knots: float = 10.0
    default_duration_hours: float = 1.0
    waypoints: list[RouteWaypointInput]
    model: str = "gfs"  # "gfs" | "ecmwf"


class WaypointForecastOutput(BaseModel):
    order_index: int
    name: str
    latitude: float
    longitude: float
    speed_knots: float
    distance_from_prev_nm: float
    cumulative_distance_nm: float
    transit_time_hours: float
    station_duration_hours: float
    eta: str  # ISO string
    etd: str  # ISO string
    activity: str | None = None

    # Datos meteorológicos interpolados en ETA
    has_weather: bool
    forecast_hour: int | None = None
    weather_time: str | None = None
    wind_speed_kt: float | None = None
    wind_gust_kt: float | None = None
    wind_dir_deg: float | None = None
    wave_height_m: float | None = None
    wave_period_s: float | None = None
    wave_dir_deg: float | None = None
    sea_temp_c: float | None = None
    air_temp_c: float | None = None
    precip_rate_mmh: float | None = None
    beaufort_scale: int | None = None
    beaufort_description: str | None = None

    # Alertas operacionales náuticas
    is_warning: bool = False
    warning_reasons: list[str] = []


class RouteForecastResponse(BaseModel):
    departure_datetime: str
    arrival_datetime: str
    total_distance_nm: float
    total_transit_hours: float
    total_station_hours: float
    total_duration_hours: float
    model_name: str | None = "GFS (NOAA 0.25°)"
    model_run_date: str | None = None
    model_run_hour: str | None = None
    waypoints: list[WaypointForecastOutput]

