import React from 'react';
import dayjs from 'dayjs';
import { Card, Tag, Button, Typography, Spin, Space, Segmented } from 'antd';
import { 
  CloseOutlined, 
  ThunderboltOutlined, 
  DashboardOutlined, 
  CompassOutlined, 
  ArrowDownOutlined,
  EnvironmentOutlined 
} from '@ant-design/icons';

const { Text } = Typography;

function getCardinalText(deg) {
  if (deg == null) return '—';
  const val = (deg + 360) % 360;
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(val / 22.5) % 16;
  return `${dirs[idx]} (${Math.round(val)}°)`;
}

function getMaritimeSafetyStatus(windKts, gustKts, waveM) {
  const w = windKts || 0;
  const g = gustKts || w;
  const h = waveM || 0;

  if (w > 24 || h > 2.8 || g > 32) {
    return {
      tag: '🔴 RIESGO ELEVADO',
      color: '#dc2626',
      bgColor: '#fef2f2',
      borderColor: '#fecaca',
      title: 'Condición Adversa / Mar Gruesa',
      advice: 'Precaución para pangas y lanchas menores.',
    };
  }

  if (w >= 16 || h >= 1.6 || g >= 22) {
    return {
      tag: '🟡 PRECAUCIÓN',
      color: '#d97706',
      bgColor: '#fffbeb',
      borderColor: '#fef3c7',
      title: 'Precaución en Navegación',
      advice: 'Brisa fresca y mar picada.',
    };
  }

  return {
    tag: '🟢 FAVORABLE',
    color: '#16a34a',
    bgColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    title: 'Condición Óptima de Navegación',
    advice: 'Mar en calma. Apto para todo tipo de embarcaciones.',
  };
}

