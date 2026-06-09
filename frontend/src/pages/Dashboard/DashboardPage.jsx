/**
 * SIAE — Dashboard Principal.
 * Vista general con resumen de todos los módulos, métricas avanzadas y gráficos SVG interactivos.
 */

import { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Typography, Tag, message, Space, Divider, Tooltip } from 'antd';
import {
  ToolOutlined,
  FileTextOutlined,
  CompassOutlined,
  TeamOutlined,
  InboxOutlined,
  DollarOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  PieChartOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const ShipIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: 'inline-block', verticalAlign: 'middle' }}
  >
    <path d="M2 17h20l-2 4H4l-2-4z" />
    <path d="M5 17v-4h10v4" />
    <path d="M12 13V6M12 8h4l-2-2h-2" />
  </svg>
);

const { Title, Text } = Typography;

const CRUISE_STATUS_COLORS = {
  borrador: '#D4AC0D',
  pendiente: '#8E44AD',
  planificado: '#1677FF',
  en_curso: '#52C41A',
  completado: '#7F8C8D',
  cancelado: '#F5222D',
};

const CRUISE_STATUS_LABELS = {
  borrador: 'Borrador',
  pendiente: 'Pendiente',
  planificado: 'Planificado',
  en_curso: 'En Curso',
  completado: 'Completado',
  cancelado: 'Cancelado',
};

// ── COMPONENTE GRÁFICO: Dona de Estados de Cruceros ──────────────
function CruiseStatusDonutChart({ counts }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76
  
  let accumulatedPercent = 0;

  const slices = Object.entries(counts)
    .filter(([_, count]) => count > 0)
    .map(([status, count]) => {
      const percent = count / total;
      const strokeLength = percent * circumference;
      const strokeOffset = circumference - (accumulatedPercent * circumference);
      accumulatedPercent += percent;
      return {
        status,
        count,
        percent,
        color: CRUISE_STATUS_COLORS[status],
        strokeLength,
        strokeOffset,
      };
    });

  return (
    <Row align="middle" gutter={24}>
      <style>{`
        .legend-item-cruise:hover {
          background: #f1f5f9 !important;
          border-color: #cbd5e1 !important;
          transform: translateY(-2px);
        }
      `}</style>
      <Col xs={24} md={10} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 180, height: 180 }}>
          <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ transform: 'rotate(-90deg)' }}>
            {total === 0 ? (
              <circle cx="50" cy="50" r={radius} stroke="#e2e8f0" strokeWidth="10" fill="transparent" />
            ) : (
              slices.map((slice) => (
                <circle
                  key={slice.status}
                  cx="50"
                  cy="50"
                  r={radius}
                  stroke={slice.color}
                  strokeWidth="10"
                  fill="transparent"
                  strokeDasharray={`${slice.strokeLength} ${circumference}`}
                  strokeDashoffset={slice.strokeOffset}
                  style={{ transition: 'all 0.5s ease', cursor: 'pointer' }}
                >
                  <title>{`${CRUISE_STATUS_LABELS[slice.status]}: ${slice.count} (${(slice.percent * 100).toFixed(0)}%)`}</title>
                </circle>
              ))
            )}
          </svg>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#0A2647' }}>{total}</div>
            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>Cruceros</div>
          </div>
        </div>
      </Col>
      <Col xs={24} md={14}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {Object.entries(counts).map(([status, count]) => (
            <div key={status} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 13,
              padding: '6px 12px',
              background: '#f8fafc',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              transition: 'all 0.2s ease',
            }}
            className="legend-item-cruise"
            >
              <Space size={6}>
                <span style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: CRUISE_STATUS_COLORS[status],
                  boxShadow: `0 0 4px ${CRUISE_STATUS_COLORS[status]}`
                }} />
                <Text style={{ color: '#475569', fontWeight: 500, fontSize: 12 }}>{CRUISE_STATUS_LABELS[status]}</Text>
              </Space>
              <Text strong style={{ color: '#1e293b' }}>{count}</Text>
            </div>
          ))}
        </div>
      </Col>
    </Row>
  );
}

