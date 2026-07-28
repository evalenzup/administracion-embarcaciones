"""
SIAE — Descarga e ingesta de reportes de las estaciones automáticas (EMA) del SMN/CONAGUA.
"""
import csv
import logging
import ssl
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.ema import EmaStation, EmaMeasurement

logger = logging.getLogger("siae.weather")

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
BASE_URL = "https://smn.conagua.gob.mx/tools/GUI/sivea_v3/php/getReporteEstacion.php"


def _clean_float(val: str) -> float | None:
    if not val:
        return None
    val = val.strip()
    if "///" in val or val == "" or val.lower() == "null" or val.lower() == "none":
        return None
    try:
        return float(val)
    except ValueError:
        return None


def fetch_and_parse_smn(smn_name: str, report_type: int = 1) -> list[dict]:
    """
    Descarga el CSV de una estación desde el SMN y lo parsea dinámicamente según sus cabeceras.
    Devuelve una lista de diccionarios listos para persistir.
    """
    encoded_name = urllib.parse.quote(smn_name)
    url = f"{BASE_URL}?tipo={report_type}&nombre_estacion={encoded_name}"
    
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30.0) as response:
            content_bytes = response.read()
            
            # Verificar si Conagua devolvió un error del backend en texto plano
            try:
                text_content = content_bytes.decode('latin-1').strip()
                if text_content.startswith("Error") or "No se encontr" in text_content:
                    logger.warning("El servidor de Conagua devolvió un error para %s: %s", smn_name, text_content)
                    return []
            except Exception:
                pass
            
            lines = content_bytes.decode('utf-8', errors='ignore').splitlines()
            if not lines:
                return []
            
            # Buscar la línea de cabeceras (comienza con "Fecha Local" o similar)
            header_idx = -1
            for idx, line in enumerate(lines):
                if "Fecha Local" in line:
                    header_idx = idx
                    break
                    
            if header_idx == -1:
                logger.warning("No se encontró la cabecera en el reporte de %s", smn_name)
                return []
                
            # Parsear cabeceras usando csv.reader para respetar dobles comillas
            header_row = next(csv.reader([lines[header_idx]]))
            
            # Construir mapa de índices para las columnas encontradas
            col_map = {}
            for col_idx, col_name in enumerate(header_row):
                c_upper = col_name.upper()
                if "FECHA UTC" in c_upper:
                    col_map["timestamp"] = col_idx
                elif "TEMPERATURA" in c_upper:
                    col_map["temperature"] = col_idx
                elif "PRECIPITACI" in c_upper:
                    col_map["precipitation"] = col_idx
                elif "HUMEDAD" in c_upper:
                    col_map["humidity"] = col_idx
                elif "PRESI" in c_upper:
                    col_map["pressure"] = col_idx
                elif "RADIACI" in c_upper:
                    col_map["solar_radiation"] = col_idx
                elif "DIRECCI" in c_upper and "RAFAGA" not in c_upper and "RÁFAGA" not in c_upper and "VIENTO" in c_upper:
                    col_map["wind_direction"] = col_idx
                elif "RAPIDEZ" in c_upper and "RAFAGA" not in c_upper and "RÁFAGA" not in c_upper and "VIENTO" in c_upper:
                    col_map["wind_speed"] = col_idx
                elif "DIRECCI" in c_upper and ("RAFAGA" in c_upper or "RÁFAGA" in c_upper):
                    col_map["gust_direction"] = col_idx
                elif "RAPIDEZ" in c_upper and ("RAFAGA" in c_upper or "RÁFAGA" in c_upper):
                    col_map["gust_speed"] = col_idx

            if "timestamp" not in col_map:
                logger.warning("Falta columna de tiempo en el reporte de %s", smn_name)
                return []
                
            # Parsear filas de datos
            measurements = []
            reader = csv.reader(lines[header_idx + 1:])
            for row in reader:
                if not row or len(row) <= max(col_map.values(), default=0):
                    continue
                
                ts_str = row[col_map["timestamp"]].strip()
                if not ts_str:
                    continue
                    
                try:
                    # Conagua usa formato "YYYY-MM-DD HH:mm:ss"
                    ts = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
                
                measurements.append({
                    "timestamp": ts,
                    "temperature": _clean_float(row[col_map["temperature"]]) if "temperature" in col_map else None,
                    "precipitation": _clean_float(row[col_map["precipitation"]]) if "precipitation" in col_map else None,
                    "humidity": _clean_float(row[col_map["humidity"]]) if "humidity" in col_map else None,
                    "pressure": _clean_float(row[col_map["pressure"]]) if "pressure" in col_map else None,
                    "solar_radiation": _clean_float(row[col_map["solar_radiation"]]) if "solar_radiation" in col_map else None,
                    "wind_direction": _clean_float(row[col_map["wind_direction"]]) if "wind_direction" in col_map else None,
                    "wind_speed": _clean_float(row[col_map["wind_speed"]]) if "wind_speed" in col_map else None,
                    "gust_direction": _clean_float(row[col_map["gust_direction"]]) if "gust_direction" in col_map else None,
                    "gust_speed": _clean_float(row[col_map["gust_speed"]]) if "gust_speed" in col_map else None,
                })
            return measurements
    except Exception as e:
        logger.warning("Error descargando/parseando reporte de %s: %s", smn_name, e)
        return []


def ingest_smn_data(db: Session) -> None:
    """
    Descarga e ingesta los datos de las últimas 24h para todas las estaciones EMA.
    Idempotente mediante verificación de duplicados.
    """
    stations = db.query(EmaStation).all()
    if not stations:
        logger.info("No hay estaciones EMA registradas en la base de datos.")
        return
        
    logger.info("Iniciando ingesta de datos meteorológicos de %d estaciones EMA...", len(stations))
    total_added = 0
    
    for station in stations:
        measurements = fetch_and_parse_smn(station.smn_name, report_type=1)
        if not measurements:
            continue
            
        added_for_station = 0
        for m in measurements:
            # Verificar si ya existe para evitar duplicado
            exists = db.query(EmaMeasurement).filter(
                EmaMeasurement.station_id == station.id,
                EmaMeasurement.timestamp == m["timestamp"]
            ).first()
            
            if not exists:
                db_m = EmaMeasurement(
                    station_id=station.id,
                    timestamp=m["timestamp"],
                    temperature=m["temperature"],
                    precipitation=m["precipitation"],
                    humidity=m["humidity"],
                    pressure=m["pressure"],
                    solar_radiation=m["solar_radiation"],
                    wind_direction=m["wind_direction"],
                    wind_speed=m["wind_speed"],
                    gust_direction=m["gust_direction"],
                    gust_speed=m["gust_speed"]
                )
                db.add(db_m)
                added_for_station += 1
                
        if added_for_station > 0:
            db.commit()
            total_added += added_for_station
            
    logger.info("Ingesta finalizada. Se agregaron %d mediciones en total.", total_added)
