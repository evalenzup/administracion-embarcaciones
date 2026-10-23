import React, { useState, useEffect } from 'react';
import { Segmented, Tooltip, Badge, Button, Tag } from 'antd';
import {
  SlidersOutlined,
  DownOutlined,
  UpOutlined,
  CheckOutlined,
} from '@ant-design/icons';

const LAYER_CONFIG = {
  wind: { label: 'Viento', icon: '💨', desc: 'Viento y ráfagas a 10m con partículas animadas' },
  precip: { label: 'Lluvia', icon: '🌧️', desc: 'Tasa de precipitación (mm/h) y radar de lluvia' },
  air_temp: { label: 'Temp. Aire', icon: '🌤️', desc: 'Temperatura del aire a 2 metros sobre superficie' },
  waves: { label: 'Oleaje', icon: '🌊', desc: 'Altura significante de ola y oleaje de fondo (WW3)' },
  sea_temp: { label: 'Temp. Mar', icon: '🌡️', desc: 'Temperatura Superficial del Mar (TSM) con máscara de costa' },
  temperature: { label: 'Temp. Mar', icon: '🌡️', desc: 'Temperatura Superficial del Mar (TSM) con máscara de costa' },
  hurricanes: { label: 'Huracanes', icon: '🌀', desc: 'Seguimiento de ciclones y conos de pronóstico' },
};

const STATION_CONFIG = {
  telemetry: { label: 'Barcos', icon: '🚢', desc: 'Telemetría GPS en tiempo real e historial de rutas CICESE' },
  tides: { label: 'Mareas', icon: '📊', desc: 'Red de estaciones mareográficas de nivel del mar CICESE' },
  smn: { label: 'Estaciones SMN', icon: '🛰️', desc: 'Estaciones Meteorológicas Automáticas del SMN' },
};

/**
 * WeatherLayerDock - Menú moderno flotante superior derecho estilo Windy/GIS
 * Incluye conmutador de modelo numérico [GFS | ECMWF] y capas clasificadas
 * por Atmósfera, Océano y Monitoreo CICESE.
 */
