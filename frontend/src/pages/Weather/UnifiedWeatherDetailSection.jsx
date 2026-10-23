/**
 * SIAE — Contenedor Unificado de Detalle Meteorológico y Observacional.
 * Agrupa en una sola interfaz organizada por pestañas dinámicas:
 *  1. Pronóstico Numérico Puntual a 5 días (GFS 0.25° / WaveWatch III)
 *     - Marino / Costero: Viento, ráfagas, oleaje, periodo y semáforo de navegación.
 *     - Terrestre: Viento y ráfagas en superficie (sin oleaje ni advertencias de puerto).
 *  2. Nivel del Mar y Mareas (Red Mareográfica CICESE)
 *  3. Estaciones Meteorológicas Automáticas (SMN)
 *  4. Telemetría y Sensores de Embarcaciones (Flota CICESE)
 */
import React, { forwardRef, useState } from 'react';
import {
  Card,
  Tabs,
  Tag,
  Typography,
  Spin,
  Empty,
  Table,
  Row,
  Col,
  Segmented,
  Select,
  Space,
  Button,
} from 'antd';
import {
  EnvironmentOutlined,
  ThunderboltOutlined,
  DashboardOutlined,
  CompassOutlined,
  AreaChartOutlined,
  TableOutlined,
  CompassFilled,
} from '@ant-design/icons';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
  Bar,
  BarChart,
  ComposedChart,
} from 'recharts';
import dayjs from 'dayjs';

import TidesSection from './TidesSection';
import SmnSection from './SmnSection';
import VesselTelemetrySection from './VesselTelemetrySection';

const { Text } = Typography;

function getWindBeaufort(kts) {
  if (kts == null) return { name: 'Sin datos', level: 0 };
  if (kts < 4) return { name: 'Calma / Ventolina', level: 1 };
  if (kts <= 10) return { name: 'Brisa suave', level: 2 };
  if (kts <= 16) return { name: 'Brisa moderada', level: 3 };
  if (kts <= 21) return { name: 'Brisa fresca', level: 4 };
  if (kts <= 27) return { name: 'Brisa fuerte', level: 5 };
  if (kts <= 33) return { name: 'Viento duro', level: 6 };
  return { name: 'Temporal / Vendaval', level: 7 };
}

function getWaveDouglas(m) {
  if (m == null) return { name: 'Sin datos', level: 0 };
  if (m < 0.5) return { name: 'Mar en calma / llana', level: 1 };
  if (m < 1.25) return { name: 'Mar rizada', level: 2 };
  if (m < 2.5) return { name: 'Marejada / Mar picada', level: 3 };
  if (m < 4.0) return { name: 'Mar gruesa', level: 4 };
  return { name: 'Mar muy gruesa / arbolada', level: 5 };
}

function getPrecipIntensity(mmh) {
  if (mmh == null || mmh < 0.1) return { name: 'Sin lluvia', color: '#64748b', bg: '#f1f5f9' };
  if (mmh < 2.5) return { name: 'Llovizna / Débil', color: '#0284c7', bg: '#e0f2fe' };
  if (mmh < 10) return { name: 'Lluvia Moderada', color: '#2563eb', bg: '#dbeafe' };
  if (mmh < 25) return { name: 'Lluvia Fuerte', color: '#eab308', bg: '#fef9c3' };
  if (mmh < 50) return { name: 'Lluvia Muy Fuerte', color: '#f97316', bg: '#ffedd5' };
  return { name: 'Lluvia Torrencial', color: '#dc2626', bg: '#fee2e2' };
}

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
      status: 'danger',
      tag: '🔴 RIESGO ELEVADO',
      color: '#dc2626',
      bgColor: '#fef2f2',
      borderColor: '#fecaca',
      title: 'Condición Adversa / Mar Gruesa',
      advice: 'Riesgo alto para embarcaciones menores y pangas. Posibles restricciones de navegación en puerto.',
    };
  }

  if (w >= 16 || h >= 1.6 || g >= 22) {
    return {
      status: 'warning',
      tag: '🟡 PRECAUCIÓN',
      color: '#d97706',
      bgColor: '#fffbeb',
      borderColor: '#fef3c7',
      title: 'Precaución en Navegación',
      advice: 'Brisa fresca y mar picada. Se sugiere precaución para pangas, lanchas y actividades científicas menores.',
    };
  }

  return {
    status: 'safe',
    tag: '🟢 FAVORABLE',
    color: '#16a34a',
    bgColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    title: 'Condiciones Óptimas de Navegación',
    advice: 'Mar en calma y brisa suave. Apto y seguro para todo tipo de embarcaciones menores y buques oceanográficos.',
  };
}

