"""
SIAE — Schemas del módulo de Meteorología.
"""
from pydantic import BaseModel


class WeatherStatusResponse(BaseModel):
    available: bool
    run_date: str | None = None
    run_hour: str | None = None
    wind_hours: list[int] = []
    wave_hours: list[int] = []
    # Bounds Leaflet de cada malla: [[lat_sur, lon_oeste], [lat_norte, lon_este]]
    wind_bbox: list[list[float]] | None = None
    wave_bbox: list[list[float]] | None = None
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


class WeatherPointForecastResponse(BaseModel):
    lat: float
    lon: float
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