export default function WeatherLayerDock({
  activeLayer = 'wind',
  onSelectLayer,
  stationSource = 'tides',
  onSelectStationSource,
  weatherModel = 'gfs',
  onSelectModel,
  activeStorms = [],
  onFocusHurricane,
}) {
  const liveStorms = activeStorms.filter((s) => s.is_live);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1000;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1000) {
        setCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const activeLayerConfig = LAYER_CONFIG[activeLayer] || { label: 'Viento', icon: '💨' };
  const stationSourceConfig = stationSource ? STATION_CONFIG[stationSource] : null;

  // Color de acento según modelo activo
  const modelAccentColor = weatherModel === 'ecmwf' ? '#722ED1' : '#0A2647';

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 1000,
        pointerEvents: 'auto',
      }}
    >
      {collapsed ? (
        /* MODO PÍLDORA COMPACTA MINIMIZADA */
        <div
          onClick={() => setCollapsed(false)}
          style={{
            cursor: 'pointer',
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid #cbd5e1',
            borderRadius: 22,
            padding: '5px 12px',
            boxShadow: '0 8px 24px -4px rgba(10, 38, 71, 0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12,
            fontWeight: 600,
            color: '#0A2647',
            transition: 'all 0.2s ease',
          }}
          title="Haz clic para desplegar el selector de modelos y capas meteorológicas"
        >
          <SlidersOutlined style={{ color: '#0284c7', fontSize: 13 }} />
          <span>Capas:</span>

          {/* Badge del Modelo */}
          <Tag
            color={weatherModel === 'ecmwf' ? '#722ED1' : '#0A2647'}
            style={{
              margin: 0,
              borderRadius: 10,
              fontWeight: 700,
              padding: '0 6px',
              fontSize: 10,
              color: '#ffffff',
            }}
          >
            {weatherModel === 'ecmwf' ? '🇪🇺 ECMWF' : '🌐 GFS'}
          </Tag>

          {/* Badge de Capa Activa */}
          <Tag
            color={modelAccentColor}
            style={{
              margin: 0,
              borderRadius: 10,
              fontWeight: 700,
              padding: '0 6px',
              fontSize: 10,
              color: '#ffffff',
            }}
          >
            {activeLayerConfig.icon} {activeLayerConfig.label}
          </Tag>

          {/* Badge de Estación Activa si existe */}
          {stationSourceConfig && (
            <Tag
              color="#0284c7"
              style={{
                margin: 0,
                borderRadius: 10,
                fontWeight: 700,
                padding: '0 6px',
                fontSize: 10,
                color: '#ffffff',
              }}
            >
              {stationSourceConfig.icon} {stationSourceConfig.label}
            </Tag>
          )}

          {liveStorms.length > 0 && (
            <Badge count={liveStorms.length} size="small" />
          )}

          <DownOutlined style={{ fontSize: 9, color: '#64748b', marginLeft: 2 }} />
        </div>
      ) : (
        /* MODO PANEL COMPLETO EXPANDIDO VERTICAL (ESTILO WINDY / GIS) */
        <div
          style={{
            width: 215,
            maxHeight: 'calc(70vh - 24px)',
            overflowY: 'auto',
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid #cbd5e1',
            borderRadius: 16,
            padding: '10px 10px 12px 10px',
            boxShadow: '0 12px 30px -4px rgba(10, 38, 71, 0.22), 0 4px 10px -2px rgba(10, 38, 71, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {/* ENCABEZADO Y BOTÓN DE CONTRAER */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 4,
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <SlidersOutlined style={{ color: '#0284c7', fontSize: 13 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0A2647' }}>
                Capas & Modelo
              </span>
            </div>
            <Tooltip title="Minimizar panel para ver el mapa completo">
              <Button
                type="text"
                size="small"
                onClick={() => setCollapsed(true)}
                icon={<UpOutlined style={{ fontSize: 10, color: '#64748b' }} />}
                style={{
                  width: 24,
                  height: 24,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 12,
                }}
              />
            </Tooltip>
          </div>

          {/* SECCIÓN 1: SELECTOR DE MODELO NUMÉRICO */}
          <div style={{ marginTop: 2 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: 5,
              }}
            >
              Modelo Numérico
            </div>
            <Segmented
              block
              size="small"
              value={weatherModel}
              onChange={(val) => onSelectModel && onSelectModel(val)}
              options={[
                {
                  value: 'gfs',
                  label: (
                    <span
                      title="Modelo NOAA GFS / WW3 (0.25°) — Estándar global y oleaje"
                      style={{
                        fontWeight: weatherModel === 'gfs' ? 700 : 500,
                        fontSize: 11,
                        color: weatherModel === 'gfs' ? '#0A2647' : '#475569',
                      }}
                    >
                      🌐 GFS
                    </span>
                  ),
                },
                {
                  value: 'ecmwf',
                  label: (
                    <span
                      title="Modelo ECMWF IFS Europeo (0.25°) — Alta precisión orográfica y costera"
                      style={{
                        fontWeight: weatherModel === 'ecmwf' ? 700 : 500,
                        fontSize: 11,
                        color: weatherModel === 'ecmwf' ? '#722ED1' : '#475569',
                      }}
                    >
                      🇪🇺 ECMWF
                    </span>
                  ),
                },
              ]}
              style={{ background: '#f1f5f9', padding: 2 }}
            />

            {/* Leyenda sutil del modelo activo o nota de oleaje WW3 */}
            {activeLayer === 'waves' ? (
              <div
                style={{
                  marginTop: 5,
                  padding: '4px 6px',
                  borderRadius: 6,
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  fontSize: 9.5,
                  color: '#0369a1',
                  lineHeight: 1.35,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 5,
                }}
              >
                <span>🌊</span>
                <span>
                  <strong>Malla en mapa:</strong> Generada por el modelo oceánico <strong>NOAA WaveWatch III (WW3)</strong>.
                </span>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 9,
                  color: weatherModel === 'ecmwf' ? '#722ED1' : '#0A2647',
                  fontWeight: 600,
                  marginTop: 4,
                  padding: '0 2px',
                }}
              >
                {weatherModel === 'ecmwf'
                  ? '🇪🇺 ECMWF IFS 0.25° · Partículas & Radiación'
                  : '🌐 NOAA GFS 0.25° · Global & Oleaje WW3'}
              </div>
            )}
          </div>

          {/* SEPARADOR */}
          <div style={{ height: 1, background: '#f1f5f9', margin: '2px 0' }} />

          {/* SECCIÓN 2: ATMÓSFERA */}
          <div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: 4,
              }}
            >
              Atmósfera
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Viento */}
              <LayerItemButton
                icon="💨"
                label="Viento"
                desc="Viento y ráfagas a 10m con partículas animadas"
                active={activeLayer === 'wind'}
                activeColor={modelAccentColor}
                onClick={() => onSelectLayer('wind')}
              />

              {/* Lluvia */}
              <LayerItemButton
                icon="🌧️"
                label="Lluvia"
                desc="Tasa de precipitación (mm/h) y radar de lluvia"
                active={activeLayer === 'precip'}
                activeColor={modelAccentColor}
                onClick={() => onSelectLayer('precip')}
              />

              {/* Temperatura del Aire */}
              <LayerItemButton
                icon="🌤️"
                label="Temp. Aire"
                desc="Temperatura del aire a 2m sobre superficie (mar y tierra)"
                active={activeLayer === 'air_temp'}
                activeColor={modelAccentColor}
                onClick={() => onSelectLayer('air_temp')}
              />
            </div>
          </div>

          {/* SEPARADOR */}
          <div style={{ height: 1, background: '#f1f5f9', margin: '2px 0' }} />

          {/* SECCIÓN 3: OCÉANO */}
          <div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: 4,
              }}
            >
              Océano
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Oleaje */}
              <LayerItemButton
                icon="🌊"
                label="Oleaje"
                desc="Altura significante de ola y oleaje de fondo (Modelo NOAA WaveWatch III - WW3)"
                active={activeLayer === 'waves'}
                activeColor="#0A2647"
                onClick={() => onSelectLayer('waves')}
              />

              {/* Temperatura Superficial del Mar */}
              <LayerItemButton
                icon="🌡️"
                label="Temp. Mar"
                desc="Temperatura Superficial del Mar (TSM) con máscara de costa"
                active={activeLayer === 'sea_temp' || activeLayer === 'temperature'}
                activeColor={modelAccentColor}
                onClick={() => onSelectLayer('sea_temp')}
              />
            </div>
          </div>

          {/* SEPARADOR */}
          <div style={{ height: 1, background: '#f1f5f9', margin: '2px 0' }} />

          {/* SECCIÓN 4: MONITOREO CICESE */}
          <div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: 4,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>Monitoreo CICESE</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Barcos */}
              <StationItemButton
                icon="🚢"
                label="Barcos"
                desc="Telemetría GPS en tiempo real e historial de rutas de la flota"
                active={stationSource === 'telemetry'}
                activeColor="#0284c7"
                onClick={() => onSelectStationSource(stationSource === 'telemetry' ? null : 'telemetry')}
              />

              {/* Mareas */}
              <StationItemButton
                icon="📊"
                label="Mareas"
                desc="Red de estaciones mareográficas de nivel del mar del CICESE"
                active={stationSource === 'tides'}
                activeColor="#0284c7"
                onClick={() => onSelectStationSource(stationSource === 'tides' ? null : 'tides')}
              />

              {/* Estaciones SMN */}
              <StationItemButton
                icon="🛰️"
                label="Estaciones SMN"
                desc="Estaciones Meteorológicas Automáticas (EMA) del SMN"
                active={stationSource === 'smn'}
                activeColor="#0284c7"
                onClick={() => onSelectStationSource(stationSource === 'smn' ? null : 'smn')}
              />

              {/* Huracanes (sin alarmas invasivas; badge discreto si hay activos) */}
              <LayerItemButton
                icon="🌀"
                label="Huracanes"
                desc="Seguimiento de ciclones, conos de incertidumbre y pronósticos NOAA/GFS"
                active={activeLayer === 'hurricanes'}
                activeColor="#dc2626"
                badgeCount={liveStorms.length}
                onClick={() => onSelectLayer('hurricanes')}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Botón para Capas Físicas (Viento, Oleaje, Lluvia, Temperatura, Huracanes)
 */
