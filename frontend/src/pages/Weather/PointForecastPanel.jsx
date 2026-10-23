/**
 * SIAE — Ficha de Navegación y Pronóstico Puntual (Modelo GFS/WW3).
 * Traduce variables numéricas a semáforos de seguridad marítima (🟢🟡🔴),
 * escalas Beaufort/Douglas y brújula náutica para usuarios no expertos.
 */
import React, { useState } from 'react';
import { Drawer, Spin, Empty, Table, Typography, Tag, Segmented, Space, Card, Tooltip } from 'antd';
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
import { 
  CompassOutlined, 
  ThunderboltOutlined, 
  DashboardOutlined, 
  SafetyCertificateOutlined,
  WarningOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

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

const columns = [
  { title: 'Fecha/Hora', dataIndex: 'label', width: 105, render: (t) => <strong>{t}</strong> },
  { 
    title: 'Viento', 
    dataIndex: 'wind_speed_kt', 
    width: 75, 
    render: (v) => v != null ? `${v} kt` : '—' 
  },
  { 
    title: 'Ráfaga', 
    dataIndex: 'wind_gust_kt', 
    width: 75, 
    render: (v) => v != null ? `${v} kt` : '—' 
  },
  { 
    title: 'Dir.', 
    dataIndex: 'wind_dir_deg', 
    width: 85, 
    render: (v) => getCardinalText(v) 
  },
  { 
    title: 'Ola (m)', 
    dataIndex: 'wave_height_m', 
    width: 75, 
    render: (v) => v != null ? `${v} m` : '—' 
  },
  { 
    title: 'Periodo', 
    dataIndex: 'wave_period_s', 
    width: 75, 
    render: (v) => v != null ? `${v} s` : '—' 
  },
  {
    title: 'Lluvia',
    dataIndex: 'precip_rate_mmh',
    width: 85,
    render: (v) => (v != null && v >= 0.1 ? (
      <span style={{ color: '#0284c7', fontWeight: 700 }}>{v} mm/h</span>
    ) : (
      <span style={{ color: '#94a3b8' }}>0 mm/h</span>
    )),
  },
  {
    title: 'Acum.',
    dataIndex: 'precip_accum_mm',
    width: 75,
    render: (v) => (v != null && v >= 0.1 ? (
      <span style={{ color: '#0369a1', fontWeight: 600 }}>{v} mm</span>
    ) : (
      <span style={{ color: '#94a3b8' }}>0 mm</span>
    )),
  },
];

export default function PointForecastPanel({
  open,
  onClose,
  pointName,
  loading,
  forecast = [],
  selectedHour = 0,
}) {
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'charts' | 'table'

  const chartData = (forecast || []).map((f) => ({
    ...f,
    label: dayjs(f.time).format('DD/MM HH:mm'),
  }));

  const tickInterval = Math.max(0, Math.ceil(chartData.length / 7) - 1);

  // Datos dinámicos según hora de simulación
  const current = (forecast || []).find((f) => f.forecast_hour === selectedHour)
    || (forecast && forecast.length > 0 ? forecast[0] : null);
  const safety = current
    ? getMaritimeSafetyStatus(current.wind_speed_kt, current.wind_gust_kt, current.wave_height_m)
    : null;

  const beaufort = current ? getWindBeaufort(current.wind_speed_kt) : null;
  const douglas = current ? getWaveDouglas(current.wave_height_m) : null;
  const precipIntensity = current ? getPrecipIntensity(current.precip_rate_mmh) : null;

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🧭</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0A2647' }}>
              {pointName || 'Ficha de Navegación y Pronóstico'}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>
              Modelo Numérico GFS 0.25° (Viento/Lluvia) & WaveWatch III (Oleaje)
            </div>
          </div>
        </div>
      }
      open={open}
      onClose={onClose}
      width={520}
      styles={{ body: { padding: '16px 18px' } }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Spin size="large" />
          <span style={{ color: '#64748b', fontSize: 13 }}>Consultando malla del modelo meteorológico...</span>
        </div>
      ) : !forecast || forecast.length === 0 ? (
        <Empty description="No hay datos de pronóstico disponibles para este punto" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Selector de Pestañas */}
          <Segmented
            block
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { label: '🧭 Ficha de Navegación', value: 'summary' },
              { label: '📈 Gráficas (5 Días)', value: 'charts' },
              { label: '📋 Tabla Horaria', value: 'table' },
            ]}
          />

          {/* ══════════ PESTAÑA 1: FICHA DE NAVEGACIÓN Y SEMÁFORO ══════════ */}
          {activeTab === 'summary' && current && safety && (
            <>
              {/* Tarjeta de Semáforo Náutico */}
              <div
                style={{
                  background: safety.bgColor,
                  border: `1.5px solid ${safety.borderColor}`,
                  borderRadius: 12,
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: safety.color }}>
                    {safety.title}
                  </span>
                  <Tag color={safety.color} style={{ fontWeight: 800, borderRadius: 6, margin: 0, color: '#ffffff' }}>
                    {safety.tag}
                  </Tag>
                </div>
                <Text style={{ color: '#334155', fontSize: 12, lineHeight: 1.4, display: 'block' }}>
                  {safety.advice}
                </Text>
              </div>

              {/* Grid de Variables Clave Náuticas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {/* Caja Viento */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <ThunderboltOutlined style={{ color: '#0284c7', fontSize: 16 }} />
                    <Text style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>VIENTO SOSTENIDO</Text>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                    {current.wind_speed_kt != null ? `${current.wind_speed_kt} kt` : '—'}
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginLeft: 6 }}>
                      ({Math.round((current.wind_speed_kt || 0) * 1.852)} km/h)
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#0284c7', fontWeight: 600, marginTop: 4 }}>
                    Escala: {beaufort?.name}
                  </div>
                  {current.wind_gust_kt != null && (
                    <div style={{ fontSize: 11, color: '#ea580c', fontWeight: 600, marginTop: 2 }}>
                      Ráfagas de hasta: {current.wind_gust_kt} kt
                    </div>
                  )}
                </div>

                {/* Caja Oleaje */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <DashboardOutlined style={{ color: '#059669', fontSize: 16 }} />
                    <Text style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>ALTURA DE OLA</Text>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                    {current.wave_height_m != null ? `${current.wave_height_m} m` : '—'}
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginLeft: 6 }}>
                      ({((current.wave_height_m || 0) * 3.28084).toFixed(1)} ft)
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginTop: 4 }}>
                    Escala: {douglas?.name}
                  </div>
                  {current.wave_period_s != null && (
                    <div style={{ fontSize: 11, color: '#475569', fontWeight: 500, marginTop: 2 }}>
                      Periodo: {current.wave_period_s} segundos (Swell)
                    </div>
                  )}
                </div>
              </div>

              {/* Fila Precipitación / Lluvia */}
              <div
                style={{
                  background: (current.precip_rate_mmh || 0) >= 0.1 ? '#f0f9ff' : '#f8fafc',
                  border: `1px solid ${(current.precip_rate_mmh || 0) >= 0.1 ? '#bae6fd' : '#e2e8f0'}`,
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>🌧️</span>
                  <div>
                    <Text style={{ color: '#64748b', fontSize: 11, display: 'block', fontWeight: 700 }}>
                      PRECIPITACIÓN (MODELO GFS)
                    </Text>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                      {current.precip_rate_mmh != null ? `${current.precip_rate_mmh} mm/h` : '0 mm/h'}
                      <span style={{ fontSize: 11, color: precipIntensity?.color || '#64748b', fontWeight: 600, marginLeft: 8 }}>
                        · {precipIntensity?.name}
                      </span>
                    </div>
                  </div>
                </div>
                {current.precip_accum_mm != null && (
                  <Tag color="blue" style={{ borderRadius: 6, fontWeight: 700, padding: '3px 8px' }}>
                    Acum: {current.precip_accum_mm} mm
                  </Tag>
                )}
              </div>

              {/* Rosa Náutica / Dirección del Viento */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: '#0A2647',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 6px rgba(10, 38, 71, 0.25)',
                    }}
                  >
                    <CompassOutlined
                      style={{
                        fontSize: 22,
                        transform: `rotate(${current.wind_dir_deg || 0}deg)`,
                        transition: 'transform 0.3s ease',
                      }}
                    />
                  </div>
                  <div>
                    <Text style={{ color: '#64748b', fontSize: 11, display: 'block', fontWeight: 700 }}>DIRECCIÓN DE VIENTO</Text>
                    <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: 700 }}>
                      Sopla desde: {getCardinalText(current.wind_dir_deg)}
                    </Text>
                  </div>
                </div>
                <Tag color="#0A2647" style={{ borderRadius: 6, fontWeight: 700 }}>
                  {current.wind_dir_deg != null ? `${Math.round(current.wind_dir_deg)}°` : '—'}
                </Tag>
              </div>

              {/* Mini Gráfica de Tendencia a 5 Días */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ color: '#0A2647', fontSize: 12, fontWeight: 700 }}>
                    TENDENCIA DE VIENTO (PRÓXIMOS 5 DÍAS)
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: 10 }}>Nudos (kt)</Text>
                </div>
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="windGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={tickInterval} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <ChartTooltip />
                    <Area type="monotone" dataKey="wind_speed_kt" name="Viento (kt)" stroke="#0284c7" strokeWidth={2} fillOpacity={1} fill="url(#windGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* ══════════ PESTAÑA 2: GRÁFICAS DETALLADAS ══════════ */}
          {activeTab === 'charts' && (
            <>
              <div>
                <Text strong style={{ color: '#0A2647', fontSize: 12, display: 'block', marginBottom: 6 }}>
                  Viento Sostenido y Ráfagas (Nudos)
                </Text>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={tickInterval} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <ChartTooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="wind_speed_kt" name="Viento" stroke="#0284c7" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="wind_gust_kt" name="Ráfaga" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={{ marginTop: 10 }}>
                <Text strong style={{ color: '#0A2647', fontSize: 12, display: 'block', marginBottom: 6 }}>
                  Altura Significante de Oleaje (Metros)
                </Text>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={tickInterval} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <ChartTooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="wave_height_m" name="Altura de ola (m)" stroke="#059669" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={{ marginTop: 10 }}>
                <Text strong style={{ color: '#0A2647', fontSize: 12, display: 'block', marginBottom: 6 }}>
                  🌧️ Precipitación / Lluvia (mm/h) y Acumulada (mm)
                </Text>
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={tickInterval} />
                    <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 9 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} />
                    <ChartTooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="precip_rate_mmh" name="Intensidad (mm/h)" fill="#38bdf8" />
                    <Line yAxisId="right" type="monotone" dataKey="precip_accum_mm" name="Acumulada (mm)" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* ══════════ PESTAÑA 3: TABLA HORARIA ══════════ */}
          {activeTab === 'table' && (
            <Table
              dataSource={chartData}
              columns={columns}
              rowKey="forecast_hour"
              size="small"
              pagination={{ pageSize: 10, size: 'small' }}
              scroll={{ y: 360 }}
            />
          )}
        </div>
      )}
    </Drawer>
  );
}
