/**
 * SIAE — Pastilla de lectura meteorológica en tiempo real bajo el cursor (Cursor Readout).
 * 
 * Muestra instantáneamente el valor físico del punto sobrevolado por el mouse según la capa activa:
 *  - Viento / Ciclones: Velocidad (kt y km/h) y dirección cardinal (°).
 *  - Oleaje: Altura significativa (m), periodo (s) y dirección (°).
 *  - Temperatura del Mar (TSM): Grados Celsius (°C) enmascarados a costa marina.
 *  - Temperatura del Aire (2m): Grados Celsius (°C) sobre mar y continente.
 *
 * Ubicado fijamente en la esquina inferior izquierda del mapa (bottom: 14px, left: 14px),
 * perfectamente alineado bajo la tarjeta de detalle puntual.
 */
import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';

/** Texto cardinal meteorológico (0-360°) */
function getCardinalDirection(deg) {
  if (deg == null || isNaN(deg)) return '—';
  const val = (deg + 360) % 360;
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(val / 22.5) % 16;
  return `${dirs[idx]} (${Math.round(val)}°)`;
}

/** Interpolador bilineal para viento vectorial U/V */
function buildWindSampler(windData) {
  if (!windData || !Array.isArray(windData) || windData.length < 2) return null;
  const header = windData[0]?.header;
  if (!header) return null;
  const { nx, ny, la1, lo1, dx, dy } = header;
  const uData = windData[0].data;
  const vData = windData[1].data;
  if (!uData || !vData) return null;

  return (lat, lon) => {
    const colF = (lon - lo1) / dx;
    const rowF = (la1 - lat) / dy;
    if (colF < 0 || rowF < 0 || colF >= nx - 1 || rowF >= ny - 1) return null;

    const c0 = Math.floor(colF);
    const r0 = Math.floor(rowF);
    const c1 = c0 + 1;
    const r1 = r0 + 1;
    const fc = colF - c0;
    const fr = rowF - r0;

    const u00 = uData[r0 * nx + c0], u01 = uData[r0 * nx + c1], u10 = uData[r1 * nx + c0], u11 = uData[r1 * nx + c1];
    const v00 = vData[r0 * nx + c0], v01 = vData[r0 * nx + c1], v10 = vData[r1 * nx + c0], v11 = vData[r1 * nx + c1];

    if (u00 == null || u01 == null || u10 == null || u11 == null) return null;
    if (v00 == null || v01 == null || v10 == null || v11 == null) return null;

    const top_u = u00 * (1 - fc) + u01 * fc;
    const bot_u = u10 * (1 - fc) + u11 * fc;
    const top_v = v00 * (1 - fc) + v01 * fc;
    const bot_v = v10 * (1 - fc) + v11 * fc;

    const u = top_u * (1 - fr) + bot_u * fr;
    const v = top_v * (1 - fr) + bot_v * fr;

    const speedMs = Math.hypot(u, v);
    const speedKts = Math.round(speedMs * 1.94384 * 10) / 10;
    const speedKmh = Math.round(speedMs * 3.6 * 10) / 10;
    const dirDeg = (270 - (Math.atan2(v, u) * 180) / Math.PI) % 360;

    return {
      speedKts,
      speedKmh,
      dirDeg,
      dirCardinal: getCardinalDirection(dirDeg),
    };
  };
}

/** Interpolador bilineal para mallas escalares (Temperatura marina, aire, altura ola) */
function buildScalarSampler(gridData, valueKey) {
  if (!gridData || !gridData.header || !gridData[valueKey]) return null;
  const { nx, ny, la1, lo1, dx, dy } = gridData.header;
  const vals = gridData[valueKey];
  if (!vals) return null;

  return (lat, lon) => {
    const colF = (lon - lo1) / dx;
    const rowF = (la1 - lat) / dy;
    if (colF < 0 || rowF < 0 || colF >= nx - 1 || rowF >= ny - 1) return null;

    const c0 = Math.floor(colF);
    const r0 = Math.floor(rowF);
    const c1 = c0 + 1;
    const r1 = r0 + 1;
    const fc = colF - c0;
    const fr = rowF - r0;

    const v00 = vals[r0 * nx + c0];
    const v01 = vals[r0 * nx + c1];
    const v10 = vals[r1 * nx + c0];
    const v11 = vals[r1 * nx + c1];

    if (v00 == null || v01 == null || v10 == null || v11 == null || isNaN(v00) || isNaN(v01) || isNaN(v10) || isNaN(v11)) {
      return null;
    }

    const top = v00 * (1 - fc) + v01 * fc;
    const bot = v10 * (1 - fc) + v11 * fc;
    return top * (1 - fr) + bot * fr;
  };
}

