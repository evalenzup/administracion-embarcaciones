/**
 * SIAE — Página de Inventario.
 * Gestión de insumos con control de stock y movimientos.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, InputNumber,
  Typography, Card, message, Popconfirm, Tooltip, Row, Col, Statistic,
  Drawer, Descriptions, Timeline, Badge, Divider,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  ArrowUpOutlined, ArrowDownOutlined, SwapOutlined, HistoryOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { CanAccess } from '../../components/common/CanAccess';

const { Title, Text } = Typography;
const { Search, TextArea } = Input;

const CATEGORY_MAP = {
  lubricante:  { label: 'Lubricante',   color: '#E67E22' },
  filtro:      { label: 'Filtro',       color: '#2980B9' },
  herramienta: { label: 'Herramienta',  color: '#8E44AD' },
  repuesto:    { label: 'Repuesto',     color: '#E74C3C' },
  electronico: { label: 'Electrónico',  color: '#1ABC9C' },
  seguridad:   { label: 'Seguridad',    color: '#F39C12' },
  limpieza:    { label: 'Limpieza',     color: '#27AE60' },
  combustible: { label: 'Combustible',  color: '#C0392B' },
  consumible:  { label: 'Consumible',   color: '#7F8C8D' },
  otro:        { label: 'Otro',         color: '#95A5A6' },
};

const UNIT_OPTIONS = [
  { value: 'litro', label: 'Litros' }, { value: 'galon', label: 'Galones' },
  { value: 'kg', label: 'Kilogramos' }, { value: 'gramo', label: 'Gramos' },
  { value: 'pieza', label: 'Piezas' }, { value: 'caja', label: 'Cajas' },
  { value: 'rollo', label: 'Rollos' }, { value: 'metro', label: 'Metros' },
  { value: 'juego', label: 'Juegos' }, { value: 'otro', label: 'Otro' },
];

const STOCK_STATUS = {
  ok:      { label: 'OK',      badge: 'success', color: '#52C41A' },
  bajo:    { label: 'Bajo',    badge: 'warning', color: '#FAAD14' },
  agotado: { label: 'Agotado', badge: 'error',   color: '#F5222D' },
};

// ── Modal de Movimiento ──────────────────────────────────────
function MovementModal({ item, open, onClose, onSuccess }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const movType = Form.useWatch('movement_type', form);

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await apiClient.post(`/inventory/${item.id}/movements`, values);
      message.success('Movimiento registrado');
      form.resetFields();
      onSuccess();
      onClose();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al registrar');
    } finally { setSaving(false); }
  };

  const icons = { entrada: <ArrowUpOutlined style={{ color: '#52C41A' }} />, salida: <ArrowDownOutlined style={{ color: '#E74C3C' }} />, ajuste: <SwapOutlined style={{ color: '#1677FF' }} /> };

  return (
    <Modal title={<Space>{icons[movType] || <SwapOutlined />} Movimiento de Stock — {item?.name}</Space>}
      open={open} onCancel={onClose} onOk={handleSave} confirmLoading={saving}
      okText="Registrar" destroyOnClose width={420}>
      <Divider>
        <Text type="secondary">Stock actual: <Text strong>{item?.quantity} {item?.unit}</Text></Text>
      </Divider>
      <Form form={form} layout="vertical" initialValues={{ movement_type: 'entrada' }}>
        <Form.Item name="movement_type" label="Tipo de movimiento" rules={[{ required: true }]}>
          <Select options={[
            { value: 'entrada', label: '⬆️ Entrada (agrega stock)' },
            { value: 'salida',  label: '⬇️ Salida (reduce stock)' },
            { value: 'ajuste', label: '🔄 Ajuste (establece cantidad)' },
          ]} />
        </Form.Item>
        <Form.Item name="quantity" label={movType === 'ajuste' ? 'Nueva cantidad' : 'Cantidad'} rules={[{ required: true }, { type: 'number', min: 0.0001 }]}>
          <InputNumber style={{ width: '100%' }} min={0.0001} step={0.5} />
        </Form.Item>
        <Form.Item name="reason" label="Motivo">
          <Input placeholder="ej: Cambio de aceite motor, Compra de materiales..." />
        </Form.Item>
        <Form.Item name="reference" label="Referencia">
          <Input placeholder="ej: Factura #, Orden de compra..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Drawer de historial ──────────────────────────────────────
function HistoryDrawer({ item, open, onClose }) {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && item) {
      setLoading(true);
      apiClient.get(`/inventory/${item.id}/movements`)
        .then(r => setMovements(r.data.items))
        .finally(() => setLoading(false));
    }
  }, [open, item]);

  const movColor = { entrada: '#52C41A', salida: '#E74C3C', ajuste: '#1677FF' };
  const movIcon = { entrada: '⬆️', salida: '⬇️', ajuste: '🔄' };

  return (
    <Drawer title={<Space><HistoryOutlined /> Historial — {item?.name}</Space>}
      open={open} onClose={onClose} width={440}>
      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Cargando...</div> : (
        movements.length === 0 ? <Text type="secondary">Sin movimientos registrados</Text> : (
          <Timeline items={movements.map(m => ({
            color: movColor[m.movement_type],
            children: (
              <div key={m.id}>
                <Space>
                  <Tag color={movColor[m.movement_type]}>{movIcon[m.movement_type]} {m.movement_type}</Tag>
                  <Text strong>{m.quantity_before} → {m.quantity_after}</Text>
                </Space>
                {m.reason && <><br /><Text type="secondary" style={{ fontSize: 12 }}>{m.reason}</Text></>}
                {m.reference && <><br /><Text type="secondary" style={{ fontSize: 11 }}>Ref: {m.reference}</Text></>}
                <br /><Text type="secondary" style={{ fontSize: 11 }}>{m.user?.full_name} · {dayjs(m.created_at).format('DD/MM/YYYY HH:mm')}</Text>
              </div>
            ),
          }))} />
        )
      )}
    </Drawer>
  );
}

// ── Página principal ──────────────────────────────────────────
function InventoryPage() {
  const [items, setItems] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [equipments, setEquipments] = useState([]);
  const [summary, setSummary] = useState({ ok: 0, bajo: 0, agotado: 0, total: 0, valor_total: 0 });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });
  const [search, setSearch] = useState('');
  const [filterVessel, setFilterVessel] = useState(null);
  const [filterCategory, setFilterCategory] = useState(null);
  const [filterStock, setFilterStock] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [movementItem, setMovementItem] = useState(null);
  const [historyItem, setHistoryItem] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (pagination.current - 1) * pagination.pageSize;
      const params = { skip, limit: pagination.pageSize };
      if (search) params.search = search;
      if (filterVessel) params.vessel_id = filterVessel;
      if (filterCategory) params.category = filterCategory;
      if (filterStock) params.stock_status = filterStock;
      const r = await apiClient.get('/inventory', { params });
      setItems(r.data.items);
      setTotal(r.data.total);
    } catch { message.error('Error al cargar inventario'); }
    finally { setLoading(false); }
  }, [pagination, search, filterVessel, filterCategory, filterStock]);

  const fetchMeta = useCallback(async () => {
    try {
      const [vr, sr, eqr] = await Promise.all([
        apiClient.get('/vessels/options'),
        apiClient.get('/inventory/summary', { params: filterVessel ? { vessel_id: filterVessel } : {} }),
        apiClient.get('/equipment/options', { params: filterVessel ? { vessel_id: filterVessel } : {} }),
      ]);
      setVessels(vr.data);
      setSummary(sr.data);
      setEquipments(eqr.data);
      const mr = await apiClient.get('/maintenance/categories');
      setCategories(mr.data.items);
    } catch { /* */ }
  }, [filterVessel]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  const openCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ category: 'consumible', unit: 'pieza', quantity: 0, min_quantity: 0 });
    setModalOpen(true);
  };

  const openEdit = (item) => { setEditingItem(item); form.setFieldsValue(item); setModalOpen(true); };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editingItem) {
        await apiClient.put(`/inventory/${editingItem.id}`, values);
        message.success('Ítem actualizado');
      } else {
        await apiClient.post('/inventory', values);
        message.success('Ítem creado');
      }
      setModalOpen(false);
      fetchItems(); fetchMeta();
    } catch (err) { message.error(err.response?.data?.detail || 'Error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    await apiClient.delete(`/inventory/${id}`);
    message.success('Ítem eliminado');
    fetchItems(); fetchMeta();
  };

  const columns = [
    {
      title: 'Ítem',
      key: 'name',
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{r.name}</Text>
          {r.part_number && <><br /><Text type="secondary" style={{ fontSize: 11 }}>P/N: {r.part_number}</Text></>}
          {r.equipment ? (
            <><br /><Text type="secondary" style={{ fontSize: 11 }}>⚙️ {r.equipment.name}</Text></>
          ) : r.linked_system ? (
            <><br /><Text type="secondary" style={{ fontSize: 11 }}>🔗 {r.linked_system}</Text></>
          ) : null}
        </div>
      ),
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      defaultSortOrder: 'ascend',
    },
    { 
      title: 'Embarcación', 
      key: 'vessel', 
      width: 140, 
      render: (_, r) => <Text>{r.vessel?.name}</Text>,
      sorter: (a, b) => (a.vessel?.name || '').localeCompare(b.vessel?.name || ''),
    },
    {
      title: 'Categoría', dataIndex: 'category', width: 120,
      render: (c) => <Tag color={CATEGORY_MAP[c]?.color}>{CATEGORY_MAP[c]?.label}</Tag>,
      sorter: (a, b) => (a.category || '').localeCompare(b.category || ''),
    },
    {
      title: 'Stock', key: 'stock', width: 120,
      render: (_, r) => (
        <div>
          <Text strong style={{ color: STOCK_STATUS[r.stock_status]?.color, fontSize: 15 }}>
            {r.quantity}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}> {r.unit}</Text>
          <br />
          <Badge status={STOCK_STATUS[r.stock_status]?.badge} text={STOCK_STATUS[r.stock_status]?.label} />
        </div>
      ),
      sorter: (a, b) => (a.quantity || 0) - (b.quantity || 0),
    },
    {
      title: 'Mínimo', dataIndex: 'min_quantity', width: 80,
      render: (v, r) => <Text type="secondary">{v} {r.unit}</Text>,
      sorter: (a, b) => (a.min_quantity || 0) - (b.min_quantity || 0),
    },
    { 
      title: 'Ubicación', 
      dataIndex: 'location', 
      width: 140, 
      render: (v) => v || '—',
      sorter: (a, b) => (a.location || '').localeCompare(b.location || ''),
    },
    {
      title: 'Acciones', key: 'actions', width: 140,
      render: (_, r) => (
        <Space>
          <CanAccess module="inventory" action="edit">
            <Tooltip title="Movimiento de stock">
              <Button type="text" icon={<SwapOutlined />} style={{ color: '#1677FF' }} onClick={() => setMovementItem(r)} />
            </Tooltip>
          </CanAccess>
          <Tooltip title="Historial">
            <Button type="text" icon={<HistoryOutlined />} onClick={() => setHistoryItem(r)} />
          </Tooltip>
          <CanAccess module="inventory" action="edit">
            <Tooltip title="Editar"><Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          </CanAccess>
          <CanAccess module="inventory" action="delete">
            <Popconfirm title="¿Eliminar ítem?" onConfirm={() => handleDelete(r.id)}>
              <Tooltip title="Eliminar"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>
          </CanAccess>
        </Space>
      ),
    },
  ];

  const rowClassName = (r) => r.stock_status === 'agotado' ? 'row-danger' : r.stock_status === 'bajo' ? 'row-warning' : '';

  return (
    <div className="animate-fade-in">
      {/* Summary cards */}
      <Row gutter={12} style={{ marginBottom: 20 }}>
        {[
          { key: 'ok',      label: 'Stock OK',      color: '#52C41A', bg: '#f6ffed' },
          { key: 'bajo',    label: 'Stock Bajo',    color: '#FAAD14', bg: '#fffbf0' },
          { key: 'agotado', label: 'Agotado',       color: '#F5222D', bg: '#fff1f0' },
          { key: 'valor_total', label: 'Valor Total (ref.)', color: '#1677FF', bg: '#f0f5ff', prefix: '$' },
        ].map(({ key, label, color, bg, prefix }) => (
          <Col xs={12} md={6} key={key}>
            <Card size="small" style={{ borderRadius: 10, borderLeft: `3px solid ${color}`, background: bg,
              cursor: ['ok','bajo','agotado'].includes(key) ? 'pointer' : 'default' }}
              onClick={() => { if (['ok','bajo','agotado'].includes(key)) { setFilterStock(filterStock === key ? null : key); setPagination({...pagination, current: 1}); } }}>
              <Statistic title={label} value={summary[key] ?? 0} valueStyle={{ color, fontSize: 20 }}
                prefix={prefix} precision={key === 'valor_total' ? 2 : 0} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Title level={3} style={{ color: '#0A2647', margin: 0 }}>📦 Inventario</Title>
          <Text type="secondary">{total} ítems</Text>
        </Col>
        <Col>
          <Space wrap>
            <Search placeholder="Buscar ítem..." allowClear onSearch={(v) => { setSearch(v); setPagination({...pagination, current: 1}); }} style={{ width: 180 }} />
            <Select placeholder="Embarcación" allowClear style={{ width: 160 }}
              onChange={(v) => { setFilterVessel(v); setPagination({...pagination, current: 1}); }}
              options={vessels.map(v => ({ value: v.id, label: v.name }))} />
            <Select placeholder="Categoría" allowClear style={{ width: 140 }}
              onChange={(v) => { setFilterCategory(v); setPagination({...pagination, current: 1}); }}
              options={Object.entries(CATEGORY_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
            <Button icon={<ReloadOutlined />} onClick={() => { fetchItems(); fetchMeta(); }} />
            <CanAccess module="inventory" action="create">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo Ítem</Button>
            </CanAccess>
          </Space>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <style>{`.row-danger td{background:#fff1f0!important}.row-warning td{background:#fffbf0!important}`}</style>
        <Table columns={columns} dataSource={items} rowKey="id" loading={loading} rowClassName={rowClassName}
          pagination={{ current: pagination.current, pageSize: pagination.pageSize, total, showSizeChanger: true,
            showTotal: (t) => `${t} ítems`, onChange: (p, s) => setPagination({ current: p, pageSize: s }) }} />
      </Card>

      {/* Modal crear/editar */}
      <Modal title={editingItem ? `Editar: ${editingItem.name}` : 'Nuevo Ítem de Inventario'}
        open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSave}
        confirmLoading={saving} okText={editingItem ? 'Guardar' : 'Crear'} destroyOnClose width={640}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="vessel_id" label="Embarcación" rules={[{ required: true }]}>
            <Select placeholder="Seleccionar embarcación" options={vessels.map(v => ({ value: v.id, label: v.name }))} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={16}><Form.Item name="name" label="Nombre del ítem" rules={[{ required: true }]}><Input placeholder="ej: Aceite Motor SAE 40" /></Form.Item></Col>
            <Col span={8}><Form.Item name="part_number" label="No. de Parte"><Input placeholder="P/N" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="category" label="Categoría" rules={[{ required: true }]}>
                <Select options={Object.entries(CATEGORY_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unit" label="Unidad de medida" rules={[{ required: true }]}>
                <Select options={UNIT_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="quantity" label="Cantidad inicial"><InputNumber style={{ width: '100%' }} min={0} step={1} /></Form.Item></Col>
            <Col span={8}><Form.Item name="min_quantity" label="Mínimo (alerta)"><InputNumber style={{ width: '100%' }} min={0} step={1} /></Form.Item></Col>
            <Col span={8}><Form.Item name="max_quantity" label="Máximo"><InputNumber style={{ width: '100%' }} min={0} step={1} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="location" label="Ubicación a bordo"><Input placeholder="ej: Bodega principal, Sala de máquinas" /></Form.Item></Col>
            <Col span={12}><Form.Item name="unit_cost" label="Costo unitario ($)"><InputNumber style={{ width: '100%' }} min={0} step={10} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="equipment_id" label="Equipo / Sistema asociado">
                <Select allowClear placeholder="Seleccionar equipo (recomendado)"
                  options={equipments.map(e => ({ value: e.id, label: e.name }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="maintenance_category_id" label="Categoría de Mantenimiento (opcional)">
                <Select allowClear placeholder="Sin vínculo"
                  options={categories.map(c => ({ value: c.id, label: `${c.icon || ''} ${c.name}` }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="linked_system" label="Sub-componente (opcional)">
            <Input placeholder="Si aplica, indica la parte exacta (ej. Inyector #3, Válvula)" />
          </Form.Item>
          <Form.Item name="notes" label="Notas">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal movimiento */}
      <MovementModal item={movementItem} open={!!movementItem}
        onClose={() => setMovementItem(null)} onSuccess={() => { fetchItems(); fetchMeta(); }} />

      {/* Drawer historial */}
      <HistoryDrawer item={historyItem} open={!!historyItem} onClose={() => setHistoryItem(null)} />
    </div>
  );
}

export default InventoryPage;
