/**
 * SIAE — Página de Facturación y Cobros.
 * Permite gestionar los cobros de los cruceros, registrar tarifas,
 * ver KPIs financieros y subir los recibos escaneados entregados por administración.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker,
  Space, Tag, Card, Row, Col, Statistic, message, Tooltip, Popconfirm,
  Typography, Divider, Empty, Upload, Tabs, Switch, Alert
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  DollarOutlined, FilePdfOutlined, UploadOutlined, EyeOutlined,
  CalendarOutlined, SearchOutlined, CheckCircleOutlined, SyncOutlined,
  SettingOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

// Friendly names for Client Types
export const CLIENT_TYPE_LABELS = {
  nacional_institucion: 'Inst. Nacional Mexicana',
  nacional_empresa: 'Empresa Nacional',
  extranjero: 'Institución Extranjera',
  cicese_interno: 'Proyecto Interno CICESE',
  cicese_interno_bahia: 'Interno (Modalidad Bahía)',
  secihti: 'Proyecto SECIHTI (ex-CONAHCyT)',
  cicese_autogenerado: 'CICESE Autogenerados',
  externo_nacional: 'Externo Nacional',
  general: 'Público General'
};

export const STATUS_CONFIG = {
  por_cobrar: { color: 'warning', text: 'Por Cobrar', icon: <SyncOutlined spin /> },
  cobrado: { color: 'processing', text: 'Cobrado', icon: <CheckCircleOutlined /> },
  transferido: { color: 'success', text: 'Transferido', icon: <CheckCircleOutlined /> }
};

export default function BillingPage() {
  const { hasPermission } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [billings, setBillings] = useState([]);
  const [total, setTotal] = useState(0);
  const [vessels, setVessels] = useState([]);
  const [cruises, setCruises] = useState([]);
  const [stats, setStats] = useState({
    summary: {
      total_by_status: { por_cobrar: 0.0, cobrado: 0.0, transferido: 0.0 },
      total_by_currency: { MXN: 0.0, USD: 0.0 },
      count_by_status: { por_cobrar: 0, cobrado: 0, transferido: 0 }
    },
    monthly_billing: []
  });

  // Filtros
  const [filterVesselId, setFilterVesselId] = useState(null);
  const [filterStatus, setFilterStatus] = useState(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDateRange, setFilterDateRange] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  // Modales
  const [modalOpen, setModalOpen] = useState(false);
  const [editBilling, setEditBilling] = useState(null);
  
  // Detalle visual
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedBilling, setSelectedBilling] = useState(null);

  // Transferencia Consolidada
  const [batchTransferModalOpen, setBatchTransferModalOpen] = useState(false);
  const [eligibleBillings, setEligibleBillings] = useState([]);
  const [selectedBillingIds, setSelectedBillingIds] = useState([]);
  const [batchFolio, setBatchFolio] = useState('');
  const [batchDate, setBatchDate] = useState(dayjs());
  const [savingBatch, setSavingBatch] = useState(false);

  const canCreate = hasPermission('billing', 'create');
  const canEdit = hasPermission('billing', 'edit');
  const canDelete = hasPermission('billing', 'delete');

  const [activeTab, setActiveTab] = useState('cobros');

  // Tarifas State
  const [rates, setRates] = useState([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesTotal, setRatesTotal] = useState(0);
  const [rateFilterVesselId, setRateFilterVesselId] = useState(null);
  const [rateFilterYear, setRateFilterYear] = useState(2025);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState(null);

  const fetchRates = useCallback(async () => {
    setRatesLoading(true);
    try {
      const params = {};
      if (rateFilterVesselId) params.vessel_id = rateFilterVesselId;
      if (rateFilterYear) params.year = rateFilterYear;
      
      const res = await apiClient.get('/vessel-rates', { params });
      setRates(res.data.items || []);
      setRatesTotal(res.data.total || 0);
    } catch {
      message.error('Error al cargar catálogo de tarifas');
    } finally {
      setRatesLoading(false);
    }
  }, [rateFilterVesselId, rateFilterYear]);

  useEffect(() => {
    if (activeTab === 'tarifas') {
      fetchRates();
    }
  }, [activeTab, fetchRates]);

  const handleDeleteRate = async (rateId) => {
    try {
      await apiClient.delete(`/vessel-rates/${rateId}`);
      message.success('Tarifa eliminada con éxito');
      fetchRates();
    } catch {
      message.error('Error al eliminar tarifa');
    }
  };

  const handleOpenCreateRate = () => {
    setEditingRate(null);
    setRateModalOpen(true);
  };

  const handleOpenEditRate = (rate) => {
    setEditingRate(rate);
    setRateModalOpen(true);
  };

  const handleRateSaved = () => {
    setRateModalOpen(false);
    fetchRates();
  };

  // Cargar catálogos
  useEffect(() => {
    // Embarcaciones
    apiClient.get('/vessels?limit=100').then(r => {
      setVessels(r.data.items || r.data || []);
    }).catch(() => {});

    // Cruceros completados (para poder facturarlos)
    apiClient.get('/cruises?limit=100').then(r => {
      // Filtrar cruceros completados
      const items = r.data.items || r.data || [];
      const completed = items.filter(c => c.status === 'completado');
      setCruises(completed);
    }).catch(() => {});
  }, []);

  const fetchBillings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        skip: ((page - 1) * pageSize).toString(),
        limit: pageSize.toString(),
      });
      if (filterVesselId) params.append('vessel_id', filterVesselId);
      if (filterStatus) params.append('status', filterStatus);
      if (filterSearch) params.append('search', filterSearch);
      if (filterDateRange?.[0]) params.append('date_from', filterDateRange[0].format('YYYY-MM-DD'));
      if (filterDateRange?.[1]) params.append('date_to', filterDateRange[1].format('YYYY-MM-DD'));

      const r = await apiClient.get(`/cruise-billings?${params}`);
      setBillings(r.data.items || []);
      setTotal(r.data.total || 0);
    } catch {
      message.error('Error al cargar la lista de facturación');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterVesselId, filterStatus, filterSearch, filterDateRange]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const r = await apiClient.get('/cruise-billings/stats');
      setStats(r.data);
    } catch {
      // Silencioso
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBillings();
    fetchStats();
  }, [fetchBillings, fetchStats]);

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/cruise-billings/${id}`);
      message.success('Registro de cobro eliminado correctamente');
      fetchBillings();
      fetchStats();
    } catch {
      message.error('Error al eliminar el registro de cobro');
    }
  };

  const handleOpenCreate = () => {
    setEditBilling(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (record) => {
    setEditBilling(record);
    setModalOpen(true);
  };

  const handleOpenView = (record) => {
    setSelectedBilling(record);
    setViewModalOpen(true);
  };

  const handleSaved = () => {
    fetchBillings();
    fetchStats();
  };

  const handleOpenBatchTransfer = async () => {
    setLoading(true);
    try {
      const [resPorCobrar, resCobrado] = await Promise.all([
        apiClient.get('/cruise-billings', { params: { status: 'por_cobrar', limit: 100 } }),
        apiClient.get('/cruise-billings', { params: { status: 'cobrado', limit: 100 } })
      ]);
      const pending = [
        ...(resPorCobrar.data.items || []),
        ...(resCobrado.data.items || [])
      ];
      setEligibleBillings(pending);
      setSelectedBillingIds([]);
      setBatchFolio('');
      setBatchDate(dayjs());
      setBatchTransferModalOpen(true);
    } catch {
      message.error('Error al obtener cobros pendientes para transferencia');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessBatchTransfer = async () => {
    if (!batchFolio.trim()) {
      message.error('Por favor ingrese el folio o referencia de la transferencia');
      return;
    }
    if (!batchDate) {
      message.error('Por favor seleccione la fecha de transferencia');
      return;
    }
    if (selectedBillingIds.length === 0) {
      message.error('Debe seleccionar al menos un cobro');
      return;
    }

    setSavingBatch(true);
    try {
      await apiClient.post('/cruise-billings/batch-transfer', {
        billing_ids: selectedBillingIds,
        payment_reference: batchFolio,
        transfer_date: batchDate.format('YYYY-MM-DD')
      });
      message.success('Transferencia masiva registrada con éxito');
      setBatchTransferModalOpen(false);
      fetchBillings();
      fetchStats();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Error al procesar la transferencia masiva';
      message.error(errorMsg);
    } finally {
      setSavingBatch(false);
    }
  };

  // ── Columnas de la tabla principal ─────────────────────────
  const columns = [
    {
      title: 'Crucero',
      dataIndex: 'cruise',
      render: (cruise) => cruise ? (
        <div>
          <div style={{ fontWeight: 600, color: '#0A2647' }}>{cruise.name}</div>
          {cruise.cruise_number && <Text type="secondary" style={{ fontSize: 11 }}>{cruise.cruise_number}</Text>}
        </div>
      ) : <Text type="secondary">—</Text>,
      sorter: (a, b) => (a.cruise?.name || '').localeCompare(b.cruise?.name || ''),
    },
    {
      title: 'Embarcación',
      dataIndex: ['cruise', 'vessel', 'name'],
      width: 140,
      render: (name) => <Tag color="blue" style={{ fontWeight: 500 }}>{name || '—'}</Tag>,
      sorter: (a, b) => (a.cruise?.vessel?.name || '').localeCompare(b.cruise?.vessel?.name || ''),
    },
    {
      title: 'Proyecto / Solicitante',
      dataIndex: 'billing_entity',
      ellipsis: true,
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{v || '—'}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {CLIENT_TYPE_LABELS[r.client_type] || r.client_type}
          </Text>
        </div>
      ),
      sorter: (a, b) => (a.billing_entity || '').localeCompare(b.billing_entity || ''),
    },
    {
      title: 'Monto Total',
      dataIndex: 'total',
      width: 150,
      align: 'right',
      render: (v, r) => (
        <div style={{ textAlign: 'right' }}>
          <Text strong style={{ color: '#0A2647', fontSize: 15 }}>
            {r.currency === 'USD' ? '$' : '$'}{v?.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {r.currency}
          </Text>
          {r.currency === 'USD' && r.exchange_rate && (
            <div style={{ fontSize: 10, color: '#888' }}>
              T.C: ${r.exchange_rate} MXN
            </div>
          )}
        </div>
      ),
      sorter: (a, b) => (a.total || 0) - (b.total || 0),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Estado',
      dataIndex: 'status',
      width: 130,
      render: (status) => {
        const conf = STATUS_CONFIG[status] || { color: 'default', text: status };
        return <Tag color={conf.color} icon={conf.icon} style={{ fontWeight: 600 }}>{conf.text}</Tag>;
      },
      sorter: (a, b) => (a.status || '').localeCompare(b.status || ''),
    },
    {
      title: 'Documentos',
      key: 'documents',
      width: 140,
      align: 'center',
      render: (_, record) => {
        const hasReceipt = !!record.receipt_filename;
        const hasOrder = !!record.vessel_order_filename;
        const hasSignedOrder = !!record.signed_vessel_order_filename;
        
        if (!hasReceipt && !hasOrder && !hasSignedOrder) {
          return <Text type="secondary" style={{ fontSize: 12 }}>Sin archivos</Text>;
        }
        
        return (
          <Space size="small">
            {hasReceipt && (
              <Tooltip title="Ver Recibo">
                <Button
                  type="text"
                  size="small"
                  icon={<FilePdfOutlined style={{ fontSize: 16, color: '#C0392B' }} />}
                  href={`${apiClient.defaults.baseURL.replace('/api/v1', '')}${record.receipt_filename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </Tooltip>
            )}
            {hasOrder && (
              <Tooltip title="Ver Orden de Embarcación">
                <Button
                  type="text"
                  size="small"
                  icon={<FilePdfOutlined style={{ fontSize: 16, color: '#2980B9' }} />}
                  href={`${apiClient.defaults.baseURL.replace('/api/v1', '')}${record.vessel_order_filename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </Tooltip>
            )}
            {hasSignedOrder && (
              <Tooltip title="Ver Orden Firmada">
                <Button
                  type="text"
                  size="small"
                  icon={<FilePdfOutlined style={{ fontSize: 16, color: '#27AE60' }} />}
                  href={`${apiClient.defaults.baseURL.replace('/api/v1', '')}${record.signed_vessel_order_filename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </Tooltip>
            )}
          </Space>
        );
      }
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Ver Detalle">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleOpenView(record)}
            />
          </Tooltip>
          {canEdit && (
            <Tooltip title="Editar">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleOpenEdit(record)}
              />
            </Tooltip>
          )}
          {canDelete && (
            <Popconfirm
              title="¿Eliminar este cobro?"
              description="Esta acción no se puede deshacer."
              onConfirm={() => handleDelete(record.id)}
              okText="Sí" cancelText="No"
            >
              <Tooltip title="Eliminar">
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // ── Columnas de la tabla de tarifas ───────────────────────
  const rateColumns = [
    {
      title: 'Embarcación',
      dataIndex: ['vessel', 'name'],
      key: 'vessel_name',
      render: (text, record) => <Tag color="blue" style={{ fontWeight: 500 }}>{record.vessel?.name || '—'}</Tag>,
    },
    {
      title: 'Concepto / Servicio',
      dataIndex: 'concept',
      key: 'concept',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: 'Tipo de Cliente / Proyecto',
      dataIndex: 'client_type',
      key: 'client_type',
      render: (val) => CLIENT_TYPE_LABELS[val] || val,
    },
    {
      title: 'Tarifa Autorizada',
      dataIndex: 'rate_amount',
      key: 'rate_amount',
      align: 'right',
      render: (val, record) => (
        <span style={{ fontWeight: 600, color: '#0A2647', fontSize: 14 }}>
          {record.currency === 'USD' ? '$' : '$'}{val.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {record.currency}
        </span>
      ),
    },
    {
      title: 'Año',
      dataIndex: 'year',
      key: 'year',
      align: 'center',
    },
    {
      title: 'Estado',
      dataIndex: 'is_active',
      key: 'is_active',
      align: 'center',
      render: (isActive) => (
        <Tag color={isActive ? 'success' : 'default'}>
          {isActive ? 'Vigente' : 'Inactiva'}
        </Tag>
      ),
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 110,
      render: (_, record) => (
        <Space size="middle">
          {canEdit && (
            <Tooltip title="Editar Tarifa">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleOpenEditRate(record)}
              />
            </Tooltip>
          )}
          {canDelete && (
            <Popconfirm
              title="¿Eliminar esta tarifa?"
              description="Esta acción no se puede deshacer."
              onConfirm={() => handleDeleteRate(record.id)}
              okText="Sí" cancelText="No"
            >
              <Tooltip title="Eliminar Tarifa">
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'cobros',
      label: (
        <span>
          <DollarOutlined /> Cobros y Facturación
        </span>
      ),
      children: (
        <>
          {/* Tarjetas de KPIs */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} md={8}>
              <Card bordered={false} className="kpi-card" style={{ borderLeft: '4px solid #E67E22', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <Statistic
                  title={<span style={{ fontWeight: 600, color: '#888' }}>Por Cobrar (Pendiente)</span>}
                  value={stats.summary.total_by_status.por_cobrar}
                  precision={2}
                  prefix={<DollarOutlined style={{ color: '#E67E22' }} />}
                  suffix="MXN"
                  valueStyle={{ color: '#D35400', fontWeight: 700 }}
                />
                <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                  {stats.summary.count_by_status.por_cobrar} cobros pendientes
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Card bordered={false} className="kpi-card" style={{ borderLeft: '4px solid #2980B9', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <Statistic
                  title={<span style={{ fontWeight: 600, color: '#888' }}>Cobrado por Administración</span>}
                  value={stats.summary.total_by_status.cobrado}
                  precision={2}
                  prefix={<DollarOutlined style={{ color: '#2980B9' }} />}
                  suffix="MXN"
                  valueStyle={{ color: '#2980B9', fontWeight: 700 }}
                />
                <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                  {stats.summary.count_by_status.cobrado} cobros listos para transferir
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Card bordered={false} className="kpi-card" style={{ borderLeft: '4px solid #27AE60', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <Statistic
                  title={<span style={{ fontWeight: 600, color: '#888' }}>Transferido al DEO</span>}
                  value={stats.summary.total_by_status.transferido}
                  precision={2}
                  prefix={<DollarOutlined style={{ color: '#27AE60' }} />}
                  suffix="MXN"
                  valueStyle={{ color: '#27AE60', fontWeight: 700 }}
                />
                <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                  {stats.summary.count_by_status.transferido} cobros completados
                </div>
              </Card>
            </Col>
          </Row>

          {/* Filtros de Cobros */}
          <Card bodyStyle={{ padding: '16px 24px' }} style={{ marginBottom: 20, borderRadius: 8 }}>
            <Row gutter={[16, 16]} align="middle">
              <Col xs={24} sm={12} md={6}>
                <Select
                  allowClear
                  placeholder="Filtrar por Embarcación"
                  style={{ width: '100%' }}
                  value={filterVesselId}
                  onChange={setFilterVesselId}
                >
                  {vessels.map(v => (
                    <Option key={v.id} value={v.id}>{v.name}</Option>
                  ))}
                </Select>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Select
                  allowClear
                  placeholder="Filtrar por Estado"
                  style={{ width: '100%' }}
                  value={filterStatus}
                  onChange={setFilterStatus}
                >
                  <Option value="por_cobrar">Por Cobrar</Option>
                  <Option value="cobrado">Cobrado</Option>
                  <Option value="transferido">Transferido</Option>
                </Select>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Input
                  placeholder="Buscar proyecto, contacto..."
                  prefix={<SearchOutlined style={{ color: '#999' }} />}
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                />
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Space>
                  <Button type="primary" onClick={fetchBillings}>
                    Filtrar
                  </Button>
                  <Button onClick={() => {
                    setFilterVesselId(null);
                    setFilterStatus(null);
                    setFilterSearch('');
                    setFilterDateRange(null);
                  }}>
                    Limpiar
                  </Button>
                </Space>
              </Col>
            </Row>
          </Card>

          {/* Tabla de Cobros */}
          <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 8, overflow: 'hidden' }}>
            <Table
              dataSource={billings}
              columns={columns}
              rowKey="id"
              loading={loading}
              pagination={{
                current: page,
                pageSize: pageSize,
                total: total,
                onChange: (p) => setPage(p),
                showSizeChanger: false
              }}
            />
          </Card>
        </>
      )
    },
    {
      key: 'tarifas',
      label: (
        <span>
          <SettingOutlined /> Configuración de Tarifas
        </span>
      ),
      children: (
        <>
          {/* Filtros de Tarifas */}
          <Card bodyStyle={{ padding: '16px 24px' }} style={{ marginBottom: 20, borderRadius: 8 }}>
            <Row gutter={[16, 16]} align="middle">
              <Col xs={24} sm={12} md={8}>
                <Select
                  allowClear
                  placeholder="Filtrar por Embarcación"
                  style={{ width: '100%' }}
                  value={rateFilterVesselId}
                  onChange={setRateFilterVesselId}
                >
                  {vessels.map(v => (
                    <Option key={v.id} value={v.id}>{v.name}</Option>
                  ))}
                </Select>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Select
                  placeholder="Año de Vigencia"
                  style={{ width: '100%' }}
                  value={rateFilterYear}
                  onChange={setRateFilterYear}
                >
                  <Option value={2024}>2024</Option>
                  <Option value={2025}>2025</Option>
                  <Option value={2026}>2026</Option>
                  <Option value={2027}>2027</Option>
                </Select>
              </Col>
              <Col xs={24} sm={24} md={8}>
                <Space>
                  <Button type="primary" onClick={fetchRates}>
                    Filtrar
                  </Button>
                  <Button onClick={() => {
                    setRateFilterVesselId(null);
                    setRateFilterYear(2025);
                  }}>
                    Limpiar
                  </Button>
                </Space>
              </Col>
            </Row>
          </Card>

          {/* Tabla de Tarifas */}
          <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 8, overflow: 'hidden' }}>
            <Table
              dataSource={rates}
              columns={rateColumns}
              rowKey="id"
              loading={ratesLoading}
              pagination={false}
            />
          </Card>
        </>
      )
    }
  ];

  return (
    <div>
      {/* Cabecera */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={3} style={{ margin: 0, color: '#0A2647' }}>
            💰 Facturación y Cobros
          </Title>
          <Text type="secondary">Control de cobros por cruceros de investigación y tarifas autorizadas</Text>
        </div>
        <Space>
          {activeTab === 'cobros' ? (
            <>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => { fetchBillings(); fetchStats(); }}
              >
                Refrescar
              </Button>
              {canEdit && (
                <Button
                  icon={<SyncOutlined />}
                  onClick={handleOpenBatchTransfer}
                >
                  Registrar Transferencia Consolidada
                </Button>
              )}
              {canCreate && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleOpenCreate}
                >
                  Registrar Cobro
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchRates}
              >
                Refrescar
              </Button>
              {canEdit && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleOpenCreateRate}
                >
                  Agregar Tarifa
                </Button>
              )}
            </>
          )}
        </Space>
      </div>

      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab} 
        items={tabItems}
        type="line"
        size="large"
      />

      {/* Modal Formulario (Crear/Editar) */}
      <BillingFormModal
        open={modalOpen}
        billing={editBilling}
        cruises={cruises}
        vessels={vessels}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />

      {/* Modal Vista Detalle */}
      <BillingViewModal
        open={viewModalOpen}
        billing={selectedBilling}
        onClose={() => setViewModalOpen(false)}
      />

      {/* Modal Formulario de Tarifas */}
      <VesselRateFormModal
        open={rateModalOpen}
        rate={editingRate}
        vessels={vessels}
        onClose={() => setRateModalOpen(false)}
        onSaved={handleRateSaved}
      />

      {/* Modal: Registrar Transferencia Consolidada */}
      <Modal
        title={<strong>Registrar Transferencia Consolidada (DEO)</strong>}
        open={batchTransferModalOpen}
        onCancel={() => setBatchTransferModalOpen(false)}
        footer={null}
        width={900}
        destroyOnClose
      >
        <Paragraph>
          Seleccione los cobros de cruceros que forman parte de la transferencia bancaria recibida. Al confirmar, todos los cobros seleccionados se marcarán como <strong>Transferido</strong> y se registrará automáticamente su abono en la cuenta de Recursos Autogenerados (624602).
        </Paragraph>

        {eligibleBillings.length === 0 ? (
          <Alert
            message="No hay cobros pendientes de transferir"
            description="Todos los cobros de cruceros registrados ya se encuentran en estado 'Transferido'."
            type="info"
            showIcon
            style={{ marginBottom: 20 }}
          />
        ) : (
          <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <Form layout="vertical">
                  <Form.Item label={<strong>Folio / Referencia de Transferencia</strong>} required>
                    <Input
                      placeholder="Ej. TR-991823"
                      value={batchFolio}
                      onChange={(e) => setBatchFolio(e.target.value)}
                    />
                  </Form.Item>
                </Form>
              </Col>
              <Col span={12}>
                <Form layout="vertical">
                  <Form.Item label={<strong>Fecha de Transferencia</strong>} required>
                    <DatePicker
                      format="DD/MM/YYYY"
                      style={{ width: '100%' }}
                      value={batchDate}
                      onChange={setBatchDate}
                    />
                  </Form.Item>
                </Form>
              </Col>
            </Row>

            <div style={{ maxHeight: 250, overflowY: 'auto', marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 8 }}>
              <Table
                dataSource={eligibleBillings}
                rowKey="id"
                pagination={false}
                size="small"
                rowSelection={{
                  selectedRowKeys: selectedBillingIds,
                  onChange: setSelectedBillingIds
                }}
                columns={[
                  { 
                    title: 'Crucero', 
                    render: (_, rec) => (
                      <Text strong>{rec.cruise?.name || `ID: ${rec.cruise_id}`}</Text>
                    ) 
                  },
                  { 
                    title: 'Proyecto / Razón Social', 
                    dataIndex: 'billing_entity', 
                    render: (text) => text || 'N/A',
                    ellipsis: true 
                  },
                  { 
                    title: 'Contacto', 
                    dataIndex: 'billing_contact', 
                    render: (text) => text || 'N/A',
                    ellipsis: true 
                  },
                  { 
                    title: 'Estado Actual', 
                    dataIndex: 'status', 
                    render: (st) => {
                      const conf = STATUS_CONFIG[st] || { color: 'default', text: st };
                      return <Tag color={conf.color}>{conf.text}</Tag>;
                    } 
                  },
                  { 
                    title: 'Total', 
                    dataIndex: 'total', 
                    align: 'right', 
                    render: (val, rec) => (
                      <strong>
                        {new Intl.NumberFormat('es-MX', { style: 'currency', currency: rec.currency || 'MXN' }).format(val)}
                      </strong>
                    ) 
                  }
                ]}
              />
            </div>

            <Row gutter={16} style={{ marginBottom: 20 }}>
              <Col span={12}>
                <Card size="small" style={{ background: '#fafafa' }}>
                  <div>Cobros Seleccionados: <strong>{selectedBillingIds.length}</strong></div>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" style={{ background: '#fafafa' }}>
                  <div>Monto Consolidado Transferido:</div>
                  <Title level={4} style={{ margin: '4px 0', color: '#52c41a' }}>
                    {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
                      eligibleBillings
                        .filter(b => selectedBillingIds.includes(b.id))
                        .reduce((sum, b) => sum + (b.total * (b.exchange_rate || 1.0)), 0)
                    )} MXN
                  </Title>
                </Card>
              </Col>
            </Row>

            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setBatchTransferModalOpen(false)}>Cancelar</Button>
                <Button 
                  type="primary" 
                  onClick={handleProcessBatchTransfer}
                  loading={savingBatch}
                  disabled={selectedBillingIds.length === 0 || !batchFolio.trim()}
                  style={{ borderRadius: 6 }}
                >
                  Registrar Transferencia
                </Button>
              </Space>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}