// ── COMPONENTE GRÁFICO: Dona de Estado de Facturación ───────────
function BillingDonutChart({ totals }) {
  const sumTotal = totals.por_cobrar + totals.cobrado + totals.transferido;
  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76
  
  let accumulatedPercent = 0;

  const items = [
    { key: 'por_cobrar', label: 'Por Cobrar', color: '#E67E22', value: totals.por_cobrar },
    { key: 'cobrado', label: 'Cobrado', color: '#1677FF', value: totals.cobrado },
    { key: 'transferido', label: 'Transferido', color: '#52C41A', value: totals.transferido },
  ];

  const slices = items
    .filter(i => i.value > 0)
    .map((item) => {
      const percent = item.value / sumTotal;
      const strokeLength = percent * circumference;
      const strokeOffset = circumference - (accumulatedPercent * circumference);
      accumulatedPercent += percent;
      return {
        ...item,
        percent,
        strokeLength,
        strokeOffset,
      };
    });

  return (
    <Row align="middle" gutter={24}>
      <style>{`
        .legend-item:hover {
          background: #f1f5f9 !important;
          border-color: #cbd5e1 !important;
          transform: translateX(4px);
        }
      `}</style>
      <Col xs={24} md={10} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 180, height: 180 }}>
          <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ transform: 'rotate(-90deg)' }}>
            {sumTotal === 0 ? (
              <circle cx="50" cy="50" r={radius} stroke="#e2e8f0" strokeWidth="10" fill="transparent" />
            ) : (
              slices.map((slice) => (
                <circle
                  key={slice.key}
                  cx="50"
                  cy="50"
                  r={radius}
                  stroke={slice.color}
                  strokeWidth="10"
                  fill="transparent"
                  strokeDasharray={`${slice.strokeLength} ${circumference}`}
                  strokeDashoffset={slice.strokeOffset}
                  style={{ transition: 'all 0.5s ease', cursor: 'pointer' }}
                >
                  <title>{`${slice.label}: $${slice.value.toLocaleString()} (${(slice.percent * 100).toFixed(0)}%)`}</title>
                </circle>
              ))
            )}
          </svg>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            width: '75%',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0A2647', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={`$${sumTotal.toLocaleString()}`}>
              ${sumTotal > 1000000 ? `${(sumTotal / 1000000).toFixed(1)}M` : sumTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>Total Reg.</div>
          </div>
        </div>
      </Col>
      <Col xs={24} md={14}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => (
            <div key={item.key} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 14,
              padding: '8px 12px',
              background: '#f8fafc',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              transition: 'all 0.2s ease',
            }}
            className="legend-item"
            >
              <Space size={8}>
                <span style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: item.color,
                  boxShadow: `0 0 6px ${item.color}`
                }} />
                <Text style={{ color: '#475569', fontWeight: 500 }}>{item.label}</Text>
              </Space>
              <Text strong style={{ color: '#1e293b' }}>
                ${item.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </Text>
            </div>
          ))}
        </div>
      </Col>
    </Row>
  );
}