function LayerItemButton({
  icon,
  label,
  desc,
  active,
  activeColor = '#0A2647',
  badgeCount = 0,
  onClick,
  disabled = false,
  disabledReason = '',
  disabledBadge = '',
}) {
  const tooltipContent = disabled ? (
    <div style={{ fontSize: 11, lineHeight: 1.4 }}>
      <div style={{ fontWeight: 700, color: '#f87171' }}>Capa no disponible</div>
      <div>{disabledReason || 'Esta variable no está incluida en el modelo seleccionado.'}</div>
    </div>
  ) : (
    desc
  );

  return (
    <Tooltip title={tooltipContent} placement="left">
      <div
        onClick={disabled ? undefined : onClick}
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: '5px 8px',
          borderRadius: 8,
          background: disabled
            ? 'rgba(241, 245, 249, 0.45)'
            : active
            ? activeColor
            : 'rgba(248, 250, 252, 0.85)',
          color: disabled ? '#94a3b8' : active ? '#ffffff' : '#334155',
          border: disabled
            ? '1px dashed #cbd5e1'
            : `1px solid ${active ? activeColor : '#e2e8f0'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'all 0.15s ease',
          fontSize: 11,
          fontWeight: active ? 700 : 500,
          opacity: disabled ? 0.6 : 1,
        }}
        onMouseEnter={(e) => {
          if (!active && !disabled) {
            e.currentTarget.style.background = '#f1f5f9';
            e.currentTarget.style.borderColor = '#cbd5e1';
          }
        }}
        onMouseLeave={(e) => {
          if (!active && !disabled) {
            e.currentTarget.style.background = 'rgba(248, 250, 252, 0.85)';
            e.currentTarget.style.borderColor = '#e2e8f0';
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 13, filter: disabled ? 'grayscale(100%)' : 'none' }}>{icon}</span>
          <span style={{ textDecoration: disabled ? 'line-through' : 'none' }}>{label}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {disabledBadge && (
            <span
              style={{
                fontSize: 9,
                color: '#64748b',
                background: '#e2e8f0',
                padding: '1px 5px',
                borderRadius: 4,
                fontWeight: 600,
              }}
            >
              {disabledBadge}
            </span>
          )}
          {badgeCount > 0 && !disabled && (
            <Badge
              count={badgeCount}
              size="small"
              style={{
                backgroundColor: active ? '#ffffff' : '#dc2626',
                color: active ? '#dc2626' : '#ffffff',
                boxShadow: 'none',
                fontWeight: 700,
              }}
            />
          )}
          {active && !disabled && <CheckOutlined style={{ fontSize: 10, color: '#ffffff' }} />}
        </div>
      </div>
    </Tooltip>
  );
}

/**
 * Botón para Estaciones y Flota (Barcos, Mareas, SMN - Multiseleccionables/Toggleables)
 */
function StationItemButton({ icon, label, desc, active, activeColor = '#0284c7', onClick }) {
  return (
    <Tooltip title={desc} placement="left">
      <div
        onClick={onClick}
        style={{
          cursor: 'pointer',
          padding: '5px 8px',
          borderRadius: 8,
          background: active ? activeColor : 'rgba(248, 250, 252, 0.85)',
          color: active ? '#ffffff' : '#334155',
          border: `1px solid ${active ? activeColor : '#e2e8f0'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'all 0.15s ease',
          fontSize: 11,
          fontWeight: active ? 700 : 500,
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.background = '#f1f5f9';
            e.currentTarget.style.borderColor = '#cbd5e1';
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = 'rgba(248, 250, 252, 0.85)';
            e.currentTarget.style.borderColor = '#e2e8f0';
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 13 }}>{icon}</span>
          <span>{label}</span>
        </div>

        {active && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              background: 'rgba(255, 255, 255, 0.25)',
              padding: '1px 5px',
              borderRadius: 6,
              color: '#ffffff',
            }}
          >
            ACTIVO
          </span>
        )}
      </div>
    </Tooltip>
  );
}
