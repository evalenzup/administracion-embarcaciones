/**
 * SIAE — Página de Registro de Carga de Combustible.
 * Tabla filtrable, tarjetas de resumen, gráfica mensual y modal de registro.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker,
  TimePicker, Space, Tag, Card, Row, Col, Statistic, message,
  Tooltip, Popconfirm, Typography, Divider, Empty, Slider,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  FilterOutlined, BarChartOutlined, CalendarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

// ── Paleta de colores por embarcación (para la gráfica) ──────
const VESSEL_COLORS = [
  '#1B4F72', '#2E86C1', '#17A589', '#D35400', '#7D3C98',
  '#CB4335', '#1A5276', '#0B5345',
];

// ── Mini gráfica de barras SVG ────────────────────────────────
function ConsumptionChart({ series, vessels }) {
  if (!series || series.length === 0) {
    return (
      <Empty description="Sin datos de consumo" style={{ padding: '20px 0' }} />
    );
  }

  // Agrupar por mes y generar etiquetas
  const monthKeys = [...new Set(series.map(s => `${s.year}-${String(s.month).padStart(2, '0')}`))]
    .sort().slice(-6);

  const vesselIds = [...new Set(series.map(s => s.vessel_id))];
  const maxVal = Math.max(...series.map(s => s.total_liters), 1);

  const chartHeight = 160;
  const barGroupWidth = 60;
  const barWidth = Math.max(8, Math.floor((barGroupWidth - 4) / Math.max(vesselIds.length, 1)));
  const chartWidth = monthKeys.length * (barGroupWidth + 16) + 60;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={chartWidth} height={chartHeight + 50} style={{ display: 'block' }}>
        {/* Líneas de referencia */}
        {[0, 0.25, 0.5, 0.75, 1].map(p => (
          <g key={p}>
            <line
              x1={40} y1={chartHeight - p * chartHeight}
              x2={chartWidth - 10} y2={chartHeight - p * chartHeight}
              stroke="#e8e8e8" strokeWidth={1}
            />
            <text x={2} y={chartHeight - p * chartHeight + 4} fontSize={9} fill="#999">
              {Math.round(maxVal * p)}
            </text>
          </g>
        ))}

        {/* Barras */}
        {monthKeys.map((mk, mi) => {
          const [year, month] = mk.split('-').map(Number);
          const x0 = 40 + mi * (barGroupWidth + 16);
          return (
            <g key={mk}>
              {vesselIds.map((vid, vi) => {
                const row = series.find(s => s.year === year && s.month === month && s.vessel_id === vid);
                const val = row ? row.total_liters : 0;
                const barH = Math.max(0, (val / maxVal) * chartHeight);
                const color = VESSEL_COLORS[vi % VESSEL_COLORS.length];
                return (
                  <g key={vid}>
                    <rect
                      x={x0 + vi * (barWidth + 2)}
                      y={chartHeight - barH}
                      width={barWidth}
                      height={barH}
                      fill={color}
                      rx={2}
                      opacity={0.85}
                    >
                      <title>{`${row?.vessel_name || vid}: ${val.toFixed(0)} L`}</title>
                    </rect>
                  </g>
                );
              })}
              {/* Etiqueta mes */}
              <text
                x={x0 + (vesselIds.length * (barWidth + 2)) / 2}
                y={chartHeight + 18}
                textAnchor="middle"
                fontSize={10}
                fill="#555"
              >
                {dayjs(`${year}-${month}-01`).format('MMM')}
              </text>
              <text
                x={x0 + (vesselIds.length * (barWidth + 2)) / 2}
                y={chartHeight + 30}
                textAnchor="middle"
                fontSize={9}
                fill="#aaa"
              >
                {year}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Leyenda */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
        {vesselIds.map((vid, vi) => {
          const name = series.find(s => s.vessel_id === vid)?.vessel_name || `Emb. ${vid}`;
          return (
            <div key={vid} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 12, height: 12, borderRadius: 2,
                backgroundColor: VESSEL_COLORS[vi % VESSEL_COLORS.length],
              }} />
              <Text style={{ fontSize: 12 }}>{name}</Text>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Modal de Formulario ───────────────────────────────────────
function FuelLogFormModal({ open, onClose, onSaved, editRecord, preselectedVesselId }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [vessels, setVessels] = useState([]);
  const [cruises, setCruises] = useState([]);
  const [selectedVesselId, setSelectedVesselId] = useState(null);

  // Cargar embarcaciones activas
  useEffect(() => {
    if (open) {
      apiClient.get('/vessels?limit=100').then(r => {
        setVessels(r.data.items || r.data || []);
      }).catch(() => {});
    }
  }, [open]);

  // Cargar cruceros al cambiar embarcación
  useEffect(() => {
    if (selectedVesselId) {
      apiClient.get(`/cruises?vessel_id=${selectedVesselId}&limit=50`).then(r => {
        setCruises(r.data.items || []);
      }).catch(() => setCruises([]));
    } else {
      setCruises([]);
    }
  }, [selectedVesselId]);

  // Prellenar formulario
  useEffect(() => {
    if (open) {
      if (editRecord) {
        form.setFieldsValue({
          vessel_id: editRecord.vessel_id,
          cruise_id: editRecord.cruise_id,
          load_date: dayjs(editRecord.load_date),
          load_time: editRecord.load_time ? dayjs(editRecord.load_time, 'HH:mm') : null,
          fuel_type: editRecord.fuel_type,
          liters: editRecord.liters,
          level_before_pct: editRecord.level_before_pct,
          level_after_pct: editRecord.level_after_pct,
          supplier: editRecord.supplier,
          unit_cost: editRecord.unit_cost,
          total_cost: editRecord.total_cost,
          notes: editRecord.notes,
        });
        setSelectedVesselId(editRecord.vessel_id);
      } else {
        form.resetFields();
        form.setFieldsValue({ load_date: dayjs() });
        if (preselectedVesselId) {
          form.setFieldValue('vessel_id', preselectedVesselId);
          setSelectedVesselId(preselectedVesselId);
          // Pre-llenar tipo de combustible desde la embarcación
          const vessel = vessels.find(v => v.id === preselectedVesselId);
          if (vessel?.fuel_type) form.setFieldValue('fuel_type', vessel.fuel_type);
        }
      }
    }
  }, [open, editRecord, preselectedVesselId]);

  const handleVesselChange = (vid) => {
    setSelectedVesselId(vid);
    form.setFieldValue('cruise_id', null);
    const vessel = vessels.find(v => v.id === vid);
    if (vessel?.fuel_type && !editRecord) {
      form.setFieldValue('fuel_type', vessel.fuel_type);
    }
  };

  const handleUnitCostChange = (val) => {
    const liters = form.getFieldValue('liters');
    if (val && liters) {
      form.setFieldValue('total_cost', parseFloat((val * liters).toFixed(2)));
    }
  };

  const handleLitersChange = (val) => {
    const unitCost = form.getFieldValue('unit_cost');
    if (val && unitCost) {
      form.setFieldValue('total_cost', parseFloat((val * unitCost).toFixed(2)));
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const payload = {
        ...values,
        load_date: values.load_date.format('YYYY-MM-DD'),
        load_time: values.load_time ? values.load_time.format('HH:mm') : null,
      };

      if (editRecord) {
        await apiClient.put(`/fuel-logs/${editRecord.id}`, payload);
        message.success('Registro actualizado correctamente');
      } else {
        await apiClient.post('/fuel-logs', payload);
        message.success('Carga de combustible registrada correctamente');
      }

      onSaved();
      onClose();
    } catch (err) {
      if (err?.response?.data?.detail) {
        message.error(err.response.data.detail);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <span>⛽</span>
          <span style={{ color: '#0A2647', fontWeight: 700 }}>
            {editRecord ? 'Editar Registro de Combustible' : 'Registrar Carga de Combustible'}
          </span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText={editRecord ? 'Guardar Cambios' : 'Registrar Carga'}
      cancelText="Cancelar"
      width={640}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item name="vessel_id" label="Embarcación" rules={[{ required: true, message: 'Selecciona la embarcación' }]}>
              <Select
                placeholder="Seleccionar embarcación"
                onChange={handleVesselChange}
                showSearch
                optionFilterProp="children"
              >
                {vessels.map(v => (
                  <Option key={v.id} value={v.id}>{v.name}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="fuel_type" label="Tipo de Combustible" rules={[{ required: true, message: 'Requerido' }]}>
              <Select placeholder="Tipo">
                <Option value="Diesel">Diesel</Option>
                <Option value="Gasolina">Gasolina</Option>
                <Option value="Diesel marino">Diesel marino</Option>
                <Option value="Gas LP">Gas LP</Option>
                <Option value="Otro">Otro</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="load_date" label="Fecha de Carga" rules={[{ required: true, message: 'Selecciona la fecha' }]}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="load_time" label="Hora (opcional)">
              <TimePicker style={{ width: '100%' }} format="HH:mm" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="liters" label="Litros Cargados" rules={[{ required: true, message: 'Ingresa los litros' }]}>
              <InputNumber
                style={{ width: '100%' }}
                min={0.1} step={10}
                addonAfter="L"
                onChange={handleLitersChange}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="unit_cost" label="Costo por Litro">
              <InputNumber
                style={{ width: '100%' }}
                min={0} step={0.5}
                prefix="$"
                addonAfter="MXN"
                onChange={handleUnitCostChange}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="total_cost" label="Costo Total">
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                prefix="$"
                addonAfter="MXN"
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="level_before_pct" label="Nivel antes de carga (%)">
              <InputNumber style={{ width: '100%' }} min={0} max={100} addonAfter="%" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="level_after_pct" label="Nivel después de carga (%)">
              <InputNumber style={{ width: '100%' }} min={0} max={100} addonAfter="%" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={16}>
            <Form.Item name="supplier" label="Proveedor / Estación">
              <Input placeholder="ej. Pemex Estación 1234, Puerto de Ensenada" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="cruise_id" label="Crucero asociado (opcional)">
              <Select
                placeholder={selectedVesselId ? 'Seleccionar...' : 'Primero selecciona embarcación'}
                allowClear
                disabled={!selectedVesselId}
              >
                {cruises.map(c => (
                  <Option key={c.id} value={c.id}>
                    {c.folio || `#${c.id}`} — {c.title}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="notes" label="Notas">
          <TextArea rows={2} placeholder="Observaciones adicionales..." maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Página principal ──────────────────────────────────────────
export default function FuelLogsPage({ preselectedVesselId = null, inModal = false }) {
  const { hasPermission } = useAuth();

  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [vessels, setVessels] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);

  // Filtros
  const [filterVesselId, setFilterVesselId] = useState(preselectedVesselId || null);
  const [filterDateRange, setFilterDateRange] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  const canCreate = hasPermission('fuel_logs', 'create');
  const canEdit = hasPermission('fuel_logs', 'edit');
  const canDelete = hasPermission('fuel_logs', 'delete');

  // Cargar embarcaciones para filtro
  useEffect(() => {
    apiClient.get('/vessels?limit=100').then(r => {
      setVessels(r.data.items || r.data || []);
    }).catch(() => {});
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        skip: ((page - 1) * pageSize).toString(),
        limit: pageSize.toString(),
      });
      if (filterVesselId) params.append('vessel_id', filterVesselId);
      if (filterDateRange?.[0]) params.append('date_from', filterDateRange[0].format('YYYY-MM-DD'));
      if (filterDateRange?.[1]) params.append('date_to', filterDateRange[1].format('YYYY-MM-DD'));

      const r = await apiClient.get(`/fuel-logs?${params}`);
      setLogs(r.data.items || []);
      setTotal(r.data.total || 0);
    } catch {
      message.error('Error al cargar registros');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterVesselId, filterDateRange]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const params = new URLSearchParams({ months_back: '6' });
      if (filterVesselId) params.append('vessel_id', filterVesselId);
      const r = await apiClient.get(`/fuel-logs/stats?${params}`);
      setStats(r.data);
    } catch {
      // silencioso
    } finally {
      setStatsLoading(false);
    }
  }, [filterVesselId]);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/fuel-logs/${id}`);
      message.success('Registro eliminado');
      fetchLogs();
      fetchStats();
    } catch {
      message.error('Error al eliminar');
    }
  };

  const handleOpenCreate = () => {
    setEditRecord(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (record) => {
    setEditRecord(record);
    setModalOpen(true);
  };

  const handleSaved = () => {
    fetchLogs();
    fetchStats();
  };

  // ── Columnas de la tabla ──────────────────────────────────
  const columns = [
    {
      title: 'Fecha',
      dataIndex: 'load_date',
      width: 110,
      render: (d, r) => (
        <div>
          <div style={{ fontWeight: 600, color: '#1B4F72' }}>{dayjs(d).format('DD/MM/YYYY')}</div>
          {r.load_time && <div style={{ fontSize: 11, color: '#999' }}>{r.load_time}</div>}
        </div>
      ),
    },
    {
      title: 'Embarcación',
      dataIndex: ['vessel', 'name'],
      render: (name) => <Tag color="blue" style={{ fontWeight: 600 }}>{name || '—'}</Tag>,
    },
    {
      title: 'Litros',
      dataIndex: 'liters',
      width: 100,
      align: 'right',
      render: (v) => (
        <Text strong style={{ color: '#0A2647', fontSize: 15 }}>
          {v?.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} L
        </Text>
      ),
    },
    {
      title: 'Combustible',
      dataIndex: 'fuel_type',
      width: 110,
      render: (v) => <Tag>{v}</Tag>,
    },
    {
      title: 'Proveedor',
      dataIndex: 'supplier',
      ellipsis: true,
      render: (v) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Costo Total',
      dataIndex: 'total_cost',
      width: 130,
      align: 'right',
      render: (v) => v != null
        ? <Text style={{ color: '#17A589', fontWeight: 600 }}>
            ${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Crucero',
      dataIndex: 'cruise',
      width: 120,
      render: (c) => c ? (
        <Tag color="purple">{c.folio || `#${c.id}`}</Tag>
      ) : <Text type="secondary">—</Text>,
    },
    {
      title: 'Registró',
      dataIndex: ['registered_by', 'full_name'],
      width: 140,
      ellipsis: true,
      render: (v) => <Text style={{ fontSize: 12, color: '#555' }}>{v || '—'}</Text>,
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 90,
      render: (_, record) => (
        <Space size="small">
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
              title="¿Eliminar este registro?"
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

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ padding: inModal ? 0 : 0 }}>
      {!inModal && (
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Title level={3} style={{ margin: 0, color: '#0A2647' }}>
              ⛽ Registro de Combustible
            </Title>
            <Text type="secondary">Historial de cargas de combustible por embarcación</Text>
          </div>
          {canCreate && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="large"
              onClick={handleOpenCreate}
              style={{ backgroundColor: '#1B4F72', borderColor: '#1B4F72' }}
            >
              Registrar Carga
            </Button>
          )}
        </div>
      )}

      {/* Tarjetas de resumen */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card
            size="small"
            style={{ borderRadius: 12, background: 'linear-gradient(135deg, #1B4F72 0%, #2E86C1 100%)', border: 'none' }}
          >
            <Statistic
              title={<Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Litros cargados este mes</Text>}
              value={stats?.total_liters_month ?? 0}
              suffix="L"
              loading={statsLoading}
              valueStyle={{ color: '#fff', fontWeight: 700, fontSize: 26 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card
            size="small"
            style={{ borderRadius: 12, background: 'linear-gradient(135deg, #0B5345 0%, #17A589 100%)', border: 'none' }}
          >
            <Statistic
              title={<Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Costo total este mes</Text>}
              value={stats?.total_cost_month ?? 0}
              prefix="$"
              suffix="MXN"
              precision={2}
              loading={statsLoading}
              valueStyle={{ color: '#fff', fontWeight: 700, fontSize: 22 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderRadius: 12 }}>
            <Statistic
              title="Cargas este mes"
              value={stats?.loads_count_month ?? 0}
              loading={statsLoading}
              valueStyle={{ color: '#1B4F72', fontWeight: 700 }}
            />
            {stats?.last_load_date && (
              <Text style={{ fontSize: 11, color: '#999' }}>
                Última: {dayjs(stats.last_load_date).format('DD/MM/YYYY')}
              </Text>
            )}
          </Card>
        </Col>
      </Row>

      {/* Gráfica de consumo */}
      <Card
        title={
          <Space>
            <BarChartOutlined style={{ color: '#1B4F72' }} />
            <span style={{ fontWeight: 600, color: '#0A2647' }}>Consumo Mensual (últimos 6 meses)</span>
          </Space>
        }
        style={{ marginBottom: 20, borderRadius: 12 }}
        size="small"
        loading={statsLoading}
      >
        <ConsumptionChart series={stats?.monthly_series || []} vessels={vessels} />
      </Card>

      {/* Filtros */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={8}>
            <Select
              placeholder="Filtrar por embarcación"
              allowClear
              style={{ width: '100%' }}
              value={filterVesselId}
              onChange={v => { setFilterVesselId(v); setPage(1); }}
            >
              {vessels.map(v => <Option key={v.id} value={v.id}>{v.name}</Option>)}
            </Select>
          </Col>
          <Col xs={24} sm={12}>
            <RangePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              value={filterDateRange}
              onChange={v => { setFilterDateRange(v); setPage(1); }}
              placeholder={['Fecha inicio', 'Fecha fin']}
            />
          </Col>
          <Col xs={24} sm={4}>
            <Button icon={<ReloadOutlined />} onClick={() => { fetchLogs(); fetchStats(); }} style={{ width: '100%' }}>
              Actualizar
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Tabla */}
      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 0 }}>
        {inModal && canCreate && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate} style={{ backgroundColor: '#1B4F72' }}>
              Registrar Carga
            </Button>
          </div>
        )}
        <Table
          rowKey="id"
          columns={columns}
          dataSource={logs}
          loading={loading}
          size="small"
          scroll={{ x: 900 }}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: setPage,
            showTotal: (t) => `${t} registros en total`,
            showSizeChanger: false,
          }}
        />
      </Card>

      {/* Modal de formulario */}
      <FuelLogFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditRecord(null); }}
        onSaved={handleSaved}
        editRecord={editRecord}
        preselectedVesselId={!editRecord ? (filterVesselId || preselectedVesselId) : null}
      />
    </div>
  );
}

// Exportar el modal por separado para VesselsPage
export { FuelLogFormModal };