// ── COMPONENTE GRÁFICO: Historial de Facturación Mensual (Barras SVG) ──
function BillingBarChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', borderRadius: 8 }}>
        <Text type="secondary" style={{ fontStyle: 'italic' }}>Sin datos de facturación histórica registrados.</Text>
      </div>
    );
  }

  // Tomamos los últimos 6 meses para visualización clara
  const visibleData = data.slice(-6);
  
  // Encontrar el valor máximo para escalar el gráfico
  const maxVal = Math.max(
    ...visibleData.map(d => Math.max(d.total_mxn, d.total_usd * 18)), // estimamos tipo de cambio para escala relativa
    10000
  );

  const chartHeight = 220;
  const chartWidth = 700;
  const paddingLeft = 65;
  const paddingRight = 25;
  const paddingTop = 25;
  const paddingBottom = 35;

  const graphHeight = chartHeight - paddingTop - paddingBottom;
  const graphWidth = chartWidth - paddingLeft - paddingRight;

  const step = graphWidth / visibleData.length;
  const barWidth = 22;
  const barGap = 6;

  const formatYValue = (val) => {
    if (val === 0) return '$0';
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
    return `$${val}`;
  };

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} width="100%" height="100%" style={{ display: 'block', minHeight: 220 }}>
        <defs>
          {/* Gradients */}
          <linearGradient id="mxnGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id="mxnGradHover" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="usdGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
          <linearGradient id="usdGradHover" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>

        <style>{`
          .bar-mxn-rect {
            fill: url(#mxnGrad);
            transition: all 0.25s ease;
            cursor: pointer;
          }
          .bar-mxn-rect:hover {
            fill: url(#mxnGradHover);
            filter: drop-shadow(0px 2px 5px rgba(59, 130, 246, 0.4));
          }
          .bar-usd-rect {
            fill: url(#usdGrad);
            transition: all 0.25s ease;
            cursor: pointer;
          }
          .bar-usd-rect:hover {
            fill: url(#usdGradHover);
            filter: drop-shadow(0px 2px 5px rgba(16, 185, 129, 0.4));
          }
          .grid-line {
            stroke: #f1f5f9;
            stroke-width: 1;
          }
          .axis-line {
            stroke: #cbd5e1;
            stroke-width: 1.5;
          }
          .chart-text {
            font-size: 10px;
            fill: #64748b;
            font-family: system-ui, -apple-system, sans-serif;
            font-weight: 500;
          }
        `}</style>

        {/* Y Axis Grid Lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const y = paddingTop + graphHeight * (1 - ratio);
          const val = maxVal * ratio;
          return (
            <g key={idx}>
              <line x1={paddingLeft} y1={y} x2={chartWidth - paddingRight} y2={y} className="grid-line" strokeDasharray={ratio === 0 ? "0" : "4 4"} />
              <text x={paddingLeft - 10} y={y + 3} textAnchor="end" className="chart-text">
                {formatYValue(val)}
              </text>
            </g>
          );
        })}

        {/* X Axis Line */}
        <line x1={paddingLeft} y1={chartHeight - paddingBottom} x2={chartWidth - paddingRight} y2={chartHeight - paddingBottom} className="axis-line" />

        {/* Bars */}
        {visibleData.map((d, index) => {
          const xCenter = paddingLeft + (index * step) + step / 2;
          
          // Escala de barras
          const hMxn = (d.total_mxn / maxVal) * graphHeight;
          const hUsd = ((d.total_usd * 18) / maxVal) * graphHeight; // Usamos USD estimado a escala visual

          const rectHeightMxn = Math.max(hMxn, d.total_mxn > 0 ? 4 : 0);
          const rectHeightUsd = Math.max(hUsd, d.total_usd > 0 ? 4 : 0);

          const yMxn = chartHeight - paddingBottom - rectHeightMxn;
          const yUsd = chartHeight - paddingBottom - rectHeightUsd;

          const xMxn = xCenter - barWidth - barGap / 2;
          const xUsd = xCenter + barGap / 2;

          return (
            <g key={d.month}>
              {/* MXN Bar */}
              {d.total_mxn > 0 && (
                <rect
                  x={xMxn}
                  y={yMxn}
                  width={barWidth}
                  height={rectHeightMxn}
                  className="bar-mxn-rect"
                  rx="3"
                >
                  <title>{`MXN: $${d.total_mxn.toLocaleString()}`}</title>
                </rect>
              )}

              {/* USD Bar */}
              {d.total_usd > 0 && (
                <rect
                  x={xUsd}
                  y={yUsd}
                  width={barWidth}
                  height={rectHeightUsd}
                  className="bar-usd-rect"
                  rx="3"
                >
                  <title>{`USD: $${d.total_usd.toLocaleString()}`}</title>
                </rect>
              )}

              {/* Month Label */}
              <text x={xCenter} y={chartHeight - paddingBottom + 18} textAnchor="middle" className="chart-text" style={{ fontSize: 11, fill: '#475569' }}>
                {dayjs(d.month + '-01').format('MMM')}
              </text>
            </g>
          );
        })}
      </svg>
      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 12 }}>
        <Space size={6}>
          <span style={{ display: 'inline-block', width: 14, height: 10, backgroundColor: '#3b82f6', borderRadius: 3, boxShadow: '0 0 4px rgba(59, 130, 246, 0.4)' }} />
          <Text style={{ fontSize: 12, fontWeight: 500, color: '#475569' }}>MXN</Text>
        </Space>
        <Space size={6}>
          <span style={{ display: 'inline-block', width: 14, height: 10, backgroundColor: '#10b981', borderRadius: 3, boxShadow: '0 0 4px rgba(16, 185, 129, 0.4)' }} />
          <Text style={{ fontSize: 12, fontWeight: 500, color: '#475569' }}>USD (Escala ×18)</Text>
        </Space>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, hasPermission, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    vessels: 0,
    maintenance: 0,
    documents: 0,
    cruises: 0,
    personnel: 0,
    inventory: 0,
    total_nm: 0,
    cruise_status_counts: {
      borrador: 0,
      pendiente: 0,
      planificado: 0,
      en_curso: 0,
      completado: 0,
      cancelado: 0,
    },
    billing_stats: {
      total_by_status: { por_cobrar: 0, cobrado: 0, transferido: 0 },
      monthly_billing: [],
    }
  });

  const isAdmin = user?.is_superadmin || user?.roles?.some(r => r.name === 'Administrador');

  useEffect(() => {
    if (authLoading) return;
    if (!hasPermission('dashboard', 'view')) {
      navigate('/requests', { replace: true });
      return;
    }

    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const summaries = {
          vessels: 0,
          maintenance: 0,
          documents: 0,
          cruises: 0,
          personnel: 0,
          inventory: 0,
          total_nm: 0,
          cruise_status_counts: {
            borrador: 0,
            pendiente: 0,
            planificado: 0,
            en_curso: 0,
            completado: 0,
            cancelado: 0,
          },
          billing_stats: {
            total_by_status: { por_cobrar: 0, cobrado: 0, transferido: 0 },
            monthly_billing: [],
          }
        };
        
        // Llamadas básicas accesibles para todos los usuarios autorizados
        try { const r = await apiClient.get('/vessels/options'); summaries.vessels = r.data.length; } catch {}
        try { const r = await apiClient.get('/maintenance/summary'); summaries.maintenance = r.data.pendientes || 0; } catch {}
        try { const r = await apiClient.get('/documents/summary'); summaries.documents = (r.data.por_vencer || 0) + (r.data.vencidos || 0); } catch {}
        try { const r = await apiClient.get('/personnel/summary'); summaries.personnel = r.data.activo || 0; } catch {}
        try { const r = await apiClient.get('/inventory/summary'); summaries.inventory = (r.data.bajo || 0) + (r.data.agotado || 0); } catch {}
        
        // Cruceros y millas (Extraídos del endpoint central de cruceros)
        try { 
          const r = await apiClient.get('/cruises/summary'); 
          summaries.cruises = (r.data.en_curso || 0) + (r.data.planificado || 0);
          
          if (isAdmin) {
            summaries.total_nm = r.data.total_nm || 0;
            summaries.cruise_status_counts = {
              borrador: r.data.borrador || 0,
              pendiente: r.data.pendiente || 0,
              planificado: r.data.planificado || 0,
              en_curso: r.data.en_curso || 0,
              completado: r.data.completado || 0,
              cancelado: r.data.cancelado || 0,
            };
          }
        } catch {}

        // Información de facturación (Solo para Administradores con permisos de facturación)
        if (isAdmin && hasPermission('billing', 'view')) {
          try {
            const r = await apiClient.get('/cruise-billings/stats');
            summaries.billing_stats = {
              total_by_status: r.data.summary.total_by_status,
              monthly_billing: r.data.monthly_billing,
            };
          } catch {}
        }

        setData(summaries);
      } catch (err) {
        message.error('Error al cargar datos del dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [authLoading, hasPermission, navigate, isAdmin]);

  // Layout de métricas originales para usuarios regulares
  const originalStats = [
    { title: 'Embarcaciones', value: data.vessels, icon: <ShipIcon />, color: '#1B4F72', path: '/vessels' },
    { title: 'Cruceros Activos', value: data.cruises, icon: <CompassOutlined />, color: '#27AE60', path: '/cruises' },
    { title: 'Personal DEO Activo', value: data.personnel, icon: <TeamOutlined />, color: '#8E44AD', path: '/personnel' },
    { title: 'Mantenimientos Pendientes', value: data.maintenance, icon: <ToolOutlined />, color: '#E67E22', path: '/maintenance' },
    { title: 'Documentos por Vencer/Vencidos', value: data.documents, icon: <FileTextOutlined />, color: '#E74C3C', path: '/documents' },
    { title: 'Alertas de Inventario (Bajo/Agotado)', value: data.inventory, icon: <InboxOutlined />, color: '#2980B9', path: '/inventory' },
  ];

  if (authLoading || !hasPermission('dashboard', 'view')) {
    return null;
  }

  // ── RENDER: MODO USUARIO REGULAR ──────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="animate-fade-in">
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <Title level={3} style={{ color: '#0A2647', margin: 0 }}>
              📊 Panel de Control
            </Title>
            <Text type="secondary">Resumen general del estado de la flota</Text>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          {originalStats.map((stat) => (
            <Col xs={24} sm={12} lg={8} key={stat.title}>
              <Card
                hoverable
                onClick={() => navigate(stat.path)}
                loading={loading}
                style={{
                  borderRadius: 12,
                  borderLeft: `4px solid ${stat.color}`,
                  cursor: 'pointer'
                }}
              >
                <Statistic
                  title={stat.title}
                  value={stat.value}
                  prefix={<span style={{ color: stat.color, marginRight: 12 }}>{stat.icon}</span>}
                  valueStyle={{ color: stat.color, fontWeight: 600 }}
                />
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    );
  }

  // ── RENDER: MODO ADMINISTRADOR (KPIs extendidos + Gráficos) ─────────
  const billingTotals = data.billing_stats.total_by_status;
  const pendingMxn = billingTotals.por_cobrar;
  const collectedMxn = billingTotals.cobrado + billingTotals.transferido;

  return (
    <div className="animate-fade-in">
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <Title level={3} style={{ color: '#0A2647', margin: 0 }}>
            📊 Panel de Control
          </Title>
          <Text type="secondary">Administración global y estadísticas del sistema SIAE.</Text>
        </Col>
      </Row>

      {/* BLOQUE KPIs 1: OPERACIÓN FLOTA */}
      <Divider orientation="left" style={{ margin: '12px 0 16px 0', borderColor: '#f0f0f0' }}>
        <Text strong style={{ color: '#1B4F72', fontSize: 13, textTransform: 'uppercase' }}>Operación de Salidas</Text>
      </Divider>
      
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/vessels')} loading={loading} style={{ borderRadius: 12, borderLeft: '4px solid #1B4F72' }}>
            <Statistic title="Embarcaciones" value={data.vessels} prefix={<span style={{ color: '#1B4F72', marginRight: 12 }}><ShipIcon /></span>} valueStyle={{ color: '#1B4F72', fontWeight: 600 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/cruises')} loading={loading} style={{ borderRadius: 12, borderLeft: '4px solid #27AE60' }}>
            <Statistic title="Cruceros Activos" value={data.cruises} prefix={<span style={{ color: '#27AE60', marginRight: 12 }}><CompassOutlined /></span>} valueStyle={{ color: '#27AE60', fontWeight: 600 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/personnel')} loading={loading} style={{ borderRadius: 12, borderLeft: '4px solid #8E44AD' }}>
            <Statistic title="Personal DEO Activo" value={data.personnel} prefix={<span style={{ color: '#8E44AD', marginRight: 12 }}><TeamOutlined /></span>} valueStyle={{ color: '#8E44AD', fontWeight: 600 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/cruises')} loading={loading} style={{ borderRadius: 12, borderLeft: '4px solid #2980B9' }}>
            <Statistic title="Millas Náuticas Recorridas" value={data.total_nm} precision={1} suffix="mn" prefix={<span style={{ color: '#2980B9', marginRight: 12 }}><CompassOutlined /></span>} valueStyle={{ color: '#2980B9', fontWeight: 600 }} />
          </Card>
        </Col>
      </Row>

      {/* BLOQUE KPIs 2: CONTROL Y MANTENIMIENTO */}
      <Divider orientation="left" style={{ margin: '16px 0 16px 0', borderColor: '#f0f0f0' }}>
        <Text strong style={{ color: '#E67E22', fontSize: 13, textTransform: 'uppercase' }}>Control y Mantenimiento</Text>
      </Divider>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={8}>
          <Card hoverable onClick={() => navigate('/maintenance')} loading={loading} style={{ borderRadius: 12, borderLeft: '4px solid #E67E22' }}>
            <Statistic title="Mantenimientos Pendientes" value={data.maintenance} prefix={<span style={{ color: '#E67E22', marginRight: 12 }}><ToolOutlined /></span>} valueStyle={{ color: '#E67E22', fontWeight: 600 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card hoverable onClick={() => navigate('/documents')} loading={loading} style={{ borderRadius: 12, borderLeft: '4px solid #E74C3C' }}>
            <Statistic title="Documentos Vencidos / Por Vencer" value={data.documents} prefix={<span style={{ color: '#E74C3C', marginRight: 12 }}><FileTextOutlined /></span>} valueStyle={{ color: '#E74C3C', fontWeight: 600 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card hoverable onClick={() => navigate('/inventory')} loading={loading} style={{ borderRadius: 12, borderLeft: '4px solid #2980B9' }}>
            <Statistic title="Alertas de Inventario (Bajo/Agotado)" value={data.inventory} prefix={<span style={{ color: '#2980B9', marginRight: 12 }}><InboxOutlined /></span>} valueStyle={{ color: '#2980B9', fontWeight: 600 }} />
          </Card>
        </Col>
      </Row>

      {/* BLOQUE KPIs 3: RESUMEN FINANCIERO (Condicional) */}
      {hasPermission('billing', 'view') && (
        <>
          <Divider orientation="left" style={{ margin: '16px 0 16px 0', borderColor: '#f0f0f0' }}>
            <Text strong style={{ color: '#27AE60', fontSize: 13, textTransform: 'uppercase' }}>Resumen Financiero</Text>
          </Divider>
          
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} lg={12}>
              <Card hoverable onClick={() => navigate('/billing')} loading={loading} style={{ borderRadius: 12, borderLeft: '4px solid #E67E22' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ fontSize: 24, color: '#E67E22', marginRight: 16 }}><DollarOutlined /></div>
                  <div style={{ flexGrow: 1 }}>
                    <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 2 }}>Total Por Cobrar</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#D35400' }}>
                      ${pendingMxn.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: 12, fontWeight: 500 }}>MXN</span>
                    </div>
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={12}>
              <Card hoverable onClick={() => navigate('/billing')} loading={loading} style={{ borderRadius: 12, borderLeft: '4px solid #27AE60' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ fontSize: 24, color: '#27AE60', marginRight: 16 }}><CheckCircleOutlined /></div>
                  <div style={{ flexGrow: 1 }}>
                    <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 2 }}>Facturación Recuperada</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#27AE60' }}>
                      ${collectedMxn.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: 12, fontWeight: 500 }}>MXN</span>
                    </div>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* BLOQUE GRÁFICOS SVG */}
      <Divider orientation="left" style={{ margin: '16px 0 16px 0', borderColor: '#f0f0f0' }}>
        <Text strong style={{ color: '#2C3E50', fontSize: 13, textTransform: 'uppercase' }}>Análisis Visual de Actividad</Text>
      </Divider>

      <Row gutter={[16, 16]} style={{ marginBottom: 24, display: 'flex', alignItems: 'stretch' }}>
        {hasPermission('billing', 'view') ? (
          <>
            <Col xs={24} lg={16} style={{ display: 'flex', flexDirection: 'column' }}>
              <Card 
                title={<Space><BarChartOutlined style={{ color: '#1677FF' }} /><span>Tendencia de Facturación Mensual</span></Space>} 
                style={{ borderRadius: 12, height: '100%', display: 'flex', flexDirection: 'column' }}
                styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px' } }}
              >
                <div style={{ width: '100%' }}>
                  <BillingBarChart data={data.billing_stats.monthly_billing} />
                </div>
              </Card>
            </Col>
            <Col xs={24} lg={8} style={{ display: 'flex', flexDirection: 'column' }}>
              <Card 
                title={<Space><PieChartOutlined style={{ color: '#E67E22' }} /><span>Estado de Facturación</span></Space>} 
                style={{ borderRadius: 12, height: '100%', display: 'flex', flexDirection: 'column' }}
                styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px' } }}
              >
                <div style={{ width: '100%' }}>
                  <BillingDonutChart totals={data.billing_stats.total_by_status} />
                </div>
              </Card>
            </Col>
          </>
        ) : (
          <Col xs={24} md={24}>
            <Card 
              title={<Space><PieChartOutlined style={{ color: '#1677FF' }} /><span>Distribución de Cruceros por Estado</span></Space>} 
              style={{ borderRadius: 12 }}
              styles={{ body: { padding: '24px' } }}
            >
              <div>
                <CruiseStatusDonutChart counts={data.cruise_status_counts} />
              </div>
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
}
