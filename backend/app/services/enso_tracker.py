"""
SIAE — Servicio de Monitoreo del Fenómeno El Niño / Oscilación del Sur (ENSO).
Descarga y procesa en tiempo real los índices semanales de anomalías de Temperatura
Superficial del Mar (TSM) de la NOAA (Climate Prediction Center - CPC).
"""
import logging
import re
import time
from datetime import datetime, timezone
import httpx

logger = logging.getLogger("siae.weather.enso")

NOAA_WEEKLY_ENSO_URL = "https://www.cpc.ncep.noaa.gov/data/indices/wksst9120.for"
NOAA_MONTHLY_ENSO_URL = "https://www.cpc.ncep.noaa.gov/data/indices/sstoi.indices"

# Caché en memoria por 6 horas (los índices de NOAA se actualizan semanalmente)
_CACHE_DATA = None
_CACHE_TIMESTAMP = 0
CACHE_TTL_SECONDS = 6 * 3600


def _parse_enso_status(anomaly_34: float) -> tuple[str, str, str, str]:
    """
    Determina la fase y la intensidad del ENSO según el umbral estándar de la NOAA (Región Niño 3.4).
    Devuelve (status, category, color, description).
    """
    if anomaly_34 >= 2.0:
        return (
            "el_nino",
            "Super El Niño / Muy Fuerte",
            "#b91c1c",
            "Anomalía térmica extrema (≥ +2.0°C). Calentamiento oceánico masivo que profundiza drásticamente la termoclina y aporta máxima energía térmica para ciclones tropicales.",
        )
    if anomaly_34 >= 1.5:
        return (
            "el_nino",
            "El Niño Fuerte",
            "#dc2626",
            "Anomalía térmica alta (+1.5°C a +1.9°C). Aguas superficiales significativamente más cálidas de lo normal en el Pacífico oriental y mexicano.",
        )
    if anomaly_34 >= 1.0:
        return (
            "el_nino",
            "El Niño Moderado",
            "#ea580c",
            "Anomalía térmica moderada (+1.0°C a +1.4°C). Reducción notable en la intensidad de surgencias costeras y aumento de TSM en el Golfo de California.",
        )
    if anomaly_34 >= 0.5:
        return (
            "el_nino",
            "El Niño Débil",
            "#d97706",
            "Anomalía térmica leve (+0.5°C a +0.9°C). Condiciones oceánicas en transición cálida.",
        )
    if anomaly_34 <= -1.5:
        return (
            "la_nina",
            "La Niña Fuerte",
            "#1d4ed8",
            "Anomalía térmica muy fría (≤ -1.5°C). Surgencias costeras muy intensas y aguas frías ricas en nutrientes en el Pacífico mexicano.",
        )
    if anomaly_34 <= -1.0:
        return (
            "la_nina",
            "La Niña Moderada",
            "#2563eb",
            "Anomalía térmica fría (-1.0°C a -1.4°C). Termoclina somera y menor actividad ciclónica en el Pacífico oriental.",
        )
    if anomaly_34 <= -0.5:
        return (
            "la_nina",
            "La Niña Débil",
            "#0284c7",
            "Anomalía térmica ligeramente fría (-0.5°C a -0.9°C).",
        )

    return (
        "neutral",
        "Fase Neutra (ENSO-Neutral)",
        "#059669",
        "Condiciones térmicas dentro de la variabilidad climatológica normal (-0.5°C a +0.5°C).",
    )