export default function PointFloatingCard({
  point,
  forecast = [],
  selectedHour = 0,
  loading = false,
  weatherModel = 'gfs',
  onSelectModel,
  pointModelName = null,
  onClose,
  onViewDetails,
}) {
  if (!point) return null;

  const current = (forecast || []).find((f) => f.forecast_hour === selectedHour)
    || (forecast && forecast.length > 0 ? forecast[0] : null);
  const hasWaves = current && current.wave_height_m != null;

  const maritimeSafety = hasWaves && current
    ? getMaritimeSafetyStatus(current.wind_speed_kt, current.wind_gust_kt, current.wave_height_m)
    : null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 56,
        left: 14,
        zIndex: 1000,
        width: 320,
        maxWidth: 'calc(100vw - 32px)',
        pointerEvents: 'auto',
      }}
    >
      <Card
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid #cbd5e1',
          boxShadow: '0 12px 28px -6px rgba(10, 38, 71, 0.2), 0 6px 12px -3px rgba(10, 38, 71, 0.1)',
        }}
        styles={{ body: { padding: '12px 14px' } }}
      >
        {/* Cabecera de la Tarjeta */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <EnvironmentOutlined style={{ color: hasWaves ? '#0284c7' : '#059669', fontSize: 16, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <Text strong style={{ color: '#0A2647', fontSize: 13, display: 'block', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {point.name || `Lat ${point.lat.toFixed(2)}°N, Lon ${Math.abs(point.lon).toFixed(2)}°W`}
              </Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                <Text type="secondary" style={{ fontSize: 10 }}>
                  {hasWaves
                    ? (weatherModel === 'ecmwf' ? 'Marino (ECMWF IFS)' : 'Marino (GFS/WW3)')
                    : (weatherModel === 'ecmwf' ? 'Terrestre (ECMWF)' : 'Terrestre (GFS)')}
                </Text>
                {current?.time && (
                  <Tag color="blue" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px', borderRadius: 4 }}>
                    T+{current.forecast_hour ?? selectedHour}h ({dayjs(current.time).format('ddd DD/MM HH:mm')})
                  </Tag>
                )}
              </div>
            </div>
          </div>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined style={{ color: '#64748b', fontSize: 11 }} />}
            onClick={onClose}
            style={{ color: '#64748b' }}
          />
        </div>

        {/* Selector de Modelo Numérico Puntual */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '3px 8px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <Text type="secondary" style={{ fontSize: 10, fontWeight: 600 }}>Modelo:</Text>
          <Segmented
            size="small"
            value={weatherModel}
            onChange={(val) => onSelectModel && onSelectModel(val)}
            options={[
              { label: '🌐 GFS', value: 'gfs' },
              { label: '🇪🇺 ECMWF', value: 'ecmwf' },
            ]}
            style={{ fontSize: 10 }}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Spin size="small" />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>Cargando pronóstico...</div>
          </div>
        ) : !current ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#64748b', fontSize: 11 }}>
            Sin datos de modelo para esta coordenada
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Banner de Estado: Náutico si hay oleaje, o Atmosférico si es tierra */}
            {hasWaves && maritimeSafety && (
              <div
                style={{
                  background: maritimeSafety.bgColor,
                  border: `1px solid ${maritimeSafety.borderColor}`,
                  borderRadius: 8,
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: maritimeSafety.color }}>
                  {maritimeSafety.title}
                </span>
                <Tag color={maritimeSafety.color} style={{ fontWeight: 800, borderRadius: 4, margin: 0, padding: '0 4px', fontSize: 10, color: '#ffffff' }}>
                  {maritimeSafety.tag}
                </Tag>
              </div>
            )}

            {!hasWaves && (
              <div
                style={{
                  background: (current.wind_gust_kt || current.wind_speed_kt || 0) > 22 ? '#fffbeb' : '#f0fdf4',
                  border: `1px solid ${(current.wind_gust_kt || current.wind_speed_kt || 0) > 22 ? '#fef3c7' : '#bbf7d0'}`,
                  borderRadius: 8,
                  padding: '5px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: (current.wind_gust_kt || current.wind_speed_kt || 0) > 22 ? '#d97706' : '#16a34a' }}>
                  {(current.wind_gust_kt || current.wind_speed_kt || 0) > 22 ? 'Viento Racheado en Superficie' : 'Condiciones Atmosféricas Estables'}
                </span>
                <Tag color={(current.wind_gust_kt || current.wind_speed_kt || 0) > 22 ? '#d97706' : '#16a34a'} style={{ fontWeight: 700, borderRadius: 4, margin: 0, padding: '0 4px', fontSize: 10, color: '#ffffff' }}>
                  TERRESTRE
                </Tag>
              </div>
            )}

            {/* Fila de Métricas */}
            {hasWaves ? (
              /* Modo Marino: Viento + Oleaje */
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {/* Viento */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <ThunderboltOutlined style={{ color: '#0284c7', fontSize: 13 }} />
                    <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 700 }}>VIENTO</Text>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                    {current.wind_speed_kt != null ? `${current.wind_speed_kt} kt` : '—'}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <CompassOutlined style={{ fontSize: 11, transform: `rotate(${current.wind_dir_deg || 0}deg)` }} />
                    <span>{getCardinalText(current.wind_dir_deg)}</span>
                  </div>
                </div>

                {/* Oleaje */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <DashboardOutlined style={{ color: '#059669', fontSize: 13 }} />
                    <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 700 }}>OLEAJE</Text>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                    {current.wave_height_m != null ? `${current.wave_height_m} m` : '—'}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                    {current.wave_period_s ? `${current.wave_period_s}s periodo` : 'Mar en calma'}
                  </div>
                </div>
              </div>
            ) : (
              /* Modo Terrestre: Viento Sostenido + Ráfagas Máximas */
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {/* Viento Sostenido */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <ThunderboltOutlined style={{ color: '#0284c7', fontSize: 13 }} />
                    <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 700 }}>VIENTO</Text>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                    {current.wind_speed_kt != null ? `${current.wind_speed_kt} kt` : '—'}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <CompassOutlined style={{ fontSize: 11, transform: `rotate(${current.wind_dir_deg || 0}deg)` }} />
                    <span>{getCardinalText(current.wind_dir_deg)}</span>
                  </div>
                </div>

                {/* Ráfagas */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <ThunderboltOutlined style={{ color: '#ea580c', fontSize: 13 }} />
                    <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 700 }}>RÁFAGAS</Text>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#ea580c' }}>
                    {current.wind_gust_kt != null ? `${current.wind_gust_kt} kt` : `${current.wind_speed_kt || '—'} kt`}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                    {Math.round(((current.wind_gust_kt || current.wind_speed_kt || 0) * 1.852))} km/h máx
                  </div>
                </div>
              </div>
            )}

            {/* Fila de Temperatura Térmica (TSM / Aire) */}
            {(current.sea_temp_c != null || current.air_temp_c != null) && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>🌡️</span>
                  <div>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>TEMPERATURA</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                      {current.sea_temp_c != null && (
                        <span>TSM Mar: <strong style={{ color: '#0284c7' }}>{current.sea_temp_c}°C</strong></span>
                      )}
                      {current.sea_temp_c != null && current.air_temp_c != null && <span> · </span>}
                      {current.air_temp_c != null && (
                        <span>Aire: <strong style={{ color: '#ea580c' }}>{current.air_temp_c}°C</strong></span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Fila de Precipitación / Lluvia */}
            {current.precip_rate_mmh != null && (
              <div
                style={{
                  background: current.precip_rate_mmh >= 0.1 ? '#eff6ff' : '#f8fafc',
                  border: `1px solid ${current.precip_rate_mmh >= 0.1 ? '#bfdbfe' : '#e2e8f0'}`,
                  borderRadius: 8,
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>🌧️</span>
                  <div>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>PRECIPITACIÓN</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: current.precip_rate_mmh >= 0.1 ? '#0284c7' : '#0f172a' }}>
                      {current.precip_rate_mmh} mm/h
                      <span style={{ fontSize: 10, fontWeight: 500, color: '#64748b', marginLeft: 4 }}>
                        ({current.precip_rate_mmh < 0.1 ? 'Sin lluvia' : current.precip_rate_mmh < 2.5 ? 'Llovizna' : current.precip_rate_mmh < 10 ? 'Moderada' : current.precip_rate_mmh < 25 ? 'Fuerte' : 'Torrencial'})
                      </span>
                    </div>
                  </div>
                </div>
                {current.precip_accum_mm != null && (
                  <Tag color="blue" style={{ fontSize: 10, margin: 0, padding: '0 6px', fontWeight: 700 }}>
                    {current.precip_accum_mm} mm acum.
                  </Tag>
                )}
              </div>
            )}

            {/* Botón para ver gráficas completas abajo */}
            <Button
              type="primary"
              size="middle"
              block
              icon={<ArrowDownOutlined style={{ fontSize: 12 }} />}
              onClick={onViewDetails}
              style={{
                borderRadius: 8,
                background: '#0A2647',
                borderColor: '#0A2647',
                fontWeight: 700,
                fontSize: 12,
                height: 34,
                marginTop: 2,
              }}
            >
              Ver Gráficas y Detalle Completo
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
