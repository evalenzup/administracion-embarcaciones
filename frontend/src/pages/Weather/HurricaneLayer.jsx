import React, { useRef, useEffect } from 'react';
import { Polygon, Polyline, Marker, Popup } from 'react-leaflet';
import L from '../../utils/leafletGlobal';
import { formatTijuanaDateTime } from '../../utils/hurricaneDateUtils';

/** Crea el ícono central animado para el ojo del ciclón / tormenta */
function createCycloneEyeIcon(catInfo, intensityKts, name) {
  const color = catInfo?.color || '#faad14';
  const catCode = catInfo?.code || 'TS';
  const size = 38;

  return L.divIcon({
    className: 'custom-cyclone-eye-icon',
    html: `
      <div style="position: relative; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center;">
        <!-- Anillo de pulso radar -->
        <div class="hurricane-pulse-circle" style="background: ${color}; opacity: 0.35;"></div>
        <!-- Núcleo con rotación de ciclón -->
        <div class="hurricane-spinner" style="
          width: ${size - 4}px; 
          height: ${size - 4}px; 
          border-radius: 50%; 
          background: radial-gradient(circle, ${color} 30%, rgba(15, 23, 42, 0.9) 100%);
          border: 2.5px solid #ffffff;
          box-shadow: 0 0 16px ${color};
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <!-- Ícono SVG espiral de huracán -->
          <svg viewBox="0 0 24 24" width="20" height="20" fill="#ffffff">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
        </div>
        <!-- Pill de categoría flotante -->
        <div style="
          position: absolute;
          bottom: -8px;
          background: ${color};
          color: #ffffff;
          font-weight: 800;
          font-size: 10px;
          padding: 1px 5px;
          border-radius: 6px;
          border: 1.5px solid #ffffff;
          box-shadow: 0 2px 6px rgba(0,0,0,0.5);
          white-space: nowrap;
        ">
          ${catCode}
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
  });
}

/** Crea el ícono tipo badge para los hitos/waypoints de la trayectoria */
function createWaypointIcon(catInfo, isFuture = true, borderColor = '#ffffff') {
  const color = catInfo?.color || '#1890ff';
  const code = catInfo?.code || '•';
  const size = isFuture ? 24 : 18;

  return L.divIcon({
    className: 'hurricane-waypoint-badge',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: ${color};
        color: #ffffff;
        border: 2px solid ${borderColor};
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${isFuture ? 10 : 8}px;
        font-weight: 700;
      ">
        ${isFuture ? code : ''}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  });
}

export default function HurricaneLayer({
  stormDetails,
  showCone = true,
  visible = true,
  selectedModel = 'NOAA', // 'NOAA' | 'GFS' | 'ALL'
  activeWaypointSelection = null,
}) {
  const forecastMarkerRefs = useRef({});

  // Escuchar selección de waypoints desde el panel lateral y abrir su popup automáticamente
  useEffect(() => {
    if (activeWaypointSelection != null) {
      const idx = typeof activeWaypointSelection === 'object' ? activeWaypointSelection.index : activeWaypointSelection;
      if (idx != null) {
        const marker = forecastMarkerRefs.current[idx];
        if (marker) {
          const timer = setTimeout(() => {
            try {
              marker.openPopup();
            } catch (e) {
              // ignore
            }
          }, 80);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [activeWaypointSelection]);

  if (!visible || !stormDetails) return null;

  const {
    name,
    category_info,
    intensity_kts,
    pressure_hpa,
    current_position,
    movement,
    past_track = [],
    forecast_track = [],
    cone_polygon = [],
    models = {},
    is_live,
  } = stormDetails;

  // Punto actual
  const currentPos = current_position ? [current_position.lat, current_position.lon] : null;
  const currentPosTime = current_position?.date_str ? formatTijuanaDateTime(current_position.date_str) : null;

  // Ruta pasada (observada)
  const pastCoords = [];
  if (past_track && past_track.length > 0) {
    past_track.forEach((pt) => pastCoords.push([pt.lat, pt.lon]));
    if (currentPos) pastCoords.push(currentPos);
  }

  // Modelos disponibles
  const noaaModel = models.NOAA || { forecast_track, cone_polygon };
  const gfsModel = models.GFS;

  // Rutas pronosticadas
  const showNoaa = selectedModel === 'NOAA' || selectedModel === 'ALL' || !gfsModel;
  const showGfs = (selectedModel === 'GFS' || selectedModel === 'ALL') && Boolean(gfsModel);

  const noaaForecastCoords = currentPos ? [currentPos] : [];
  if (noaaModel.forecast_track && noaaModel.forecast_track.length > 0) {
    noaaModel.forecast_track.forEach((pt) => noaaForecastCoords.push([pt.lat, pt.lon]));
  }

  const gfsForecastCoords = currentPos ? [currentPos] : [];
  if (gfsModel?.forecast_track && gfsModel.forecast_track.length > 0) {
    gfsModel.forecast_track.forEach((pt) => gfsForecastCoords.push([pt.lat, pt.lon]));
  }

  return (
    <>
      {/* 1. Conos de Incertidumbre */}
      {showCone && showNoaa && noaaModel.cone_polygon && noaaModel.cone_polygon.length > 2 && (
        <Polygon
          positions={noaaModel.cone_polygon}
          pathOptions={{
            color: '#d97706',
            weight: 1.5,
            dashArray: '5, 5',
            fillColor: '#f59e0b',
            fillOpacity: selectedModel === 'ALL' ? 0.14 : 0.22,
          }}
        />
      )}

      {showCone && showGfs && gfsModel?.cone_polygon && gfsModel.cone_polygon.length > 2 && (
        <Polygon
          positions={gfsModel.cone_polygon}
          pathOptions={{
            color: '#0284c7',
            weight: 1.5,
            dashArray: '4, 4',
            fillColor: '#38bdf8',
            fillOpacity: selectedModel === 'ALL' ? 0.14 : 0.22,
          }}
        />
      )}

      {/* 2. Trayectoria Pasada / Observada */}
      {pastCoords.length > 1 && (
        <Polyline
          positions={pastCoords}
          pathOptions={{
            color: '#475569',
            weight: 3.5,
            opacity: 0.85,
          }}
        />
      )}

      {/* Marcadores de Hitos Pasados */}
      {past_track.map((pt, idx) => {
        const timeInfo = formatTijuanaDateTime(pt.date_str);
        return (
          <Marker
            key={`past-${idx}`}
            position={[pt.lat, pt.lon]}
            icon={createWaypointIcon(pt.cat_info, false)}
          >
            <Popup>
              <div style={{ minWidth: 180, fontSize: 12, color: '#0f172a' }}>
                <div style={{ fontWeight: 700, color: '#0A2647', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginBottom: 6 }}>
                  🕒 {timeInfo.utcStr || pt.date_str} (Posición Pasada)
                </div>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', marginBottom: 6, color: '#334155' }}>
                  <span style={{ fontSize: 10, color: '#64748b', display: 'block', fontWeight: 600 }}>HORA LOCAL (TIJUANA / BC):</span>
                  <span style={{ fontWeight: 700, fontSize: 12, color: '#0A2647' }}>{timeInfo.localStr || pt.date_str}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div>Intensidad: <strong>{pt.wind_kts} kt</strong> ({Math.round(pt.wind_kts * 1.852)} km/h)</div>
                  <div>Categoría: <strong style={{ color: pt.cat_info?.color }}>{pt.cat_info?.name || pt.cat_info?.label}</strong></div>
                  {pt.pressure_hpa && <div>Presión: <strong>{pt.pressure_hpa} hPa</strong></div>}
                  <div>Coords: {pt.lat.toFixed(2)}°N, {Math.abs(pt.lon).toFixed(2)}°W</div>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* 3. Trayectoria Pronosticada: NOAA Oficial */}
      {showNoaa && noaaForecastCoords.length > 1 && (
        <Polyline
          positions={noaaForecastCoords}
          pathOptions={{
            color: '#d97706',
            weight: 3.5,
            opacity: 0.95,
            dashArray: '6, 6',
          }}
        />
      )}

      {/* 4. Trayectoria Pronosticada: GFS Numérico */}
      {showGfs && gfsForecastCoords.length > 1 && (
        <Polyline
          positions={gfsForecastCoords}
          pathOptions={{
            color: '#0284c7',
            weight: 3.5,
            opacity: 0.95,
            dashArray: '4, 4',
          }}
        />
      )}

      {/* Marcadores de Waypoints: NOAA Oficial */}
      {showNoaa &&
        noaaModel.forecast_track?.map((pt, idx) => {
          const timeInfo = formatTijuanaDateTime(pt.date_str);
          return (
            <Marker
              key={`future-noaa-${idx}`}
              ref={(el) => {
                if (el && (selectedModel === 'NOAA' || selectedModel === 'ALL')) {
                  forecastMarkerRefs.current[idx] = el;
                }
              }}
              position={[pt.lat, pt.lon]}
              icon={createWaypointIcon(pt.cat_info, true, '#d97706')}
            >
              <Popup>
                <div style={{ minWidth: 190, fontSize: 12, color: '#0f172a' }}>
                  <div style={{ fontWeight: 700, color: '#0A2647', borderBottom: '2px solid #d97706', paddingBottom: 4, marginBottom: 6 }}>
                    🛰️ {timeInfo.utcStr || pt.date_str} (NOAA Oficial)
                  </div>
                  <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 6, padding: '4px 8px', marginBottom: 6, color: '#92400e' }}>
                    <span style={{ fontSize: 10, color: '#b45309', display: 'block', fontWeight: 600 }}>HORA LOCAL (TIJUANA / BC):</span>
                    <span style={{ fontWeight: 700, fontSize: 12, color: '#78350f' }}>{timeInfo.localStr || pt.date_str}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div>Viento Pronosticado: <strong>{pt.wind_kts} kt</strong> ({Math.round(pt.wind_kts * 1.852)} km/h)</div>
                    <div>Intensidad: <strong style={{ color: pt.cat_info?.color }}>{pt.cat_info?.name || pt.cat_info?.label}</strong></div>
                    {pt.pressure_hpa && <div>Presión Estimada: <strong>{pt.pressure_hpa} hPa</strong></div>}
                    <div>Ubicación: {pt.lat.toFixed(2)}°N, {Math.abs(pt.lon).toFixed(2)}°W</div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

      {/* Marcadores de Waypoints: GFS Numérico */}
      {showGfs &&
        gfsModel?.forecast_track?.map((pt, idx) => {
          const timeInfo = formatTijuanaDateTime(pt.date_str);
          return (
            <Marker
              key={`future-gfs-${idx}`}
              ref={(el) => {
                if (el && selectedModel === 'GFS') {
                  forecastMarkerRefs.current[idx] = el;
                }
              }}
              position={[pt.lat, pt.lon]}
              icon={createWaypointIcon(pt.cat_info, true, '#0284c7')}
            >
              <Popup>
                <div style={{ minWidth: 190, fontSize: 12, color: '#0f172a' }}>
                  <div style={{ fontWeight: 700, color: '#0A2647', borderBottom: '2px solid #0284c7', paddingBottom: 4, marginBottom: 6 }}>
                    🌐 +{pt.hours_ahead}h ({timeInfo.utcStr || pt.date_str}) · GFS Numérico
                  </div>
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 8px', marginBottom: 6, color: '#1e40af' }}>
                    <span style={{ fontSize: 10, color: '#1d4ed8', display: 'block', fontWeight: 600 }}>HORA LOCAL (TIJUANA / BC):</span>
                    <span style={{ fontWeight: 700, fontSize: 12, color: '#1e3a8a' }}>{timeInfo.localStr || pt.date_str}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div>Viento Modelo GFS: <strong>{pt.wind_kts} kt</strong> ({Math.round(pt.wind_kts * 1.852)} km/h)</div>
                    <div>Categoría Estimada: <strong style={{ color: pt.cat_info?.color }}>{pt.cat_info?.name || pt.cat_info?.label}</strong></div>
                    <div>Ubicación Vórtice: {pt.lat.toFixed(2)}°N, {Math.abs(pt.lon).toFixed(2)}°W</div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

      {/* 5. Ojo del Ciclón / Centro Actual */}
      {currentPos && (
        <Marker
          position={currentPos}
          icon={createCycloneEyeIcon(category_info, intensity_kts, name)}
        >
          <Popup>
            <div style={{ minWidth: 190, fontSize: 12, color: '#0f172a' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: category_info?.color || '#faad14', marginBottom: 2 }}>
                🌀 {name?.toUpperCase()} ({category_info?.code})
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                {category_info?.label} · {is_live ? 'En Vivo' : 'Archivo Histórico'}
              </div>
              {currentPosTime && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '3px 6px', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: '#1d4ed8', fontWeight: 600 }}>Hora local Tijuana: {currentPosTime.localStr}</span>
                </div>
              )}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div>💨 Viento Máx: <strong>{intensity_kts} kt</strong> ({Math.round(intensity_kts * 1.852)} km/h)</div>
                {pressure_hpa && <div>🧭 Presión: <strong>{pressure_hpa} hPa</strong></div>}
                <div>🏃 Desplazamiento: <strong>{movement?.dir_cardinal || 'NW'} a {movement?.speed_kts || 0} kt</strong></div>
                <div>📍 Posición: <strong>{current_position.lat.toFixed(2)}°N, {Math.abs(current_position.lon).toFixed(2)}°W</strong></div>
              </div>
            </div>
          </Popup>
        </Marker>
      )}
    </>
  );
}
