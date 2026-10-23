import React, { useEffect, useState } from 'react';
import { Modal, Tag, Spin, Row, Col, Card, Alert, Typography, Button, Space, Tooltip, Segmented } from 'antd';
import {
  LineChartOutlined,
  GlobalOutlined,
  CompassOutlined,
  CheckOutlined,
  PlusOutlined,
  FundViewOutlined,
} from '@ant-design/icons';
import { MapContainer, TileLayer, Rectangle, Marker, Popup, useMap } from 'react-leaflet';
import L from '../../utils/leafletGlobal';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import apiClient from '../../api/client';

const { Text } = Typography;

const REGION_CONFIGS = [
  {
    key: 'nino12',
    name: 'Niño 1+2',
    subtitle: 'Costa Oriental',
    coords: '0°-10°S, 90°W-80°W',
    bounds: [[0, -90], [-10, -80]],
    center: [-5, -85],
    dataKey: 'nino12_anom',
    sstKey: 'nino12_sst',
    anomalyField: 'nino12_anomaly',
    sstField: 'nino12_sst',
    color: '#ea580c', // Naranja intenso
    strokeDasharray: '4 4',
    strokeWidth: 2,
    badge: 'Niño 1+2 (Costa)',
    desc: 'Región costera sudamericana y entrada al Pacífico oriental. Es la primera en calentarse y genera impactos directos en la Corriente de California.',
  },
  {
    key: 'nino3',
    name: 'Niño 3',
    subtitle: 'Pacífico Oriental',
    coords: '5°N-5°S, 150°W-90°W',
    bounds: [[5, -150], [-5, -90]],
    center: [0, -120],
    dataKey: 'nino3_anom',
    sstKey: 'nino3_sst',
    anomalyField: 'nino3_anomaly',
    sstField: 'nino3_sst',
    color: '#d97706', // Ámbar / Oro
    strokeDasharray: '3 3',
    strokeWidth: 2,
    badge: 'Niño 3 (Oriental)',
    desc: 'Cuadrante oriental de surgencia ecuatorial. Refleja la inclinación de la termoclina y el transporte de calor hacia México.',
  },
  {
    key: 'nino34',
    name: 'Niño 3.4',
    subtitle: 'Clave Oficial (ONI)',
    coords: '5°N-5°S, 170°W-120°W',
    bounds: [[5, -170], [-5, -120]],
    center: [0, -145],
    dataKey: 'nino34_anom',
    sstKey: 'nino34_sst',
    anomalyField: 'nino34_anomaly',
    sstField: 'nino34_sst',
    color: '#dc2626', // Rojo
    strokeDasharray: undefined,
    strokeWidth: 2.8,
    badge: 'Niño 3.4 (Clave ONI)',
    desc: 'Índice de referencia oficial de NOAA y la OMM. Define formalmente los eventos de El Niño (≥ +0.5°C) y La Niña (≤ -0.5°C).',
  },
  {
    key: 'nino4',
    name: 'Niño 4',
    subtitle: 'Pacífico Central',
    coords: '5°N-5°S, 160°E-150°W',
    bounds: [[5, -200], [-5, -150]],
    center: [0, -175],
    dataKey: 'nino4_anom',
    sstKey: 'nino4_sst',
    anomalyField: 'nino4_anomaly',
    sstField: 'nino4_sst',
    color: '#0284c7', // Azul / Cian
    strokeDasharray: '5 3',
    strokeWidth: 2,
    badge: 'Niño 4 (Central)',
    desc: 'Piscina cálida del Pacífico central y occidental. Modula la convección atmosférica y el acoplamiento océano-atmósfera (Modoki).',
  },
];

function EnsoMapController() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize();
      map.setView([0, -135], 2);
    }, 150);
  }, [map]);
  return null;
}

