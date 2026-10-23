import { useMemo, useState } from 'react';
import { Card, Col, Row, Segmented, Statistic, Typography, Button, Space, Tag, Empty, Tooltip as AntTooltip } from 'antd';
import { DownloadOutlined, CompassOutlined, DashboardOutlined, FireOutlined, EyeOutlined } from '@ant-design/icons';
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Brush
} from 'recharts';
import dayjs from 'dayjs';
import L from 'leaflet';

const { Text, Title } = Typography;

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

/** Color por intensidad de viento */
function getWindColor(kts) {
  if (kts == null) return '#999';
  if (kts < 5) return '#52c41a';   // Calma / Brisa muy leve
  if (kts < 12) return '#1890ff';  // Brisa suave / moderada
  if (kts < 20) return '#faad14';  // Viento regular
  if (kts < 30) return '#fa541c';  // Viento fuerte
  return '#f5222d';                // Muy fuerte / temporal
}

/** Componente de Flecha de Viento con Grados */
function WindArrowIcon({ deg, speedKts, size = 20 }) {
  if (deg == null) return <span style={{ color: '#aaa' }}>—</span>;
  const color = getWindColor(speedKts);
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.04)',
        border: `1px solid ${color}`,
        transform: `rotate(${deg}deg)`,
        transition: 'transform 0.3s ease',
      }}
      title={`Viento desde ${deg}°`}
    >
      <svg width={size * 0.75} height={size * 0.75} viewBox="0 0 24 24" fill={color}>
        {/* Flecha apuntando hacia arriba (Norte = 0°) */}
        <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
      </svg>
    </div>
  );
}

/** Custom Dot en Recharts para pintar flechas de viento espaciadas */
const CustomWindArrowDot = (props) => {
  const { cx, cy, payload, index, totalPoints } = props;
  if (!payload || payload.windDir == null || payload.windSpeed == null) return null;

  // Espaciar flechas para que no se encimen
  const step = Math.max(1, Math.floor(totalPoints / 16));
  if (index % step !== 0 && index !== totalPoints - 1) return null;

  const color = getWindColor(payload.windSpeed);

  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <circle r={10} fill="#ffffff" stroke={color} strokeWidth={1.5} opacity={0.95} />
      <g transform={`rotate(${payload.windDir})`}>
        <path d="M 0 -6 L 4 5 L 0 3 L -4 5 Z" fill={color} />
      </g>
    </g>
  );
};