// ── SUB-COMPONENTE: BillingFormModal ──────────────────────────

export function BillingFormModal({ open, billing, cruises, vessels, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [receiptFileList, setReceiptFileList] = useState([]);
  const [vesselOrderFileList, setVesselOrderFileList] = useState([]);
  const [signedOrderFileList, setSignedOrderFileList] = useState([]);
  const [selectedCruise, setSelectedCruise] = useState(null);
  const [vesselRates, setVesselRates] = useState([]);
  
  // Tipos de cálculo visuales
  const [vesselType, setVesselType] = useState('lancha'); // 'barco' o menor

  // Escuchar campos cambiados para recalcular total
  const formValues = Form.useWatch([], form);

  // Manejar cambio de crucero seleccionado (autocompletar según tarifas)
  const handleCruiseChange = useCallback(async (cruiseId) => {
    const cruise = cruises.find(c => c.id === cruiseId);
    if (!cruise) return;

    setSelectedCruise(cruise);
    const vType = cruise.vessel?.vessel_type || 'lancha';
    setVesselType(vType);

    // Calcular días navegados por defecto
    let daysNav = 0;
    if (cruise.departure_date && cruise.return_date) {
      daysNav = dayjs(cruise.return_date).diff(dayjs(cruise.departure_date), 'day') || 1;
    }

    form.setFieldsValue({
      billing_entity: cruise.project_name || '',
      billing_contact: cruise.scientific_leader || '',
      days_navigated: daysNav,
      fuel_liters: cruise.fuel_consumed || 0,
    });

    // Obtener tarifas de la embarcación
    try {
      const res = await apiClient.get(`/vessel-rates?vessel_id=${cruise.vessel_id}`);
      const rates = res.data.items || [];
      setVesselRates(rates);

      // Limpiar selección de tarifas anterior
      form.setFieldsValue({
        client_type: null,
        rate_per_day: 0,
        rate_mobilization: 0,
        vessel_rent_cost: 0,
        currency: vType === 'barco' ? 'USD' : 'MXN',
      });
    } catch {
      message.error('Error al obtener tarifas de la embarcación');
    }
  }, [cruises, form]);

  // Cargar datos al editar o autoseleccionar si hay un solo crucero
  useEffect(() => {
    if (open) {
      form.resetFields();
      setReceiptFileList([]);
      setVesselOrderFileList([]);
      setSignedOrderFileList([]);
      setSelectedCruise(null);
      setVesselRates([]);
      
      if (billing) {
        // Modo Edición
        setVesselType(billing.cruise?.vessel?.vessel_type || 'lancha');
        setSelectedCruise(billing.cruise);
        
        // Cargar tarifas de la embarcación del cobro
        if (billing.cruise?.vessel_id) {
          apiClient.get(`/vessel-rates?vessel_id=${billing.cruise.vessel_id}`).then(r => {
            setVesselRates(r.data.items || []);
          }).catch(() => {});
        }

        form.setFieldsValue({
          ...billing,
          payment_date: billing.payment_date ? dayjs(billing.payment_date) : null,
          transfer_date: billing.transfer_date ? dayjs(billing.transfer_date) : null,
        });
      } else {
        // Modo Creación: valores iniciales
        form.setFieldsValue({
          currency: 'MXN',
          exchange_rate: 1.0,
          status: 'por_cobrar',
          tax_pct: 0.0, // 0% IVA por defecto (institución sin fines de lucro)
          days_navigated: 0,
          rate_per_day: 0,
          days_mobilization: 0,
          rate_mobilization: 0,
          vessel_rent_cost: 0,
          vehicle_rent_cost: 0,
          fuel_liters: 0,
          fuel_price_per_liter: 0,
          vehicle_fuel_liters: 0,
          vehicle_fuel_price_per_liter: 0,
          other_costs: 0,
          discount: 0,
        });

        // Autoseleccionar si hay un solo crucero (como al abrir desde detalle de crucero)
        if (cruises && cruises.length === 1) {
          const defaultCruise = cruises[0];
          form.setFieldsValue({ cruise_id: defaultCruise.id });
          handleCruiseChange(defaultCruise.id);
        }
      }
    }
  }, [open, billing, form, cruises, handleCruiseChange]);

  // Manejar cambio de tipo de cliente (aplicar tarifa correspondiente)
  const handleClientTypeChange = (clientType) => {
    if (!selectedCruise) return;
    
    if (vesselType === 'barco') {
      // Buscar tarifa correspondiente para barco
      const matchingRate = vesselRates.find(r => r.client_type === clientType && (r.concept.toLowerCase().includes('campo') || r.concept.toLowerCase().includes('buque') || r.concept.toLowerCase().includes('renta')));
      const mobRate = vesselRates.find(r => r.concept.toLowerCase().includes('movil') || r.concept.toLowerCase().includes('desmovil'));

      form.setFieldsValue({
        rate_per_day: matchingRate ? matchingRate.rate_amount : 0,
        rate_mobilization: mobRate ? mobRate.rate_amount : 9500, // Defecto de movilización
        currency: matchingRate ? matchingRate.currency : 'USD',
      });
    } else {
      // Buscar tarifas para embarcación menor
      // vessel_rent: concept matching client_type, containing "embarcación" or "lancha" or "campo" or "renta", but NOT "vehículo", "unidad", "remolque", "pickup"
      const matchingVesselRate = vesselRates.find(r => 
        r.client_type === clientType && 
        (r.concept.toLowerCase().includes('embarcación') || r.concept.toLowerCase().includes('lancha') || r.concept.toLowerCase().includes('campo') || r.concept.toLowerCase().includes('renta')) &&
        !r.concept.toLowerCase().includes('vehículo') && 
        !r.concept.toLowerCase().includes('unidad') && 
        !r.concept.toLowerCase().includes('remolque') && 
        !r.concept.toLowerCase().includes('pickup')
      );
      
      // vehicle_rent: concept matching client_type, containing "vehículo", "unidad", "remolque", "pickup"
      const matchingVehicleRate = vesselRates.find(r => 
        r.client_type === clientType && 
        (r.concept.toLowerCase().includes('vehículo') || r.concept.toLowerCase().includes('unidad') || r.concept.toLowerCase().includes('remolque') || r.concept.toLowerCase().includes('pickup'))
      );

      form.setFieldsValue({
        vessel_rent_cost: matchingVesselRate ? matchingVesselRate.rate_amount : 0,
        vehicle_rent_cost: matchingVehicleRate ? matchingVehicleRate.rate_amount : 0,
        currency: matchingVesselRate ? matchingVesselRate.currency : 'MXN',
      });
    }
  };

  // Cálculo matemático en caliente
  const calculations = useMemo(() => {
    if (!formValues) return { subtotal: 0, tax: 0, total: 0, fuelCost: 0, vehicleFuelCost: 0 };

    const daysNav = formValues.days_navigated || 0;
    const rateDay = formValues.rate_per_day || 0;
    const daysMob = formValues.days_mobilization || 0;
    const rateMob = formValues.rate_mobilization || 0;

    const vesselRent = formValues.vessel_rent_cost || 0;
    const vehicleRent = formValues.vehicle_rent_cost || 0;
    
    const liters = formValues.fuel_liters || 0;
    const priceL = formValues.fuel_price_per_liter || 0;
    const fuelCost = liters * priceL;

    const vehicleLiters = formValues.vehicle_fuel_liters || 0;
    const vehiclePriceL = formValues.vehicle_fuel_price_per_liter || 0;
    const vehicleFuelCost = vehicleLiters * vehiclePriceL;

    const otherCosts = formValues.other_costs || 0;
    const discount = formValues.discount || 0;
    const taxPct = formValues.tax_pct || 0;

    let subtotal = 0;
    if (vesselType === 'barco') {
      subtotal = (daysNav * rateDay) + (daysMob * rateMob);
    } else {
      subtotal = vesselRent + vehicleRent + fuelCost + vehicleFuelCost;
    }

    subtotal = subtotal + otherCosts;
    const tax = subtotal * (taxPct / 100);
    const total = subtotal - discount + tax;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round(total * 100) / 100,
      fuelCost: Math.round(fuelCost * 100) / 100,
      vehicleFuelCost: Math.round(vehicleFuelCost * 100) / 100
    };
  }, [formValues, vesselType]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      const payload = {
        ...values,
        payment_date: values.payment_date ? values.payment_date.format('YYYY-MM-DD') : null,
        transfer_date: values.transfer_date ? values.transfer_date.format('YYYY-MM-DD') : null,
      };

      const isStatusChangingToTransfer = 
        values.status === 'transferido' && (!billing || billing.status !== 'transferido');

      const executeSave = async () => {
        setSaving(true);
        try {
          let billingId = null;

          if (billing) {
            // Editar
            await apiClient.put(`/cruise-billings/${billing.id}`, payload);
            billingId = billing.id;
            message.success('Información financiera actualizada');
          } else {
            // Crear
            const res = await apiClient.post('/cruise-billings', payload);
            billingId = res.data.id;
            message.success('Cobro registrado exitosamente');
          }

          // Subir recibo si hay
          if (receiptFileList.length > 0 && billingId) {
            const formData = new FormData();
            const fileObj = receiptFileList[0].originFileObj || receiptFileList[0];
            formData.append('file', fileObj);
            await apiClient.post(`/cruise-billings/${billingId}/upload-receipt`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
            message.success('Recibo subido correctamente');
          }

          // Subir orden de embarcación si hay
          if (vesselOrderFileList.length > 0 && billingId) {
            const formData = new FormData();
            const fileObj = vesselOrderFileList[0].originFileObj || vesselOrderFileList[0];
            formData.append('file', fileObj);
            await apiClient.post(`/cruise-billings/${billingId}/upload-vessel-order`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
            message.success('Orden de Embarcación subida correctamente');
          }

          // Subir orden de embarcación firmada si hay
          if (signedOrderFileList.length > 0 && billingId) {
            const formData = new FormData();
            const fileObj = signedOrderFileList[0].originFileObj || signedOrderFileList[0];
            formData.append('file', fileObj);
            await apiClient.post(`/cruise-billings/${billingId}/upload-signed-vessel-order`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
            message.success('Orden de Embarcación Firmada subida correctamente');
          }

          onClose();
          onSaved();
        } catch (error) {
          let errorMsg = 'Error al guardar la información financiera';
          if (error.response?.data?.detail) {
            if (typeof error.response.data.detail === 'string') {
              errorMsg = error.response.data.detail;
            } else if (Array.isArray(error.response.data.detail)) {
              errorMsg = error.response.data.detail.map(d => `${d.loc.join('.')}: ${d.msg}`).join(', ');
            } else {
              errorMsg = JSON.stringify(error.response.data.detail);
            }
          }
          message.error(errorMsg);
        } finally {
          setSaving(false);
        }
      };

      if (isStatusChangingToTransfer) {
        Modal.confirm({
          title: 'Confirmar Transferencia Bancaria',
          content: 'Al cambiar el estado a "Transferido (Cuenta DEO)", se registrará automáticamente el abono correspondiente en la cuenta de Recursos Autogenerados (624602). ¿Desea proceder con este cambio?',
          okText: 'Confirmar y registrar',
          cancelText: 'Cancelar',
          okButtonProps: { style: { backgroundColor: '#0A2647' } },
          onOk: () => {
            executeSave();
          }
        });
      } else {
        executeSave();
      }

    } catch (error) {
      // Form validation error, handled by Ant Design
    }
  };

  const receiptUploadProps = {
    beforeUpload: (file) => {
      setReceiptFileList([file]);
      return false; // Evitar subida automática
    },
    fileList: receiptFileList,
    onRemove: () => setReceiptFileList([]),
    maxCount: 1,
    accept: '.pdf,image/*'
  };

  const vesselOrderUploadProps = {
    beforeUpload: (file) => {
      setVesselOrderFileList([file]);
      return false; // Evitar subida automática
    },
    fileList: vesselOrderFileList,
    onRemove: () => setVesselOrderFileList([]),
    maxCount: 1,
    accept: '.pdf'
  };

  const signedOrderUploadProps = {
    beforeUpload: (file) => {
      setSignedOrderFileList([file]);
      return false; // Evitar subida automática
    },
    fileList: signedOrderFileList,
    onRemove: () => setSignedOrderFileList([]),
    maxCount: 1,
    accept: '.pdf'
  };

  return (
    <Modal
      open={open}
      title={billing ? '✏️ Editar Registro de Cobro' : '💰 Registrar Cobro de Crucero'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Guardar"
      cancelText="Cancelar"
      width={720}
      confirmLoading={saving}
      bodyStyle={{ padding: '12px 24px' }}
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="cruise_id"
              label="Crucero"
              rules={[{ required: true, message: 'Seleccione el crucero' }]}
            >
              <Select
                disabled={!!billing}
                placeholder="Seleccione un crucero completado"
                onChange={handleCruiseChange}
              >
                {billing ? (
                  <Option value={billing.cruise_id}>{billing.cruise?.name}</Option>
                ) : (
                  cruises.map(c => (
                    <Option key={c.id} value={c.id}>
                      {c.name} ({c.cruise_number || `ID: ${c.id}`}) — {c.vessel?.name}
                    </Option>
                  ))
                )}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="client_type"
              label="Tipo de Cliente"
              rules={[{ required: true, message: 'Seleccione el tipo de cliente' }]}
            >
              <Select
                placeholder="Seleccione tipo"
                onChange={handleClientTypeChange}
              >
                {Object.entries(CLIENT_TYPE_LABELS).map(([k, v]) => (
                  <Option key={k} value={k}>{v}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="currency" label="Moneda" rules={[{ required: true }]}>
              <Select placeholder="Seleccione moneda">
                <Option value="MXN">MXN (Pesos)</Option>
                <Option value="USD">USD (Dólares)</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="billing_entity" label="Proyecto / Entidad a Facturar">
              <Input placeholder="Proyecto 10234, Empresa S.A., etc." />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="billing_contact" label="Contacto / Responsable">
              <Input placeholder="Dr. Juan Pérez, Ing. María López" />
            </Form.Item>
          </Col>
        </Row>

        <Divider style={{ margin: '12px 0' }} />

        {/* CÁLCULO ESPECÍFICO DEPENDIENDO DE LA EMBARCACIÓN */}
        {vesselType === 'barco' ? (
          <div>
            <Title level={5} style={{ color: '#0A2647', marginBottom: 16 }}>🚢 Cálculo para Embarcación Mayor (BOAH)</Title>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="days_navigated" label="Días Navegados">
                  <InputNumber style={{ width: '100%' }} min={0} precision={1} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="rate_per_day" label="Tarifa por Día">
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="days_mobilization" label="Días Movilización">
                  <InputNumber style={{ width: '100%' }} min={0} precision={1} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="rate_mobilization" label="Tarifa Movilización">
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} />
                </Form.Item>
              </Col>
            </Row>
          </div>
        ) : (
          <div>
            <Title level={5} style={{ color: '#17A589', marginBottom: 16 }}>⛵ Cálculo para Embarcación Menor ({selectedCruise?.vessel?.name || 'Lancha'})</Title>
            
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <Card 
                  size="small" 
                  title={<span style={{ color: '#17A589', fontWeight: 600 }}>⛵ Embarcación (Lancha)</span>} 
                  bodyStyle={{ padding: '12px 16px' }}
                  style={{ border: '1px solid #D1F2EB', height: '100%' }}
                >
                  <Form.Item name="vessel_rent_cost" label="Renta de Embarcación">
                    <InputNumber style={{ width: '100%' }} min={0} precision={2} />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="fuel_liters" label="Litros Gasolina">
                        <InputNumber style={{ width: '100%' }} min={0} precision={1} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="fuel_price_per_liter" label="Precio Litro">
                        <InputNumber style={{ width: '100%' }} min={0} precision={2} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <div style={{ textAlign: 'right', fontWeight: 600, color: '#666', marginTop: 4 }}>
                    Combustible: <span style={{ color: '#17A589', fontSize: 15 }}>${(calculations.fuelCost || 0).toLocaleString()} MXN</span>
                  </div>
                </Card>
              </Col>
              
              <Col span={12}>
                <Card 
                  size="small" 
                  title={<span style={{ color: '#2980B9', fontWeight: 600 }}>🚗 Vehículo de Remolque</span>} 
                  bodyStyle={{ padding: '12px 16px' }}
                  style={{ border: '1px solid #D6EAF8', height: '100%' }}
                >
                  <Form.Item name="vehicle_rent_cost" label="Renta Vehículo / Remolque">
                    <InputNumber style={{ width: '100%' }} min={0} precision={2} />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="vehicle_fuel_liters" label="Litros Gasolina">
                        <InputNumber style={{ width: '100%' }} min={0} precision={1} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="vehicle_fuel_price_per_liter" label="Precio Litro">
                        <InputNumber style={{ width: '100%' }} min={0} precision={2} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <div style={{ textAlign: 'right', fontWeight: 600, color: '#666', marginTop: 4 }}>
                    Combustible: <span style={{ color: '#2980B9', fontSize: 15 }}>${(calculations.vehicleFuelCost || 0).toLocaleString()} MXN</span>
                  </div>
                </Card>
              </Col>
            </Row>
          </div>
        )}

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="other_costs" label="Otros Costos Extraordinarios">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="other_costs_description" label="Descripción de Costos Extraordinarios">
              <Input placeholder="Viáticos extras, maniobra especial..." />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="discount" label="Descuento Directo">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="tax_pct" label="IVA / Impuesto (%)">
              <InputNumber style={{ width: '100%' }} min={0} max={100} precision={1} />
            </Form.Item>
          </Col>
          {formValues?.currency === 'USD' && (
            <Col span={8}>
              <Form.Item name="exchange_rate" label="Tipo de Cambio (MXN)">
                <InputNumber style={{ width: '100%' }} min={0.1} precision={4} />
              </Form.Item>
            </Col>
          )}
        </Row>

        <Divider style={{ margin: '12px 0' }} />

        {/* Resumen Financiero en Caliente */}
        <Card bodyStyle={{ padding: 16 }} style={{ backgroundColor: '#F8F9FA', border: '1px solid #E9ECEF', marginBottom: 16 }}>
          <Row gutter={16} align="middle">
            <Col span={6}>
              <Statistic title="Subtotal" value={calculations.subtotal} precision={2} suffix={formValues?.currency} />
            </Col>
            <Col span={6}>
              <Statistic title="IVA" value={calculations.tax} precision={2} suffix={formValues?.currency} />
            </Col>
            <Col span={12} style={{ textAlign: 'right' }}>
              <Statistic
                title={<span style={{ fontSize: 13, fontWeight: 600 }}>Total Estimado</span>}
                value={calculations.total}
                precision={2}
                suffix={formValues?.currency}
                valueStyle={{ color: '#27AE60', fontSize: 24, fontWeight: 800 }}
              />
            </Col>
          </Row>
        </Card>

        {/* CONTROL DE PAGO */}
        <Title level={5} style={{ color: '#0A2647', marginBottom: 12 }}>💳 Control y Estado del Pago</Title>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="status" label="Estado del Cobro">
              <Select placeholder="Seleccione estado">
                <Option value="por_cobrar">Por Cobrar</Option>
                <Option value="cobrado">Cobrado (Administración)</Option>
                <Option value="transferido">Transferido (Cuenta DEO)</Option>
              </Select>
            </Form.Item>
          </Col>
          {formValues?.status !== 'por_cobrar' && (
            <>
              <Col span={8}>
                <Form.Item name="payment_reference" label="Referencia de Pago">
                  <Input placeholder="Folio / Tje Bancaria" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="payment_date" label="Fecha de Pago">
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
            </>
          )}
        </Row>

        {formValues?.status === 'transferido' && (
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="transfer_date" label="Fecha de Transferencia al DEO">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
        )}

        <Title level={5} style={{ color: '#0A2647', marginTop: 16, marginBottom: 12 }}>📁 Documentación Digital</Title>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="Recibo">
              <Upload {...receiptUploadProps}>
                <Button icon={<UploadOutlined />} style={{ width: '100%' }}>Seleccionar</Button>
              </Upload>
              {billing?.receipt_filename && (
                <div style={{ marginTop: 8 }}>
                  <Tag color="success" style={{ marginBottom: 4, display: 'inline-block' }}>Cargado</Tag>
                  <div>
                    <Button type="link" size="small" style={{ padding: 0 }} href={`${apiClient.defaults.baseURL.replace('/api/v1', '')}${billing.receipt_filename}`} target="_blank">
                      Ver actual
                    </Button>
                  </div>
                </div>
              )}
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Orden Embarcación">
              <Upload {...vesselOrderUploadProps}>
                <Button icon={<UploadOutlined />} style={{ width: '100%' }}>Seleccionar</Button>
              </Upload>
              {billing?.vessel_order_filename && (
                <div style={{ marginTop: 8 }}>
                  <Tag color="success" style={{ marginBottom: 4, display: 'inline-block' }}>Cargado</Tag>
                  <div>
                    <Button type="link" size="small" style={{ padding: 0 }} href={`${apiClient.defaults.baseURL.replace('/api/v1', '')}${billing.vessel_order_filename}`} target="_blank">
                      Ver actual
                    </Button>
                  </div>
                </div>
              )}
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Orden Firmada">
              <Upload {...signedOrderUploadProps}>
                <Button icon={<UploadOutlined />} style={{ width: '100%' }}>Seleccionar</Button>
              </Upload>
              {billing?.signed_vessel_order_filename && (
                <div style={{ marginTop: 8 }}>
                  <Tag color="success" style={{ marginBottom: 4, display: 'inline-block' }}>Cargado</Tag>
                  <div>
                    <Button type="link" size="small" style={{ padding: 0 }} href={`${apiClient.defaults.baseURL.replace('/api/v1', '')}${billing.signed_vessel_order_filename}`} target="_blank">
                      Ver actual
                    </Button>
                  </div>
                </div>
              )}
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={24}>
            <Form.Item name="notes" label="Notas / Observaciones">
              <TextArea rows={2} placeholder="Observaciones sobre la facturación..." />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}


// ── SUB-COMPONENTE: BillingViewModal ──────────────────────────

function BillingViewModal({ open, billing, onClose }) {
  if (!billing) return null;

  const cruise = billing.cruise;
  const vesselType = cruise?.vessel?.vessel_type || 'lancha';

  return (
    <Modal
      open={open}
      title={<span style={{ color: '#0A2647', fontSize: 18, fontWeight: 700 }}>🧾 Detalle Financiero del Crucero</span>}
      onCancel={onClose}
      footer={[
        <Button key="close" type="primary" onClick={onClose}>
          Cerrar
        </Button>
      ]}
      width={640}
    >
      <div style={{ padding: '10px 0' }}>
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Text type="secondary">Crucero:</Text>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{cruise?.name}</div>
          </Col>
          <Col span={12}>
            <Text type="secondary">Embarcación:</Text>
            <div>
              <Tag color="blue" style={{ fontSize: 13 }}>{cruise?.vessel?.name}</Tag>
            </div>
          </Col>
        </Row>

        <Divider style={{ margin: '12px 0' }} />

        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Text type="secondary">Tipo de Cliente:</Text>
            <div style={{ fontWeight: 500 }}>{CLIENT_TYPE_LABELS[billing.client_type] || billing.client_type}</div>
          </Col>
          <Col span={12}>
            <Text type="secondary">Proyecto / Razón Social:</Text>
            <div style={{ fontWeight: 500 }}>{billing.billing_entity || '—'}</div>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 10 }}>
          <Col span={12}>
            <Text type="secondary">Contacto:</Text>
            <div>{billing.billing_contact || '—'}</div>
          </Col>
          <Col span={12}>
            <Text type="secondary">Estado del Pago:</Text>
            <div>
              <Tag color={STATUS_CONFIG[billing.status]?.color} icon={STATUS_CONFIG[billing.status]?.icon} style={{ fontWeight: 600 }}>
                {STATUS_CONFIG[billing.status]?.text}
              </Tag>
            </div>
          </Col>
        </Row>

        <Divider style={{ margin: '16px 0' }} />

        <Title level={5} style={{ color: '#0A2647', marginBottom: 12 }}>💸 Conceptos y Cálculos</Title>

        {vesselType === 'barco' ? (
          <div style={{ padding: 12, backgroundColor: '#F8F9FA', borderRadius: 6, border: '1px solid #E9ECEF', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text>Días Navegados ({billing.days_navigated} días × ${billing.rate_per_day?.toLocaleString()} {billing.currency}):</Text>
              <Text strong>${(billing.days_navigated * billing.rate_per_day)?.toLocaleString()} {billing.currency}</Text>
            </div>
            {billing.days_mobilization > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>Días Movilización ({billing.days_mobilization} días × ${billing.rate_mobilization?.toLocaleString()} {billing.currency}):</Text>
                <Text strong>${(billing.days_mobilization * billing.rate_mobilization)?.toLocaleString()} {billing.currency}</Text>
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: 12, backgroundColor: '#F8F9FA', borderRadius: 6, border: '1px solid #E9ECEF', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text>Renta Fija de la Embarcación:</Text>
              <Text strong>${billing.vessel_rent_cost?.toLocaleString()} {billing.currency}</Text>
            </div>
            {billing.vehicle_rent_cost > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text>Renta de Vehículo / Remolque:</Text>
                <Text strong>${billing.vehicle_rent_cost?.toLocaleString()} {billing.currency}</Text>
              </div>
            )}
            {billing.fuel_cost > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text>Combustible Embarcación ({billing.fuel_liters} L × ${billing.fuel_price_per_liter} / L):</Text>
                <Text strong>${billing.fuel_cost?.toLocaleString()} {billing.currency}</Text>
              </div>
            )}
            {billing.vehicle_fuel_cost > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>Combustible Vehículo ({billing.vehicle_fuel_liters} L × ${billing.vehicle_fuel_price_per_liter} / L):</Text>
                <Text strong>${billing.vehicle_fuel_cost?.toLocaleString()} {billing.currency}</Text>
              </div>
            )}
          </div>
        )}

        {billing.other_costs > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 12px', marginBottom: 6 }}>
            <Text>Otros Costos ({billing.other_costs_description || 'Extra ordinarios'}):</Text>
            <Text strong>${billing.other_costs?.toLocaleString()} {billing.currency}</Text>
          </div>
        )}

        {billing.discount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 12px', marginBottom: 6, color: '#C0392B' }}>
            <Text style={{ color: '#C0392B' }}>Descuento Directo:</Text>
            <Text strong>-${billing.discount?.toLocaleString()} {billing.currency}</Text>
          </div>
        )}

        {billing.tax_amount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 12px', marginBottom: 12 }}>
            <Text>Impuestos ({billing.tax_pct}%):</Text>
            <Text strong>${billing.tax_amount?.toLocaleString()} {billing.currency}</Text>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#E8F8F5', borderRadius: 6 }}>
          <Text strong style={{ fontSize: 16, color: '#117A65' }}>Total Final:</Text>
          <Text strong style={{ fontSize: 18, color: '#117A65' }}>
            ${billing.total?.toLocaleString()} {billing.currency}
          </Text>
        </div>

        {billing.currency === 'USD' && billing.exchange_rate && (
          <div style={{ textAlign: 'right', marginTop: 6, fontSize: 11, color: '#888' }}>
            Equivalente en Pesos: ${(billing.total * billing.exchange_rate)?.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN (T.C: ${billing.exchange_rate} MXN)
          </div>
        )}

        <Divider style={{ margin: '16px 0' }} />

        <Title level={5} style={{ color: '#0A2647', marginBottom: 12 }}>💳 Registro de Operaciones de Pago</Title>
        <Row gutter={[16, 8]}>
          <Col span={12}>
            <Text type="secondary">Referencia de Pago:</Text>
            <div style={{ fontWeight: 500 }}>{billing.payment_reference || '—'}</div>
          </Col>
          <Col span={12}>
            <Text type="secondary">Fecha de Pago:</Text>
            <div>{billing.payment_date ? dayjs(billing.payment_date).format('DD/MM/YYYY') : '—'}</div>
          </Col>
        </Row>
        {billing.status === 'transferido' && (
          <Row gutter={[16, 8]} style={{ marginTop: 8 }}>
            <Col span={12}>
              <Text type="secondary">Fecha de Transferencia al DEO:</Text>
              <div style={{ fontWeight: 500 }}>
                {billing.transfer_date ? dayjs(billing.transfer_date).format('DD/MM/YYYY') : '—'}
              </div>
            </Col>
          </Row>
        )}

        <Divider style={{ margin: '16px 0' }} />

        <Title level={5} style={{ color: '#0A2647', marginBottom: 12 }}>📁 Documentos Adjuntos</Title>
        <Row gutter={16}>
          <Col span={8}>
            <div style={{ 
              backgroundColor: '#FBFCFC', 
              border: '1px solid #E5E7E9', 
              padding: '12px 8px', 
              borderRadius: 8, 
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <FilePdfOutlined style={{ fontSize: 28, color: '#C0392B', marginBottom: 6 }} />
                <div style={{ fontSize: 13, fontWeight: 600 }}>Recibo</div>
              </div>
              <div style={{ marginTop: 8 }}>
                {billing.receipt_filename ? (
                  <Button
                    type="primary"
                    ghost
                    size="small"
                    icon={<EyeOutlined />}
                    href={`${apiClient.defaults.baseURL.replace('/api/v1', '')}${billing.receipt_filename}`}
                    target="_blank"
                    style={{ width: '100%', fontSize: 12 }}
                  >
                    Abrir
                  </Button>
                ) : (
                  <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>Sin subir</Text>
                )}
              </div>
            </div>
          </Col>

          <Col span={8}>
            <div style={{ 
              backgroundColor: '#FBFCFC', 
              border: '1px solid #E5E7E9', 
              padding: '12px 8px', 
              borderRadius: 8, 
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <FilePdfOutlined style={{ fontSize: 28, color: '#2980B9', marginBottom: 6 }} />
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: '1.2' }}>Orden de Embarcación</div>
              </div>
              <div style={{ marginTop: 8 }}>
                {billing.vessel_order_filename ? (
                  <Button
                    type="primary"
                    ghost
                    size="small"
                    icon={<EyeOutlined />}
                    href={`${apiClient.defaults.baseURL.replace('/api/v1', '')}${billing.vessel_order_filename}`}
                    target="_blank"
                    style={{ width: '100%', fontSize: 12 }}
                  >
                    Abrir
                  </Button>
                ) : (
                  <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>Sin subir</Text>
                )}
              </div>
            </div>
          </Col>

          <Col span={8}>
            <div style={{ 
              backgroundColor: '#FBFCFC', 
              border: '1px solid #E5E7E9', 
              padding: '12px 8px', 
              borderRadius: 8, 
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <FilePdfOutlined style={{ fontSize: 28, color: '#27AE60', marginBottom: 6 }} />
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: '1.2' }}>Orden Firmada</div>
              </div>
              <div style={{ marginTop: 8 }}>
                {billing.signed_vessel_order_filename ? (
                  <Button
                    type="primary"
                    ghost
                    size="small"
                    icon={<EyeOutlined />}
                    href={`${apiClient.defaults.baseURL.replace('/api/v1', '')}${billing.signed_vessel_order_filename}`}
                    target="_blank"
                    style={{ width: '100%', fontSize: 12 }}
                  >
                    Abrir
                  </Button>
                ) : (
                  <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>Sin subir</Text>
                )}
              </div>
            </div>
          </Col>
        </Row>

        {billing.notes && (
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">Notas adicionales:</Text>
            <p style={{ margin: 0, padding: 8, backgroundColor: '#FFFEE6', borderRadius: 4, fontStyle: 'italic' }}>
              {billing.notes}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── SUB-COMPONENTE: VesselRateFormModal ─────────────────────────

function VesselRateFormModal({ open, rate, vessels, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (rate) {
        form.setFieldsValue({
          ...rate,
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          year: 2025,
          currency: 'MXN',
          is_active: true,
          client_type: 'general',
        });
      }
    }
  }, [open, rate, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (rate) {
        // Editar
        await apiClient.put(`/vessel-rates/${rate.id}`, values);
        message.success('Tarifa actualizada con éxito');
      } else {
        // Crear
        await apiClient.post('/vessel-rates', values);
        message.success('Tarifa registrada con éxito');
      }
      onSaved();
    } catch (err) {
      if (err.response?.data?.detail) {
        message.error(err.response.data.detail);
      } else {
        message.error('Error al guardar tarifa');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={<span style={{ color: '#0A2647', fontWeight: 700 }}>{rate ? '✏️ Editar Tarifa' : '💰 Registrar Nueva Tarifa'}</span>}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText={rate ? 'Guardar' : 'Crear'}
      cancelText="Cancelar"
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 16 }}
      >
        <Form.Item
          name="vessel_id"
          label="Embarcación"
          rules={[{ required: true, message: 'Selecciona una embarcación' }]}
        >
          <Select placeholder="Seleccionar embarcación" disabled={!!rate}>
            {vessels.map(v => (
              <Option key={v.id} value={v.id}>{v.name}</Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="concept"
          label="Concepto / Servicio"
          rules={[{ required: true, message: 'Ej: Día de buque, Renta de lancha, Combustible...' }]}
        >
          <Input placeholder="Ej: Día de buque, Renta de embarcación..." maxLength={200} />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="client_type"
              label="Tipo de Cliente"
              rules={[{ required: true, message: 'Selecciona el tipo de cliente' }]}
            >
              <Select placeholder="Seleccionar tipo">
                {Object.entries(CLIENT_TYPE_LABELS).map(([k, v]) => (
                  <Option key={k} value={k}>{v}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="year"
              label="Año de Vigencia"
              rules={[{ required: true, message: 'Ingresa el año (ej. 2025)' }]}
            >
              <InputNumber style={{ width: '100%' }} min={2000} max={2100} placeholder="Ej: 2025" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="rate_amount"
              label="Monto de la Tarifa"
              rules={[{ required: true, message: 'Ingresa el monto' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                precision={2}
                placeholder="0.00"
                formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={value => value.replace(/\$\s?|(,*)/g, '')}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="currency"
              label="Moneda"
              rules={[{ required: true, message: 'Selecciona la moneda' }]}
            >
              <Select>
                <Option value="MXN">Pesos Mexicanos (MXN)</Option>
                <Option value="USD">Dólares (USD)</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="is_active"
          label="Tarifa Vigente / Activa"
          valuePropName="checked"
        >
          <Switch checkedChildren="Sí" unCheckedChildren="No" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
