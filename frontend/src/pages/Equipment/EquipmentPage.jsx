/**
 * SIAE — Página de Equipos y Sistemas.
 * Gestión de motores, generadores, y sistemas a bordo de la embarcación.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select,
  Typography, Card, message, Popconfirm, Tooltip, Row, Col,
  Statistic, Upload, InputNumber, Badge, Divider, Drawer
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  SettingOutlined, UploadOutlined, FilePdfOutlined, ScheduleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { CanAccess } from '../../components/common/CanAccess';

const { Title, Text } = Typography;
const { Search, TextArea } = Input;

const CATEGORY_MAP = {
  motor_principal: { label: 'Motor Principal', color: '#8E44AD' },
  generador: { label: 'Generador', color: '#E67E22' },
  sistema_hidraulico: { label: 'Sistema Hidráulico', color: '#2980B9' },
  sistema_electrico: { label: 'Sistema Eléctrico', color: '#F1C40F' },
  bomba: { label: 'Bomba', color: '#1ABC9C' },
  grua_winche: { label: 'Grúa / Winche', color: '#D35400' },
  navegacion: { label: 'Navegación / Electrónica', color: '#34495E' },
  refrigeracion: { label: 'Refrigeración', color: '#7F8C8D' },
  otro: { label: 'Otro', color: '#BDC3C7' },
};

const STATUS_MAP = {
  operativo: { label: 'Operativo', color: 'success', badge: 'success' },
  mantenimiento: { label: 'Mantenimiento', color: 'processing', badge: 'processing' },
  reparacion: { label: 'En Reparación', color: 'warning', badge: 'warning' },
  fuera_servicio: { label: 'Fuera de Servicio', color: 'error', badge: 'error' },
};

// ── Drawer de Rutinas ───────────────────────────────────────────────
function EquipmentRoutinesDrawer({ equipment, open, onClose }) {
  const [routines, setRoutines] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const fetchRoutines = useCallback(async () => {
    if (!equipment) return;
    setLoading(true);
    try {
      const [r, inv] = await Promise.all([
        apiClient.get(`/equipment/${equipment.id}/routines`),
        apiClient.get('/inventory', { params: { skip: 0, limit: 1000 } })
      ]);
      setRoutines(r.data);
      setInventoryItems(inv.data.items);
    } catch {
      message.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [equipment]);

  useEffect(() => {
    if (open) fetchRoutines();
    else {
      setRoutines([]);
      form.resetFields();
      setEditingId(null);
    }
  }, [open, fetchRoutines, form]);

  const handleSave = async (values) => {
    setSaving(true);
    try {
      const combinedParts = [];
      if (values.parts) {
        values.parts.forEach(p => {
          if (p && p.inventory_item_id) {
            combinedParts.push({
              inventory_item_id: p.inventory_item_id,
              quantity_required: p.quantity_required
            });
          }
        });
      }
      if (values.tools) {
        values.tools.forEach(t => {
          if (t && t.inventory_item_id) {
            combinedParts.push({
              inventory_item_id: t.inventory_item_id,
              quantity_required: 1.0
            });
          }
        });
      }

      const payload = {
        name: values.name,
        interval_hours: values.interval_hours,
        interval_months: values.interval_months,
        description: values.description,
        parts: combinedParts
      };

      if (editingId) {
        await apiClient.put(`/equipment/routines/${editingId}`, payload);
        message.success('Rutina actualizada');
      } else {
        await apiClient.post(`/equipment/${equipment.id}/routines`, payload);
        message.success('Rutina creada');
      }
      form.resetFields();
      setEditingId(null);
      fetchRoutines();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/equipment/routines/${id}`);
      message.success('Rutina eliminada');
      fetchRoutines();
    } catch {
      message.error('Error al eliminar');
    }
  };

  const handleEditClick = (r) => {
    setEditingId(r.id);
    const formParts = [];
    const formTools = [];
    if (r.parts) {
      r.parts.forEach(p => {
        const item = p.inventory_item;
        const matched = item || inventoryItems.find(i => i.id === p.inventory_item_id);
        if (matched?.category === 'herramienta') {
          formTools.push({
            inventory_item_id: p.inventory_item_id
          });
        } else {
          formParts.push({
            inventory_item_id: p.inventory_item_id,
            quantity_required: p.quantity_required
          });
        }
      });
    }
    form.setFieldsValue({
      name: r.name,
      interval_hours: r.interval_hours,
      interval_months: r.interval_months,
      description: r.description,
      parts: formParts,
      tools: formTools
    });
  };

  const partsOptions = inventoryItems
    .filter(i => i.category !== 'herramienta')
    .map(i => ({ value: i.id, label: `${i.name} ${i.part_number ? `(${i.part_number})` : ''} - Stock: ${i.quantity}` }));

  const toolsOptions = inventoryItems
    .filter(i => i.category === 'herramienta')
    .map(i => ({ value: i.id, label: `${i.name} ${i.part_number ? `(${i.part_number})` : ''} - Stock: ${i.quantity}` }));

  const columns = [
    { title: 'Rutina', dataIndex: 'name', key: 'name', render: (t) => <Text strong>{t}</Text> },
    { title: 'Recursos Requeridos', key: 'parts', width: 250, render: (_, r) => {
      const routineParts = r.parts?.filter(p => p.inventory_item?.category !== 'herramienta') || [];
      const routineTools = r.parts?.filter(p => p.inventory_item?.category === 'herramienta') || [];
      
      if (routineParts.length === 0 && routineTools.length === 0) {
        return <span style={{ fontSize: 11, color: '#999' }}>Sin recursos requeridos</span>;
      }
      
      return (
        <div style={{ fontSize: 11, color: '#555' }}>
          {routineParts.length > 0 && (
            <div>
              <strong>Insumos:</strong>
              <ul style={{ margin: '2px 0 6px 0', paddingLeft: 12 }}>
                {routineParts.map(p => (
                  <li key={p.id}>
                    {p.quantity_required}x {p.inventory_item?.name || 'Ítem'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {routineTools.length > 0 && (
            <div>
              <strong>Herramientas:</strong>
              <ul style={{ margin: '2px 0 0 0', paddingLeft: 12 }}>
                {routineTools.map(p => (
                  <li key={p.id}>
                    🛠️ {p.inventory_item?.name || 'Herramienta'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }},
    { title: 'Frecuencia', key: 'freq', width: 140, render: (_, r) => (
      <div style={{ fontSize: 12 }}>
        {r.interval_hours ? <div>🕒 Cada {r.interval_hours} hrs</div> : null}
        {r.interval_months ? <div>📅 Cada {r.interval_months} mes</div> : null}
      </div>
    )},
    { title: 'Último Servicio', key: 'last', width: 150, render: (_, r) => (
      <div style={{ fontSize: 11, color: '#666' }}>
        {r.last_performed_hours ? <div>Horómetro: {r.last_performed_hours} hrs</div> : null}
        {r.last_performed_date ? <div>Fecha: {dayjs(r.last_performed_date).format('DD/MM/YYYY')}</div> : <div>Sin registro</div>}
      </div>
    )},
    { title: 'Acciones', key: 'actions', width: 100, render: (_, r) => (
      <Space>
        <Button size="small" type="text" icon={<EditOutlined/>} onClick={() => handleEditClick(r)} />
        <Popconfirm title="¿Eliminar rutina?" onConfirm={() => handleDelete(r.id)}>
           <Button size="small" type="text" danger icon={<DeleteOutlined/>} />
        </Popconfirm>
      </Space>
    )}
  ];

  return (
    <Drawer title={<Space><ScheduleOutlined /> Rutinas de Mantenimiento — {equipment?.name}</Space>} 
      open={open} onClose={onClose} width={750} destroyOnClose>
       <Card size="small" style={{ marginBottom: 16, background: '#f9f9f9', borderRadius: 8 }}>
         <Form form={form} layout="vertical" onFinish={handleSave}>
            <Row gutter={12}>
               <Col span={10}>
                  <Form.Item name="name" label="Nombre de la rutina" rules={[{required:true}]}><Input placeholder="ej. Cambio de aceite"/></Form.Item>
               </Col>
               <Col span={7}>
                  <Form.Item name="interval_hours" label="Cada (horas)"><InputNumber style={{width:'100%'}} step={50} min={0}/></Form.Item>
               </Col>
               <Col span={7}>
                  <Form.Item name="interval_months" label="Cada (meses)"><InputNumber style={{width:'100%'}} step={1} min={0}/></Form.Item>
               </Col>
            </Row>
            <Form.Item name="description" label="Descripción / Tareas (Opcional)"><Input.TextArea rows={2} /></Form.Item>
            
            <Divider style={{ margin: '12px 0' }} orientation="left" plain>Insumos / Refacciones Requeridas</Divider>
            <Form.List name="parts">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                      <Form.Item {...restField} name={[name, 'inventory_item_id']} rules={[{ required: true, message: 'Requerido' }]}>
                        <Select placeholder="Seleccionar ítem" style={{ width: 350 }} showSearch optionFilterProp="label"
                          options={partsOptions} />
                      </Form.Item>
                      <Form.Item {...restField} name={[name, 'quantity_required']} rules={[{ required: true, message: 'Requerido' }]}>
                        <InputNumber placeholder="Cantidad" min={0.1} step={1} />
                      </Form.Item>
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                    </Space>
                  ))}
                  <Form.Item>
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      Agregar Insumo Requerido
                    </Button>
                  </Form.Item>
                </>
              )}
            </Form.List>

            <Divider style={{ margin: '12px 0' }} orientation="left" plain>Herramientas Requeridas</Divider>
            <Form.List name="tools">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                      <Form.Item {...restField} name={[name, 'inventory_item_id']} rules={[{ required: true, message: 'Requerido' }]}>
                        <Select placeholder="Seleccionar herramienta" style={{ width: 454 }} showSearch optionFilterProp="label"
                          options={toolsOptions} />
                      </Form.Item>
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                    </Space>
                  ))}
                  <Form.Item>
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      Agregar Herramienta Requerida
                    </Button>
                  </Form.Item>
                </>
              )}
            </Form.List>

            <Space>
               <Button type="primary" htmlType="submit" loading={saving} icon={editingId ? <EditOutlined/> : <PlusOutlined/>}>
                 {editingId ? 'Actualizar Rutina' : 'Agregar Rutina'}
               </Button>
               {editingId && <Button onClick={() => { setEditingId(null); form.resetFields(); }}>Cancelar</Button>}
            </Space>
         </Form>
       </Card>
       <Table columns={columns} dataSource={routines} rowKey="id" pagination={false} loading={loading} size="small" />
    </Drawer>
  );
}

function EquipmentPage() {
  const [equipment, setEquipment] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [summary, setSummary] = useState({ operativo: 0, mantenimiento: 0, reparacion: 0, fuera_servicio: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });
  const [search, setSearch] = useState('');
  const [filterVessel, setFilterVessel] = useState(null);
  const [filterCategory, setFilterCategory] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [routinesEq, setRoutinesEq] = useState(null);
  const [editingEq, setEditingEq] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const normFile = (e) => {
    if (Array.isArray(e)) return e;
    return e?.fileList;
  };

  const fetchEquipment = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (pagination.current - 1) * pagination.pageSize;
      const params = { skip, limit: pagination.pageSize };
      if (search) params.search = search;
      if (filterVessel) params.vessel_id = filterVessel;
      if (filterCategory) params.category = filterCategory;
      
      const response = await apiClient.get('/equipment', { params });
      setEquipment(response.data.items);
      setTotal(response.data.total);
    } catch { message.error('Error al cargar equipos'); }
    finally { setLoading(false); }
  }, [pagination, search, filterVessel, filterCategory]);

  const fetchVessels = useCallback(async () => {
    try {
      const r = await apiClient.get('/vessels/options');
      setVessels(r.data);
    } catch { /* silently */ }
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const r = await apiClient.get('/equipment/summary', {
        params: filterVessel ? { vessel_id: filterVessel } : {},
      });
      setSummary(r.data);
    } catch { /* silently */ }
  }, [filterVessel]);

  useEffect(() => { fetchEquipment(); }, [fetchEquipment]);
  useEffect(() => { fetchVessels(); fetchSummary(); }, [fetchVessels, fetchSummary]);

  const openCreate = () => {
    setEditingEq(null);
    form.resetFields();
    form.setFieldsValue({ category: 'motor_principal', status: 'operativo', hour_meter: 0 });
    setModalOpen(true);
  };

  const openEdit = (eq) => {
    setEditingEq(eq);
    form.resetFields();
    form.setFieldsValue(eq);
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const fileObj = values.file?.[0]?.originFileObj;
      const payload = { ...values };
      delete payload.file;

      setSaving(true);
      let eqId = editingEq?.id;
      if (editingEq) {
        await apiClient.put(`/equipment/${eqId}`, payload);
      } else {
        const res = await apiClient.post('/equipment', payload);
        eqId = res.data.id;
      }

      if (fileObj) {
        const formData = new FormData();
        formData.append('file', fileObj);
        await apiClient.post(`/equipment/${eqId}/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      }

      message.success(editingEq ? 'Equipo actualizado' : 'Equipo registrado');
      setModalOpen(false);
      fetchEquipment();
      fetchSummary();
    } catch (err) {
      if (err.response?.data?.detail) message.error(err.response.data.detail);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/equipment/${id}`);
      message.success('Equipo eliminado');
      fetchEquipment(); fetchSummary();
    } catch (err) { message.error(err.response?.data?.detail || 'Error al eliminar'); }
  };

  const columns = [
    {
      title: 'Equipo / Sistema',
      key: 'name',
      render: (_, r) => (
        <Space>
          <SettingOutlined style={{ color: CATEGORY_MAP[r.category]?.color, fontSize: 18 }} />
          <div>
            <Text strong style={{ fontSize: 13 }}>{r.name}</Text>
            {r.brand && <><br /><Text type="secondary" style={{ fontSize: 12 }}>{r.brand} {r.model ? `- ${r.model}` : ''}</Text></>}
          </div>
        </Space>
      ),
    },
    {
      title: 'Embarcación',
      key: 'vessel',
      render: (_, r) => <Text>{r.vessel?.name}</Text>,
      width: 140,
    },
    {
      title: 'Categoría',
      dataIndex: 'category',
      width: 150,
      render: (cat) => <Tag color={CATEGORY_MAP[cat]?.color}>{CATEGORY_MAP[cat]?.label}</Tag>,
    },
    {
      title: 'No. Serie',
      dataIndex: 'serial_number',
      width: 130,
      render: (sn) => sn ? <Text copyable>{sn}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Estado',
      key: 'status',
      width: 140,
      render: (_, r) => {
        const v = STATUS_MAP[r.status] || STATUS_MAP.operativo;
        return <Badge status={v.badge} text={v.label} />;
      },
    },
    {
      title: 'Horómetro',
      key: 'hours',
      width: 120,
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          <strong>{r.hour_meter?.toFixed(1) || 0}</strong> hrs
        </div>
      ),
    },
    {
      title: 'Acciones', key: 'actions', width: 140,
      render: (_, r) => (
        <Space>
          {r.manual_file_path && (
            <Tooltip title="Ver manual PDF">
              <Button type="text" icon={<FilePdfOutlined style={{ color: '#E74C3C', fontSize: 16 }} />} onClick={() => setPreviewFile({ title: r.name, file_path: r.manual_file_path })} />
            </Tooltip>
          )}
          <CanAccess module="equipment" action="edit">
            <Tooltip title="Rutinas de Mantenimiento">
              <Button type="text" icon={<ScheduleOutlined style={{ color: '#2980B9' }} />} onClick={() => setRoutinesEq(r)} />
            </Tooltip>
            <Tooltip title="Editar equipo"><Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          </CanAccess>
          <CanAccess module="equipment" action="delete">
            <Popconfirm title="¿Eliminar equipo?" onConfirm={() => handleDelete(r.id)}>
              <Tooltip title="Eliminar"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>
          </CanAccess>
        </Space>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      {/* Resumen */}
      <Row gutter={12} style={{ marginBottom: 20 }}>
        {[
          { key: 'operativo',      label: 'Operativos',      color: '#52C41A', bg: '#f6ffed' },
          { key: 'mantenimiento',  label: 'Mantenimiento',   color: '#1677FF', bg: '#e6f4ff' },
          { key: 'reparacion',     label: 'En Reparación',   color: '#FAAD14', bg: '#fffbe6' },
          { key: 'fuera_servicio', label: 'Fuera de Serv.',  color: '#FF4D4F', bg: '#fff2f0' },
        ].map(({ key, label, color, bg }) => (
          <Col xs={12} md={6} key={key}>
            <Card size="small" style={{ borderRadius: 10, borderLeft: `3px solid ${color}`, background: bg }}>
              <Statistic title={label} value={summary[key] || 0} valueStyle={{ color, fontSize: 22 }} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ color: '#0A2647', margin: 0 }}>⚙️ Equipos y Sistemas</Title>
          <Text type="secondary">{total} equipos registrados</Text>
        </Col>
        <Col>
          <Space wrap>
            <Search placeholder="Buscar equipo, serie..." allowClear onSearch={(v) => { setSearch(v); setPagination({ ...pagination, current: 1 }); }} style={{ width: 220 }} />
            <Select placeholder="Embarcación" allowClear style={{ width: 160 }} onChange={(v) => { setFilterVessel(v); setPagination({ ...pagination, current: 1 }); }}
              options={vessels.map((v) => ({ value: v.id, label: v.name }))} />
            <Select placeholder="Categoría" allowClear style={{ width: 160 }} onChange={(v) => { setFilterCategory(v); setPagination({ ...pagination, current: 1 }); }}
              options={Object.entries(CATEGORY_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
            <Button icon={<ReloadOutlined />} onClick={() => { fetchEquipment(); fetchSummary(); }} />
            <CanAccess module="equipment" action="create">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo Equipo</Button>
            </CanAccess>
          </Space>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Table columns={columns} dataSource={equipment} rowKey="id" loading={loading}
          pagination={{ current: pagination.current, pageSize: pagination.pageSize, total, showSizeChanger: true, showTotal: (t) => `${t} equipos`, onChange: (p, s) => setPagination({ current: p, pageSize: s }) }} />
      </Card>

      {/* Modal crear/editar */}
      <Modal title={editingEq ? `Editar Equipo: ${editingEq.name}` : 'Registrar Nuevo Equipo'}
        open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSave}
        confirmLoading={saving} okText={editingEq ? 'Guardar Cambios' : 'Registrar'} destroyOnClose width={750}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            {!editingEq && (
              <Col span={8}>
                <Form.Item name="vessel_id" label="Embarcación" rules={[{ required: true, message: 'Requerido' }]}>
                  <Select placeholder="Seleccionar" options={vessels.map((v) => ({ value: v.id, label: v.name }))} />
                </Form.Item>
              </Col>
            )}
            <Col span={editingEq ? 16 : 8}>
              <Form.Item name="name" label="Nombre del equipo" rules={[{ required: true, message: 'Requerido' }]}>
                <Input placeholder="ej: Motor Principal Babor" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="category" label="Categoría" rules={[{ required: true }]}>
                <Select options={Object.entries(CATEGORY_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="brand" label="Marca / Fabricante"><Input placeholder="ej: Caterpillar" /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="model" label="Modelo"><Input placeholder="ej: C32" /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="serial_number" label="Número de Serie"><Input placeholder="S/N" /></Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }} />

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="hour_meter" label="Horómetro Actual (hrs)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} step={10} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="Estado Operativo">
                <Select options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="year_installed" label="Año Fab/Instalación">
                <InputNumber style={{ width: '100%' }} min={1950} max={2050} placeholder="YYYY" />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="location" label="Ubicación a bordo">
                <Input placeholder="ej: Cuarto de máquinas babor" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="characteristics" label="Características Técnicas">
                <TextArea rows={3} placeholder="Voltaje, HP, RPM, capacidad, etc." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="description" label="Descripción General">
                <TextArea rows={3} placeholder="Función del equipo..." />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="file" label="Manual del Equipo (PDF)" valuePropName="fileList" getValueFromEvent={normFile}>
            <Upload beforeUpload={() => false} maxCount={1} accept=".pdf">
              <Button icon={<UploadOutlined />}>Subir Manual</Button>
            </Upload>
          </Form.Item>
          {editingEq?.manual_file_path && (
            <div style={{ fontSize: 12, color: '#666', marginTop: -15, marginBottom: 15 }}>
              Este equipo ya tiene un manual. Al subir uno nuevo se reemplazará el anterior.
            </div>
          )}
        </Form>
      </Modal>

      {/* Visor de PDF Modal */}
      <Modal 
        title={`Manual: ${previewFile?.title}`} 
        open={!!previewFile} 
        onCancel={() => setPreviewFile(null)} 
        footer={null} 
        width="96%" 
        destroyOnClose 
        style={{ top: 10, paddingBottom: 0, margin: 0, maxWidth: '100%' }}
        styles={{ body: { padding: 0, height: '88vh', overflow: 'hidden' } }}
      >
        {previewFile?.file_path && (
          <iframe src={previewFile.file_path} width="100%" height="100%" style={{ border: 'none', display: 'block' }} title="Manual PDF" />
        )}
      </Modal>

      {/* Drawer de Rutinas */}
      <EquipmentRoutinesDrawer equipment={routinesEq} open={!!routinesEq} onClose={() => setRoutinesEq(null)} />
    </div>
  );
}

export default EquipmentPage;
