/**
 * SIAE — Sección de mareas y ventanas de operación.
 * Curva de marea (predicciones red mareográfica CICESE) con umbral ajustable
 * y ventanas operables (marea ≥ umbral) sombreadas y tabuladas — para planear
 * entradas/salidas por rampas y escolleras de poco calado.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Col, DatePicker, Empty, InputNumber, Row, Segmented, Select, Spin, Table, Tag, Typography, message } from 'antd';
import {
  Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import apiClient from '../../api/client';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const DEFAULT_MIN_TIDE_M = 1.0;

/**
 * Extremos locales de la serie (pleamares y bajamares). La serie es horaria;
 * el instante y la altura del extremo real se refinan con un ajuste
 * parabólico de 3 puntos (el máximo/mínimo verdadero puede caer entre
 * muestras — el ajuste lo ubica con precisión de minutos).
 */
function findTideExtremes(series) {
  const extremes = [];
  for (let i = 1; i < series.length - 1; i++) {
    const prev = series[i - 1].height_m;
    const curr = series[i].height_m;
    const next = series[i + 1].height_m;
    const isMax = curr >= prev && curr > next;
    const isMin = curr <= prev && curr < next;
    if (!isMax && !isMin) continue;

    // Ajuste parabólico: desplazamiento del vértice respecto a la muestra i
    const denom = prev - 2 * curr + next;
    const delta = denom !== 0 ? 0.5 * (prev - next) / denom : 0;
    const dtMs = series[i + 1].t - series[i].t;
    const t = series[i].t + delta * dtMs;
    const height = curr - 0.25 * (prev - next) * delta;

    extremes.push({
      t,
      height_m: Math.round(height * 100) / 100,
      type: isMax ? 'pleamar' : 'bajamar',
    });
  }

  // Intervalo desde el extremo anterior (pleamar→bajamar y viceversa)
  for (let i = 0; i < extremes.length; i++) {
    if (i === 0) {
      extremes[i].interval_min = null;
      continue;
    }
    extremes[i].interval_min = Math.round((extremes[i].t - extremes[i - 1].t) / 60000);
  }
  return extremes;
}

