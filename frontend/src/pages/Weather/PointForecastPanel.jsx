/**
 * SIAE — Panel de pronóstico puntual (viento, ráfagas, oleaje) para el
 * módulo de Meteorología. Se abre al hacer click en el mapa o en un punto fijo.
 */
import { useState } from 'react';
import { Drawer, Spin, Empty, Table, Typography } from 'antd';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';

const { Text } = Typography;

const columns = [
  { title: 'Fecha/Hora', dataIndex: 'label', width: 120 },
  { title: 'Viento (kt)', dataIndex: 'wind_speed_kt', width: 90, render: (v) => v ?? '—' },
  { title: 'Ráfaga (kt)', dataIndex: 'wind_gust_kt', width: 90, render: (v) => v ?? '—' },
  { title: 'Dirección', dataIndex: 'wind_dir_deg', width: 90, render: (v) => (v != null ? `${v}°` : '—') },
  { title: 'Ola (m)', dataIndex: 'wave_height_m', width: 80, render: (v) => v ?? '—' },
  { title: 'Periodo (s)', dataIndex: 'wave_period_s', width: 90, render: (v) => v ?? '—' },
];

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string|null} props.pointName
 * @param {boolean} props.loading
 * @param {Array} props.forecast - Lista de {time, forecast_hour, wind_speed_kt, ...}
 */
function PointForecastPanel({ open, onClose, pointName, loading, forecast }) {
  const [infoExpanded, setInfoExpanded] = useState(false);
  const chartData = (forecast || []).map((f) => ({
    ...f,
    label: dayjs(f.time).format('DD/MM HH:mm'),
  }));
  const tickInterval = Math.max(0, Math.ceil(chartData.length / 8) - 1);

  const displayTitle = pointName
    ? `${pointName} — Pronóstico del Modelo`
    : 'Pronóstico del Modelo (Simulación)';

  return (
    <Drawer title={displayTitle} open={open} onClose={onClose} width={520}>
      <div style={{
        background: '#e6f7ff',
        border: '1px solid #91d5ff',
        borderRadius: 6,
        padding: '8px 12px',
        marginBottom: 16,
        fontSize: 12,
        color: 'rgba(0, 0, 0, 0.85)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>ℹ️ <strong>Datos de Simulación (Modelo GFS/WW3)</strong></span>
          <a onClick={() => setInfoExpanded(!infoExpanded)} style={{ fontSize: 11, fontWeight: '500' }}>
            {infoExpanded ? 'Ocultar info' : 'Saber más...'}
          </a>
        </div>
        {infoExpanded && (
          <div style={{ marginTop: 6, borderTop: '1px solid #91d5ff', paddingTop: 6, color: '#555', lineHeight: '1.4' }}>
            Esta barra lateral muestra predicciones y simulaciones basadas en los modelos GFS (viento) y WW3 (oleaje).
            Las observaciones reales medidas por sensores terrestres en tiempo real se visualizan en la sección inferior de la pantalla.
          </div>
        )}
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin tip="Cargando pronóstico del modelo..." />
        </div>
      ) : !forecast || forecast.length === 0 ? (
        <Empty description="Sin datos de pronóstico para este punto" />
      ) : (
        <>
          <Text strong>Viento y ráfagas (nudos)</Text>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="wind_speed_kt" name="Viento" stroke="#1677FF" dot={false} />
              <Line type="monotone" dataKey="wind_gust_kt" name="Ráfaga" stroke="#FA8C16" dot={false} />
            </LineChart>
          </ResponsiveContainer>

          <Text strong style={{ marginTop: 16, display: 'block' }}>Oleaje (metros)</Text>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={tickInterval} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="wave_height_m" name="Altura de ola" stroke="#08979C" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>

          <Text strong style={{ marginTop: 16, display: 'block', marginBottom: 8 }}>Tabla horaria</Text>
          <Table
            dataSource={chartData}
            columns={columns}
            rowKey="forecast_hour"
            size="small"
            pagination={{ pageSize: 12 }}
            scroll={{ y: 300 }}
          />
        </>
      )}
    </Drawer>
  );
}

export default PointForecastPanel;