/** Tooltip personalizado con métricas completas y flecha de viento interactiva */
const CustomChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const windColor = getWindColor(data.windSpeed);

  return (
    <div style={{
      background: 'rgba(10, 38, 71, 0.95)',
      color: '#fff',
      padding: '12px 16px',
      borderRadius: 8,
      boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
      fontSize: 12,
      minWidth: 230,
      backdropFilter: 'blur(4px)',
      border: '1px solid rgba(255,255,255,0.15)'
    }}>
      <div style={{ fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 6, marginBottom: 8, color: '#69c0ff' }}>
        🕒 {data.fullTimeStr}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', alignItems: 'center' }}>
        {/* Velocidad del Barco */}
        <span style={{ color: '#13C2C2', fontWeight: 600 }}>🚢 Vel. Barco:</span>
        <strong style={{ color: '#fff' }}>{data.boatSpeed != null ? `${data.boatSpeed} kt` : '—'}</strong>

        {/* Viento con Flecha */}
        <span style={{ color: '#69c0ff', fontWeight: 600 }}>💨 Viento:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <WindArrowIcon deg={data.windDir} speedKts={data.windSpeed} size={18} />
          <strong style={{ color: windColor }}>
            {data.windSpeed != null ? `${data.windSpeed} kt` : '—'}
          </strong>
          {data.windDir != null && (
            <span style={{ fontSize: 11, color: '#d9d9d9' }}>
              ({data.windDir}° {data.windCardinal})
            </span>
          )}
        </div>

        {/* Temperatura */}
        {data.temp != null && (
          <>
            <span style={{ color: '#ff7875' }}>🌡️ Temp:</span>
            <span>{data.temp}°C</span>
          </>
        )}

        {/* Humedad */}
        {data.humidity != null && (
          <>
            <span style={{ color: '#85a5ff' }}>💧 Humedad:</span>
            <span>{data.humidity}%</span>
          </>
        )}

        {/* Presión */}
        {data.pressure != null && (
          <>
            <span style={{ color: '#b37feb' }}>📐 Presión:</span>
            <span>{data.pressure} hPa</span>
          </>
        )}

        {/* Posición GPS */}
        {data.latitude != null && data.longitude != null && (
          <>
            <span style={{ color: '#8c8c8c', fontSize: 10 }}>📍 GPS:</span>
            <span style={{ color: '#bfbfbf', fontSize: 10 }}>
              {data.latitude.toFixed(4)}, {data.longitude.toFixed(4)}
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default function CruiseTelemetryCharts({ telemetryTrack, cruise, onDownloadCsv }) {
  const [activeView, setActiveView] = useState('all'); // 'all' | 'wind_speed' | 'temp_hum' | 'pressure'

  // Procesar serie de datos con cálculo de velocidad del barco y direcciones
  const formattedData = useMemo(() => {
    if (!telemetryTrack || telemetryTrack.length === 0) return [];

    const result = [];
    let prevPt = null;

    for (let i = 0; i < telemetryTrack.length; i++) {
      const pt = telemetryTrack[i];
      let boatSpeedKnots = 0;

      if (prevPt && pt.latitude != null && pt.longitude != null && prevPt.latitude != null && prevPt.longitude != null) {
        const dtHours = (new Date(pt.timestamp) - new Date(prevPt.timestamp)) / 3600000;
        if (dtHours > 0 && dtHours < 0.5) {
          const distNm = L.latLng(prevPt.latitude, prevPt.longitude).distanceTo(L.latLng(pt.latitude, pt.longitude)) / 1852;
          const spd = distNm / dtHours;
          if (spd < 40) {
            boatSpeedKnots = spd;
          }
        }
      }
      if (pt.latitude != null && pt.longitude != null && (pt.latitude !== 0 || pt.longitude !== 0)) {
        prevPt = pt;
      }

      const wind = pt.wind_speed_corr != null ? pt.wind_speed_corr : pt.wind_speed;
      const windKts = wind != null ? Number((wind * 1.94384).toFixed(1)) : null;
      const windDir = pt.wind_dir_corr != null ? pt.wind_dir_corr : pt.wind_dir;

      result.push({
        ...pt,
        timeStr: dayjs(pt.timestamp).format('HH:mm'),
        fullTimeStr: dayjs(pt.timestamp).format('DD/MM/YYYY HH:mm'),
        boatSpeed: Number(boatSpeedKnots.toFixed(1)),
        windSpeed: windKts,
        windDir: windDir != null ? Math.round(windDir) : null,
        windCardinal: windDir != null ? getWindDirectionText(windDir) : '—',
        temp: pt.temp != null ? Number(pt.temp.toFixed(1)) : null,
        humidity: pt.humidity != null ? Math.round(pt.humidity) : null,
        pressure: pt.pressure != null ? Number(pt.pressure.toFixed(1)) : null,
      });
    }
    return result;
  }, [telemetryTrack]);

  // KPIs Resumen
  const kpis = useMemo(() => {
    if (!formattedData.length) return null;

    let maxBoatSpeed = 0;
    let totalBoatSpeed = 0;
    let countBoat = 0;

    let maxWindSpeed = 0;
    let maxWindDir = null;
    let totalWind = 0;
    let countWind = 0;
    let sumCos = 0;
    let sumSin = 0;

    let minTemp = Infinity;
    let maxTemp = -Infinity;
    let totalTemp = 0;
    let countTemp = 0;

    let minPres = Infinity;
    let maxPres = -Infinity;
    let totalPres = 0;
    let countPres = 0;

    let totalHum = 0;
    let countHum = 0;

    formattedData.forEach((d) => {
      if (d.boatSpeed != null) {
        if (d.boatSpeed > maxBoatSpeed) maxBoatSpeed = d.boatSpeed;
        totalBoatSpeed += d.boatSpeed;
        countBoat++;
      }
      if (d.windSpeed != null) {
        if (d.windSpeed > maxWindSpeed) {
          maxWindSpeed = d.windSpeed;
          maxWindDir = d.windDir;
        }
        totalWind += d.windSpeed;
        countWind++;
      }
      if (d.windDir != null) {
        const rad = (d.windDir * Math.PI) / 180;
        sumCos += Math.cos(rad);
        sumSin += Math.sin(rad);
      }
      if (d.temp != null) {
        if (d.temp < minTemp) minTemp = d.temp;
        if (d.temp > maxTemp) maxTemp = d.temp;
        totalTemp += d.temp;
        countTemp++;
      }
      if (d.pressure != null) {
        if (d.pressure < minPres) minPres = d.pressure;
        if (d.pressure > maxPres) maxPres = d.pressure;
        totalPres += d.pressure;
        countPres++;
      }
      if (d.humidity != null) {
        totalHum += d.humidity;
        countHum++;
      }
    });

    let avgWindDir = null;
    if (countWind > 0) {
      const avgRad = Math.atan2(sumSin / countWind, sumCos / countWind);
      avgWindDir = (avgRad * 180) / Math.PI;
      if (avgWindDir < 0) avgWindDir += 360;
    }

    return {
      maxBoatSpeed,
      avgBoatSpeed: countBoat > 0 ? (totalBoatSpeed / countBoat).toFixed(1) : '—',
      maxWindSpeed,
      maxWindDir,
      avgWindSpeed: countWind > 0 ? (totalWind / countWind).toFixed(1) : '—',
      avgWindDir: avgWindDir != null ? Math.round(avgWindDir) : null,
      avgTemp: countTemp > 0 ? (totalTemp / countTemp).toFixed(1) : '—',
      minTemp: minTemp !== Infinity ? minTemp : '—',
      maxTemp: maxTemp !== -Infinity ? maxTemp : '—',
      avgHumidity: countHum > 0 ? Math.round(totalHum / countHum) : '—',
      avgPressure: countPres > 0 ? (totalPres / countPres).toFixed(1) : '—',
      totalPoints: formattedData.length,
      startTime: formattedData[0]?.fullTimeStr,
      endTime: formattedData[formattedData.length - 1]?.fullTimeStr,
    };
  }, [formattedData]);

  if (!formattedData.length) {
    return (
      <Card style={{ borderRadius: 12, marginTop: 16 }}>
        <Empty description="No hay lecturas de telemetría registradas para este crucero." />
      </Card>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      {/* ── Banner Superior de KPIs ── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {/* Velocidad del Barco */}
        <Col xs={24} sm={12} md={6}>
          <Card
            size="small"
            style={{ borderRadius: 8, background: 'linear-gradient(135deg, #e6fffb 0%, #ffffff 100%)', border: '1px solid #87e8de' }}
          >
            <Statistic
              title={<span style={{ color: '#006d75', fontWeight: 600 }}>🚢 Velocidad de Embarcación</span>}
              value={kpis?.maxBoatSpeed}
              suffix={<span style={{ fontSize: 13, color: '#555' }}>kt máx</span>}
              valueStyle={{ color: '#13c2c2', fontWeight: 700 }}
            />
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
              Promedio en ruta: <b>{kpis?.avgBoatSpeed} kt</b>
            </div>
          </Card>
        </Col>

        {/* Viento y Dirección */}
        <Col xs={24} sm={12} md={6}>
          <Card
            size="small"
            style={{ borderRadius: 8, background: 'linear-gradient(135deg, #e6f7ff 0%, #ffffff 100%)', border: '1px solid #91d5ff' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Statistic
                title={<span style={{ color: '#003a8c', fontWeight: 600 }}>💨 Viento Meteorológico</span>}
                value={kpis?.maxWindSpeed}
                suffix={<span style={{ fontSize: 13, color: '#555' }}>kt ráfaga</span>}
                valueStyle={{ color: getWindColor(kpis?.maxWindSpeed), fontWeight: 700 }}
              />
              {kpis?.maxWindDir != null && (
                <div style={{ textAlign: 'center', marginTop: 4 }}>
                  <WindArrowIcon deg={kpis.maxWindDir} speedKts={kpis.maxWindSpeed} size={28} />
                  <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>{kpis.maxWindDir}°</div>
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
              Promedio: <b>{kpis?.avgWindSpeed} kt</b> {kpis?.avgWindDir != null && `(${kpis.avgWindDir}° ${getWindDirectionText(kpis.avgWindDir)})`}
            </div>
          </Card>
        </Col>

        {/* Temperatura y Humedad */}
        <Col xs={24} sm={12} md={6}>
          <Card
            size="small"
            style={{ borderRadius: 8, background: 'linear-gradient(135deg, #fff7e6 0%, #ffffff 100%)', border: '1px solid #ffd591' }}
          >
            <Statistic
              title={<span style={{ color: '#873800', fontWeight: 600 }}>🌡️ Temperatura & Humedad</span>}
              value={kpis?.avgTemp}
              suffix="°C"
              valueStyle={{ color: '#d46b08', fontWeight: 700 }}
            />
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
              Rango: <b>{kpis?.minTemp}° - {kpis?.maxTemp}°C</b> | Hum: <b>{kpis?.avgHumidity}%</b>
            </div>
          </Card>
        </Col>

        {/* Presión y Puntos */}
        <Col xs={24} sm={12} md={6}>
          <Card
            size="small"
            style={{ borderRadius: 8, background: 'linear-gradient(135deg, #f9f0ff 0%, #ffffff 100%)', border: '1px solid #d3adf7' }}
          >
            <Statistic
              title={<span style={{ color: '#391085', fontWeight: 600 }}>📐 Presión Barométrica</span>}
              value={kpis?.avgPressure}
              suffix="hPa"
              valueStyle={{ color: '#722ed1', fontWeight: 700 }}
            />
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
              Muestreo: <b>{kpis?.totalPoints} mediciones</b> (1/min)
            </div>
          </Card>
        </Col>
      </Row>

      {/* ── Controles de Vista y Descarga ── */}
      <Card
        style={{ borderRadius: 12, marginBottom: 16 }}
        styles={{ body: { padding: '12px 16px' } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <Space>
            <span style={{ fontWeight: 600, color: '#0A2647', fontSize: 13 }}>Vista de Gráfica:</span>
            <Segmented
              value={activeView}
              onChange={setActiveView}
              options={[
                { label: '📊 Todas las Variables', value: 'all' },
                { label: '🚢 Vel. Barco & Viento (con Flechas)', value: 'wind_speed' },
                { label: '🌡️ Temperatura & Humedad', value: 'temp_hum' },
                { label: '📐 Presión Barométrica', value: 'pressure' },
              ]}
            />
          </Space>

          {onDownloadCsv && (
            <Button
              type="primary"
              ghost
              icon={<DownloadOutlined />}
              onClick={onDownloadCsv}
              style={{ borderColor: '#13C2C2', color: '#08979c', borderRadius: 6 }}
            >
              Exportar CSV de Telemetría
            </Button>
          )}
        </div>
      </Card>

      {/* ── GRÁFICA 1: VELOCIDAD DEL BARCO vs VIENTO + FLECHAS DE DIRECCIÓN ── */}
      {(activeView === 'all' || activeView === 'wind_speed') && (
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#0A2647', fontWeight: 700, fontSize: 14 }}>
                💨 Velocidad del Viento vs. Velocidad de Navegación del Barco
              </span>
              <Space size={6}>
                <Tag color="cyan">🚢 Barco (SOG)</Tag>
                <Tag color="blue">💨 Viento (Nudos)</Tag>
                <Tag color="geekblue">🧭 Flechas = Rumbo de Viento</Tag>
              </Space>
            </div>
          }
          style={{ borderRadius: 12, marginBottom: 16 }}
          styles={{ body: { padding: '16px 12px 8px' } }}
        >
          {/* Tira de Viento con Vectores Direccionales */}
          <div style={{
            background: '#fafafa',
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 12,
            overflowX: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#0A2647', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
              <CompassOutlined /> Vectores de Viento a lo largo del tiempo:
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {formattedData.filter((_, idx) => idx % Math.max(1, Math.floor(formattedData.length / 12)) === 0).map((pt, idx) => (
                <div key={idx} style={{ textAlign: 'center', minWidth: 44 }}>
                  <WindArrowIcon deg={pt.windDir} speedKts={pt.windSpeed} size={22} />
                  <div style={{ fontSize: 10, fontWeight: 600, color: getWindColor(pt.windSpeed), marginTop: 2 }}>
                    {pt.windSpeed != null ? `${pt.windSpeed} kt` : '—'}
                  </div>
                  <div style={{ fontSize: 9, color: '#888' }}>{pt.timeStr}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <ComposedChart data={formattedData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="timeStr" stroke="#8c8c8c" fontSize={11} />
                <YAxis stroke="#8c8c8c" fontSize={11} label={{ value: 'Nudos (kt)', angle: -90, position: 'insideLeft', fill: '#8c8c8c', fontSize: 11 }} />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                {/* Área de velocidad del barco */}
                <Area
                  type="monotone"
                  dataKey="boatSpeed"
                  name="Velocidad Barco (kt)"
                  stroke="#13C2C2"
                  strokeWidth={2}
                  fill="#13C2C2"
                  fillOpacity={0.15}
                />
                {/* Línea de viento con puntos de flecha direccional */}
                <Line
                  type="monotone"
                  dataKey="windSpeed"
                  name="Velocidad Viento (kt)"
                  stroke="#1890FF"
                  strokeWidth={2.5}
                  dot={<CustomWindArrowDot totalPoints={formattedData.length} />}
                  activeDot={{ r: 6, fill: '#096dd9' }}
                />
                <Brush dataKey="timeStr" height={24} stroke="#1890FF" fill="#f0f5ff" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* ── GRÁFICA 2: TEMPERATURA Y HUMEDAD RELATIVA ── */}
      {(activeView === 'all' || activeView === 'temp_hum') && (
        <Card
          title={<span style={{ color: '#0A2647', fontWeight: 700, fontSize: 14 }}>🌡️ Perfil de Temperatura (°C) y Humedad Relativa (%)</span>}
          style={{ borderRadius: 12, marginBottom: 16 }}
          styles={{ body: { padding: '16px 12px 8px' } }}
        >
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={formattedData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="timeStr" stroke="#8c8c8c" fontSize={11} />
                <YAxis yAxisId="left" stroke="#FA541C" fontSize={11} domain={['dataMin - 1', 'dataMax + 1']} label={{ value: 'Temp (°C)', angle: -90, position: 'insideLeft', fill: '#FA541C', fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" stroke="#1D39C4" fontSize={11} domain={[0, 100]} label={{ value: 'Humedad (%)', angle: 90, position: 'insideRight', fill: '#1D39C4', fontSize: 11 }} />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Line yAxisId="left" type="monotone" dataKey="temp" name="Temperatura (°C)" stroke="#FA541C" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                <Line yAxisId="right" type="monotone" dataKey="humidity" name="Humedad Relativa (%))" stroke="#1D39C4" strokeWidth={2} strokeDasharray="4 2" dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* ── GRÁFICA 3: PRESIÓN BAROMÉTRICA ── */}
      {(activeView === 'all' || activeView === 'pressure') && (
        <Card
          title={<span style={{ color: '#0A2647', fontWeight: 700, fontSize: 14 }}>📐 Presión Barométrica en Ruta (hPa)</span>}
          style={{ borderRadius: 12, marginBottom: 16 }}
          styles={{ body: { padding: '16px 12px 8px' } }}
        >
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={formattedData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="timeStr" stroke="#8c8c8c" fontSize={11} />
                <YAxis stroke="#722ED1" fontSize={11} domain={['dataMin - 1', 'dataMax + 1']} label={{ value: 'Presión (hPa)', angle: -90, position: 'insideLeft', fill: '#722ED1', fontSize: 11 }} />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Line type="monotone" dataKey="pressure" name="Presión Atmosférica (hPa)" stroke="#722ED1" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
