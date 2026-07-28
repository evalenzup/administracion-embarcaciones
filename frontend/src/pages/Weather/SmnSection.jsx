/**
 * SIAE — Sección de datos reales de estaciones del SMN.
 * Muestra gráficos históricos de sensores reales y tabla de mediciones recientes.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, Col, DatePicker, Empty, Row, Segmented, Select, Spin, Table, Tag, Typography, message } from 'antd';
import {
  CartesianGrid, Legend, Line, LineChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import apiClient from '../../api/client';

const { Text, Title } = Typography;

const columns = [
  { title: 'Fecha/Hora', dataIndex: 'time', width: 115, render: (v) => dayjs(v).format('DD/MM HH:mm') },
  { title: 'Temp', dataIndex: 'temperature', width: 70, render: (v) => (v != null ? `${v}°` : '—') },
  { title: 'Hum', dataIndex: 'humidity', width: 70, render: (v) => (v != null ? `${v}%` : '—') },
  { title: 'Viento', dataIndex: 'wind_speed', width: 80, render: (v) => (v != null ? `${v} km/h` : '—') },
  { title: 'Lluvia', dataIndex: 'precipitation', width: 70, render: (v) => (v != null ? `${v} mm` : '—') },
];

function SmnSection({ stations, stationId, onStationChange }) {
  const [range, setRange] = useState('24h');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chartType, setChartType] = useState('temp_hum');

  const fetchData = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const r = await apiClient.get(`/weather/smn/stations/${stationId}/history`, {
        params: { range }
      });
      setHistory(r.data);
    } catch {
      message.error('Error al cargar mediciones de la estación');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [stationId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedStation = stations.find((s) => s.id === stationId);

  // Formatear etiquetas de tiempo
  const chartData = (history || []).map((h) => {
    const dt = dayjs(h.time);
    let label = '';
    if (range === '24h') {
      label = dt.format('HH:mm');
    } else if (range === '1w') {
      label = dt.format('DD/MM HH:mm');
    } else {
      label = dt.format('DD/MM');
    }
    return {
      ...h,
      label,
    };
  });

  // Ticks densidad
  const tickInterval = Math.max(0, Math.ceil(chartData.length / 8) - 1);

  // Tabla invertida (últimos primero) para consulta fácil
  const tableData = [...chartData].reverse();

  return (
    <Card
      title={
        <span>
          🛰️ Datos Reales: Estaciones Meteorológicas Automáticas{' '}
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 'normal' }}>
            (Observaciones del SMN en tiempo real · Altitud: {selectedStation?.altitude ?? 0}m)
          </Text>
        </span>
      }
      style={{ borderRadius: 12, marginTop: 12 }}
      styles={{ body: { padding: 16 } }}
      extra={
        <Row gutter={8} align="middle" wrap={false}>
          <Col>
            <Select
              value={stationId}
              onChange={onStationChange}
              showSearch
              optionFilterProp="label"
              style={{ width: 280 }}
              options={stations.map((s) => ({
                value: s.id,
                label: `(${s.state}) ${s.name}`,
              }))}
            />
          </Col>
          <Col>
            <Segmented
              size="small"
              value={range}
              onChange={setRange}
              options={[
                { label: '24 Horas', value: '24h' },
                { label: '1 Semana', value: '1w' },
                { label: '30 Días', value: '30d' },
                { label: '90 Días', value: '90d' },
              ]}
            />
          </Col>
        </Row>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>
      ) : chartData.length === 0 ? (
        <Empty description="Sin mediciones disponibles para esta estación en el rango seleccionado" />
      ) : (
        <Row gutter={16}>
          <Col xs={24} lg={16}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Segmented
                size="small"
                value={chartType}
                onChange={setChartType}
                options={[
                  { label: '🌡️ Temp y Humedad', value: 'temp_hum' },
                  { label: '💨 Viento y Ráfagas', value: 'wind' },
                  { label: '🌧️ Precipitación', value: 'rain' },
                  { label: '📐 Presión', value: 'pressure' },
                ]}
              />
            </div>

            {chartType === 'temp_hum' && (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 8, right: -10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} unit="°C" stroke="#FF4D4F" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit="%" stroke="#1890FF" />
                  <Tooltip labelFormatter={(value, items) => items?.[0] ? dayjs(items[0].payload.time).format('DD/MM/YYYY HH:mm') : value} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="left" type="monotone" dataKey="temperature" name="Temp (°C)" stroke="#FF4D4F" dot={false} strokeWidth={1.5} connectNulls />
                  <Line yAxisId="right" type="monotone" dataKey="humidity" name="Hum (%)" stroke="#1890FF" dot={false} strokeWidth={1.5} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}

            {chartType === 'wind' && (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
                  <YAxis tick={{ fontSize: 10 }} unit=" km/h" />
                  <Tooltip labelFormatter={(value, items) => items?.[0] ? dayjs(items[0].payload.time).format('DD/MM/YYYY HH:mm') : value} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="wind_speed" name="Viento (km/h)" stroke="#52C41A" dot={false} strokeWidth={1.5} connectNulls />
                  <Line type="monotone" dataKey="gust_speed" name="Ráfagas (km/h)" stroke="#FA8C16" dot={false} strokeWidth={1.5} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}

            {chartType === 'rain' && (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
                  <YAxis tick={{ fontSize: 10 }} unit=" mm" />
                  <Tooltip labelFormatter={(value, items) => items?.[0] ? dayjs(items[0].payload.time).format('DD/MM/YYYY HH:mm') : value} />
                  <Bar dataKey="precipitation" name="Lluvia (mm)" fill="#096DD9" />
                </BarChart>
              </ResponsiveContainer>
            )}

            {chartType === 'pressure' && (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
                  <YAxis tick={{ fontSize: 10 }} domain={['dataMin - 2', 'dataMax + 2']} unit=" hPa" />
                  <Tooltip labelFormatter={(value, items) => items?.[0] ? dayjs(items[0].payload.time).format('DD/MM/YYYY HH:mm') : value} />
                  <Line type="monotone" dataKey="pressure" name="Presión (hPa)" stroke="#722ED1" dot={false} strokeWidth={1.5} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}

            <Text type="secondary" style={{ fontSize: 11, marginTop: 8, display: 'block' }}>
              Valores reportados por sensores en sitio. Zona horaria local (UTC si el navegador no la detecta).
            </Text>
          </Col>

          <Col xs={24} lg={8}>
            <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 12, color: '#0A2647' }}>
              Lecturas Recientes
            </Text>
            <Table
              dataSource={tableData}
              columns={columns}
              rowKey="time"
              size="small"
              pagination={{ pageSize: 5 }}
            />
          </Col>
        </Row>
      )}
    </Card>
  );
}

export default SmnSection;