/** Interpolador completo para oleaje */
function buildWavesSampler(wavesData) {
  if (!wavesData || !wavesData.header) return null;
  const heightSampler = buildScalarSampler(wavesData, 'height');
  const periodSampler = buildScalarSampler(wavesData, 'period');
  const dirSampler = buildScalarSampler(wavesData, 'direction');

  if (!heightSampler) return null;

  return (lat, lon) => {
    const h = heightSampler(lat, lon);
    if (h == null) return null;
    const p = periodSampler ? periodSampler(lat, lon) : null;
    const d = dirSampler ? dirSampler(lat, lon) : null;

    return {
      heightM: Math.round(h * 100) / 100,
      periodS: p != null ? Math.round(p * 10) / 10 : null,
      dirDeg: d != null ? Math.round(d) : null,
      dirCardinal: d != null ? getCardinalDirection(d) : null,
    };
  };
}

export default function WeatherCursorReadout({
  activeLayer = 'wind',
  windData = null,
  wavesData = null,
  tempData = null,
  precipData = null,
  weatherModel = 'gfs',
}) {
  const map = useMap();
  const [readout, setReadout] = useState(null);
  const lastLatLngRef = useRef(null);

  const samplersRef = useRef({
    wind: null,
    waves: null,
    seaTemp: null,
    airTemp: null,
    precip: null,
  });

  const sampleAt = (lat, lon) => {
    if (lat == null || lon == null || activeLayer === 'none') {
      setReadout(null);
      return;
    }

    if (activeLayer === 'wind' || activeLayer === 'hurricanes') {
      const sampler = samplersRef.current.wind;
      if (!sampler) return;
      const res = sampler(lat, lon);
      if (!res) {
        setReadout({ type: 'wind', available: false });
      } else {
        setReadout({ type: 'wind', available: true, ...res });
      }
    } else if (activeLayer === 'waves') {
      const sampler = samplersRef.current.waves;
      if (!sampler) return;
      const res = sampler(lat, lon);
      if (!res) {
        setReadout({ type: 'waves', available: false });
      } else {
        setReadout({ type: 'waves', available: true, ...res });
      }
    } else if (activeLayer === 'sea_temp' || activeLayer === 'temperature') {
      const sampler = samplersRef.current.seaTemp;
      if (!sampler) return;
      const val = sampler(lat, lon);
      if (val == null) {
        setReadout({ type: 'sea_temp', available: false });
      } else {
        setReadout({ type: 'sea_temp', available: true, tempC: Math.round(val * 10) / 10 });
      }
    } else if (activeLayer === 'air_temp') {
      const sampler = samplersRef.current.airTemp;
      if (!sampler) return;
      const val = sampler(lat, lon);
      if (val == null) {
        setReadout({ type: 'air_temp', available: false });
      } else {
        setReadout({ type: 'air_temp', available: true, tempC: Math.round(val * 10) / 10 });
      }
    } else if (activeLayer === 'precip') {
      const sampler = samplersRef.current.precip;
      if (!sampler) return;
      const val = sampler(lat, lon);
      if (val == null) {
        setReadout({ type: 'precip', available: false });
      } else {
        setReadout({ type: 'precip', available: true, rateMmh: Math.round(val * 10) / 10 });
      }
    }
  };

  // Actualizar samplers y recalcular inmediatamente si el cursor está sobre el mapa
  useEffect(() => {
    samplersRef.current.wind = buildWindSampler(windData);
    samplersRef.current.waves = buildWavesSampler(wavesData);
    samplersRef.current.seaTemp = buildScalarSampler(tempData, 'sea_temp');
    samplersRef.current.airTemp = buildScalarSampler(tempData, 'air_temp');
    samplersRef.current.precip = buildScalarSampler(precipData, 'prate_mmh');

    if (lastLatLngRef.current) {
      sampleAt(lastLatLngRef.current.lat, lastLatLngRef.current.lon);
    }
  }, [windData, wavesData, tempData, precipData, activeLayer]);

  useEffect(() => {
    if (activeLayer === 'none') {
      setReadout(null);
      return;
    }

    const handleMouseMove = (e) => {
      const latlng = e.latlng;
      if (!latlng) return;

      const lat = latlng.lat;
      const lon = latlng.lng;
      lastLatLngRef.current = { lat, lon };
      sampleAt(lat, lon);
    };

    const handleMouseOut = () => {
      lastLatLngRef.current = null;
      setReadout(null);
    };

    map.on('mousemove', handleMouseMove);
    map.on('mouseout', handleMouseOut);

    return () => {
      map.off('mousemove', handleMouseMove);
      map.off('mouseout', handleMouseOut);
    };
  }, [activeLayer, map]);

  if (activeLayer === 'none' || !readout) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 14,
        left: 14,
        zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 20,
        padding: '5px 14px',
        color: '#ffffff',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        pointerEvents: 'none',
      }}
    >
      {/* 1. Capa Viento / Huracanes */}
      {(readout.type === 'wind') && (
        <>
          <span style={{ fontSize: 13 }}>💨</span>
          <span
            style={{
              padding: '1px 6px',
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 700,
              background: weatherModel === 'ecmwf' ? '#722ED1' : '#0284c7',
              color: '#ffffff',
              letterSpacing: 0.5,
            }}
          >
            {weatherModel === 'ecmwf' ? 'ECMWF' : 'GFS'}
          </span>
          {readout.available ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 700, color: '#38bdf8' }}>
                {readout.speedKts} kt
              </span>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>
                ({readout.speedKmh} km/h)
              </span>
              <span style={{ color: '#cbd5e1' }}>·</span>
              <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                {readout.dirCardinal}
              </span>
            </div>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: 11 }}>
              Fuera del dominio numérico {weatherModel === 'ecmwf' ? 'ECMWF' : 'GFS'}
            </span>
          )}
        </>
      )}

      {/* 2. Capa Oleaje */}
      {readout.type === 'waves' && (
        <>
          <span style={{ fontSize: 13 }}>🌊</span>
          <span
            style={{
              padding: '1px 6px',
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 700,
              background: '#0284c7',
              color: '#ffffff',
              letterSpacing: 0.5,
            }}
          >
            WW3
          </span>
          {readout.available ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 700, color: '#38bdf8' }}>
                {readout.heightM} m
              </span>
              {readout.periodS != null && (
                <span style={{ color: '#94a3b8', fontSize: 11 }}>
                  ({readout.periodS}s)
                </span>
              )}
              {readout.dirCardinal && readout.dirCardinal !== '—' && (
                <>
                  <span style={{ color: '#cbd5e1' }}>·</span>
                  <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                    {readout.dirCardinal}
                  </span>
                </>
              )}
            </div>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: 11 }}>
              Tierra o fuera de dominio WW3
            </span>
          )}
        </>
      )}

      {/* 3. Capa Temperatura Superficial del Mar (TSM) */}
      {readout.type === 'sea_temp' && (
        <>
          <span style={{ fontSize: 13 }}>🌡️</span>
          <span
            style={{
              padding: '1px 6px',
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 700,
              background: weatherModel === 'ecmwf' ? '#722ED1' : '#0284c7',
              color: '#ffffff',
              letterSpacing: 0.5,
            }}
          >
            {weatherModel === 'ecmwf' ? 'ECMWF' : 'GFS'}
          </span>
          {readout.available ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>TSM Mar:</span>
              <span style={{ fontWeight: 700, color: '#38bdf8' }}>
                {readout.tempC} °C
              </span>
            </div>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: 11 }}>
              Tierra / Sin datos de TSM marina
            </span>
          )}
        </>
      )}

      {/* 4. Capa Temperatura del Aire a 2m */}
      {readout.type === 'air_temp' && (
        <>
          <span style={{ fontSize: 13 }}>🌡️</span>
          <span
            style={{
              padding: '1px 6px',
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 700,
              background: weatherModel === 'ecmwf' ? '#722ED1' : '#0284c7',
              color: '#ffffff',
              letterSpacing: 0.5,
            }}
          >
            {weatherModel === 'ecmwf' ? 'ECMWF' : 'GFS'}
          </span>
          {readout.available ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>Temp. Aire (2m):</span>
              <span style={{ fontWeight: 700, color: '#fb923c' }}>
                {readout.tempC} °C
              </span>
            </div>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: 11 }}>
              Fuera del dominio numérico {weatherModel === 'ecmwf' ? 'ECMWF' : 'GFS'}
            </span>
          )}
        </>
      )}

      {/* 5. Capa Precipitación / Radar de Lluvia */}
      {readout.type === 'precip' && (
        <>
          <span style={{ fontSize: 13 }}>🌧️</span>
          <span
            style={{
              padding: '1px 6px',
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 700,
              background: weatherModel === 'ecmwf' ? '#722ED1' : '#0284c7',
              color: '#ffffff',
              letterSpacing: 0.5,
            }}
          >
            {weatherModel === 'ecmwf' ? 'ECMWF' : 'GFS'}
          </span>
          {readout.available ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>Lluvia:</span>
              <span style={{ fontWeight: 700, color: '#38bdf8' }}>
                {readout.rateMmh} mm/h
              </span>
              <span style={{ color: '#cbd5e1' }}>·</span>
              <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: 11 }}>
                {readout.rateMmh < 0.1 ? 'Sin lluvia' : readout.rateMmh < 2.5 ? 'Llovizna' : readout.rateMmh < 10 ? 'Moderada' : readout.rateMmh < 25 ? 'Fuerte' : 'Torrencial'}
              </span>
            </div>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: 11 }}>
              Fuera del dominio numérico {weatherModel === 'ecmwf' ? 'ECMWF' : 'GFS'}
            </span>
          )}
        </>
      )}
    </div>
  );
}
