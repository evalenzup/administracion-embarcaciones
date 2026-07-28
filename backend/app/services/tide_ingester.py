"""
SIAE — Ingesta de predicciones de marea de la red mareográfica de CICESE.

Fuente: https://redmar.cicese.mx/nmar/PREDCONMAR/{AÑO}/{CODIGO}{AÑO}.TXT
Formato (verificado con ENS2026.TXT, ver PLAN_MODULO_METEOROLOGIA.md Fase 3):
- Encabezado ~13 líneas en Latin-1; la línea "Pronóstico de Mareas ... para :"
  trae nombre y coordenadas en grados y minutos.
- Filas: AÑO MES DÍA HORA MINUTO ALTURA(milímetros sobre MLLW), en UTC
  ("Zona de Tiempo: 0"), cadencia horaria.
"""
import logging
import re
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.models.tide import TidePrediction, TideStation

logger = logging.getLogger("siae.weather")

TIDE_BASE_URL = "https://redmar.cicese.mx/nmar/PREDCONMAR"

# Fallback si el índice del servidor no responde (estaciones núcleo del DEO).
# Normalmente la lista completa se descubre dinámicamente del índice del año
# (ver discover_station_codes), así que estaciones nuevas aparecen solas.
FALLBACK_STATIONS = ["ENS", "SNQ", "SNF"]

_INDEX_LINK_RE = re.compile(r'href="([A-Z0-9]{2,6})(\d{4})\.TXT"')

# La línea del encabezado con nombre y coordenadas, ej:
# "Pronóstico de Mareas (nivel del mar) para : Ensenada, B.C. (31 51 N, 116 37 W)"
# Algunos archivos omiten la coma entre N y la longitud (ej. SZL 2026).
_HEADER_RE = re.compile(
    r"para\s*:\s*(?P<name>.+?)\s*\(\s*(?P<lat_d>\d+)\s+(?P<lat_m>\d+)\s*N[,\s]+(?P<lon_d>\d+)\s+(?P<lon_m>\d+)\s*W"
)
# Fallback solo-nombre para archivos con coordenadas malformadas en origen
_NAME_RE = re.compile(r"para\s*:\s*(?P<name>[^(]+)")

# Coordenadas de respaldo para estaciones cuyo encabezado viene corrupto en la
# fuente (ej. TPL 2026 trae "( 36 N, ...)" — latitud truncada de origen).
KNOWN_COORDS = {
    "TPL": (25.6, -109.05),  # Topolobampo, Sin.
}


def _parse_tide_file(text: str) -> tuple[dict, list[tuple[datetime, float]]]:
    """Devuelve (metadatos de estación, lista de (timestamp UTC, altura_m))."""
    meta = {"name": None, "latitude": None, "longitude": None}
    rows: list[tuple[datetime, float]] = []

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if meta["name"] is None and "para" in stripped:
            m = _HEADER_RE.search(stripped)
            if m:
                meta["name"] = m.group("name").strip()
                meta["latitude"] = round(int(m.group("lat_d")) + int(m.group("lat_m")) / 60, 4)
                # W → longitud negativa
                meta["longitude"] = round(-(int(m.group("lon_d")) + int(m.group("lon_m")) / 60), 4)
            else:
                m = _NAME_RE.search(stripped)
                if m:
                    meta["name"] = m.group("name").strip().rstrip(",")
        if stripped[0].isdigit():
            parts = stripped.split()
            if len(parts) == 6:
                try:
                    year, month, day, hour, minute = (int(p) for p in parts[:5])
                    height_mm = float(parts[5])
                except ValueError:
                    continue
                ts = datetime(year, month, day, hour, minute, tzinfo=timezone.utc)
                rows.append((ts, round(height_mm / 1000, 3)))  # mm → m

    return meta, rows


async def discover_station_codes(year: int) -> list[str]:
    """Descubre los códigos de estación disponibles parseando el índice del
    directorio del año en redmar. Si falla, devuelve el fallback."""
    url = f"{TIDE_BASE_URL}/{year}/"
    try:
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.get(url, timeout=30.0)
            if resp.status_code == 200:
                codes = sorted({m[0] for m in _INDEX_LINK_RE.findall(resp.text) if m[1] == str(year)})
                if codes:
                    return codes
    except httpx.HTTPError as exc:
        logger.warning("No se pudo listar el índice de mareas %s: %s", year, exc)
    return FALLBACK_STATIONS


async def download_tide_file(code: str, year: int) -> str | None:
    """Descarga el TXT anual de una estación. El certificado TLS de redmar no
    valida (cadena incompleta), por eso verify=False — servidor institucional
    conocido, datos públicos de solo lectura."""
    url = f"{TIDE_BASE_URL}/{year}/{code}{year}.TXT"
    try:
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.get(url, timeout=60.0)
            if resp.status_code != 200:
                logger.warning("Marea %s %s no disponible (HTTP %s)", code, year, resp.status_code)
                return None
            return resp.content.decode("latin-1")
    except httpx.HTTPError as exc:
        logger.warning("Error descargando mareas %s %s: %s", code, year, exc)
        return None


def ingest_station_year(db: Session, code: str, year: int, text: str) -> int:
    """
    Parsea e inserta las predicciones de una estación/año. Idempotente:
    borra las predicciones existentes de ese año antes de insertar.
    Devuelve el número de filas insertadas.
    """
    meta, rows = _parse_tide_file(text)
    if not rows:
        logger.warning("Archivo de mareas %s %s sin filas parseables", code, year)
        return 0

    if meta["latitude"] is None and code in KNOWN_COORDS:
        meta["latitude"], meta["longitude"] = KNOWN_COORDS[code]

    station = db.query(TideStation).filter(TideStation.code == code).first()
    if station is None:
        station = TideStation(code=code, name=meta["name"] or code,
                              latitude=meta["latitude"], longitude=meta["longitude"])
        db.add(station)
        db.flush()
    elif meta["name"]:
        station.name = meta["name"]
        if meta["latitude"] is not None:
            station.latitude = meta["latitude"]
            station.longitude = meta["longitude"]

    # Reemplazo idempotente del año
    start = datetime(year, 1, 1, tzinfo=timezone.utc)
    end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    db.query(TidePrediction).filter(
        TidePrediction.station_id == station.id,
        TidePrediction.timestamp >= start,
        TidePrediction.timestamp < end,
    ).delete(synchronize_session=False)

    db.bulk_insert_mappings(TidePrediction, [
        {"station_id": station.id, "timestamp": ts, "height_m": h} for ts, h in rows
    ])

    years = set(y for y in (station.ingested_years or "").split(",") if y)
    years.add(str(year))
    station.ingested_years = ",".join(sorted(years))

    db.commit()
    logger.info("Mareas %s %s: %d filas ingeridas (%s)", code, year, len(rows), station.name)
    return len(rows)


async def ingest_missing(db: Session) -> None:
    """
    Ingesta lo que falte para las estaciones activas: el año en curso siempre,
    y el siguiente a partir de octubre (CICESE publica el año completo por
    adelantado). Pensado para correr al arranque y periódicamente.
    """
    now = datetime.now(timezone.utc)
    years = [now.year]
    if now.month >= 10:
        years.append(now.year + 1)

    for year in years:
        codes = await discover_station_codes(year)
        for code in codes:
            station = db.query(TideStation).filter(TideStation.code == code).first()
            ingested = set((station.ingested_years or "").split(",")) if station else set()
            if str(year) in ingested:
                continue
            text = await download_tide_file(code, year)
            if text:
                ingest_station_year(db, code, year, text)
