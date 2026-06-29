/**
 * SIAE — Página de Embarcaciones.
 * CRUD completo con tabla, drawer de detalle, modal de creación/edición,
 * filtros por tipo y estado, y diseño profesional.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, InputNumber,
  Typography, Card, message, Popconfirm, Tooltip, Row, Col, Drawer,
  Descriptions, Badge, Divider, Switch, Input as AntInput, Avatar, Empty, List,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  ReloadOutlined, EyeOutlined, EnvironmentOutlined, TeamOutlined, UserOutlined,
} from '@ant-design/icons';
import apiClient from '../../api/client';
import { CanAccess } from '../../components/common/CanAccess';
import { useAuth } from '../../context/AuthContext';
import { FuelLogFormModal } from '../FuelLogs/FuelLogsPage';

const { Title, Text, Paragraph } = Typography;
const { Search } = AntInput;
const { TextArea } = Input;

// ── Constantes de display ─────────────────────────────────────
const VESSEL_TYPE_MAP = {
  barco: { label: 'Barco', color: '#1B4F72', emoji: '🚢' },
  yate: { label: 'Yate', color: '#8E44AD', emoji: '🛥️' },
  panga: { label: 'Panga', color: '#27AE60', emoji: '🚤' },
  lancha: { label: 'Lancha', color: '#E67E22', emoji: '⛵' },
  otro: { label: 'Otro', color: '#7F8C8D', emoji: '🔹' },
};

const STATUS_MAP = {
  activo: { label: 'Activo', color: 'success' },
  en_mantenimiento: { label: 'En Mantenimiento', color: 'warning' },
  fuera_de_servicio: { label: 'Fuera de Servicio', color: 'error' },
  en_crucero: { label: 'En Crucero', color: 'processing' },
};

const CREW_ROLE_MAP = {
  capitan:        { label: 'Capitán',       color: '#7b2d00' },
  primer_oficial: { label: '1er Oficial',   color: '#9c4221' },
  marinero:       { label: 'Marinero',      color: '#6b7280' },
  jefe_maquinas:  { label: 'Jefe Máquinas', color: '#92400e' },
  medico:         { label: 'Médico',        color: '#065f46' },
};

const FUEL_TYPES = ['Diésel', 'Gasolina', 'Gasolina Premium', 'Otro'];
const HULL_MATERIALS = ['Fibra de vidrio', 'Aluminio', 'Acero', 'Madera', 'Inflable PVC', 'Otro'];

function VesselsPage() {
  const { user } = useAuth();
  const [vessels, setVessels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState(null);
  const [filterStatus, setFilterStatus] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingVessel, setEditingVessel] = useState(null);
  const [viewingVessel, setViewingVessel] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // Fuel log modal state
  const [fuelModalOpen, setFuelModalOpen] = useState(false);
  const [fuelVesselId, setFuelVesselId] = useState(null);

  // Crew state
  const [vesselCrew, setVesselCrew] = useState([]);
  const [personnelOptions, setPersonnelOptions] = useState([]);
  const [addingCrew, setAddingCrew] = useState(false);
  const [newCrewRole, setNewCrewRole] = useState('marinero');
  const [newCrewPersonnelId, setNewCrewPersonnelId] = useState(null);

  const isAdmin = user?.is_superadmin || user?.roles?.some(r =>
    ['Administrador', 'Capitán', 'Jefe de Máquinas', 'Operador'].includes(r.name)
  );

  const fetchVessels = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (pagination.current - 1) * pagination.pageSize;
      const params = { skip, limit: pagination.pageSize };
      if (search) params.search = search;
      if (filterType) params.vessel_type = filterType;
      if (filterStatus) params.status = filterStatus;

      const response = await apiClient.get('/vessels', { params });
      setVessels(response.data.items);
      setTotal(response.data.total);
    } catch {
      message.error('Error al cargar embarcaciones');
    } finally {
      setLoading(false);
    }
  }, [pagination, search, filterType, filterStatus]);

  useEffect(() => { fetchVessels(); }, [fetchVessels]);

  const openCreateModal = () => {
    setEditingVessel(null);
    setVesselCrew([]);
    form.resetFields();
    form.setFieldsValue({ vessel_type: 'barco', status: 'activo' });
    setModalOpen(true);
  };

  const openEditModal = (vessel) => {
    setEditingVessel(vessel);
    form.setFieldsValue(vessel);
    fetchVesselCrew(vessel.id);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingVessel(null);
    setVesselCrew([]);
    setNewCrewPersonnelId(null);
  };

  const openDrawer = (vessel) => {
    setViewingVessel(vessel);
    setDrawerOpen(true);
    fetchVesselCrew(vessel.id);
  };

  const fetchVesselCrew = async (vesselId) => {
    try {
      const res = await apiClient.get(`/vessels/${vesselId}/crew`);
      setVesselCrew(res.data);
    } catch { setVesselCrew([]); }
  };

  const fetchPersonnelOptions = async () => {
    try {
      const res = await apiClient.get('/personnel', { params: { limit: 100, status: 'activo' } });
      setPersonnelOptions(res.data.items || []);
    } catch { setPersonnelOptions([]); }
  };

  const handleAddCrew = async () => {
    const activeVesselId = viewingVessel?.id || editingVessel?.id;
    if (!newCrewPersonnelId || !activeVesselId) return;
    setAddingCrew(true);
    try {
      await apiClient.post(`/vessels/${activeVesselId}/crew`, {
        personnel_id: newCrewPersonnelId,
        role: newCrewRole,
      });
      message.success('Tripulante agregado');
      setNewCrewPersonnelId(null);
      setNewCrewRole('marinero');
      fetchVesselCrew(activeVesselId);
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al agregar tripulante');
    } finally { setAddingCrew(false); }
  };

  const handleRemoveCrew = async (crewId) => {
    const activeVesselId = viewingVessel?.id || editingVessel?.id;
    if (!activeVesselId) return;
    try {
      await apiClient.delete(`/vessels/${activeVesselId}/crew/${crewId}`);
      message.success('Tripulante removido');
      fetchVesselCrew(activeVesselId);
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al remover');
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      if (editingVessel) {
        await apiClient.put(`/vessels/${editingVessel.id}`, values);
        message.success('Embarcación actualizada');
      } else {
        await apiClient.post('/vessels', values);
        message.success('Embarcación creada');
      }

      setModalOpen(false);
      fetchVessels();
    } catch (error) {
      if (error.response?.data?.detail) {
        message.error(error.response.data.detail);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/vessels/${id}`);
      message.success('Embarcación eliminada');
      fetchVessels();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Error al eliminar');
    }
  };

  // ── Columnas de la tabla ─────────────────────────────────────
  const columns = [
    {
      title: 'Embarcación',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => {
        const typeInfo = VESSEL_TYPE_MAP[record.vessel_type] || VESSEL_TYPE_MAP.otro;
        return (
          <Space>
            <span style={{ fontSize: 20 }}>{typeInfo.emoji}</span>
            <div>
              <Text strong style={{ fontSize: 14 }}>{name}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.registration_number || 'Sin registro'}
              </Text>
            </div>
          </Space>
        );
      },
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      defaultSortOrder: 'ascend',
    },
    {
      title: 'Tipo',
      dataIndex: 'vessel_type',
      key: 'vessel_type',
      width: 120,
      render: (type) => {
        const info = VESSEL_TYPE_MAP[type] || VESSEL_TYPE_MAP.otro;
        return <Tag color={info.color}>{info.label}</Tag>;
      },
      sorter: (a, b) => (a.vessel_type || '').localeCompare(b.vessel_type || ''),
    },
    {
      title: 'Estado',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (status) => {
        const info = STATUS_MAP[status] || { label: status, color: 'default' };
        return <Badge status={info.color} text={info.label} />;
      },
      sorter: (a, b) => (a.status || '').localeCompare(b.status || ''),
    },
    {
      title: 'Puerto Base',
      dataIndex: 'home_port',
      key: 'home_port',
      render: (port) => port ? (
        <Space><EnvironmentOutlined style={{ color: '#1B4F72' }} />{port}</Space>
      ) : <Text type="secondary">—</Text>,
      sorter: (a, b) => (a.home_port || '').localeCompare(b.home_port || ''),
    },
    {
      title: 'Motor',
      key: 'engine',
      render: (_, record) => record.engine_type ? (
        <Text style={{ fontSize: 12 }}>
          {record.engine_type}
          {record.engine_power_hp ? ` (${record.engine_power_hp} HP)` : ''}
        </Text>
      ) : <Text type="secondary">—</Text>,
      sorter: (a, b) => (a.engine_type || '').localeCompare(b.engine_type || ''),
    },
      {
        title: 'Acciones',
        key: 'actions',
        width: 170,
        render: (_, record) => (
          <Space>
            <Tooltip title="Ver detalle">
              <Button type="text" icon={<EyeOutlined />} onClick={() => openDrawer(record)} />
            </Tooltip>
            <CanAccess module="fuel_logs" action="create">
              <Tooltip title="Registrar carga de combustible">
                <Button
                  type="text"
                  icon={<span style={{ fontSize: 14 }}>⛽</span>}
                  onClick={() => { setFuelVesselId(record.id); setFuelModalOpen(true); }}
                  style={{ color: '#D35400' }}
                />
              </Tooltip>
            </CanAccess>
            <CanAccess module="vessels" action="edit">
              <Tooltip title="Editar">
                <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
              </Tooltip>
            </CanAccess>
            <CanAccess module="vessels" action="delete">
              <Popconfirm
                title="¿Eliminar embarcación?"
                description="Se eliminarán todos los datos asociados"
                onConfirm={() => handleDelete(record.id)}
              >
                <Tooltip title="Eliminar">
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </CanAccess>
          </Space>
        ),
      },
  ];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <Title level={3} style={{ color: '#0A2647', margin: 0 }}>
            🚢 Embarcaciones
          </Title>
          <Text type="secondary">{total} embarcaciones registradas</Text>
        </Col>
        <Col>
          <Space wrap>
            <Search
              placeholder="Buscar embarcación..."
              allowClear
              onSearch={(v) => { setSearch(v); setPagination({ ...pagination, current: 1 }); }}
              style={{ width: 220 }}
            />
            <Select
              placeholder="Tipo"
              allowClear
              style={{ width: 130 }}
              onChange={(v) => { setFilterType(v); setPagination({ ...pagination, current: 1 }); }}
              options={Object.entries(VESSEL_TYPE_MAP).map(([k, v]) => ({ value: k, label: `${v.emoji} ${v.label}` }))}
            />
            <Select
              placeholder="Estado"
              allowClear
              style={{ width: 160 }}
              onChange={(v) => { setFilterStatus(v); setPagination({ ...pagination, current: 1 }); }}
              options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchVessels} />
            <CanAccess module="vessels" action="create">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                Nueva Embarcación
              </Button>
            </CanAccess>
          </Space>
        </Col>
      </Row>

      {/* Tabla */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={vessels}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `${t} embarcaciones`,
            onChange: (page, size) => setPagination({ current: page, pageSize: size }),
          }}
        />
      </Card>

      {/* ── Modal crear/editar ───────────────────────────────────── */}
      <Modal
        title={editingVessel ? `Editar: ${editingVessel.name}` : 'Nueva Embarcación'}
        open={modalOpen}
        onCancel={handleCloseModal}
        onOk={handleSave}
        confirmLoading={saving}
        okText={editingVessel ? 'Guardar' : 'Crear'}
        destroyOnClose
        width={700}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="Nombre" rules={[{ required: true, message: 'Requerido' }]}>
                <Input placeholder="ej: B/O Alpha Helix" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="registration_number" label="No. de Registro">
                <Input placeholder="ej: ENMO-1234" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="vessel_type" label="Tipo" rules={[{ required: true }]}>
                <Select options={Object.entries(VESSEL_TYPE_MAP).map(([k, v]) => ({ value: k, label: `${v.emoji} ${v.label}` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="Estado">
                <Select options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13 }}>Dimensiones</Divider>
          <Row gutter={16}>
            <Col span={6}><Form.Item name="length_m" label="Eslora (m)"><InputNumber style={{ width: '100%' }} min={0} step={0.1} /></Form.Item></Col>
            <Col span={6}><Form.Item name="beam_m" label="Manga (m)"><InputNumber style={{ width: '100%' }} min={0} step={0.1} /></Form.Item></Col>
            <Col span={6}><Form.Item name="draft_m" label="Calado (m)"><InputNumber style={{ width: '100%' }} min={0} step={0.1} /></Form.Item></Col>
            <Col span={6}><Form.Item name="gross_tonnage" label="Tonelaje bruto"><InputNumber style={{ width: '100%' }} min={0} step={0.1} /></Form.Item></Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}><Form.Item name="year_built" label="Año construcción"><InputNumber style={{ width: '100%' }} min={1900} max={2030} /></Form.Item></Col>
            <Col span={16}><Form.Item name="hull_material" label="Material casco"><Select allowClear placeholder="Seleccionar" options={HULL_MATERIALS.map((m) => ({ value: m, label: m }))} /></Form.Item></Col>
          </Row>

          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13 }}>Propulsión</Divider>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="engine_type" label="Motor"><Input placeholder="ej: CAT C32" /></Form.Item></Col>
            <Col span={8}><Form.Item name="engine_power_hp" label="Potencia (HP)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col span={8}><Form.Item name="max_speed_knots" label="Velocidad máx. (nudos)"><InputNumber style={{ width: '100%' }} min={0} step={0.1} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="fuel_type" label="Combustible"><Select allowClear placeholder="Seleccionar" options={FUEL_TYPES.map((f) => ({ value: f, label: f }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="fuel_capacity_l" label="Capacidad combustible (L)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
          </Row>

          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13 }}>Capacidad y ubicación</Divider>
          <Row gutter={16}>
            <Col span={6}><Form.Item name="max_crew" label="Tripulación máx."><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col span={6}><Form.Item name="max_passengers" label="Pasajeros máx."><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col span={12}><Form.Item name="home_port" label="Puerto base"><Input placeholder="ej: Ensenada, B.C." /></Form.Item></Col>
          </Row>

          <Form.Item name="description" label="Descripción">
            <TextArea rows={3} placeholder="Notas adicionales sobre la embarcación" />
          </Form.Item>

          {editingVessel && (
            <>
              <Divider orientation="left" style={{ color: '#7b2d00', borderColor: '#7b2d00' }}>
                <Space><TeamOutlined /> Tripulación Base</Space>
              </Divider>

              {vesselCrew.length > 0 ? (
                <List
                  size="small"
                  dataSource={vesselCrew}
                  renderItem={item => {
                    const roleMeta = CREW_ROLE_MAP[item.role] || { label: item.role, color: '#999' };
                    return (
                      <List.Item
                        actions={isAdmin ? [
                          <Popconfirm key="del" title="¿Quitar de la tripulación base?" onConfirm={() => handleRemoveCrew(item.id)}>
                            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                          </Popconfirm>
                        ] : []}
                      >
                        <List.Item.Meta
                          avatar={<Avatar size={36} icon={<UserOutlined />} style={{ background: roleMeta.color }} />}
                          title={<Text style={{ fontSize: 13 }}>{item.personnel?.full_name || '—'}</Text>}
                          description={
                            <Space size={4}>
                              <Tag color={roleMeta.color} style={{ margin: 0, fontSize: 11 }}>{roleMeta.label}</Tag>
                              {item.personnel?.email && <Text type="secondary" style={{ fontSize: 11 }}>{item.personnel.email}</Text>}
                            </Space>
                          }
                        />
                      </List.Item>
                    );
                  }}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin tripulación base asignada" style={{ margin: '10px 0' }} />
              )}

              {isAdmin && (
                <Card size="small" style={{ marginTop: 12, background: '#fafafa', borderRadius: 8 }}>
                  <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Agregar Tripulante</Text>
                  <Space.Compact style={{ width: '100%' }}>
                    <Select
                      showSearch
                      placeholder="Buscar personal..."
                      style={{ flex: 1 }}
                      value={newCrewPersonnelId}
                      onChange={setNewCrewPersonnelId}
                      onFocus={fetchPersonnelOptions}
                      filterOption={(input, opt) => opt.label.toLowerCase().includes(input.toLowerCase())}
                      options={personnelOptions.map(p => ({
                        value: p.id,
                        label: `${p.first_name} ${p.last_name}`,
                      }))}
                      allowClear
                    />
                    <Select
                      style={{ width: 140 }}
                      value={newCrewRole}
                      onChange={setNewCrewRole}
                      options={Object.entries(CREW_ROLE_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
                    />
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={handleAddCrew}
                      loading={addingCrew}
                      disabled={!newCrewPersonnelId}
                      style={{ background: '#7b2d00', borderColor: '#7b2d00' }}
                    />
                  </Space.Compact>
                </Card>
              )}
            </>
          )}
        </Form>
      </Modal>

      {/* ── Drawer de detalle ──────────────────────────────────── */}
      <Drawer
        title={
          <Space>
            <span style={{ fontSize: 22 }}>{VESSEL_TYPE_MAP[viewingVessel?.vessel_type]?.emoji || '🔹'}</span>
            <span>{viewingVessel?.name}</span>
          </Space>
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
      >
        {viewingVessel && (
          <div>
            <Space style={{ marginBottom: 16 }}>
              <Tag color={VESSEL_TYPE_MAP[viewingVessel.vessel_type]?.color}>
                {VESSEL_TYPE_MAP[viewingVessel.vessel_type]?.label}
              </Tag>
              <Badge
                status={STATUS_MAP[viewingVessel.status]?.color}
                text={STATUS_MAP[viewingVessel.status]?.label}
              />
            </Space>

            <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Registro">{viewingVessel.registration_number || '—'}</Descriptions.Item>
              <Descriptions.Item label="Puerto Base">{viewingVessel.home_port || '—'}</Descriptions.Item>
              <Descriptions.Item label="Eslora">{viewingVessel.length_m ? `${viewingVessel.length_m} m` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Manga">{viewingVessel.beam_m ? `${viewingVessel.beam_m} m` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Calado">{viewingVessel.draft_m ? `${viewingVessel.draft_m} m` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Tonelaje">{viewingVessel.gross_tonnage || '—'}</Descriptions.Item>
              <Descriptions.Item label="Año">{viewingVessel.year_built || '—'}</Descriptions.Item>
              <Descriptions.Item label="Casco">{viewingVessel.hull_material || '—'}</Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">Propulsión</Divider>
            <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Motor">{viewingVessel.engine_type || '—'}</Descriptions.Item>
              <Descriptions.Item label="Potencia">{viewingVessel.engine_power_hp ? `${viewingVessel.engine_power_hp} HP` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Velocidad máx.">{viewingVessel.max_speed_knots ? `${viewingVessel.max_speed_knots} nudos` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Combustible">{viewingVessel.fuel_type || '—'}</Descriptions.Item>
              <Descriptions.Item label="Capacidad">{viewingVessel.fuel_capacity_l ? `${viewingVessel.fuel_capacity_l} L` : '—'}</Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">Capacidad</Divider>
            <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Tripulación máx.">{viewingVessel.max_crew || '—'}</Descriptions.Item>
              <Descriptions.Item label="Pasajeros máx.">{viewingVessel.max_passengers || '—'}</Descriptions.Item>
            </Descriptions>

            {viewingVessel.description && (
              <>
                <Divider orientation="left">Descripción</Divider>
                <Paragraph>{viewingVessel.description}</Paragraph>
              </>
            )}

            {/* ── Tripulación Base ── */}
            <Divider orientation="left" style={{ color: '#7b2d00', borderColor: '#7b2d00' }}>
              <Space><TeamOutlined /> Tripulación Base</Space>
            </Divider>

            {vesselCrew.length > 0 ? (
              <List
                size="small"
                dataSource={vesselCrew}
                renderItem={item => {
                  const roleMeta = CREW_ROLE_MAP[item.role] || { label: item.role, color: '#999' };
                  return (
                    <List.Item
                      actions={isAdmin ? [
                        <Popconfirm key="del" title="¿Quitar de la tripulación base?" onConfirm={() => handleRemoveCrew(item.id)}>
                          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                        </Popconfirm>
                      ] : []}
                    >
                      <List.Item.Meta
                        avatar={<Avatar size={36} icon={<UserOutlined />} style={{ background: roleMeta.color }} />}
                        title={<Text style={{ fontSize: 13 }}>{item.personnel?.full_name || '—'}</Text>}
                        description={
                          <Space size={4}>
                            <Tag color={roleMeta.color} style={{ margin: 0, fontSize: 11 }}>{roleMeta.label}</Tag>
                            {item.personnel?.email && <Text type="secondary" style={{ fontSize: 11 }}>{item.personnel.email}</Text>}
                          </Space>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin tripulación base asignada" style={{ margin: '10px 0' }} />
            )}

            {isAdmin && (
              <Card size="small" style={{ marginTop: 12, background: '#fafafa', borderRadius: 8 }}>
                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Agregar Tripulante</Text>
                <Space.Compact style={{ width: '100%' }}>
                  <Select
                    showSearch
                    placeholder="Buscar personal..."
                    style={{ flex: 1 }}
                    value={newCrewPersonnelId}
                    onChange={setNewCrewPersonnelId}
                    onFocus={fetchPersonnelOptions}
                    filterOption={(input, opt) => opt.label.toLowerCase().includes(input.toLowerCase())}
                    options={personnelOptions.map(p => ({
                      value: p.id,
                      label: `${p.first_name} ${p.last_name}`,
                    }))}
                    allowClear
                  />
                  <Select
                    style={{ width: 140 }}
                    value={newCrewRole}
                    onChange={setNewCrewRole}
                    options={Object.entries(CREW_ROLE_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
                  />
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleAddCrew}
                    loading={addingCrew}
                    disabled={!newCrewPersonnelId}
                    style={{ background: '#7b2d00', borderColor: '#7b2d00' }}
                  />
                </Space.Compact>
              </Card>
            )}
          </div>
        )}
      </Drawer>

      {/* ── Modal rápido de carga de combustible ─────────────────── */}
      <FuelLogFormModal
        open={fuelModalOpen}
        onClose={() => { setFuelModalOpen(false); setFuelVesselId(null); }}
        onSaved={() => {}}
        editRecord={null}
        preselectedVesselId={fuelVesselId}
      />
    </div>
  );
}

export default VesselsPage;