export default function EnsoTrackerModal({ visible, onClose }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Modo de visualización: 'temporal' (gráfica semanal) | 'spatial' (mapa del pacífico)
  const [viewMode, setViewMode] = useState('temporal');

  // Selección de regiones visibles en la gráfica (por defecto todas activas)
  const [selectedRegions, setSelectedRegions] = useState({
    nino12: true,
    nino3: true,
    nino34: true,
    nino4: true,
  });

  const toggleRegion = (key) => {
    setSelectedRegions((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const hasAny = Object.values(next).some(Boolean);
      return hasAny ? next : prev;
    });
  };

  const selectAllRegions = () => {
    setSelectedRegions({ nino12: true, nino3: true, nino34: true, nino4: true });
  };

  const selectOnlyNino34 = () => {
    setSelectedRegions({ nino12: false, nino3: false, nino34: true, nino4: false });
  };

  const loadEnsoData = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiClient.get('/weather/enso/status');
      setData(resp.data);
    } catch (err) {
      console.error('Error fetching ENSO status:', err);
      setError('No se pudo cargar la información del fenómeno El Niño de la NOAA.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadEnsoData();
    }
  }, [visible]);

  const latest = data?.latest;
  const history = data?.history || [];

  // Formatear datos para el gráfico de 16 semanas con las 4 regiones
  const chartData = history.map((item) => ({
    label: item.label || item.date,
    date: item.date,
    nino12_anom: item.nino12?.anom,
    nino3_anom: item.nino3?.anom,
    nino34_anom: item.nino34?.anom,
    nino4_anom: item.nino4?.anom,
    nino12_sst: item.nino12?.sst,
    nino3_sst: item.nino3?.sst,
    nino34_sst: item.nino34?.sst,
    nino4_sst: item.nino4?.sst,
  }));

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={[
        <div key="footer-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
            Sincronizado automáticamente en segundo plano con el servidor de la NOAA (CPC)
          </Text>
          <Button key="close" type="primary" onClick={onClose} style={{ background: '#0A2647', borderColor: '#0A2647', borderRadius: 8, fontWeight: 600 }}>
            Cerrar
          </Button>
        </div>,
      ]}
      width={900}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #ea580c 0%, #b91c1c 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: 18,
            }}
          >
            🌋
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Monitoreo del Fenómeno El Niño / Oscilación del Sur (ENSO)
            </div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>
              Índices oficiales semanales de Temperatura Superficial del Mar — NOAA Climate Prediction Center (CPC)
            </div>
          </div>
        </div>
      }
      styles={{ body: { maxHeight: '75vh', overflowY: 'auto', paddingRight: 4 } }}
    >
      {loading && !data && (
        <div style={{ padding: 50, textAlign: 'center' }}>
          <Spin size="large" tip="Consultando índices oceanográficos de NOAA CPC..." />
        </div>
      )}

      {error && (
        <Alert
          type="warning"
          message="Error de conexión"
          description={error}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* BANNER DE ESTADO PRINCIPAL */}
          <div
            style={{
              background: `linear-gradient(135deg, ${data.color}15 0%, #ffffff 100%)`,
              border: `1.5px solid ${data.color}50`,
              borderRadius: 12,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Tag
                  color={data.color}
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 6,
                    border: 'none',
                  }}
                >
                  {data.category}
                </Tag>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  Semana actualizada al: <strong>{data.updated_at}</strong>
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#334155', maxWidth: 540, lineHeight: 1.4 }}>
                {data.description}
              </div>
            </div>

            {/* Gauge Rápido Anomaly Niño 3.4 */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '8px 16px',
                textAlign: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                Anomalía Niño 3.4 (ONI)
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: data.color }}>
                {latest?.nino34_anomaly > 0 ? `+${latest?.nino34_anomaly}°C` : `${latest?.nino34_anomaly}°C`}
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>
                TSM Absoluta: <strong>{latest?.nino34_sst}°C</strong>
              </div>
            </div>
          </div>

          {/* TARJETAS INTERACTIVAS DE LAS 4 REGIONES NIÑO */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                <GlobalOutlined style={{ color: '#0284c7' }} />
                Anomalías de TSM por Región del Pacífico Ecuatorial (NOAA OISST)
              </div>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {viewMode === 'temporal'
                  ? 'Clic en tarjeta para incluir/excluir de la gráfica'
                  : 'Cuadrantes oceánicos en tiempo real'}
              </span>
            </div>

            <Row gutter={[10, 10]}>
              {REGION_CONFIGS.map((reg) => {
                const isSelected = !!selectedRegions[reg.key];
                const anomVal = latest?.[reg.anomalyField];
                const sstVal = latest?.[reg.sstField];

                return (
                  <Col xs={12} sm={6} key={reg.key}>
                    <Tooltip title={viewMode === 'temporal' ? (isSelected ? `Ocultar ${reg.name} de la gráfica` : `Mostrar ${reg.name} en la gráfica`) : reg.desc}>
                      <Card
                        size="small"
                        onClick={() => {
                          if (viewMode === 'temporal') {
                            toggleRegion(reg.key);
                          }
                        }}
                        style={{
                          background: isSelected ? `${reg.color}08` : '#f8fafc',
                          borderColor: isSelected ? reg.color : '#e2e8f0',
                          borderWidth: isSelected ? 2 : 1,
                          borderRadius: 10,
                          textAlign: 'center',
                          cursor: viewMode === 'temporal' ? 'pointer' : 'default',
                          transition: 'all 0.2s ease',
                          opacity: isSelected || viewMode === 'spatial' ? 1 : 0.65,
                          transform: isSelected && viewMode === 'temporal' ? 'scale(1.02)' : 'none',
                          boxShadow: isSelected ? `0 4px 12px ${reg.color}25` : 'none',
                        }}
                        styles={{ body: { padding: '10px 8px' } }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: reg.color }}>
                            {reg.name}
                          </span>
                          {viewMode === 'temporal' ? (
                            <Tag
                              color={isSelected ? reg.color : 'default'}
                              style={{
                                fontSize: 9,
                                padding: '0 4px',
                                lineHeight: '16px',
                                margin: 0,
                                borderRadius: 4,
                              }}
                            >
                              {isSelected ? <CheckOutlined /> : <PlusOutlined />}
                            </Tag>
                          ) : (
                            <span style={{ fontSize: 10 }}>📍</span>
                          )}
                        </div>
                        <div style={{ fontSize: 9, color: '#64748b' }}>{reg.subtitle}</div>
                        <div style={{ fontSize: 8.5, color: '#94a3b8', marginBottom: 2 }}>{reg.coords}</div>
                        <div
                          style={{
                            fontSize: 19,
                            fontWeight: 800,
                            color: anomVal >= 0.5 ? '#b91c1c' : anomVal <= -0.5 ? '#1d4ed8' : '#059669',
                          }}
                        >
                          {anomVal > 0 ? `+${anomVal}°C` : `${anomVal}°C`}
                        </div>
                        <div style={{ fontSize: 10, color: '#475569', fontWeight: 500 }}>
                          TSM: <strong>{sstVal}°C</strong>
                        </div>
                      </Card>
                    </Tooltip>
                  </Col>
                );
              })}
            </Row>
          </div>

          {/* SELECTOR ENTRE VISTA TEMPORAL (GRÁFICA) Y VISTA ESPACIAL (MAPA) */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
            <Segmented
              size="middle"
              value={viewMode}
              onChange={setViewMode}
              options={[
                {
                  label: (
                    <div style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                      <LineChartOutlined style={{ color: viewMode === 'temporal' ? '#0284c7' : '#64748b' }} />
                      <span>Evolución Temporal (16 Semanas)</span>
                    </div>
                  ),
                  value: 'temporal',
                },
                {
                  label: (
                    <div style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                      <FundViewOutlined style={{ color: viewMode === 'spatial' ? '#0284c7' : '#64748b' }} />
                      <span>Vista Espacial del Pacífico (Mapa)</span>
                    </div>
                  ),
                  value: 'spatial',
                },
              ]}
              style={{
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: 20,
                padding: 3,
              }}
            />
          </div>

          {/* 1. MODO TEMPORAL: GRÁFICO HISTÓRICO DE 16 SEMANAS CON SELECTOR DINÁMICO */}
          {viewMode === 'temporal' && chartData.length > 0 && (
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '14px 16px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              }}
            >
              {/* Cabecera del gráfico con filtros interactivos */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom: '1px solid #f1f5f9',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <LineChartOutlined style={{ color: '#0284c7', fontSize: 15 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                    Evolución Semanal de Anomalías Térmicas (°C) — Últimas 16 Semanas
                  </span>
                </div>

                {/* Botones de acción rápida de filtrado */}
                <Space size={6}>
                  <Button
                    size="small"
                    type="link"
                    onClick={selectAllRegions}
                    style={{ fontSize: 11, padding: '0 4px', height: 'auto', fontWeight: 600 }}
                  >
                    Mostrar las 4 regiones
                  </Button>
                  <span style={{ color: '#cbd5e1' }}>|</span>
                  <Button
                    size="small"
                    type="link"
                    onClick={selectOnlyNino34}
                    style={{ fontSize: 11, padding: '0 4px', height: 'auto', color: '#dc2626', fontWeight: 600 }}
                  >
                    Solo Niño 3.4 (ONI)
                  </Button>
                </Space>
              </div>

              {/* Selector de Chips interactivos para cada una de las 4 regiones */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Graficar:</span>
                {REGION_CONFIGS.map((reg) => {
                  const active = !!selectedRegions[reg.key];
                  return (
                    <button
                      key={reg.key}
                      type="button"
                      onClick={() => toggleRegion(reg.key)}
                      style={{
                        background: active ? reg.color : '#f1f5f9',
                        color: active ? '#ffffff' : '#64748b',
                        border: `1px solid ${active ? reg.color : '#cbd5e1'}`,
                        borderRadius: 20,
                        padding: '3px 10px',
                        fontSize: 11,
                        fontWeight: active ? 700 : 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>{active ? '✓' : '+'}</span>
                      <span>{reg.name} ({reg.subtitle})</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ width: '100%', height: 230 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis
                      domain={['auto', 'auto']}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={(val) => `${val > 0 ? `+${val}` : val}°C`}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        background: 'rgba(15, 23, 42, 0.94)',
                        border: 'none',
                        borderRadius: 8,
                        color: '#ffffff',
                        fontSize: 11,
                        boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
                      }}
                      formatter={(val, name) => {
                        const reg = REGION_CONFIGS.find((r) => r.dataKey === name);
                        return [`${val > 0 ? `+${val}` : val}°C`, reg ? reg.badge : name];
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={24}
                      formatter={(val) => {
                        const reg = REGION_CONFIGS.find((r) => r.dataKey === val);
                        return reg ? reg.badge : val;
                      }}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                    <ReferenceLine y={0.0} stroke="#94a3b8" strokeDasharray="4 4" />
                    <ReferenceLine y={0.5} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '+0.5°C Niño', fill: '#ef4444', fontSize: 9 }} />
                    <ReferenceLine y={-0.5} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: '-0.5°C Niña', fill: '#3b82f6', fontSize: 9 }} />

                    {/* Líneas dinámicas renderizadas según selección del usuario */}
                    {REGION_CONFIGS.map((reg) => {
                      if (!selectedRegions[reg.key]) return null;
                      return (
                        <Line
                          key={reg.key}
                          type="monotone"
                          dataKey={reg.dataKey}
                          name={reg.dataKey}
                          stroke={reg.color}
                          strokeWidth={reg.strokeWidth}
                          strokeDasharray={reg.strokeDasharray}
                          dot={{ r: 3, fill: reg.color }}
                          activeDot={{ r: 5 }}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 2. MODO ESPACIAL: MAPA DEL PACÍFICO CON LAS 4 REGIONES DELIMITADAS */}
          {viewMode === 'spatial' && (
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '12px 14px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FundViewOutlined style={{ color: '#0284c7' }} />
                  Distribución Espacial de Cuadrantes Niño en el Pacífico Ecuatorial
                </div>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Haz clic en un cuadrante para ver sus detalles y cobertura
                </span>
              </div>

              <div style={{ height: 260, width: '100%', borderRadius: 10, overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                <MapContainer
                  center={[0, -135]}
                  zoom={2}
                  minZoom={2}
                  maxZoom={6}
                  style={{ height: '100%', width: '100%', background: '#091528' }}
                >
                  <EnsoMapController />
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  />

                  {/* Cuadrantes de las 4 regiones Niño */}
                  {REGION_CONFIGS.map((reg) => {
                    const anomVal = latest?.[reg.anomalyField];
                    const sstVal = latest?.[reg.sstField];

                    const badgeIcon = L.divIcon({
                      className: 'enso-region-badge',
                      html: `
                        <div style="
                          background: rgba(15, 23, 42, 0.90);
                          backdrop-filter: blur(6px);
                          border: 1.5px solid ${reg.color};
                          border-radius: 8px;
                          padding: 3px 8px;
                          color: #ffffff;
                          box-shadow: 0 4px 10px rgba(0,0,0,0.4);
                          text-align: center;
                          white-space: nowrap;
                          transform: translate(-50%, -50%);
                        ">
                          <div style="font-size: 10px; font-weight: 800; color: ${reg.color};">${reg.name}</div>
                          <div style="font-size: 11px; font-weight: 800; color: #ffffff;">${anomVal > 0 ? `+${anomVal}°C` : `${anomVal}°C`}</div>
                        </div>
                      `,
                      iconSize: [0, 0],
                    });

                    return (
                      <React.Fragment key={reg.key}>
                        <Rectangle
                          bounds={reg.bounds}
                          pathOptions={{
                            color: reg.color,
                            weight: 2,
                            dashArray: reg.key === 'nino34' ? undefined : '4, 4',
                            fillColor: reg.color,
                            fillOpacity: reg.key === 'nino34' ? 0.35 : 0.22,
                          }}
                        >
                          <Popup>
                            <div style={{ minWidth: 180, padding: 2 }}>
                              <strong style={{ color: reg.color, fontSize: 13, display: 'block', marginBottom: 2 }}>
                                {reg.badge}
                              </strong>
                              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                                Coordenadas: <strong>{reg.coords}</strong>
                              </div>
                              <div style={{ background: '#f8fafc', borderRadius: 6, padding: '6px 8px', border: '1px solid #e2e8f0', marginBottom: 6 }}>
                                <div style={{ fontSize: 12 }}>
                                  Anomalía TSM: <strong style={{ color: anomVal >= 0.5 ? '#b91c1c' : anomVal <= -0.5 ? '#1d4ed8' : '#059669' }}>
                                    {anomVal > 0 ? `+${anomVal}°C` : `${anomVal}°C`}
                                  </strong>
                                </div>
                                <div style={{ fontSize: 11, color: '#475569' }}>
                                  TSM Media: <strong>{sstVal}°C</strong>
                                </div>
                              </div>
                              <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.3 }}>
                                {reg.desc}
                              </div>
                            </div>
                          </Popup>
                        </Rectangle>

                        {/* Etiqueta flotante con el nombre y anomalía */}
                        <Marker position={reg.center} icon={badgeIcon}>
                          <Popup>
                            <div style={{ fontSize: 11 }}>
                              <strong>{reg.name} ({reg.subtitle})</strong><br />
                              Anomalía: <strong>{anomVal > 0 ? `+${anomVal}°C` : `${anomVal}°C`}</strong><br />
                              TSM: <strong>{sstVal}°C</strong>
                            </div>
                          </Popup>
                        </Marker>
                      </React.Fragment>
                    );
                  })}
                </MapContainer>
              </div>

              {/* Leyenda explicativa inferior de la vista espacial */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#64748b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#ea580c' }} /> Niño 1+2 (Costa)
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#d97706' }} /> Niño 3 (Oriental)
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#dc2626', border: '1px solid #991b1b' }} /> Niño 3.4 (Clave ONI)
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#0284c7' }} /> Niño 4 (Central)
                  </span>
                </div>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>
                  Dominio longitudinal: 160°E $\rightarrow$ 80°W
                </span>
              </div>
            </div>
          )}

          {/* IMPACTOS OCEANOGRÁFICOS Y DE NAVEGACIÓN PARA CICESE */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '12px 16px',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CompassOutlined style={{ color: '#0284c7' }} />
              Implicaciones Oceanográficas y Operacionales (Campañas CICESE)
            </div>

            <Row gutter={[12, 8]}>
              <Col xs={24} sm={8}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#0f172a' }}>🌊 Costa Occidental y Ensenada:</div>
                <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.3 }}>
                  {data.oceanographic_impact?.baja_california}
                </div>
              </Col>
              <Col xs={24} sm={8}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#0f172a' }}>☀️ Golfo de California:</div>
                <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.3 }}>
                  {data.oceanographic_impact?.golfo_de_california}
                </div>
              </Col>
              <Col xs={24} sm={8}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#0f172a' }}>🌀 Actividad Ciclónica (Pacífico):</div>
                <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.3 }}>
                  {data.oceanographic_impact?.ciclon_risk}
                </div>
              </Col>
            </Row>
          </div>
        </div>
      )}
    </Modal>
  );
}
