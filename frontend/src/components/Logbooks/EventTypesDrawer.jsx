import { useState, useEffect } from 'react';
import { Drawer, Table, Button, Space, Modal, Form, Input, Tag, message, ColorPicker, Select } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  SettingOutlined,
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
import apiClient from '../../api/client';

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

const LOGBOOK_ICONS = [
  { value: 'GlobalOutlined', label: 'Global (Zarpe/Arribo/Navegación)', icon: <GlobalOutlined /> },
  { value: 'CompassOutlined', label: 'Brújula (Navegación)', icon: <CompassOutlined /> },
  { value: 'EnvironmentOutlined', label: 'Ubicación (Estación/Punto)', icon: <EnvironmentOutlined /> },
  { value: 'AimOutlined', label: 'Objetivo/Muestreo', icon: <AimOutlined /> },
  { value: 'WarningOutlined', label: 'Advertencia/Alerta', icon: <WarningOutlined /> },
  { value: 'AlertOutlined', label: 'Falla/Incidente', icon: <AlertOutlined /> },
  { value: 'ToolOutlined', label: 'Herramienta (Reparación/Mant.)', icon: <ToolOutlined /> },
  { value: 'CloudOutlined', label: 'Nube (Clima/Meteorología)', icon: <CloudOutlined /> },
  { value: 'BookOutlined', label: 'Libro (Observación/Nota)', icon: <BookOutlined /> },
  { value: 'TeamOutlined', label: 'Equipo (Guardia/Personal)', icon: <TeamOutlined /> },
  { value: 'FlagOutlined', label: 'Bandera (Hito/Evento)', icon: <FlagOutlined /> },
  { value: 'MessageOutlined', label: 'Mensaje (Comunicaciones)', icon: <MessageOutlined /> },
  { value: 'ExperimentOutlined', label: 'Experimento/Científico', icon: <ExperimentOutlined /> },
];

export default function EventTypesDrawer({ open, onClose, onRefresh }) {
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchEventTypes = async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/logbooks/event-types');
      setEventTypes(r.data);
    } catch {
      message.error('Error al cargar tipos de evento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchEventTypes();
  }, [open]);

  const handleSave = async (values) => {
    setSaving(true);
    try {
      const payload = { ...values };
      // Extraer el color en formato hexadecimal si viene del ColorPicker
      if (payload.color && typeof payload.color === 'object' && payload.color.toHexString) {
        payload.color = payload.color.toHexString();
      } else if (payload.color && typeof payload.color === 'object' && typeof payload.color === 'string') {
        // Fallback en caso de que sea string normal
      }

      if (editingId) {
        await apiClient.put(`/logbooks/event-types/${editingId}`, payload);
        message.success('Evento actualizado');
      } else {
        await apiClient.post('/logbooks/event-types', payload);
        message.success('Evento creado');
      }
      setModalOpen(false);
      fetchEventTypes();
      if (onRefresh) onRefresh();
    } catch {
      message.error('Error al guardar evento');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: 'Nombre', dataIndex: 'name', key: 'name', render: (t) => <b>{t}</b> },
    { title: 'Color', dataIndex: 'color', key: 'color', render: (c) => c ? <Tag color={c}>{c}</Tag> : '—' },
    {
      title: 'Ícono', dataIndex: 'icon', key: 'icon',
      render: (iconName) => {
        const IconComponent = ICON_COMPONENTS[iconName];
        return IconComponent ? <span style={{ fontSize: 16 }}><IconComponent /></span> : iconName || '—';
      }
    },
    {
      title: 'Acciones', key: 'actions', width: 90,
      render: (_, r) => (
        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => {
          setEditingId(r.id);
          form.setFieldsValue(r);
          setModalOpen(true);
        }} />
      )
    }
  ];

  return (
    <Drawer title={<Space><SettingOutlined /> Catálogo de Eventos</Space>} width={600} open={open} onClose={onClose}>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => {
        setEditingId(null);
        form.resetFields();
        setModalOpen(true);
      }} style={{ marginBottom: 16 }}>
        Nuevo Evento
      </Button>

      <Table columns={columns} dataSource={eventTypes} rowKey="id" pagination={false} loading={loading} size="small" />

      <Modal title={editingId ? 'Editar Evento' : 'Nuevo Evento'} open={modalOpen}
        onCancel={() => setModalOpen(false)} onOk={() => form.submit()} confirmLoading={saving}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Nombre del Evento" rules={[{ required: true }]}><Input placeholder="ej: Fondeo" /></Form.Item>
          <Form.Item name="description" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="color" label="Color">
            <ColorPicker showText format="hex" />
          </Form.Item>
          <Form.Item name="icon" label="Ícono">
            <Select
              placeholder="Seleccionar ícono..."
              allowClear
              options={LOGBOOK_ICONS.map(i => ({
                value: i.value,
                label: (
                  <Space>
                    {i.icon}
                    <span>{i.label}</span>
                  </Space>
                )
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}
