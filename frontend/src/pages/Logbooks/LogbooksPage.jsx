/**
 * SIAE — Página de Bitácoras.
 * Entradas de bitácora por tipo: Capitán, Cubierta, Máquinas, Horómetros, Auditoría.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker,
  Typography, Card, message, Popconfirm, Tooltip, Row, Col, Switch,
  InputNumber, Tabs, Badge, Divider,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckOutlined,
  SettingOutlined,
  TagOutlined,
  GlobalOutlined,
  CompassOutlined,
  EnvironmentOutlined,
  AimOutlined,
  WarningOutlined,
  AlertOutlined,
  ToolOutlined,
  CloudOutlined,
  BookOutlined,
  TeamOutlined,
  FlagOutlined,
  MessageOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { CanAccess } from '../../components/common/CanAccess';
import EventTypesDrawer from '../../components/Logbooks/EventTypesDrawer';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icons in webpack/vite bundles
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng);
    },
  });
  return null;
}

function MapUpdater({ center, hasPoint }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (center) {
      const zoom = hasPoint ? 13 : 7;
      map.setView(center, zoom);
    }
  }, [center, hasPoint, map]);
  return null;
}

const ICON_COMPONENTS = {
  GlobalOutlined,
  CompassOutlined,
  EnvironmentOutlined,
  AimOutlined,
  WarningOutlined,
  AlertOutlined,
  ToolOutlined,
  CloudOutlined,
  BookOutlined,
  TeamOutlined,
  FlagOutlined,
  MessageOutlined,
  ExperimentOutlined,
};

const { Title, Text } = Typography;
const { Search, TextArea } = Input;
const { RangePicker } = DatePicker;

const LOGBOOK_TYPES = {
  capitan: { label: 'Capitán', color: '#0A2647', emoji: '⚓' },
  cubierta: { label: 'Cubierta', color: '#1B4F72', emoji: '🧭' },
  maquinas: { label: 'Máquinas', color: '#E67E22', emoji: '⚙️' },
  auditoria: { label: 'Auditoría', color: '#7F8C8D', emoji: '🔍' },
};

// ── Tabla de entradas ────────────────────────────────────────
function EntriesTable({ logbookType, vessels, eventTypes, cruises }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [search, setSearch] = useState('');
  const [filterVessel, setFilterVessel] = useState(null);
  const [filterCruise, setFilterCruise] = useState(null);
  const [dateRange, setDateRange] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const isMaquinas = logbookType === 'maquinas';
  const isNavigation = ['capitan', 'cubierta'].includes(logbookType);

  const selectedVesselId = Form.useWatch('vessel_id', form) || editingEntry?.vessel_id;
  const filteredCruises = cruises.filter(c => !selectedVesselId || c.vessel_id === selectedVesselId);

  const formLat = Form.useWatch('latitude', form);
  const formLng = Form.useWatch('longitude', form);
  const isValidCoords = typeof formLat === 'number' && typeof formLng === 'number' && !isNaN(formLat) && !isNaN(formLng);
  const mapCenter = isValidCoords ? [formLat, formLng] : [31.86, -116.63]; // Default to Ensenada

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (pagination.current - 1) * pagination.pageSize;
      const params = { skip, limit: pagination.pageSize, logbook_type: logbookType };
      if (filterVessel) params.vessel_id = filterVessel;
      if (filterCruise) params.cruise_id = filterCruise;
      if (search) params.search = search;
      if (dateRange?.[0]) params.date_from = dateRange[0].format('YYYY-MM-DD');
      if (dateRange?.[1]) params.date_to = dateRange[1].format('YYYY-MM-DD');
      const r = await apiClient.get('/logbooks', { params });
      setEntries(r.data.items);
      setTotal(r.data.total);
    } catch { message.error('Error al cargar bitácora'); }
    finally { setLoading(false); }
  }, [pagination, logbookType, filterVessel, filterCruise, search, dateRange]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const openCreate = () => {
    setEditingEntry(null);
    form.resetFields();
    form.setFieldsValue({
      logbook_type: logbookType,
      entry_date: dayjs(),
      is_signed: false,
    });
    setModalOpen(true);
  };

  const openEdit = (entry) => {
    setEditingEntry(entry);
    form.setFieldsValue({
      ...entry,
      entry_date: dayjs(entry.entry_date),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        entry_date: values.entry_date?.format('YYYY-MM-DD'),
      };
      setSaving(true);
      if (editingEntry) {
        await apiClient.put(`/logbooks/${editingEntry.id}`, payload);
        message.success('Entrada actualizada');
      } else {
        await apiClient.post('/logbooks', payload);
        message.success('Entrada registrada');
      }
      setModalOpen(false);
      fetchEntries();
    } catch (err) {
      if (err.response?.data?.detail) message.error(err.response.data.detail);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    await apiClient.delete(`/logbooks/${id}`);
    message.success('Entrada eliminada');
    fetchEntries();
  };

  const info = LOGBOOK_TYPES[logbookType];

  const baseColumns = [
    {
      title: 'Fecha', key: 'date', width: 120,
      render: (_, r) => (
        <div>
          <Text strong>{dayjs(r.entry_date).format('DD/MM/YYYY')}</Text>
          {r.entry_time && <><br /><Text type="secondary" style={{ fontSize: 11 }}>🕐 {r.entry_time}</Text></>}
        </div>
      ),
    },
    { title: 'Embarcación', key: 'vessel', width: 140, render: (_, r) => <Text>{r.vessel?.name}</Text> },
    {
      title: 'Evento',
      key: 'event',
      width: 150,
      render: (_, r) => {
        if (r.event_type) {
          const IconComponent = ICON_COMPONENTS[r.event_type.icon];
          return (
            <Tag color={r.event_type.color || 'blue'} style={{ padding: '2px 6px', fontSize: 12 }}>
              <Space size={4}>
                {IconComponent && <IconComponent />}
                <span>{r.event_type.name}</span>
              </Space>
            </Tag>
          );
        }
        return <Text type="secondary">General</Text>;
      }
    },
    {
      title: 'Contenido',
      key: 'content',
      render: (_, r) => (
        <div>
          {r.title && <Text strong style={{ fontSize: 13 }}>{r.title}</Text>}
          {r.title && <br />}
          <Text style={{ fontSize: 12 }}>{r.content?.substring(0, 120)}{r.content?.length > 120 ? '...' : ''}</Text>
          <div style={{ marginTop: 4 }}>
            {r.location_name && <Text type="secondary" style={{ fontSize: 11, marginRight: 8 }}>📍 {r.location_name}</Text>}
            {r.engine_hours && <Text type="secondary" style={{ fontSize: 11, marginRight: 8 }}>⚙️ {r.component_name || 'Motor'}: {r.engine_hours}h</Text>}
            {r.cruise && (
              <Tag color="cyan" style={{ fontSize: 10, border: 'none', background: '#E0F7FA', color: '#006064', padding: '1px 5px' }}>
                🚢 {r.cruise.cruise_number || r.cruise.name}
              </Tag>
            )}
          </div>
        </div>
      ),
    },
  ];

  const signColumn = {
    title: 'Firma', key: 'signed', width: 100,
    render: (_, r) => r.is_signed
      ? <Badge status="success" text={<Text style={{ fontSize: 11 }}>{r.signed_by || 'Firmado'}</Text>} />
      : <Badge status="default" text={<Text type="secondary" style={{ fontSize: 11 }}>Sin firma</Text>} />,
  };

  const actionsColumn = {
    title: 'Acciones', key: 'actions', width: 90,
    render: (_, r) => (
      <Space>
        <CanAccess module="logbooks" action="edit">
          <Tooltip title="Editar"><Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
        </CanAccess>
        <CanAccess module="logbooks" action="delete">
          <Popconfirm title="¿Eliminar esta entrada?" onConfirm={() => handleDelete(r.id)}>
            <Tooltip title="Eliminar"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </CanAccess>
      </Space>
    ),
  };

  const columns = [
    ...baseColumns, signColumn,
    actionsColumn,
  ];

  return (
    <>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col><Text type="secondary">{total} entradas</Text></Col>
        <Col>
          <Space wrap>
            <Search placeholder="Buscar..." allowClear onSearch={(v) => { setSearch(v); setPagination({ ...pagination, current: 1 }); }} style={{ width: 160 }} />
            <Select placeholder="Embarcación" allowClear style={{ width: 150 }}
              onChange={(v) => { setFilterVessel(v); setFilterCruise(null); setPagination({ ...pagination, current: 1 }); }}
              options={vessels.map(v => ({ value: v.id, label: v.name }))} />
            <Select placeholder="Crucero" allowClear style={{ width: 150 }}
              value={filterCruise}
              onChange={(v) => { setFilterCruise(v); setPagination({ ...pagination, current: 1 }); }}
              options={cruises
                .filter(c => !filterVessel || c.vessel_id === filterVessel)
                .map(c => ({ value: c.id, label: c.cruise_number || c.name }))} />
            <RangePicker format="DD/MM/YYYY" style={{ width: 220 }}
              onChange={(d) => { setDateRange(d); setPagination({ ...pagination, current: 1 }); }} />
            <Button icon={<ReloadOutlined />} onClick={fetchEntries} />
            <CanAccess module="logbooks" action="create">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nueva Entrada</Button>
            </CanAccess>
          </Space>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Table columns={columns} dataSource={entries} rowKey="id" loading={loading}
          pagination={{
            current: pagination.current, pageSize: pagination.pageSize, total, showSizeChanger: true,
            showTotal: (t) => `${t} entradas`, onChange: (p, s) => setPagination({ current: p, pageSize: s })
          }} />
      </Card>

      {/* Modal */}
      <Modal title={`${info.emoji} ${editingEntry ? 'Editar entrada' : 'Nueva entrada'} — Bitácora ${info.label}`}
        open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSave}
        confirmLoading={saving} okText={editingEntry ? 'Guardar' : 'Registrar'} destroyOnClose width={isNavigation ? 760 : 600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="logbook_type" hidden><Input /></Form.Item>
          {!editingEntry && (
            <Form.Item name="vessel_id" label="Embarcación" rules={[{ required: true }]}>
              <Select placeholder="Seleccionar embarcación" options={vessels.map(v => ({ value: v.id, label: v.name }))} />
            </Form.Item>
          )}
          <Row gutter={16}>
            <Col span={12}><Form.Item name="entry_date" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col span={12}><Form.Item name="entry_time" label="Hora (opcional)"><Input placeholder="HH:MM" maxLength={5} /></Form.Item></Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="cruise_id" label="Crucero / Salida (opcional)">
                <Select
                  placeholder={selectedVesselId ? "Seleccionar crucero" : "Seleccione embarcación primero"}
                  disabled={!selectedVesselId}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={filteredCruises.map(c => ({
                    value: c.id,
                    label: c.cruise_number ? `${c.cruise_number} - ${c.name}` : c.name
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="event_type_id" label="Tipo de Evento" rules={[{ required: true }]}>
                <Select placeholder="Selecciona..." showSearch optionFilterProp="label"
                  options={eventTypes.map(e => ({ value: e.id, label: e.name }))} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="title" label="Título (opcional)">
            <Input placeholder="Resumen breve de la entrada" />
          </Form.Item>

          <Form.Item name="content" label="Contenido / Observaciones" rules={[{ required: true }]}>
            <TextArea rows={4} placeholder="Descripción detallada de la entrada..." />
          </Form.Item>

          {isMaquinas && (
            <>
              <Divider orientation="left" style={{ fontSize: 12 }}>Horómetros (opcional)</Divider>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="component_name" label="Componente">
                    <Input placeholder="ej: Motor Principal" />
                  </Form.Item>
                </Col>
                <Col span={8}><Form.Item name="engine_hours" label="Horas acumuladas"><InputNumber style={{ width: '100%' }} min={0} step={0.5} /></Form.Item></Col>
                <Col span={8}><Form.Item name="engine_hours_delta" label="Horas del período"><InputNumber style={{ width: '100%' }} min={0} step={0.5} /></Form.Item></Col>
              </Row>
            </>
          )}

          {isNavigation && (
            <>
              <Divider orientation="left" style={{ fontSize: 12 }}>Posición y Condiciones</Divider>
              <Row gutter={16}>
                <Col span={12}>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="latitude" label="Latitud">
                        <InputNumber style={{ width: '100%' }} step={0.0001} placeholder="ej: 31.86" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="longitude" label="Longitud">
                        <InputNumber style={{ width: '100%' }} step={0.0001} placeholder="ej: -116.63" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name="location_name" label="Lugar">
                    <Input placeholder="ej: Bahía de Ensenada" />
                  </Form.Item>
                  <Form.Item name="weather_conditions" label="Condiciones meteorológicas">
                    <Input placeholder="ej: Viento 15kt NW, 1.5m ola" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <div style={{ height: 200, borderRadius: 8, overflow: 'hidden', border: '1px solid #d9d9d9', marginTop: 8 }}>
                    <MapContainer center={mapCenter} zoom={isValidCoords ? 13 : 7} style={{ height: '100%', width: '100%' }}>
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      />
                      <MapClickHandler onMapClick={(latlng) => {
                        form.setFieldsValue({
                          latitude: parseFloat(latlng.lat.toFixed(5)),
                          longitude: parseFloat(latlng.lng.toFixed(5)),
                        });
                      }} />
                      {isValidCoords && (
                        <Marker
                          position={[formLat, formLng]}
                          draggable={true}
                          eventHandlers={{
                            dragend: (e) => {
                              const marker = e.target;
                              const latlng = marker.getLatLng();
                              form.setFieldsValue({
                                latitude: parseFloat(latlng.lat.toFixed(5)),
                                longitude: parseFloat(latlng.lng.toFixed(5)),
                              });
                            }
                          }}
                        />
                      )}
                      <MapUpdater center={mapCenter} hasPoint={isValidCoords} />
                    </MapContainer>
                  </div>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', textAlign: 'center', marginTop: 4 }}>
                    📍 Haz clic en el mapa o arrastra el marcador para fijar las coordenadas.
                  </Text>
                </Col>
              </Row>
            </>
          )}

          <Divider orientation="left" style={{ fontSize: 12 }}>Firma y Sellado</Divider>
          <Row gutter={16} align="middle">
            <Col span={6}><Form.Item name="is_signed" label="Firmado" valuePropName="checked">
              <Switch checkedChildren={<CheckOutlined />} />
            </Form.Item></Col>
            <Col span={18}><Form.Item name="signed_by" label="Firmado por">
              <Input placeholder="Nombre del firmante (ej. Cap. Juan Pérez)" />
            </Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Página principal con tabs ───────────────────────────────────
function LogbooksPage() {
  const [vessels, setVessels] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [eventTypes, setEventTypes] = useState([]);
  const [cruises, setCruises] = useState([]);

  const fetchEventTypes = useCallback(async () => {
    try {
      const r = await apiClient.get('/logbooks/event-types');
      setEventTypes(r.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    apiClient.get('/vessels/options').then(r => setVessels(r.data)).catch(() => { });
    apiClient.get('/cruises/options').then(r => setCruises(r.data)).catch(() => { });
    fetchEventTypes();
  }, [fetchEventTypes]);

  const tabItems = Object.entries(LOGBOOK_TYPES)
    .filter(([key]) => key !== 'auditoria') // Auditoría se ve en su propia sección
    .map(([key, info]) => ({
      key,
      label: <Space>{info.emoji} {info.label}</Space>,
      children: <EntriesTable logbookType={key} vessels={vessels} eventTypes={eventTypes} cruises={cruises} />,
    }));

  return (
    <div className="animate-fade-in">
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <Title level={3} style={{ color: '#0A2647', margin: 0 }}>📔 Bitácoras</Title>
          <Text type="secondary">Registros de operación por embarcación</Text>
        </Col>
        <Col>
          <CanAccess module="logbooks" action="edit">
            <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>
              Tipos de Eventos
            </Button>
          </CanAccess>
        </Col>
      </Row>
      <Tabs items={tabItems} defaultActiveKey="capitan" />
      <EventTypesDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} onRefresh={fetchEventTypes} />
    </div>
  );
}

export default LogbooksPage;
