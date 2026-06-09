/**
 * SIAE — Página de administración de Puertos y Escoleras.
 * CRUD completo con tabla, modal de creación/edición y mapa Leaflet interactivo.
 */

import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Switch, Typography, Card, message, Popconfirm, Tooltip, Row, Col, InputNumber } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, CompassOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { CanAccess } from '../../components/common/CanAccess';
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

const { Title, Text } = Typography;
const { Search, TextArea } = Input;

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
      const zoom = hasPoint ? 12 : 5;
      map.setView(center, zoom);
    }
  }, [center, hasPoint, map]);
  return null;
}

function PortsPage() {
  const [ports, setPorts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPort, setEditingPort] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // Watch coordinates to update map
  const formLat = Form.useWatch('latitude', form);
  const formLng = Form.useWatch('longitude', form);
  const isValidCoords = typeof formLat === 'number' && typeof formLng === 'number' && !isNaN(formLat) && !isNaN(formLng);
  const mapCenter = isValidCoords ? [formLat, formLng] : [23.6345, -102.5528]; // Default to center of Mexico

  const fetchPorts = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (pagination.current - 1) * pagination.pageSize;
      const params = { skip, limit: pagination.pageSize };
      if (search) params.search = search;

      const response = await apiClient.get('/ports', { params });
      setPorts(response.data.items);
      setTotal(response.data.total);
    } catch {
      message.error('Error al cargar la lista de puertos');
    } finally {
      setLoading(false);
    }
  }, [pagination, search]);

  useEffect(() => {
    fetchPorts();
  }, [fetchPorts]);

  const openCreateModal = () => {
    setEditingPort(null);
    form.resetFields();
    form.setFieldsValue({
      is_active: true,
      latitude: null,
      longitude: null,
    });
    setModalOpen(true);
  };

  const openEditModal = (port) => {
    setEditingPort(port);
    form.resetFields();
    form.setFieldsValue({
      name: port.name,
      latitude: port.latitude,
      longitude: port.longitude,
      description: port.description,
      is_active: port.is_active,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      if (editingPort) {
        await apiClient.put(`/ports/${editingPort.id}`, values);
        message.success('Puerto actualizado exitosamente');
      } else {
        await apiClient.post('/ports', values);
        message.success('Puerto creado exitosamente');
      }

      setModalOpen(false);
      fetchPorts();
    } catch (error) {
      if (error.response?.data?.detail) {
        message.error(error.response.data.detail);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (portId) => {
    try {
      await apiClient.delete(`/ports/${portId}`);
      message.success('Puerto eliminado');
      fetchPorts();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Error al eliminar el puerto');
    }
  };

  const columns = [
    {
      title: 'Puerto / Escollera',
      dataIndex: 'name',
      key: 'name',
      render: (text) => <strong>{text}</strong>,
    },
    {
      title: 'Coordenadas',
      key: 'coordinates',
      width: 200,
      render: (_, record) => (
        <span>
          {record.latitude.toFixed(5)}, {record.longitude.toFixed(5)}
        </span>
      ),
    },
    {
      title: 'Descripción',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Estado',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 120,
      render: (active) => (
        <Tag color={active ? 'success' : 'default'}>
          {active ? 'Activo' : 'Inactivo'}
        </Tag>
      ),
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <CanAccess module="ports" action="edit">
            <Tooltip title="Editar">
              <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            </Tooltip>
          </CanAccess>
          <CanAccess module="ports" action="delete">
            <Popconfirm
              title="¿Eliminar puerto?"
              description="Esta acción no se puede deshacer y puede afectar itinerarios asociados."
              onConfirm={() => handleDelete(record.id)}
              okText="Eliminar"
              cancelText="Cancelar"
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
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <Title level={3} style={{ color: '#0A2647', margin: 0 }}>
            <CompassOutlined style={{ marginRight: 8 }} />
            Catálogo de Puertos
          </Title>
          <Text type="secondary">Puertos de salida y regreso oficiales para planificaciones de crucero.</Text>
        </Col>
        <Col>
          <Space>
            <Search
              placeholder="Buscar puerto..."
              allowClear
              onSearch={(value) => {
                setSearch(value);
                setPagination({ ...pagination, current: 1 });
              }}
              style={{ width: 250 }}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchPorts} />
            <CanAccess module="ports" action="create">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                Nuevo Puerto
              </Button>
            </CanAccess>
          </Space>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={ports}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (total) => `${total} puertos`,
            onChange: (page, size) => setPagination({ current: page, pageSize: size }),
          }}
        />
      </Card>

      {/* Modal crear/editar puerto */}
      <Modal
        title={editingPort ? 'Editar Puerto' : 'Nuevo Puerto'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText={editingPort ? 'Guardar' : 'Crear'}
        destroyOnClose
        width={750}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={24}>
            {/* Form Fields */}
            <Col span={11}>
              <Form.Item name="name" label="Nombre del Puerto / Escollera" rules={[{ required: true, message: 'Requerido' }]}>
                <Input placeholder="ej: Puerto de Ensenada (escolleras)" />
              </Form.Item>
              
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="latitude" label="Latitud" rules={[{ required: true, message: 'Requerido' }]}>
                    <InputNumber
                      style={{ width: '100%' }}
                      step={0.00001}
                      placeholder="ej: 31.8615"
                      min={-90}
                      max={90}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="longitude" label="Longitud" rules={[{ required: true, message: 'Requerido' }]}>
                    <InputNumber
                      style={{ width: '100%' }}
                      step={0.00001}
                      placeholder="ej: -116.6340"
                      min={-180}
                      max={180}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="description" label="Descripción (opcional)">
                <TextArea rows={3} placeholder="Detalles de referencia sobre el muelle o punto de salida..." />
              </Form.Item>

              <Form.Item name="is_active" label="Activo" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>

            {/* Map Selection */}
            <Col span={13}>
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary">📍 Haz clic en el mapa o arrastra el marcador para fijar las coordenadas exactas de la salida/escolleras.</Text>
              </div>
              <div style={{ height: 260, borderRadius: 8, overflow: 'hidden', border: '1px solid #d9d9d9' }}>
                <MapContainer center={mapCenter} zoom={isValidCoords ? 13 : 5} style={{ height: '100%', width: '100%' }}>
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
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

export default PortsPage;