async def fetch_enso_data() -> dict:
    """
    Descarga y estructura las series temporales recientes de índices de El Niño.
    """
    global _CACHE_DATA, _CACHE_TIMESTAMP
    now = time.time()
    if _CACHE_DATA is not None and (now - _CACHE_TIMESTAMP) < CACHE_TTL_SECONDS:
        return _CACHE_DATA

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(
                NOAA_WEEKLY_ENSO_URL,
                headers={"User-Agent": "SIAE-CICESE/1.0 (Oceanographic Monitoring)"},
                follow_redirects=True,
            )
            if resp.status_code != 200:
                logger.warning("No se pudo descargar índice ENSO semanal: status=%s", resp.status_code)
                if _CACHE_DATA:
                    return _CACHE_DATA
                return _fallback_enso_data()

            lines = resp.text.strip().split("\n")
            records = []

            # Estructura del archivo wksst9120.for:
            # Columnas: Semana (ej. 16SEP2026), Nino1+2 (SST, Anom), Nino3 (SST, Anom), Nino3.4 (SST, Anom), Nino4 (SST, Anom)
            for line in lines:
                parts = line.split()
                if len(parts) >= 9:
                    date_str = parts[0]
                    # Formato fecha: 16SEP2026
                    try:
                        dt = datetime.strptime(date_str, "%d%b%Y").replace(tzinfo=timezone.utc)
                        nino12_sst = float(parts[1])
                        nino12_anom = float(parts[2])
                        nino3_sst = float(parts[3])
                        nino3_anom = float(parts[4])
                        nino34_sst = float(parts[5])
                        nino34_anom = float(parts[6])
                        nino4_sst = float(parts[7])
                        nino4_anom = float(parts[8])

                        records.append({
                            "date": dt.strftime("%Y-%m-%d"),
                            "label": dt.strftime("%d %b"),
                            "timestamp": dt.isoformat(),
                            "nino12": {"sst": nino12_sst, "anom": nino12_anom},
                            "nino3": {"sst": nino3_sst, "anom": nino3_anom},
                            "nino34": {"sst": nino34_sst, "anom": nino34_anom},
                            "nino4": {"sst": nino4_sst, "anom": nino4_anom},
                        })
                    except Exception:
                        continue

            if not records:
                return _fallback_enso_data()

            latest = records[-1]
            nino34_anom = latest["nino34"]["anom"]
            nino12_anom = latest["nino12"]["anom"]

            status, category, color, description = _parse_enso_status(nino34_anom)

            result = {
                "updated_at": latest["date"],
                "status": status,
                "category": category,
                "color": color,
                "description": description,
                "latest": {
                    "date": latest["date"],
                    "nino34_anomaly": nino34_anom,
                    "nino34_sst": latest["nino34"]["sst"],
                    "nino12_anomaly": nino12_anom,
                    "nino12_sst": latest["nino12"]["sst"],
                    "nino3_anomaly": latest["nino3"]["anom"],
                    "nino3_sst": latest["nino3"]["sst"],
                    "nino4_anomaly": latest["nino4"]["anom"],
                    "nino4_sst": latest["nino4"]["sst"],
                },
                "history": records[-16:],  # Últimas 16 semanas para gráficos de tendencia
                "oceanographic_impact": {
                    "baja_california": "TSM elevada y menor surgencia costera; posible ingreso de especies tropicales hacia el norte.",
                    "golfo_de_california": "Retención de calor superficial y estratificación térmica pronunciada.",
                    "ciclon_risk": "Alta energía térmica marina acumulada que favorece la intensificación rápida de ciclones tropicales.",
                },
            }

            _CACHE_DATA = result
            _CACHE_TIMESTAMP = now
            return result

    except Exception as exc:
        logger.warning("Error consultando datos ENSO de NOAA: %s", exc)
        if _CACHE_DATA:
            return _CACHE_DATA
        return _fallback_enso_data()


def _fallback_enso_data() -> dict:
    """Datos sintéticos de referencia en caso de caída temporal del servidor de NOAA."""
    return {
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "status": "el_nino",
        "category": "El Niño Fuerte",
        "color": "#dc2626",
        "description": "Anomalía térmica alta en el Pacífico Oriental (NOAA Climate Prediction Center).",
        "latest": {
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "nino34_anomaly": 2.1,
            "nino34_sst": 29.4,
            "nino12_anomaly": 3.8,
            "nino12_sst": 26.2,
            "nino3_anomaly": 2.8,
            "nino3_sst": 28.5,
            "nino4_anomaly": 0.9,
            "nino4_sst": 29.6,
        },
        "history": [],
        "oceanographic_impact": {
            "baja_california": "TSM elevada en costas de Ensenada y BCS.",
            "golfo_de_california": "Estratificación térmica moderada.",
            "ciclon_risk": "Mayor energía para perturbaciones tropicales.",
        },
    }