const baseTableColumns = [
  { title: 'Fecha / Hora', dataIndex: 'label', width: 130, render: (t) => <strong>{t}</strong> },
  {
    title: 'Viento Sostenido',
    dataIndex: 'wind_speed_kt',
    width: 115,
    render: (v) => (v != null ? <span style={{ color: '#0284c7', fontWeight: 600 }}>{v} kt</span> : '—'),
  },
  {
    title: 'Ráfagas Máx.',
    dataIndex: 'wind_gust_kt',
    width: 115,
    render: (v) => (v != null ? <span style={{ color: '#ea580c', fontWeight: 600 }}>{v} kt</span> : '—'),
  },
  {
    title: 'Dirección Viento',
    dataIndex: 'wind_dir_deg',
    width: 130,
    render: (v) => (
      <Space size={4}>
        <CompassFilled style={{ transform: `rotate(${v || 0}deg)`, color: '#0A2647', fontSize: 13 }} />
        <span>{getCardinalText(v)}</span>
      </Space>
    ),
  },
  {
    title: 'Temp. Aire (2m)',
    dataIndex: 'air_temp_c',
    width: 105,
    render: (v) => (v != null ? <span style={{ color: '#ea580c', fontWeight: 600 }}>{v} °C</span> : '—'),
  },
  {
    title: 'Lluvia (mm/h)',
    dataIndex: 'precip_rate_mmh',
    width: 110,
    render: (v) => (v != null && v >= 0.1 ? (
      <span style={{ color: '#0284c7', fontWeight: 700 }}>{v} mm/h</span>
    ) : (
      <span style={{ color: '#94a3b8' }}>0 mm/h</span>
    )),
  },
  {
    title: 'Lluvia Acum.',
    dataIndex: 'precip_accum_mm',
    width: 105,
    render: (v) => (v != null && v >= 0.1 ? (
      <span style={{ color: '#0369a1', fontWeight: 600 }}>{v} mm</span>
    ) : (
      <span style={{ color: '#94a3b8' }}>0 mm</span>
    )),
  },
];

const marineTableColumns = [
  ...baseTableColumns.slice(0, 4),
  {
    title: 'Altura de Ola',
    dataIndex: 'wave_height_m',
    width: 115,
    render: (v) => (v != null ? <span style={{ color: '#059669', fontWeight: 600 }}>{v} m</span> : '—'),
  },
  {
    title: 'Periodo Swell',
    dataIndex: 'wave_period_s',
    width: 105,
    render: (v) => (v != null ? `${v} s` : '—'),
  },
  {
    title: 'TSM Mar',
    dataIndex: 'sea_temp_c',
    width: 95,
    render: (v) => (v != null ? <span style={{ color: '#0284c7', fontWeight: 600 }}>{v} °C</span> : '—'),
  },
  {
    title: 'Temp. Aire',
    dataIndex: 'air_temp_c',
    width: 95,
    render: (v) => (v != null ? <span style={{ color: '#ea580c', fontWeight: 600 }}>{v} °C</span> : '—'),
  },
  {
    title: 'Lluvia (mm/h)',
    dataIndex: 'precip_rate_mmh',
    width: 110,
    render: (v) => (v != null && v >= 0.1 ? (
      <span style={{ color: '#0284c7', fontWeight: 700 }}>{v} mm/h</span>
    ) : (
      <span style={{ color: '#94a3b8' }}>0 mm/h</span>
    )),
  },
  {
    title: 'Lluvia Acum.',
    dataIndex: 'precip_accum_mm',
    width: 105,
    render: (v) => (v != null && v >= 0.1 ? (
      <span style={{ color: '#0369a1', fontWeight: 600 }}>{v} mm</span>
    ) : (
      <span style={{ color: '#94a3b8' }}>0 mm</span>
    )),
  },
];