function formatInterval(minutes) {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

/**
 * @param {object} props
 * @param {Array} props.stations - Estaciones de /weather/tides/stations (las provee WeatherPage).
 * @param {string} props.stationCode - Código de la estación seleccionada (controlado).
 * @param {(code: string) => void} props.onStationChange
 */
function TidesSection({ stations, stationCode, onStationChange }) {
  const [range, setRange] = useState([dayjs().startOf('day'), dayjs().add(7, 'day').endOf('day')]);
  const [minTide, setMinTide] = useState(DEFAULT_MIN_TIDE_M);
  const [series, setSeries] = useState([]);
  const [windows, setWindows] = useState([]);
  const [loading, setLoading] = useState(false);
  // Vista de la tabla lateral: extremos (default) o ventanas de operación
  const [tableView, setTableView] = useState('extremes');

  const extremes = useMemo(() => findTideExtremes(series), [series]);

  const fetchData = useCallback(async () => {
    if (!stationCode || !range?.[0] || !range?.[1]) return;
    setLoading(true);
    try {
      const params = {
        station: stationCode,
        start: range[0].toISOString(),
        end: range[1].toISOString(),
      };
      const [serieRes, winRes] = await Promise.all([
        apiClient.get('/weather/tides', { params }),
        apiClient.get('/weather/tides/windows', { params: { ...params, min_height_m: minTide } }),
      ]);
      setSeries(serieRes.data.series.map((p) => ({
        t: dayjs(p.time).valueOf(),
        height_m: p.height_m,
      })));
      setWindows(winRes.data.windows);
    } catch {
      message.error('Error al cargar predicciones de marea');
    } finally {
      setLoading(false);
    }
  }, [stationCode, range, minTide]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const windowColumns = [
    { title: 'Desde', dataIndex: 'start', render: (v) => dayjs(v).format('DD/MM/YYYY HH:mm') },
    { title: 'Hasta', dataIndex: 'end', render: (v) => dayjs(v).format('DD/MM/YYYY HH:mm') },
    { title: 'Duración', dataIndex: 'duration_hours', width: 110, render: (v) => <Tag color="green">{v} h</Tag> },
  ];

  const extremeColumns = [
    { title: 'Fecha/Hora', dataIndex: 't', render: (v) => dayjs(v).format('DD/MM HH:mm') },
    {
      title: 'Tipo', dataIndex: 'type', width: 100,
      render: (v) => v === 'pleamar'
        ? <Tag color="blue">▲ Pleamar</Tag>
        : <Tag color="orange">▼ Bajamar</Tag>,
    },
    { title: 'Altura (m)', dataIndex: 'height_m', width: 80 },
    {
      title: 'Intervalo', dataIndex: 'interval_min', width: 100,
      render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{formatInterval(v)}</Text>,
    },
  ];

  return (
    <Card
      title={<span>🌊 Mareas y ventanas de operación <Text type="secondary" style={{ fontSize: 11, fontWeight: 'normal' }}>(predicción CICESE, m sobre Bajamar Media Inferior)</Text></span>}
      style={{ borderRadius: 12, marginTop: 12 }}
      styles={{ body: { padding: 16 } }}
      extra={
        <Row gutter={8} align="middle" wrap={false}>
          <Col>
            <Select
              value={stationCode}
              onChange={onStationChange}
              showSearch
              optionFilterProp="label"
              style={{ width: 210 }}
              options={stations.map((s) => ({ value: s.code, label: s.name }))}
            />
          </Col>
          <Col>
            <RangePicker
              value={range}
              onChange={setRange}
              format="DD/MM/YYYY"
              allowClear={false}
            />
          </Col>
          <Col>
            <Text style={{ fontSize: 12, marginRight: 4 }}>Marea mín. (m):</Text>
            <InputNumber
              size="small"
              min={0}
              max={3}
              step={0.1}
              value={minTide}
              onChange={(v) => setMinTide(v ?? DEFAULT_MIN_TIDE_M)}
              style={{ width: 70 }}
            />
          </Col>
        </Row>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>
      ) : series.length === 0 ? (
        <Empty description="Sin predicciones de marea para el rango seleccionado" />
      ) : (
        <Row gutter={16}>
          <Col xs={24} lg={16}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={series} margin={{ top: 8, right: 8, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(t) => dayjs(t).format('DD/MM HH:mm')}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 10 }} unit=" m" />
                <Tooltip
                  labelFormatter={(t) => dayjs(t).format('DD/MM/YYYY HH:mm')}
                  formatter={(v) => [`${v} m`, 'Marea']}
                />
                {/* Ventanas operables sombreadas en verde */}
                {windows.map((w) => (
                  <ReferenceArea
                    key={w.start}
                    x1={dayjs(w.start).valueOf()}
                    x2={dayjs(w.end).valueOf()}
                    fill="#52C41A"
                    fillOpacity={0.15}
                  />
                ))}
                <ReferenceLine y={minTide} stroke="#FA8C16" strokeDasharray="6 3"
                  label={{ value: `${minTide} m`, position: 'insideTopRight', fontSize: 10, fill: '#FA8C16' }} />
                <ReferenceLine y={0} stroke="#999" />
                <Area type="monotone" dataKey="height_m" name="Marea" stroke="#0A2647" fill="#1677FF" fillOpacity={0.25} dot={false} />
                {/* Pleamares y bajamares marcados sobre la curva */}
                {extremes.map((e) => (
                  <ReferenceDot
                    key={e.t}
                    x={e.t}
                    y={e.height_m}
                    r={3.5}
                    fill={e.type === 'pleamar' ? '#1677FF' : '#FA8C16'}
                    stroke="#fff"
                    strokeWidth={1}
                    label={{
                      value: `${e.height_m}`,
                      position: e.type === 'pleamar' ? 'top' : 'bottom',
                      fontSize: 10,
                      fill: e.type === 'pleamar' ? '#0A2647' : '#AD6800',
                    }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Horas en tu zona horaria local. Predicción armónica anual — no incluye marea meteorológica (viento/presión).
            </Text>
          </Col>
          <Col xs={24} lg={8}>
            <Segmented
              size="small"
              block
              value={tableView}
              onChange={setTableView}
              style={{ marginBottom: 8 }}
              options={[
                { label: 'Pleamares y bajamares', value: 'extremes' },
                { label: `Ventanas ≥ ${minTide} m`, value: 'windows' },
              ]}
            />
            {tableView === 'extremes' ? (
              <Table
                dataSource={extremes}
                columns={extremeColumns}
                rowKey="t"
                size="small"
                pagination={{ pageSize: 6 }}
                locale={{ emptyText: 'Sin extremos en el rango' }}
              />
            ) : (
              <Table
                dataSource={windows}
                columns={windowColumns}
                rowKey="start"
                size="small"
                pagination={{ pageSize: 6 }}
                locale={{ emptyText: 'Sin ventanas en el rango' }}
              />
            )}
          </Col>
        </Row>
      )}
    </Card>
  );
}

export default TidesSection;
