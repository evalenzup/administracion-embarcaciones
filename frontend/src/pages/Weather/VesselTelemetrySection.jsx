/**
 * SIAE — Sección de telemetría meteorológica y de posición de embarcaciones.
 * Muestra gráficos históricos de sensores a bordo y tabla de mediciones recientes.
 */
import { useCallback, useEffect, useState, useMemo } from 'react';
import { Card, Col, Empty, Row, Segmented, Spin, Table, Tag, Typography, message, DatePicker, Button, Space } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import L from 'leaflet';

const { Text } = Typography;
const { RangePicker } = DatePicker;

/** Convierte dirección en grados a texto descriptivo y punto cardinal */
function getWindDirectionText(deg) {
  if (deg == null) return '—';
  const normalized = (deg % 360 + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  const directions = [
    { name: 'Norte', abbr: 'N' },
    { name: 'Norte-Noreste', abbr: 'NNE' },
    { name: 'Noreste', abbr: 'NE' },
    { name: 'Este-Noreste', abbr: 'ENE' },
    { name: 'Este', abbr: 'E' },
    { name: 'Este-Sureste', abbr: 'ESE' },
    { name: 'Sureste', abbr: 'SE' },
    { name: 'Sur-Sureste', abbr: 'SSE' },
    { name: 'Sur', abbr: 'S' },
    { name: 'Sur-Suroeste', abbr: 'SSW' },
    { name: 'Suroeste', abbr: 'SW' },
    { name: 'Oeste-Suroeste', abbr: 'WSW' },
    { name: 'Oeste', abbr: 'W' },
    { name: 'Oeste-Noroeste', abbr: 'WNW' },
    { name: 'Noroeste', abbr: 'NW' },
    { name: 'Norte-Noroeste', abbr: 'NNW' }
  ];
  return `${directions[index].name} (${directions[index].abbr})`;
}

const columns = [
  { 
    title: 'Fecha/Hora', 
    dataIndex: 'timestamp', 
    width: 115, 
    render: (v) => dayjs(v).format('DD/MM HH:mm') 
  },
  { 
    title: 'Posición', 
    key: 'position', 
    width: 130, 
    render: (_, record) => 
      record.latitude != null && record.longitude != null && (record.latitude !== 0 || record.longitude !== 0)
        ? `${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}` 
        : 'Sin GPS'
  },
  { title: 'Temp', dataIndex: 'temp', width: 70, render: (v) => (v != null ? `${v.toFixed(1)}°C` : '—') },
  { title: 'Hum', dataIndex: 'humidity', width: 70, render: (v) => (v != null ? `${Math.round(v)}%` : '—') },
  { title: 'Presión', dataIndex: 'pressure', width: 85, render: (v) => (v != null ? `${v.toFixed(1)} hPa` : '—') },
  { 
    title: 'Precip', 
    dataIndex: 'precip_total', 
    width: 80, 
    render: (v) => (v != null ? `${v.toFixed(1)} mm` : '—') 
  },
  { 
    title: 'Viento (Corr)', 
    key: 'wind', 
    width: 110, 
    render: (_, record) => {
      const speed = record.wind_speed_corr != null ? record.wind_speed_corr : record.wind_speed;
      const dir = record.wind_dir_corr != null ? record.wind_dir_corr : record.wind_dir;
      if (speed == null) return '—';
      // Convertir m/s a nudos para los marinos
      const speedKts = speed * 1.94384;
      return `${speedKts.toFixed(1)} kt${dir != null ? ` (${Math.round(dir)}°)` : ''}`;
    }
  },
  { 
    title: 'Batería', 
    dataIndex: 'supply_v', 
    width: 80, 
    render: (v) => (v != null ? `${v.toFixed(1)} V` : '—') 
  },
  { 
    title: 'Estado', 
    dataIndex: 'status', 
    width: 70, 
    render: (v) => {
      if (!v) return '—';
      const isOk = v === '0000' || v === '0';
      return <Tag color={isOk ? 'success' : 'warning'}>{v}</Tag>;
    }
  },
];

function VesselTelemetrySection({ vesselId, vesselName, range, onRangeChange, onRecordClick }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chartType, setChartType] = useState('temp_hum');

  const fetchData = useCallback(async () => {
    if (!vesselId || !range || range.length < 2) return;
    setLoading(true);
    try {
      const [start, end] = range;
      const r = await apiClient.get(`/vessels/${vesselId}/telemetry`, {
        params: { 
          start: start.toISOString(),
          end: end.toISOString()
        }
      });
      setHistory(r.data);
    } catch {
      message.error('Error al cargar la telemetría de la embarcación');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [vesselId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calcular promedios y totales meteorológicos y de viaje para el rango
  const stats = useMemo(() => {
    if (!history || history.length < 2) return null;
    
    // 1. Filtrar registros con GPS válido para distancia
    const validPts = history.filter(p => p.latitude != null && p.longitude != null && (p.latitude !== 0 || p.longitude !== 0));
    
    let distanceNm = 0;
    if (validPts.length >= 2) {
      let totalMeters = 0;
      for (let i = 1; i < validPts.length; i++) {
        const p1 = L.latLng(validPts[i - 1].latitude, validPts[i - 1].longitude);
        const p2 = L.latLng(validPts[i].latitude, validPts[i].longitude);
        totalMeters += p1.distanceTo(p2);
      }
      distanceNm = totalMeters / 1852;
    }

    const startTime = new Date(history[0].timestamp);
    const endTime = new Date(history[history.length - 1].timestamp);
    const durationMs = endTime - startTime;
    const durationHours = durationMs / 3600000;
    
    let avgSpeedKnots = null;
    if (durationHours > 0) {
      avgSpeedKnots = distanceNm / durationHours;
    }

    // 2. Promedios meteorológicos
    let totalTemp = 0, countTemp = 0;
    let totalPressure = 0, countPressure = 0;
    let totalHumidity = 0, countHumidity = 0;
    let totalWind = 0, maxWind = 0, countWind = 0, maxWindDir = null;
    let sumCos = 0, sumSin = 0, countWindDir = 0;
    let totalPrecip = 0;

    for (let i = 0; i < history.length; i++) {
      const pt = history[i];
      if (pt.temp != null) {
        totalTemp += pt.temp;
        countTemp++;
      }
      if (pt.pressure != null) {
        totalPressure += pt.pressure;
        countPressure++;
      }
      if (pt.humidity != null) {
        totalHumidity += pt.humidity;
        countHumidity++;
      }
      const wind = pt.wind_speed_corr != null ? pt.wind_speed_corr : pt.wind_speed;
      const windDir = pt.wind_dir_corr != null ? pt.wind_dir_corr : pt.wind_dir;
      if (wind != null) {
        const windKts = wind * 1.94384;
        totalWind += windKts;
        if (windKts > maxWind) {
          maxWind = windKts;
          maxWindDir = windDir;
        }
        countWind++;
      }
      if (windDir != null) {
        const rad = windDir * Math.PI / 180;
        sumCos += Math.cos(rad);
        sumSin += Math.sin(rad);
        countWindDir++;
      }
      if (i > 0 && pt.precip_total != null && history[i - 1].precip_total != null) {
        const diff = pt.precip_total - history[i - 1].precip_total;
        if (diff > 0 && diff < 100) {
          totalPrecip += diff;
        }
      }
    }

    let avgWindDir = null;
    if (countWindDir > 0) {
      const avgRad = Math.atan2(sumSin / countWindDir, sumCos / countWindDir);
      avgWindDir = avgRad * 180 / Math.PI;
      if (avgWindDir < 0) avgWindDir += 360;
    }

    return {
      distanceNm,
      durationMs,
      avgSpeedKnots,
      avgTemp: countTemp > 0 ? totalTemp / countTemp : null,
      avgPressure: countPressure > 0 ? totalPressure / countPressure : null,
      avgHumidity: countHumidity > 0 ? totalHumidity / countHumidity : null,
      avgWind: countWind > 0 ? totalWind / countWind : null,
      maxWind: countWind > 0 ? maxWind : null,
      maxWindDir,
      avgWindDir,
      totalPrecip,
    };
  }, [history]);

  // Formatear etiquetas de tiempo para gráficos
  const chartData = (history || []).map((h) => {
    const dt = dayjs(h.timestamp);
    const [start, end] = range || [];
    const diffDays = (start && end) ? end.diff(start, 'day') : 1;
    const label = diffDays <= 2 ? dt.format('HH:mm') : dt.format('DD/MM HH:mm');
    
    // Viento en nudos para el gráfico
    const windSpeedKts = h.wind_speed_corr != null ? h.wind_speed_corr * 1.94384 : (h.wind_speed != null ? h.wind_speed * 1.94384 : null);
    const windDir = h.wind_dir_corr != null ? h.wind_dir_corr : h.wind_dir;
    
    return {
      ...h,
      label,
      windSpeedKts,
      windDir,
    };
  });

  const tickInterval = Math.max(0, Math.ceil(chartData.length / 8) - 1);
  const tableData = [...chartData].reverse();

  const handleDownloadCsv = useCallback(() => {
    if (!history || history.length === 0) {
      message.warning('No hay datos de telemetría para exportar en el rango seleccionado.');
      return;
    }

    const headers = [
      'Fecha y Hora (Local)',
      'Fecha y Hora (UTC)',
      'Latitud',
      'Longitud',
      'Temperatura (C)',
      'Humedad (%)',
      'Presion (hPa)',
      'Punto Rocio (C)',
      'Viento Relativo (m/s)',
      'Viento Relativo (nudos)',
      'Dir Viento Relativo (grados)',
      'Viento Corregido (m/s)',
      'Viento Corregido (nudos)',
      'Dir Viento Corregido (grados)',
      'Dir Cardinal',
      'Precipitacion Total (mm)',
      'Intensidad Precipitacion (mm/h)',
      'Voltaje Suministro (V)',
    ];

    const rows = history.map((pt) => {
      const localTime = pt.timestamp ? dayjs(pt.timestamp).format('YYYY-MM-DD HH:mm:ss') : '';
      const utcTime = pt.timestamp ? new Date(pt.timestamp).toISOString().replace('T', ' ').substring(0, 19) : '';
      const windKts = pt.wind_speed != null ? (pt.wind_speed * 1.94384).toFixed(2) : '';
      const windCorrKts = pt.wind_speed_corr != null ? (pt.wind_speed_corr * 1.94384).toFixed(2) : '';
      const dirCard = pt.wind_dir_corr != null ? getWindDirectionText(pt.wind_dir_corr) : (pt.wind_dir != null ? getWindDirectionText(pt.wind_dir) : '');

      return [
        localTime,
        utcTime,
        pt.latitude ?? '',
        pt.longitude ?? '',
        pt.temp ?? '',
        pt.humidity ?? '',
        pt.pressure ?? '',
        pt.dewpoint ?? '',
        pt.wind_speed ?? '',
        windKts,
        pt.wind_dir ?? '',
        pt.wind_speed_corr ?? '',
        windCorrKts,
        pt.wind_dir_corr ?? '',
        `"${dirCard}"`,
        pt.precip_total ?? '',
        pt.precip_int ?? '',
        pt.supply_v ?? '',
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (vesselName || `buque_${vesselId}`)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_\-]/g, '_');
    link.setAttribute('href', url);
    link.setAttribute('download', `telemetria_${safeName}_${dayjs().format('YYYYMMDD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success('Archivo CSV de telemetría descargado exitosamente');
  }, [history, vesselName, vesselId]);

  return (
    <Card
      title={
        <span>
          🚢 Telemetría en Tiempo Real: {vesselName}{' '}
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 'normal' }}>
            (Datos recibidos por WiFi del dispositivo a bordo · Sensores GMX600/GPS)
          </Text>
        </span>
      }
      style={{ borderRadius: 12, marginTop: 12 }}
      styles={{ body: { padding: 16 } }}
      extra={
        <Space>
          <RangePicker
            showTime
            format="YYYY-MM-DD HH:mm"
            value={range}
            onChange={onRangeChange}
            presets={[
              { label: 'Últimas 24h', value: [dayjs().subtract(1, 'day'), dayjs()] },
              { label: '1 Semana', value: [dayjs().subtract(7, 'day'), dayjs()] },
              { label: '30 Días', value: [dayjs().subtract(30, 'day'), dayjs()] },
            ]}
            style={{ width: 320 }}
          />
          {history && history.length > 0 && (
            <Button
              icon={<DownloadOutlined />}
              onClick={handleDownloadCsv}
              style={{ borderColor: '#13C2C2', color: '#08979c' }}
            >
              Exportar CSV
            </Button>
          )}
        </Space>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>
      ) : chartData.length === 0 ? (
        <Empty description="No hay lecturas de telemetría reportadas para esta embarcación en el rango seleccionado" />
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            <div style={{ marginBottom: 12 }}>
              <Segmented
                size="small"
                value={chartType}
                onChange={setChartType}
                options={[
                  { label: '🌡️ Temp y Humedad', value: 'temp_hum' },
                  { label: '💨 Viento', value: 'wind' },
                  { label: '📐 Presión', value: 'pressure' },
                  { label: '🌧️ Precipitación', value: 'precipitation' },
                  { label: '⚡ Voltaje Batería', value: 'voltage' },
                ]}
              />
            </div>

            {stats && (
              <div style={{ 
                background: '#f8f9fa', 
                borderRadius: 8, 
                padding: '8px 12px', 
                marginBottom: 12, 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: '8px 16px',
                fontSize: '10px',
                border: '1px solid #e8e8e8',
                color: '#555'
              }}>
                <div>
                  <span style={{ color: '#888' }}>Distancia: </span>
                  <strong style={{ color: '#0A2647' }}>{stats.distanceNm ? `${stats.distanceNm.toFixed(1)} mn` : '0 mn'}</strong>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Vel. Promedio: </span>
                  <strong style={{ color: '#0A2647' }}>{stats.avgSpeedKnots ? `${stats.avgSpeedKnots.toFixed(1)} kt` : '—'}</strong>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Temp. Promedio: </span>
                  <strong style={{ color: '#0A2647' }}>{stats.avgTemp != null ? `${stats.avgTemp.toFixed(1)}°C` : '—'}</strong>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Viento Promedio: </span>
                  <strong style={{ color: '#0A2647' }}>
                    {stats.avgWind != null ? `${stats.avgWind.toFixed(1)} kt` : '—'}
                    {stats.avgWindDir != null ? ` (${Math.round(stats.avgWindDir)}° ${getWindDirectionText(stats.avgWindDir)})` : ''}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Viento Máximo: </span>
                  <strong style={{ color: '#0A2647' }}>
                    {stats.maxWind != null ? `${stats.maxWind.toFixed(1)} kt` : '—'}
                    {stats.maxWindDir != null ? ` (${Math.round(stats.maxWindDir)}° ${getWindDirectionText(stats.maxWindDir)})` : ''}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Presión: </span>
                  <strong style={{ color: '#0A2647' }}>{stats.avgPressure != null ? `${stats.avgPressure.toFixed(1)} hPa` : '—'}</strong>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Humedad: </span>
                  <strong style={{ color: '#0A2647' }}>{stats.avgHumidity != null ? `${Math.round(stats.avgHumidity)}%` : '—'}</strong>
                </div>
                <div>
                  <span style={{ color: '#888' }}>Lluvia Total: </span>
                  <strong style={{ color: '#0A2647' }}>{stats.totalPrecip != null ? `${stats.totalPrecip.toFixed(1)} mm` : '0 mm'}</strong>
                </div>
              </div>
            )}

            {chartType === 'temp_hum' && (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 8, right: -10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} unit="°C" stroke="#FF4D4F" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit="%" stroke="#1890FF" />
                  <Tooltip labelFormatter={(value, items) => items?.[0] ? dayjs(items[0].payload.timestamp).format('DD/MM/YYYY HH:mm') : value} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="left" type="monotone" dataKey="temp" name="Temperatura (°C)" stroke="#FF4D4F" dot={false} strokeWidth={1.5} connectNulls />
                  <Line yAxisId="right" type="monotone" dataKey="humidity" name="Humedad (%)" stroke="#1890FF" dot={false} strokeWidth={1.5} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}

            {chartType === 'wind' && (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 8, right: -10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} unit=" kt" stroke="#52C41A" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit="°" domain={[0, 360]} ticks={[0, 90, 180, 270, 360]} stroke="#1890FF" />
                  <Tooltip
                    labelFormatter={(value, items) => items?.[0] ? dayjs(items[0].payload.timestamp).format('DD/MM/YYYY HH:mm') : value}
                    formatter={(value, name) => {
                      if (name === 'Dirección (°)' && value != null) {
                        return [`${value}° (${getWindDirectionText(value)})`, name];
                      }
                      if (name === 'Velocidad (kt)' && value != null) {
                        return [`${value.toFixed(1)} kt`, name];
                      }
                      return [value, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="left" type="monotone" dataKey="windSpeedKts" name="Velocidad (kt)" stroke="#52C41A" dot={false} strokeWidth={1.5} connectNulls />
                  <Line yAxisId="right" type="monotone" dataKey="windDir" name="Dirección (°)" stroke="#1890FF" dot={false} strokeWidth={1.5} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}

            {chartType === 'precipitation' && (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 8, right: -10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} unit=" mm" stroke="#1890FF" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit=" mm/h" stroke="#13C2C2" />
                  <Tooltip labelFormatter={(value, items) => items?.[0] ? dayjs(items[0].payload.timestamp).format('DD/MM/YYYY HH:mm') : value} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="left" type="monotone" dataKey="precip_total" name="Acumulada (mm)" stroke="#1890FF" dot={false} strokeWidth={1.5} connectNulls />
                  <Line yAxisId="right" type="monotone" dataKey="precip_int" name="Intensidad (mm/h)" stroke="#13C2C2" dot={false} strokeWidth={1.5} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}

            {chartType === 'pressure' && (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
                  <YAxis tick={{ fontSize: 10 }} domain={['dataMin - 2', 'dataMax + 2']} unit=" hPa" />
                  <Tooltip labelFormatter={(value, items) => items?.[0] ? dayjs(items[0].payload.timestamp).format('DD/MM/YYYY HH:mm') : value} />
                  <Line type="monotone" dataKey="pressure" name="Presión (hPa)" stroke="#722ED1" dot={false} strokeWidth={1.5} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}

            {chartType === 'voltage' && (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
                  <YAxis tick={{ fontSize: 10 }} domain={[10, 15]} unit=" V" />
                  <Tooltip labelFormatter={(value, items) => items?.[0] ? dayjs(items[0].payload.timestamp).format('DD/MM/YYYY HH:mm') : value} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="supply_v" name="Voltaje Alimentación (V)" stroke="#FA8C16" dot={false} strokeWidth={1.5} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}

            <Text type="secondary" style={{ fontSize: 11, marginTop: 8, display: 'block' }}>
              Valores capturados por la estación Gill GMX600 a bordo. Los horarios corresponden a tu zona horaria local.
            </Text>
          </Col>

          <Col xs={24} lg={8}>
            <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 12, color: '#0A2647' }}>
              Lecturas Recientes
            </Text>
            <Table
              dataSource={tableData}
              columns={columns}
              rowKey="id"
              size="small"
              pagination={{ 
                defaultPageSize: 5, 
                showSizeChanger: true, 
                pageSizeOptions: ['5', '10', '20', '50', '100'] 
              }}
              scroll={{ y: 200, x: 800 }}
              onRow={(record) => ({
                onClick: () => {
                  if (onRecordClick) onRecordClick(record);
                },
                style: { 
                  cursor: record.latitude != null && record.longitude != null && (record.latitude !== 0 || record.longitude !== 0) 
                    ? 'pointer' 
                    : 'default' 
                }
              })}
            />
          </Col>
        </Row>
      )}
    </Card>
  );
}

export default VesselTelemetrySection;
