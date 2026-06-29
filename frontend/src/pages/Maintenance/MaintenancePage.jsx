/**
 * SIAE — Página de Mantenimiento.
 * Vista con dos tabs: Registros de mantenimiento y Categorías configurables.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker,
  Typography, Card, message, Popconfirm, Tooltip, Row, Col, Badge,
  Tabs, InputNumber, Statistic, Alert,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  ToolOutlined, SettingOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { CanAccess } from '../../components/common/CanAccess';

const { Title, Text } = Typography;
const { Search } = Input;
const { TextArea } = Input;

const PRIORITY_MAP = {
  baja:    { label: 'Baja',     color: '#52C41A' },
  media:   { label: 'Media',    color: '#FAAD14' },
  alta:    { label: 'Alta',     color: '#FA8C16' },
  critica: { label: 'Crítica',  color: '#F5222D' },
};

const STATUS_MAP = {
  pendiente:    { label: 'Pendiente',    badge: 'default'    },
  en_progreso:  { label: 'En Progreso',  badge: 'processing' },
  completado:   { label: 'Completado',   badge: 'success'    },
  cancelado:    { label: 'Cancelado',    badge: 'error'      },
};

const TYPE_MAP = {
  preventivo: { label: 'Preventivo', color: '#2980B9' },
  correctivo: { label: 'Correctivo', color: '#E74C3C' },
  predictivo: { label: 'Predictivo', color: '#8E44AD' },
};

// ── Sub-página: Registros ──────────────────────────────────────────
function RecordsTab({ vessels, categories, equipments }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });
  const [search, setSearch] = useState('');
  const [filterVessel, setFilterVessel] = useState(null);
  const [filterStatus, setFilterStatus] = useState(null);
  const [filterPriority, setFilterPriority] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState({ pendiente: 0, en_progreso: 0, completado: 0, cancelado: 0, criticos: 0, total: 0 });
  const [routines, setRoutines] = useState([]);
  
  const selectedEquipmentId = Form.useWatch('equipment_id', form);
  const selectedRoutineId = Form.useWatch('routine_id', form);
  const selectedType = Form.useWatch('maintenance_type', form);
  const selectedStatus = Form.useWatch('status', form);
  const selectedVesselId = Form.useWatch('vessel_id', form) || editingRecord?.vessel_id || editingRecord?.vessel?.id;

  const filteredEquipments = selectedVesselId
    ? equipments.filter(e => e.vessel_id === selectedVesselId)
    : [];

  const selectedRoutine = routines.find(r => r.id === selectedRoutineId);
  const selectedRoutineParts = selectedRoutine?.parts?.filter(p => p.inventory_item?.category !== 'herramienta') || [];
  const selectedRoutineTools = selectedRoutine?.parts?.filter(p => p.inventory_item?.category === 'herramienta') || [];
  const missingParts = selectedRoutine?.parts?.filter(p => p.quantity_required > (p.inventory_item?.quantity || 0)) || [];

  const showRoutine = selectedType !== 'correctivo';
  const showExecutionFields = selectedStatus && selectedStatus !== 'pendiente';
  const partsLabel = selectedRoutineId ? "Refacciones extras" : "Refacciones utilizadas";
  const partsPlaceholder = selectedRoutineId ? "Lista de piezas o materiales adicionales usados" : "Lista de piezas o materiales usados";

  // Limpiar rutina si el tipo cambia a correctivo
  useEffect(() => {
    if (selectedType === 'correctivo') {
      form.setFieldValue('routine_id', undefined);
    }
  }, [selectedType, form]);

  // Limpiar equipo y rutina al cambiar de embarcación (solo en creación)
  useEffect(() => {
    if (!editingRecord) {
      form.setFieldValue('equipment_id', undefined);
      form.setFieldValue('routine_id', undefined);
    }
  }, [selectedVesselId, form, editingRecord]);

  // Autocompletado inteligente de fechas al cambiar estado
  useEffect(() => {
    if (selectedStatus === 'en_progreso') {
      if (!form.getFieldValue('started_date')) {
        form.setFieldValue('started_date', dayjs());
      }
    } else if (selectedStatus === 'completado') {
      if (!form.getFieldValue('started_date')) {
        form.setFieldValue('started_date', dayjs());
      }
      if (!form.getFieldValue('completed_date')) {
        form.setFieldValue('completed_date', dayjs());
      }
    }
  }, [selectedStatus, form]);

  useEffect(() => {
    if (selectedEquipmentId) {
      apiClient.get(`/equipment/${selectedEquipmentId}/routines`)
        .then(res => setRoutines(res.data))
        .catch(() => setRoutines([]));
    } else {
      setRoutines([]);
      form.setFieldValue('routine_id', undefined);
    }
  }, [selectedEquipmentId, form]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (pagination.current - 1) * pagination.pageSize;
      const params = { skip, limit: pagination.pageSize };
      if (search) params.search = search;
      if (filterVessel) params.vessel_id = filterVessel;
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      const r = await apiClient.get('/maintenance', { params });
      setRecords(r.data.items);
      setTotal(r.data.total);
    } catch { message.error('Error al cargar mantenimientos'); }
    finally { setLoading(false); }
  }, [pagination, search, filterVessel, filterStatus, filterPriority]);

  const fetchSummary = useCallback(async () => {
    try {
      const r = await apiClient.get('/maintenance/summary', { params: filterVessel ? { vessel_id: filterVessel } : {} });
      setSummary(r.data);
    } catch { /* silently */ }
  }, [filterVessel]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const openCreate = () => {
    setEditingRecord(null);
    form.resetFields();
    form.setFieldsValue({ maintenance_type: 'correctivo', priority: 'media', status: 'pendiente' });
    setModalOpen(true);
  };

  const openEdit = (rec) => {
    setEditingRecord(rec);
    form.setFieldsValue({
      ...rec,
      vessel_id: rec.vessel_id || rec.vessel?.id || null,
      category_id: rec.category?.id || null,
      assigned_to: rec.assigned_user?.id || null,
      scheduled_date: rec.scheduled_date ? dayjs(rec.scheduled_date) : null,
      started_date: rec.started_date ? dayjs(rec.started_date) : null,
      completed_date: rec.completed_date ? dayjs(rec.completed_date) : null,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        scheduled_date: values.scheduled_date?.format('YYYY-MM-DD') || null,
        started_date: values.started_date?.format('YYYY-MM-DD') || null,
        completed_date: values.completed_date?.format('YYYY-MM-DD') || null,
      };
      setSaving(true);
      if (editingRecord) {
        await apiClient.put(`/maintenance/${editingRecord.id}`, payload);
        message.success('Registro actualizado');
      } else {
        await apiClient.post('/maintenance', payload);
        message.success('Registro creado');
      }
      setModalOpen(false);
      fetchRecords(); fetchSummary();
    } catch (err) {
      if (err.response?.data?.detail) message.error(err.response.data.detail);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/maintenance/${id}`);
      message.success('Registro eliminado');
      fetchRecords(); fetchSummary();
    } catch (err) { message.error(err.response?.data?.detail || 'Error'); }
  };

  const columns = [
    {
      title: 'Mantenimiento',
      key: 'title',
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{r.title}</Text>
          {r.equipment ? (
            <><br /><Text type="secondary" style={{ fontSize: 11 }}>⚙️ {r.equipment.name}</Text></>
          ) : r.system_component ? (
            <><br /><Text type="secondary" style={{ fontSize: 11 }}>📍 {r.system_component}</Text></>
          ) : null}
          {r.routine && (
            <><br /><Text type="secondary" style={{ fontSize: 11, color: '#2980B9' }}>🗓️ {r.routine.name}</Text></>
          )}
          {r.category && (
            <><br /><Tag style={{ marginTop: 2, fontSize: 11 }} color={r.category.color || '#666'}>{r.category.name}</Tag></>
          )}
        </div>
      ),
      sorter: (a, b) => (a.title || '').localeCompare(b.title || ''),
    },
    { 
      title: 'Embarcación', 
      key: 'vessel', 
      width: 140, 
      render: (_, r) => <Text>{r.vessel?.name}</Text>,
      sorter: (a, b) => (a.vessel?.name || '').localeCompare(b.vessel?.name || ''),
    },
    {
      title: 'Tipo', dataIndex: 'maintenance_type', width: 110,
      render: (t) => <Tag color={TYPE_MAP[t]?.color}>{TYPE_MAP[t]?.label}</Tag>,
      sorter: (a, b) => (a.maintenance_type || '').localeCompare(b.maintenance_type || ''),
    },
    {
      title: 'Prioridad', dataIndex: 'priority', width: 100,
      render: (p) => <Tag color={PRIORITY_MAP[p]?.color}>{PRIORITY_MAP[p]?.label}</Tag>,
      sorter: (a, b) => {
        const weights = { critica: 4, alta: 3, media: 2, baja: 1 };
        return (weights[a.priority] || 0) - (weights[b.priority] || 0);
      },
    },
    {
      title: 'Estado', dataIndex: 'status', width: 130,
      render: (s) => <Badge status={STATUS_MAP[s]?.badge} text={STATUS_MAP[s]?.label} />,
      sorter: (a, b) => (a.status || '').localeCompare(b.status || ''),
    },
    {
      title: 'Fecha Prog.', dataIndex: 'scheduled_date', width: 110,
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '—',
      sorter: (a, b) => dayjs(a.scheduled_date || 0).unix() - dayjs(b.scheduled_date || 0).unix(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Acciones', key: 'actions', width: 100,
      render: (_, r) => (
        <Space>
          <CanAccess module="maintenance" action="edit">
            <Tooltip title="Editar"><Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          </CanAccess>
          <CanAccess module="maintenance" action="delete">
            <Popconfirm title="¿Eliminar este registro?" onConfirm={() => handleDelete(r.id)}>
              <Tooltip title="Eliminar"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>
          </CanAccess>
        </Space>
      ),
    },
  ];

  // Colorear filas críticas
  const rowClassName = (r) =>
    r.priority === 'critica' && r.status !== 'completado' && r.status !== 'cancelado' ? 'row-danger' : '';

  return (
    <>
      {/* Tarjetas de resumen */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {[
          { key: 'pendiente',   label: 'Pendientes',   color: '#8C8C8C', bg: '#f9f9f9' },
          { key: 'en_progreso', label: 'En Progreso',  color: '#1677FF', bg: '#f0f5ff' },
          { key: 'completado',  label: 'Completados',  color: '#52C41A', bg: '#f6ffed' },
          { key: 'criticos',    label: 'Críticos',     color: '#F5222D', bg: '#fff1f0' },
        ].map(({ key, label, color, bg }) => (
          <Col xs={12} md={6} key={key}>
            <Card size="small" style={{ borderRadius: 10, borderLeft: `3px solid ${color}`, background: bg }}>
              <Statistic title={label} value={summary[key]} valueStyle={{ color, fontSize: 22 }} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Barra de herramientas */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col><Text type="secondary">{total} registros</Text></Col>
        <Col>
          <Space wrap>
            <Search placeholder="Buscar..." allowClear onSearch={(v) => { setSearch(v); setPagination({ ...pagination, current: 1 }); }} style={{ width: 180 }} />
            <Select placeholder="Embarcación" allowClear style={{ width: 150 }} onChange={(v) => { setFilterVessel(v); setPagination({ ...pagination, current: 1 }); }}
              options={vessels.map((v) => ({ value: v.id, label: v.name }))} />
            <Select placeholder="Estado" allowClear style={{ width: 140 }} onChange={(v) => { setFilterStatus(v); setPagination({ ...pagination, current: 1 }); }}
              options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
            <Select placeholder="Prioridad" allowClear style={{ width: 120 }} onChange={(v) => { setFilterPriority(v); setPagination({ ...pagination, current: 1 }); }}
              options={Object.entries(PRIORITY_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
            <Button icon={<ReloadOutlined />} onClick={() => { fetchRecords(); fetchSummary(); }} />
            <CanAccess module="maintenance" action="create">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo Registro</Button>
            </CanAccess>
          </Space>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <style>{`.row-danger td { background: #fff1f0 !important; }`}</style>
        <Table columns={columns} dataSource={records} rowKey="id" loading={loading} rowClassName={rowClassName}
          pagination={{ current: pagination.current, pageSize: pagination.pageSize, total, showSizeChanger: true, showTotal: (t) => `${t} registros`, onChange: (p, s) => setPagination({ current: p, pageSize: s }) }} />
      </Card>

      {/* Modal */}
      <Modal title={editingRecord ? `Editar: ${editingRecord.title}` : 'Nuevo Registro de Mantenimiento'}
        open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSave}
        confirmLoading={saving} okText={editingRecord ? 'Guardar' : 'Crear'} destroyOnClose width={680}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {!editingRecord ? (
            <Form.Item name="vessel_id" label="Embarcación" rules={[{ required: true, message: 'Requerido' }]}>
              <Select placeholder="Seleccionar embarcación" options={vessels.map((v) => ({ value: v.id, label: v.name }))} />
            </Form.Item>
          ) : (
            <Form.Item label="Embarcación">
              <Input value={editingRecord.vessel?.name || '—'} disabled style={{ color: 'rgba(0, 0, 0, 0.85)', backgroundColor: '#f5f5f5' }} />
            </Form.Item>
          )}

          {selectedVesselId && filteredEquipments.length === 0 && (
            <Alert
              message="Sin equipos registrados"
              description={
                <span>
                  Esta embarcación no cuenta con equipos o sistemas registrados en el catálogo.
                  Para poder programar mantenimientos específicos, primero debes registrar equipos para esta embarcación en el módulo de <strong>Equipos y Sistemas</strong>.
                </span>
              }
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}
          <Form.Item name="title" label="Título" rules={[{ required: true, message: 'Requerido' }]}>
            <Input placeholder="ej: Cambio de aceite motor principal" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="maintenance_type" label="Tipo">
                <Select options={Object.entries(TYPE_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="priority" label="Prioridad">
                <Select options={Object.entries(PRIORITY_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="Estado">
                <Select options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={showRoutine ? 8 : 12}>
              <Form.Item name="equipment_id" label="Equipo / Sistema"
                rules={[{ required: selectedType === 'preventivo', message: 'El equipo es requerido para mantenimientos preventivos' }]}>
                <Select allowClear placeholder={filteredEquipments.length === 0 ? "Sin equipos disponibles" : "Seleccionar equipo"} disabled={!selectedVesselId || filteredEquipments.length === 0}
                  options={filteredEquipments.map((e) => ({ value: e.id, label: e.name }))} />
              </Form.Item>
            </Col>
            {showRoutine && (
              <Col span={8}>
                <Form.Item name="routine_id" label="Rutina de Mantenimiento"
                  rules={[{ required: selectedType === 'preventivo', message: 'La rutina es requerida para mantenimientos preventivos' }]}>
                  <Select allowClear placeholder="Seleccionar rutina" disabled={!selectedEquipmentId}
                    options={routines.map((r) => ({ value: r.id, label: r.name }))} />
                </Form.Item>
              </Col>
            )}
            <Col span={showRoutine ? 8 : 12}>
              <Form.Item name="category_id" label="Categoría de Mant.">
                <Select allowClear placeholder="Sin categoría"
                  options={categories.map((c) => ({ value: c.id, label: `${c.icon || ''} ${c.name}` }))} />
              </Form.Item>
            </Col>
          </Row>
          
          {showRoutine && (selectedRoutineParts.length > 0 || selectedRoutineTools.length > 0) && (
            <Card size="small" style={{ marginBottom: 16, background: '#f5f5f5', borderRadius: 8 }}>
              {selectedRoutineParts.length > 0 && (
                <>
                  <Text strong>Insumos/Refacciones requeridas por esta rutina:</Text>
                  <ul style={{ margin: '4px 0 8px 0', paddingLeft: 16, fontSize: 13 }}>
                    {selectedRoutineParts.map(p => (
                      <li key={p.id} style={{ color: p.quantity_required > (p.inventory_item?.quantity || 0) ? '#cf1322' : 'inherit' }}>
                        {p.quantity_required}x {p.inventory_item?.name} (Stock actual: {p.inventory_item?.quantity || 0})
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {selectedRoutineTools.length > 0 && (
                <>
                  <Text strong>Herramientas requeridas por esta rutina:</Text>
                  <ul style={{ margin: '4px 0', paddingLeft: 16, fontSize: 13 }}>
                    {selectedRoutineTools.map(p => (
                      <li key={p.id} style={{ color: (p.inventory_item?.quantity || 0) < 1 ? '#cf1322' : 'inherit' }}>
                        🛠️ {p.inventory_item?.name} (Disponible: {p.inventory_item?.quantity || 0})
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {missingParts.length > 0 && (
                <Alert type="warning" showIcon message="Stock o disponibilidad de herramientas insuficiente para ejecutar esta rutina" style={{ marginTop: 8 }} />
              )}
            </Card>
          )}

          <Form.Item name="system_component" label="Sub-componente (opcional)">
            <Input placeholder="ej: Filtro separador, Válvula X" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={showExecutionFields ? 8 : 24}>
              <Form.Item name="scheduled_date" label="Fecha programada">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            {showExecutionFields && (
              <>
                <Col span={8}><Form.Item name="started_date" label="Fecha de inicio"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
                <Col span={8}><Form.Item name="completed_date" label="Fecha de término"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
              </>
            )}
          </Row>
          <Row gutter={16}>
            <Col span={showExecutionFields ? 8 : 24}>
              <Form.Item name="estimated_cost" label="Costo estimado ($)">
                <InputNumber style={{ width: '100%' }} min={0} step={100} />
              </Form.Item>
            </Col>
            {showExecutionFields && (
              <>
                <Col span={8}><Form.Item name="actual_cost" label="Costo real ($)"><InputNumber style={{ width: '100%' }} min={0} step={100} /></Form.Item></Col>
                <Col span={8}><Form.Item name="hours_worked" label="Horas trabajadas (hrs)"><InputNumber style={{ width: '100%' }} min={0} step={0.5} /></Form.Item></Col>
              </>
            )}
          </Row>
          <Form.Item name="description" label="Descripción">
            <TextArea rows={2} placeholder="Descripción del trabajo a realizar o problema detectado" />
          </Form.Item>
          {showExecutionFields && (
            <>
              <Form.Item name="work_performed" label="Trabajo realizado y hallazgos">
                <TextArea rows={3} placeholder="Describa el trabajo ejecutado y cualquier hallazgo relevante (ej: estado de piezas, desgaste observado, anomalías menores, etc.)" />
              </Form.Item>
              <Form.Item name="parts_used" label={partsLabel}>
                <TextArea rows={2} placeholder={partsPlaceholder} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </>
  );
}

// ── Sub-página: Categorías ─────────────────────────────────────
function CategoriesTab({ categories, onReload }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setEditingCat(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (c) => { setEditingCat(c); form.setFieldsValue(c); setModalOpen(true); };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editingCat) {
        await apiClient.put(`/maintenance/categories/${editingCat.id}`, values);
        message.success('Categoría actualizada');
      } else {
        await apiClient.post('/maintenance/categories', values);
        message.success('Categoría creada');
      }
      setModalOpen(false);
      onReload();
    } catch (err) {
      if (err.response?.data?.detail) message.error(err.response.data.detail);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/maintenance/categories/${id}`);
      message.success('Categoría eliminada');
      onReload();
    } catch (err) { message.error(err.response?.data?.detail || 'Error al eliminar'); }
  };

  return (
    <>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col><Text type="secondary">{categories.length} categorías configuradas</Text></Col>
        <Col>
          <CanAccess module="maintenance" action="create">
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nueva Categoría</Button>
          </CanAccess>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        {categories.map((cat) => (
          <Col xs={24} sm={12} md={8} lg={6} key={cat.id}>
            <Card size="small" style={{ borderRadius: 10, borderLeft: `3px solid ${cat.color || '#ccc'}` }}>
              <Row justify="space-between" align="middle">
                <Col>
                  <Space>
                    <span style={{ fontSize: 20 }}>{cat.icon}</span>
                    <div>
                      <Text strong>{cat.name}</Text>
                      {cat.description && <><br /><Text type="secondary" style={{ fontSize: 11 }}>{cat.description}</Text></>}
                    </div>
                  </Space>
                </Col>
                <Col>
                  <Space>
                    <CanAccess module="maintenance" action="edit">
                      <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(cat)} />
                    </CanAccess>
                    <CanAccess module="maintenance" action="delete">
                      <Popconfirm title="¿Eliminar categoría?" onConfirm={() => handleDelete(cat.id)}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </CanAccess>
                  </Space>
                </Col>
              </Row>
            </Card>
          </Col>
        ))}
      </Row>

      <Modal title={editingCat ? `Editar: ${editingCat.name}` : 'Nueva Categoría'}
        open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSave}
        confirmLoading={saving} okText={editingCat ? 'Guardar' : 'Crear'} destroyOnClose width={400}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Nombre" rules={[{ required: true }]}>
            <Input placeholder="ej: Sistemas de Seguridad" />
          </Form.Item>
          <Form.Item name="description" label="Descripción">
            <Input placeholder="Descripción breve" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="icon" label="Ícono (emoji)">
                <Input placeholder="ej: 🔧" maxLength={4} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="color" label="Color (hex)">
                <Input placeholder="#E67E22" maxLength={7} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Página principal ────────────────────────────────────────────
function MaintenancePage() {
  const [vessels, setVessels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [equipments, setEquipments] = useState([]);

  const fetchVessels = async () => {
    try { const r = await apiClient.get('/vessels/options'); setVessels(r.data); } catch { /* */ }
  };

  const fetchCategories = async () => {
    try { const r = await apiClient.get('/maintenance/categories'); setCategories(r.data.items); } catch { /* */ }
  };

  const fetchEquipments = async () => {
    try { const r = await apiClient.get('/equipment/options'); setEquipments(r.data); } catch { /* */ }
  };

  useEffect(() => { fetchVessels(); fetchCategories(); fetchEquipments(); }, []);

  const tabItems = [
    {
      key: 'records',
      label: <Space><ToolOutlined /> Registros</Space>,
      children: <RecordsTab vessels={vessels} categories={categories} equipments={equipments} />,
    },
    {
      key: 'categories',
      label: <Space><SettingOutlined /> Categorías</Space>,
      children: <CategoriesTab categories={categories} onReload={fetchCategories} />,
    },
  ];

  return (
    <div className="animate-fade-in">
      <Row style={{ marginBottom: 20 }}>
        <Col>
          <Title level={3} style={{ color: '#0A2647', margin: 0 }}>🔧 Mantenimiento</Title>
          <Text type="secondary">Gestión de mantenimientos y categorías configurables</Text>
        </Col>
      </Row>
      <Tabs items={tabItems} defaultActiveKey="records" />
    </div>
  );
}

export default MaintenancePage;