const UnifiedWeatherDetailSection = forwardRef(function UnifiedWeatherDetailSection(
  {
    activeTab,
    onTabChange,
    selectedHour = 0,
    stationSource = 'tides',
    selectedPoint,
    pointForecast = [],
    pointLoading = false,
    nearestTideInfo,
    nearestSmnInfo,
    tideStations = [],
    tideStation = 'ENS',
    onTideStationChange,
    smnStations = [],
    smnStationId,
    onSmnStationChange,
    vesselsTelemetry = [],
    selectedVessel,
    onSelectVessel,
    telemetryDates,
    onTelemetryDatesChange,
    onRecordClick,
    onClearPoint,
    weatherModel = 'gfs',
    onSelectModel,
    pointModelName = null,
  },
  ref
) {
  const [pointSubView, setPointSubView] = useState('charts'); // 'charts' | 'table'
  const [tempGraphMode, setTempGraphMode] = useState('both'); // 'both' | 'sea' | 'air'

  const chartData = (pointForecast || []).map((f) => ({
    ...f,
    label: dayjs(f.time).format('DD/MM HH:mm'),
  }));

  const tickInterval = Math.max(0, Math.ceil(chartData.length / 8) - 1);
  const current = (pointForecast || []).find((f) => f.forecast_hour === selectedHour)
    || (pointForecast && pointForecast.length > 0 ? pointForecast[0] : null);
  const hasWaves = pointForecast && pointForecast.some((f) => f.wave_height_m != null);

  const safety = (hasWaves && current)
    ? getMaritimeSafetyStatus(current.wind_speed_kt, current.wind_gust_kt, current.wave_height_m)
    : null;
  const beaufort = current ? getWindBeaufort(current.wind_speed_kt) : null;
  const douglas = (hasWaves && current) ? getWaveDouglas(current.wave_height_m) : null;

  // Construcción dinámica de pestañas según lo que está activo en el mapa
  const tabItems = [];

  // 1. Tab de Pronóstico Numérico Puntual (GFS/WW3)
  // Aparece si hay un punto seleccionado O si ninguna capa de observación está activa
  if (selectedPoint || !stationSource) {
    tabItems.push({
      key: 'point',
      label: (
        <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>📍</span> Pronóstico Numérico (5 Días)
          {selectedPoint && (
            <Tag
              color="blue"
              closable
              onClose={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onClearPoint && onClearPoint();
              }}
              style={{ marginLeft: 4, borderRadius: 10, fontSize: 10, cursor: 'pointer' }}
            >
              {selectedPoint.name || `Lat ${selectedPoint.lat.toFixed(2)}°, Lon ${Math.abs(selectedPoint.lon).toFixed(2)}°`}
            </Tag>
          )}
        </span>
      ),
      children: (
        <div style={{ minHeight: 380, padding: '4px 0' }}>
          {pointLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <Spin size="large" />
              <Text type="secondary" style={{ fontSize: 13 }}>
                Consultando pronóstico del modelo {weatherModel === 'ecmwf' ? 'ECMWF IFS (Europeo)' : 'GFS / WW3 (NOAA)'}...
              </Text>
            </div>
          ) : !selectedPoint ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <Empty
                image={<EnvironmentOutlined style={{ fontSize: 48, color: '#0284c7', opacity: 0.7 }} />}
                imageStyle={{ height: 60 }}
                description={
                  <div style={{ maxWidth: 480, margin: '0 auto' }}>
                    <Text strong style={{ fontSize: 15, color: '#0A2647', display: 'block', marginBottom: 6 }}>
                      Ningún punto seleccionado en el mapa
                    </Text>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      Haz clic sobre cualquier coordenada del océano o costa en el mapa superior para generar la ficha y las curvas a 5 días.
                    </Text>
                  </div>
                }
              />
            </div>
          ) : !pointForecast || pointForecast.length === 0 ? (
            <Empty description="No hay datos de pronóstico numérico para las coordenadas seleccionadas" style={{ padding: 40 }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Resumen del Punto y Semáforo */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '14px 18px',
                }}
              >
                <Row gutter={[16, 16]} align="middle">
                  {/* Coordenadas y Modelo */}
                  <Col xs={24} md={hasWaves ? 8 : 10}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <EnvironmentOutlined style={{ fontSize: 20, color: hasWaves ? '#0284c7' : '#059669' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <Text strong style={{ fontSize: 14, color: '#0A2647' }}>
                            {selectedPoint.name || `Lat ${selectedPoint.lat.toFixed(3)}°N, Lon ${Math.abs(selectedPoint.lon).toFixed(3)}°W`}
                          </Text>
                          {onClearPoint && (
                            <Button
                              size="small"
                              type="dashed"
                              danger
                              onClick={onClearPoint}
                              style={{ fontSize: 10, borderRadius: 6, height: 22, padding: '0 6px' }}
                            >
                              ✕ Quitar punto
                            </Button>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Modelo:</span>
                          <Segmented
                            size="small"
                            value={weatherModel}
                            onChange={(val) => onSelectModel && onSelectModel(val)}
                            options={[
                              { label: '🌐 GFS (NOAA 0.25°)', value: 'gfs' },
                              { label: '🇪🇺 ECMWF (IFS Europeo)', value: 'ecmwf' },
                            ]}
                            style={{ fontSize: 11 }}
                          />
                          {weatherModel === 'ecmwf' ? (
                            <Tag color="purple" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '18px' }}>🇪🇺 Costero / Rigel</Tag>
                          ) : (
                            <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '18px' }}>🌐 Global / Alpha Helix</Tag>
                          )}
                          {current?.time && (
                            <Tag color="cyan" style={{ fontSize: 10, padding: '0 5px', borderRadius: 4, margin: 0 }}>
                              T+{current.forecast_hour ?? selectedHour}h · {dayjs(current.time).format('ddd DD/MM HH:mm')}
                            </Tag>
                          )}
                        </div>
                      </div>
                    </div>
                  </Col>

                  {/* Banner de Estado */}
                  {hasWaves && safety && (
                    <Col xs={24} md={16}>
                      <div
                        style={{
                          background: safety.bgColor,
                          border: `1.5px solid ${safety.borderColor}`,
                          borderRadius: 8,
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 8,
                        }}
                      >
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 800, color: safety.color, marginRight: 8 }}>
                            {safety.title}
                          </span>
                          <span style={{ fontSize: 11, color: '#334155' }}>
                            {safety.advice}
                          </span>
                        </div>
                        <Tag color={safety.color} style={{ fontWeight: 800, borderRadius: 6, margin: 0, color: '#ffffff' }}>
                          {safety.tag}
                        </Tag>
                      </div>
                    </Col>
                  )}

                  {!hasWaves && current && (
                    <Col xs={24} md={14}>
                      <div
                        style={{
                          background: (current.wind_gust_kt || current.wind_speed_kt || 0) > 22 ? '#fffbeb' : '#f0fdf4',
                          border: `1.5px solid ${(current.wind_gust_kt || current.wind_speed_kt || 0) > 22 ? '#fef3c7' : '#bbf7d0'}`,
                          borderRadius: 8,
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 800, color: (current.wind_gust_kt || current.wind_speed_kt || 0) > 22 ? '#d97706' : '#16a34a', marginRight: 8 }}>
                            {(current.wind_gust_kt || current.wind_speed_kt || 0) > 22 ? 'Viento Racheado' : 'Condiciones Atmosféricas Estables'}
                          </span>
                          <span style={{ fontSize: 11, color: '#334155' }}>
                            Pronóstico atmosférico continental a 10 metros de superficie.
                          </span>
                        </div>
                        <Tag color={(current.wind_gust_kt || current.wind_speed_kt || 0) > 22 ? '#d97706' : '#16a34a'} style={{ fontWeight: 700, borderRadius: 6, margin: 0, color: '#ffffff' }}>
                          TERRESTRE
                        </Tag>
                      </div>
                    </Col>
                  )}
                </Row>

                {/* Tarjetas métricas actuales */}
                {current && (
                  <Row gutter={[12, 12]} style={{ marginTop: 14 }}>
                    {hasWaves ? (
                      /* Métricas Marinas: Viento, Ráfagas, Oleaje, Dirección, TSM, T. Aire, Precipitación */
                      <>
                        <Col xs={12} sm={8} md={3}>
                          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <ThunderboltOutlined style={{ color: '#0284c7', fontSize: 13 }} />
                              <Text style={{ color: '#64748b', fontSize: 9, fontWeight: 700 }}>VIENTO SOST.</Text>
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                              {current.wind_speed_kt != null ? `${current.wind_speed_kt} kt` : '—'}
                            </div>
                            <div style={{ fontSize: 9, color: '#0284c7', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {beaufort?.name}
                            </div>
                          </div>
                        </Col>

                        <Col xs={12} sm={8} md={3}>
                          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <ThunderboltOutlined style={{ color: '#ea580c', fontSize: 13 }} />
                              <Text style={{ color: '#64748b', fontSize: 9, fontWeight: 700 }}>RÁFAGAS MÁX.</Text>
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#ea580c' }}>
                              {current.wind_gust_kt != null ? `${current.wind_gust_kt} kt` : '—'}
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
                              Picos de racha
                            </div>
                          </div>
                        </Col>

                        <Col xs={12} sm={8} md={3}>
                          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <DashboardOutlined style={{ color: '#059669', fontSize: 13 }} />
                              <Text style={{ color: '#64748b', fontSize: 9, fontWeight: 700 }}>ALTURA OLA</Text>
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                              {current.wave_height_m != null ? `${current.wave_height_m} m` : '—'}
                            </div>
                            <div style={{ fontSize: 9, color: '#059669', fontWeight: 600, marginTop: 2 }}>
                              {douglas?.name} {current.wave_period_s ? `· ${current.wave_period_s}s` : ''}
                            </div>
                          </div>
                        </Col>

                        <Col xs={12} sm={8} md={3}>
                          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <CompassOutlined style={{ color: '#0A2647', fontSize: 13 }} />
                              <Text style={{ color: '#64748b', fontSize: 9, fontWeight: 700 }}>DIRECCIÓN</Text>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {getCardinalText(current.wind_dir_deg)}
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
                              {current.wind_dir_deg != null ? `${Math.round(current.wind_dir_deg)}°` : '—'}
                            </div>
                          </div>
                        </Col>

                        <Col xs={12} sm={8} md={4}>
                          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ fontSize: 13 }}>🌊</span>
                              <Text style={{ color: '#64748b', fontSize: 9, fontWeight: 700 }}>TSM MAR</Text>
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#0284c7' }}>
                              {current.sea_temp_c != null ? `${current.sea_temp_c} °C` : '—'}
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
                              Superficie marina
                            </div>
                          </div>
                        </Col>

                        <Col xs={12} sm={8} md={4}>
                          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ fontSize: 13 }}>🌡️</span>
                              <Text style={{ color: '#64748b', fontSize: 9, fontWeight: 700 }}>T. AIRE (2M)</Text>
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#ea580c' }}>
                              {current.air_temp_c != null ? `${current.air_temp_c} °C` : '—'}
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
                              Atmósfera a 2m
                            </div>
                          </div>
                        </Col>

                        <Col xs={12} sm={8} md={4}>
                          <div style={{ background: (current.precip_rate_mmh || 0) >= 0.1 ? '#f0f9ff' : '#ffffff', border: `1px solid ${(current.precip_rate_mmh || 0) >= 0.1 ? '#bae6fd' : '#cbd5e1'}`, borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ fontSize: 13 }}>🌧️</span>
                              <Text style={{ color: '#64748b', fontSize: 9, fontWeight: 700 }}>PRECIPITACIÓN</Text>
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: (current.precip_rate_mmh || 0) >= 0.1 ? '#0284c7' : '#0f172a' }}>
                              {current.precip_rate_mmh != null ? `${current.precip_rate_mmh} mm/h` : '0 mm/h'}
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
                              {getPrecipIntensity(current.precip_rate_mmh)?.name}
                            </div>
                          </div>
                        </Col>
                      </>
                    ) : (
                      /* 5 Métricas Terrestres (Viento, Ráfagas, Dirección, T. Aire, Precipitación) */
                      <>
                        <Col xs={12} sm={8} md={4}>
                          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <ThunderboltOutlined style={{ color: '#0284c7', fontSize: 14 }} />
                              <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 700 }}>VIENTO SOSTENIDO</Text>
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                              {current.wind_speed_kt != null ? `${current.wind_speed_kt} kt` : '—'}
                              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginLeft: 4 }}>
                                ({Math.round((current.wind_speed_kt || 0) * 1.852)} km/h)
                              </span>
                            </div>
                            <div style={{ fontSize: 10, color: '#0284c7', fontWeight: 600, marginTop: 2 }}>
                              {beaufort?.name}
                            </div>
                          </div>
                        </Col>

                        <Col xs={12} sm={8} md={4}>
                          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <ThunderboltOutlined style={{ color: '#ea580c', fontSize: 14 }} />
                              <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 700 }}>RÁFAGAS MÁXIMAS</Text>
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#ea580c' }}>
                              {current.wind_gust_kt != null ? `${current.wind_gust_kt} kt` : `${current.wind_speed_kt || '—'} kt`}
                            </div>
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                              Picos de turbulencia
                            </div>
                          </div>
                        </Col>

                        <Col xs={12} sm={8} md={4}>
                          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <CompassOutlined style={{ color: '#0A2647', fontSize: 14 }} />
                              <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 700 }}>DIRECCIÓN DE VIENTO</Text>
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                              {getCardinalText(current.wind_dir_deg)}
                            </div>
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                              {current.wind_dir_deg != null ? `Ángulo: ${Math.round(current.wind_dir_deg)}°` : '—'}
                            </div>
                          </div>
                        </Col>

                        <Col xs={12} sm={12} md={6}>
                          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ fontSize: 14 }}>🌡️</span>
                              <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 700 }}>TEMP. AIRE (2M)</Text>
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#ea580c' }}>
                              {current.air_temp_c != null ? `${current.air_temp_c} °C` : '—'}
                            </div>
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                              Temperatura a 2m de suelo
                            </div>
                          </div>
                        </Col>

                        <Col xs={12} sm={12} md={6}>
                          <div style={{ background: (current.precip_rate_mmh || 0) >= 0.1 ? '#f0f9ff' : '#ffffff', border: `1px solid ${(current.precip_rate_mmh || 0) >= 0.1 ? '#bae6fd' : '#cbd5e1'}`, borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ fontSize: 14 }}>🌧️</span>
                              <Text style={{ color: '#64748b', fontSize: 10, fontWeight: 700 }}>PRECIPITACIÓN</Text>
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: (current.precip_rate_mmh || 0) >= 0.1 ? '#0284c7' : '#0f172a' }}>
                              {current.precip_rate_mmh != null ? `${current.precip_rate_mmh} mm/h` : '0 mm/h'}
                            </div>
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                              {getPrecipIntensity(current.precip_rate_mmh)?.name}
                            </div>
                          </div>
                        </Col>
                      </>
                    )}
                  </Row>
                )}
              </div>

              {/* Sub-selector Gráficas vs Tabla */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Segmented
                  value={pointSubView}
                  onChange={setPointSubView}
                  options={[
                    { label: '📈 Curvas de Tendencia (5 Días)', value: 'charts', icon: <AreaChartOutlined /> },
                    { label: '📋 Tabla Horaria Completa', value: 'table', icon: <TableOutlined /> },
                  ]}
                />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Resolución horaria continua a 120 horas
                </Text>
              </div>

              {/* Gráficas Detalladas */}
              {pointSubView === 'charts' ? (
                <Row gutter={[16, 16]}>
                  {/* Gráfica Viento y Ráfagas */}
                  <Col xs={24} lg={hasWaves ? 12 : 12}>
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text strong style={{ color: '#0A2647', fontSize: 13 }}>
                          💨 Viento Sostenido y Ráfagas Máximas
                        </Text>
                        <Tag color="blue">Nudos (kt)</Tag>
                      </div>
                      <ResponsiveContainer width="100%" height={230}>
                        <LineChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <ChartTooltip />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="wind_speed_kt" name="Viento Sostenido (kt)" stroke="#0284c7" strokeWidth={2.5} dot={false} />
                          <Line type="monotone" dataKey="wind_gust_kt" name="Ráfaga Máxima (kt)" stroke="#ea580c" strokeWidth={1.8} strokeDasharray="4 4" dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Col>

                  {/* Gráfica Oleaje y Periodo (Solo si hay datos marinos) */}
                  {hasWaves && (
                    <Col xs={24} lg={12}>
                      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <Text strong style={{ color: '#0A2647', fontSize: 13 }}>
                            🌊 Altura Significante de Oleaje ($H_s$)
                          </Text>
                          <Tag color="cyan">Metros (m)</Tag>
                        </div>
                        <ResponsiveContainer width="100%" height={230}>
                          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="unifiedWaveGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#059669" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <ChartTooltip />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Area type="monotone" dataKey="wave_height_m" name="Altura de Ola (m)" stroke="#059669" strokeWidth={2.5} fillOpacity={1} fill="url(#unifiedWaveGrad)" connectNulls />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </Col>
                  )}

                  {/* Gráfica Temperatura Térmica (TSM y Aire) */}
                  {chartData.some((f) => f.sea_temp_c != null || f.air_temp_c != null) && (
                    <Col xs={24} lg={hasWaves ? 12 : 12}>
                      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Text strong style={{ color: '#0A2647', fontSize: 13 }}>
                              🌡️ Gráfica de Temperatura a 5 Días
                            </Text>
                            <Tag color="orange">°C</Tag>
                          </div>
                          
                          {/* Selector dinámico: Ambas | Solo Mar | Solo Aire */}
                          {hasWaves && (
                            <Segmented
                              size="small"
                              value={tempGraphMode}
                              onChange={setTempGraphMode}
                              options={[
                                { label: '⚖️ Ambas (Mar vs Aire)', value: 'both' },
                                { label: '🌊 Solo Mar (TSM)', value: 'sea' },
                                { label: '🌤️ Solo Aire (2m)', value: 'air' },
                              ]}
                            />
                          )}
                        </div>

                        <ResponsiveContainer width="100%" height={230}>
                          {tempGraphMode === 'sea' ? (
                            <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                              <defs>
                                <linearGradient id="seaTempGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                                  <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
                              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}°`} />
                              <ChartTooltip formatter={(v, name) => [`${v} °C`, name]} />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              <Area type="monotone" dataKey="sea_temp_c" name="TSM Temp. Superficial Mar (°C)" stroke="#0284c7" strokeWidth={2.5} fillOpacity={1} fill="url(#seaTempGrad)" connectNulls />
                            </AreaChart>
                          ) : tempGraphMode === 'air' ? (
                            <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                              <defs>
                                <linearGradient id="airTempGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#ea580c" stopOpacity={0.4} />
                                  <stop offset="95%" stopColor="#ea580c" stopOpacity={0.0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
                              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}°`} />
                              <ChartTooltip formatter={(v, name) => [`${v} °C`, name]} />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              <Area type="monotone" dataKey="air_temp_c" name="Temperatura del Aire (2m) (°C)" stroke="#ea580c" strokeWidth={2.5} fillOpacity={1} fill="url(#airTempGrad)" connectNulls />
                            </AreaChart>
                          ) : (
                            <LineChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
                              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}°`} />
                              <ChartTooltip formatter={(v, name) => [`${v} °C`, name]} />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              {hasWaves && (
                                <Line type="monotone" dataKey="sea_temp_c" name="TSM Temp. Superficial Mar (°C)" stroke="#0284c7" strokeWidth={2.5} dot={false} connectNulls />
                              )}
                              <Line type="monotone" dataKey="air_temp_c" name="Temperatura del Aire (2m) (°C)" stroke="#ea580c" strokeWidth={2} strokeDasharray={hasWaves ? '3 3' : '0'} dot={false} connectNulls />
                            </LineChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    </Col>
                  )}

                  {/* Gráfica de Precipitación y Lluvia Acumulada */}
                  <Col xs={24} lg={hasWaves ? 12 : 12}>
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Text strong style={{ color: '#0A2647', fontSize: 13 }}>
                            🌧️ Pronóstico de Precipitación y Lluvia a 5 Días
                          </Text>
                          <Tag color="cyan">mm/h & mm</Tag>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={230}>
                        <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
                          <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                          <ChartTooltip formatter={(v, name) => [name.includes('Intensidad') ? `${v} mm/h` : `${v} mm`, name]} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar yAxisId="left" dataKey="precip_rate_mmh" name="Intensidad de Lluvia (mm/h)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                          <Line yAxisId="right" type="monotone" dataKey="precip_accum_mm" name="Precipitación Acumulada (mm)" stroke="#2563eb" strokeWidth={2.5} dot={false} connectNulls />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </Col>
                </Row>
              ) : (
                /* Tabla Horaria (columnas marinas o terrestres) */
                <Table
                  dataSource={chartData}
                  columns={hasWaves ? marineTableColumns : baseTableColumns}
                  rowKey="forecast_hour"
                  size="small"
                  pagination={{ pageSize: 12, size: 'small', showSizeChanger: true }}
                  scroll={{ x: 750 }}
                />
              )}
            </div>
          )}
        </div>
      ),
    });
  }

  // 2. Tab de Mareas (CICESE) — Solo si Mareas está activo en el mapa
  if (stationSource === 'tides') {
    tabItems.push({
      key: 'tides',
      label: (
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          🌊 Nivel del Mar / Mareas (CICESE)
          {tideStation && (
            <Tag color="cyan" style={{ marginLeft: 6, borderRadius: 10, fontSize: 10 }}>
              {tideStation}
              {nearestTideInfo?.distanceKm != null && !nearestTideInfo.isTooFar ? ` (${nearestTideInfo.distanceKm} km)` : ''}
            </Tag>
          )}
        </span>
      ),
      children: (
        <div>
          {nearestTideInfo && !nearestTideInfo.isTooFar && (
            <div
              style={{
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: 8,
                padding: '6px 12px',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <EnvironmentOutlined style={{ color: '#0284c7' }} />
              <Text style={{ fontSize: 12, color: '#0369a1' }}>
                <strong>Estación mareográfica más cercana al punto seleccionado:</strong> {nearestTideInfo.name} ({nearestTideInfo.code}) a <strong>{nearestTideInfo.distanceKm} km</strong> de distancia.
              </Text>
            </div>
          )}
          {nearestTideInfo?.isTooFar && (
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fef3c7',
                borderRadius: 8,
                padding: '6px 12px',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 14 }}>🌊</span>
              <Text style={{ fontSize: 12, color: '#92400e' }}>
                <strong>Punto en mar abierto / fuera de costa:</strong> La estación mareográfica más cercana es <strong>{nearestTideInfo.name}</strong> a <strong>{nearestTideInfo.distanceKm} km</strong> de distancia.
              </Text>
            </div>
          )}
          <TidesSection
            stations={tideStations}
            stationCode={tideStation}
            onStationChange={onTideStationChange}
          />
        </div>
      ),
    });
  }

  // 3. Tab de Estaciones SMN — Solo si SMN está activo en el mapa
  if (stationSource === 'smn') {
    const currentSmn = smnStations.find((s) => s.id === smnStationId);
    tabItems.push({
      key: 'smn',
      label: (
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          🛰️ Estaciones SMN (EMA)
          {currentSmn && (
            <Tag color="orange" style={{ marginLeft: 6, borderRadius: 10, fontSize: 10 }}>
              {currentSmn.name}
              {nearestSmnInfo?.distanceKm != null && !nearestSmnInfo.isTooFar ? ` (${nearestSmnInfo.distanceKm} km)` : ''}
            </Tag>
          )}
        </span>
      ),
      children: (
        <div>
          {nearestSmnInfo && !nearestSmnInfo.isTooFar && (
            <div
              style={{
                background: '#fff7ed',
                border: '1px solid #ffedd5',
                borderRadius: 8,
                padding: '6px 12px',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <EnvironmentOutlined style={{ color: '#ea580c' }} />
              <Text style={{ fontSize: 12, color: '#9a3412' }}>
                <strong>Estación meteorológica automática (EMA) más cercana:</strong> {nearestSmnInfo.name} a <strong>{nearestSmnInfo.distanceKm} km</strong> de distancia.
              </Text>
            </div>
          )}
          {nearestSmnInfo?.isTooFar && (
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fef3c7',
                borderRadius: 8,
                padding: '6px 12px',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 14 }}>🛰️</span>
              <Text style={{ fontSize: 12, color: '#92400e' }}>
                <strong>Sin estación meteorológica cercana (&lt; 150 km):</strong> La estación más cercana es <strong>{nearestSmnInfo.name}</strong> a <strong>{nearestSmnInfo.distanceKm} km</strong> de distancia.
              </Text>
            </div>
          )}
          <SmnSection
            stations={smnStations}
            stationId={smnStationId}
            onStationChange={onSmnStationChange}
          />
        </div>
      ),
    });
  }

  // 4. Tab de Telemetría de Embarcaciones — Solo si Barcos está activo en el mapa
  if (stationSource === 'telemetry') {
    tabItems.push({
      key: 'telemetry',
      label: (
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          🚢 Telemetría de Embarcaciones
          {selectedVessel && <Tag color="gold" style={{ marginLeft: 6, borderRadius: 10, fontSize: 10 }}>{selectedVessel.name}</Tag>}
        </span>
      ),
      children: (
        <div>
          {/* Selector de Embarcación en Cabecera de la Pestaña */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 12,
              background: '#f8fafc',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>🚢</span>
              <Text strong style={{ color: '#0A2647', fontSize: 13 }}>
                Embarcación Seleccionada:
              </Text>
              {selectedVessel ? (
                <Tag color="#0A2647" style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4 }}>
                  {selectedVessel.name}
                </Tag>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>Ninguna</Text>
              )}
            </div>

            <Space>
              <Text type="secondary" style={{ fontSize: 12 }}>Cambiar embarcación:</Text>
              <Select
                placeholder="Seleccionar embarcación..."
                value={selectedVessel?.id}
                style={{ width: 220 }}
                onChange={(value) => {
                  const vt = vesselsTelemetry.find((v) => v.vessel_id === value);
                  if (vt) {
                    onSelectVessel({ id: vt.vessel_id, name: vt.vessel_name });
                  }
                }}
                options={vesselsTelemetry.map((vt) => ({
                  value: vt.vessel_id,
                  label: `${vt.vessel_name} (${vt.latest_telemetry?.latitude != null ? 'Con GPS' : 'Sin GPS'})`,
                }))}
              />
            </Space>
          </div>

          {selectedVessel ? (
            <VesselTelemetrySection
              vesselId={selectedVessel.id}
              vesselName={selectedVessel.name}
              range={telemetryDates}
              onRangeChange={onTelemetryDatesChange}
              onRecordClick={onRecordClick}
            />
          ) : (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <Empty
                description={
                  <div style={{ maxWidth: 420, margin: '0 auto' }}>
                    <Text strong style={{ fontSize: 14, color: '#0A2647', display: 'block', marginBottom: 4 }}>
                      Selecciona una embarcación
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Elige una embarcación en el menú superior o haz clic en su icono sobre el mapa para revisar su ruta histórica y sensores a bordo.
                    </Text>
                  </div>
                }
              />
            </div>
          )}
        </div>
      ),
    });
  }

  // Resolver pestaña activa real disponible
  const effectiveActiveKey = tabItems.some((t) => t.key === activeTab)
    ? activeTab
    : tabItems[0]?.key || 'point';

  if (tabItems.length === 0) {
    return null;
  }

  return (
    <div ref={ref} style={{ scrollMarginTop: 16 }}>
      <Card
        style={{
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 12px rgba(10, 38, 71, 0.05)',
        }}
        styles={{ body: { padding: '12px 18px' } }}
      >
        <Tabs
          activeKey={effectiveActiveKey}
          onChange={onTabChange}
          items={tabItems}
          type="line"
          size="middle"
        />
      </Card>
    </div>
  );
});

export default UnifiedWeatherDetailSection;
