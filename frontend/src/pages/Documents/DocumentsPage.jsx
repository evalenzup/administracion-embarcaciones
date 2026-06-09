/**
 * SIAE — Página de Documentación.
 * CRUD de documentos por embarcación con semáforo de vigencia.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker,
  Typography, Card, message, Popconfirm, Tooltip, Row, Col, Badge,
  Switch, Input as AntInput, Statistic, Upload,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  FileTextOutlined, WarningOutlined, CheckCircleOutlined, CloseCircleOutlined,
  UploadOutlined, EyeOutlined, FilePdfOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { CanAccess } from '../../components/common/CanAccess';

const { Title, Text } = Typography;
const { Search } = AntInput;
const { TextArea } = Input;

// ── Configuración de categorías ──────────────────────────────
const CATEGORY_MAP = {
  certificado:  { label: 'Certificado',            color: '#1B4F72' },
  plano:        { label: 'Plano',                  color: '#8E44AD' },
  permiso:      { label: 'Permiso',                color: '#E67E22' },
  poliza:       { label: 'Póliza',                 color: '#27AE60' },
  licencia:     { label: 'Licencia',               color: '#2980B9' },
  inspeccion:   { label: 'Inspección',             color: '#E74C3C' },
  manual:       { label: 'Manual',                 color: '#7F8C8D' },
  otro:         { label: 'Otro',                   color: '#95A5A6' },
};

// Semáforo de vigencia
const VIGENCY_MAP = {
  vigente:      { label: 'Vigente',       color: 'success',   icon: <CheckCircleOutlined /> },
  por_vencer:   { label: 'Por Vencer',    color: 'warning',   icon: <WarningOutlined /> },
  vencido:      { label: 'Vencido',       color: 'error',     icon: <CloseCircleOutlined /> },
  sin_vigencia: { label: 'Sin Vigencia',  color: 'default',   icon: <FileTextOutlined /> },
};

function DocumentsPage() {
  const [docs, setDocs] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [summary, setSummary] = useState({ vigente: 0, por_vencer: 0, vencido: 0, sin_vigencia: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });
  const [search, setSearch] = useState('');
  const [filterVessel, setFilterVessel] = useState(null);
  const [filterCategory, setFilterCategory] = useState(null);
  const [filterVigency, setFilterVigency] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isPermanent = Form.useWatch('is_permanent', form);

  const normFile = (e) => {
    if (Array.isArray(e)) return e;
    return e?.fileList;
  };

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (pagination.current - 1) * pagination.pageSize;
      const params = { skip, limit: pagination.pageSize };
      if (search) params.search = search;
      if (filterVessel) params.vessel_id = filterVessel;
      if (filterCategory) params.category = filterCategory;
      if (filterVigency) params.vigency = filterVigency;
      const response = await apiClient.get('/documents', { params });
      setDocs(response.data.items);
      setTotal(response.data.total);
    } catch { message.error('Error al cargar documentos'); }
    finally { setLoading(false); }
  }, [pagination, search, filterVessel, filterCategory, filterVigency]);

  const fetchVessels = useCallback(async () => {
    try {
      const r = await apiClient.get('/vessels/options');
      setVessels(r.data);
    } catch { /* silently */ }
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const r = await apiClient.get('/documents/summary', {
        params: filterVessel ? { vessel_id: filterVessel } : {},
      });
      setSummary(r.data);
    } catch { /* silently */ }
  }, [filterVessel]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);
  useEffect(() => { fetchVessels(); fetchSummary(); }, [fetchVessels, fetchSummary]);

  const openCreate = () => {
    setEditingDoc(null);
    form.resetFields();
    form.setFieldsValue({ category: 'certificado', is_permanent: false });
    setModalOpen(true);
  };

  const openEdit = (doc) => {
    setEditingDoc(doc);
    form.resetFields();
    form.setFieldsValue({
      ...doc,
      issue_date: doc.issue_date ? dayjs(doc.issue_date) : null,
      expiry_date: doc.expiry_date ? dayjs(doc.expiry_date) : null,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const fileObj = values.file?.[0]?.originFileObj;
      const payload = {
        ...values,
        issue_date: values.issue_date ? values.issue_date.format('YYYY-MM-DD') : null,
        expiry_date: values.expiry_date ? values.expiry_date.format('YYYY-MM-DD') : null,
      };
      delete payload.file;

      setSaving(true);
      let docId = editingDoc?.id;
      if (editingDoc) {
        await apiClient.put(`/documents/${docId}`, payload);
      } else {
        const res = await apiClient.post('/documents', payload);
        docId = res.data.id;
      }

      // Si hay archivo, subirlo
      if (fileObj) {
        const formData = new FormData();
        formData.append('file', fileObj);
        await apiClient.post(`/documents/${docId}/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      }

      message.success(editingDoc ? 'Documento actualizado' : 'Documento guardado con archivo');
      setModalOpen(false);
      fetchDocs();
      fetchSummary();
    } catch (err) {
      if (err.response?.data?.detail) message.error(err.response.data.detail);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/documents/${id}`);
      message.success('Documento eliminado');
      fetchDocs(); fetchSummary();
    } catch (err) { message.error(err.response?.data?.detail || 'Error al eliminar'); }
  };

  const handleUpload = async (options, documentId) => {
    const { onSuccess, onError, file } = options;
    const formData = new FormData();
    formData.append('file', file);
    try {
      await apiClient.post(`/documents/${documentId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      message.success('Archivo subido correctamente');
      onSuccess('ok');
      fetchDocs();
    } catch (err) {
      message.error('Error al subir el archivo');
      onError(err);
    }
  };

  const columns = [
    {
      title: 'Documento',
      key: 'doc',
      render: (_, r) => (
        <Space>
          <FileTextOutlined style={{ color: CATEGORY_MAP[r.category]?.color, fontSize: 18 }} />
          <div>
            <Text strong style={{ fontSize: 13 }}>
              {r.title}
            </Text>
            {r.document_number && <><br /><Text type="secondary" style={{ fontSize: 12 }}>#{r.document_number}</Text></>}
          </div>
        </Space>
      ),
    },
    {
      title: 'Embarcación',
      key: 'vessel',
      render: (_, r) => <Text>{r.vessel?.name}</Text>,
      width: 160,
    },
    {
      title: 'Categoría',
      dataIndex: 'category',
      width: 130,
      render: (cat) => <Tag color={CATEGORY_MAP[cat]?.color}>{CATEGORY_MAP[cat]?.label}</Tag>,
    },
    {
      title: 'Vigencia',
      key: 'vigency',
      width: 150,
      render: (_, r) => {
        const v = VIGENCY_MAP[r.vigency_status] || VIGENCY_MAP.sin_vigencia;
        return (
          <div>
            <Badge status={v.color} text={v.label} />
            {r.days_to_expiry !== null && r.days_to_expiry !== undefined && (
              <><br />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {r.days_to_expiry >= 0 ? `Vence en ${r.days_to_expiry} días` : `Vencido hace ${Math.abs(r.days_to_expiry)} días`}
                </Text>
              </>
            )}
          </div>
        );
      },
    },
    {
      title: 'Vencimiento',
      dataIndex: 'expiry_date',
      width: 120,
      render: (d, r) => r.is_permanent ? <Tag color="green">Permanente</Tag> : (d ? dayjs(d).format('DD/MM/YYYY') : '—'),
    },
    {
      title: 'Acciones', key: 'actions', width: 140,
      render: (_, r) => (
        <Space>
          {r.file_path && (
            <Tooltip title="Visualizar documento PDF">
              <Button type="text" icon={<FilePdfOutlined style={{ color: '#E74C3C', fontSize: 16 }} />} onClick={() => setPreviewFile(r)} />
            </Tooltip>
          )}
          <CanAccess module="documents" action="edit">
            <Tooltip title="Editar documento"><Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          </CanAccess>
          <CanAccess module="documents" action="delete">
            <Popconfirm title="¿Eliminar documento?" onConfirm={() => handleDelete(r.id)}>
              <Tooltip title="Eliminar"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>
          </CanAccess>
        </Space>
      ),
    },
  ];

  // Colores de fila según vigencia
  const rowClassName = (r) => {
    if (r.vigency_status === 'vencido') return 'row-danger';
    if (r.vigency_status === 'por_vencer') return 'row-warning';
    return '';
  };

  return (
    <div className="animate-fade-in">
      {/* Semáforo de resumen */}
      <Row gutter={12} style={{ marginBottom: 20 }}>
        {[
          { key: 'vigente',      label: 'Vigentes',      color: '#27AE60', bg: '#f0fff4' },
          { key: 'por_vencer',   label: 'Por Vencer',    color: '#E67E22', bg: '#fff8f0' },
          { key: 'vencido',      label: 'Vencidos',      color: '#E74C3C', bg: '#fff0f0' },
          { key: 'sin_vigencia', label: 'Sin Vigencia',  color: '#95A5A6', bg: '#f9f9f9' },
        ].map(({ key, label, color, bg }) => (
          <Col xs={12} md={6} key={key}>
            <Card
              size="small"
              style={{ borderRadius: 10, borderLeft: `3px solid ${color}`, background: bg, cursor: 'pointer' }}
              onClick={() => { setFilterVigency(filterVigency === key ? null : key); setPagination({ ...pagination, current: 1 }); }}
            >
              <Statistic title={label} value={summary[key]} valueStyle={{ color, fontSize: 22 }} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ color: '#0A2647', margin: 0 }}>📋 Documentación</Title>
          <Text type="secondary">{total} documentos {filterVigency ? `(filtro: ${VIGENCY_MAP[filterVigency]?.label})` : ''}</Text>
        </Col>
        <Col>
          <Space wrap>
            <Search placeholder="Buscar documento..." allowClear onSearch={(v) => { setSearch(v); setPagination({ ...pagination, current: 1 }); }} style={{ width: 200 }} />
            <Select placeholder="Embarcación" allowClear style={{ width: 160 }} onChange={(v) => { setFilterVessel(v); setPagination({ ...pagination, current: 1 }); }}
              options={vessels.map((v) => ({ value: v.id, label: v.name }))} />
            <Select placeholder="Categoría" allowClear style={{ width: 140 }} onChange={(v) => { setFilterCategory(v); setPagination({ ...pagination, current: 1 }); }}
              options={Object.entries(CATEGORY_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
            <Button icon={<ReloadOutlined />} onClick={() => { fetchDocs(); fetchSummary(); }} />
            <CanAccess module="documents" action="create">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo Documento</Button>
            </CanAccess>
          </Space>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <style>{`.row-danger td { background: #fff5f5 !important; } .row-warning td { background: #fffbf0 !important; }`}</style>
        <Table columns={columns} dataSource={docs} rowKey="id" loading={loading} rowClassName={rowClassName}
          pagination={{ current: pagination.current, pageSize: pagination.pageSize, total, showSizeChanger: true, showTotal: (t) => `${t} documentos`, onChange: (p, s) => setPagination({ current: p, pageSize: s }) }} />
      </Card>

      {/* Modal crear/editar */}
      <Modal title={editingDoc ? `Editar: ${editingDoc.title}` : 'Nuevo Documento'}
        open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSave}
        confirmLoading={saving} okText={editingDoc ? 'Guardar' : 'Crear'} destroyOnClose width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {!editingDoc && (
            <Form.Item name="vessel_id" label="Embarcación" rules={[{ required: true, message: 'Requerido' }]}>
              <Select placeholder="Seleccionar embarcación" options={vessels.map((v) => ({ value: v.id, label: v.name }))} />
            </Form.Item>
          )}
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="title" label="Título del documento" rules={[{ required: true, message: 'Requerido' }]}>
                <Input placeholder="ej: Certificado de Seguridad" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="category" label="Categoría" rules={[{ required: true }]}>
                <Select options={Object.entries(CATEGORY_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="document_number" label="No. de documento">
                <Input placeholder="ej: SEMAR-2024-001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="issuing_authority" label="Autoridad emisora">
                <Input placeholder="ej: SEMAR, SCT, Capitanía" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="issue_date" label="Fecha de emisión">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Seleccionar fecha" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="expiry_date" label="Fecha de vencimiento">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Seleccionar fecha" disabled={isPermanent} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="is_permanent" label="Documento permanente (sin vencimiento)" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="file" label="Archivo digital (opcional)" valuePropName="fileList" getValueFromEvent={normFile}>
                <Upload beforeUpload={() => false} maxCount={1} accept=".pdf,image/*">
                  <Button icon={<UploadOutlined />}>Seleccionar archivo</Button>
                </Upload>
              </Form.Item>
              {editingDoc?.file_path && (
                <div style={{ fontSize: 12, color: '#666', marginTop: -15, marginBottom: 15 }}>
                  Ya existe un archivo subido. Subir uno nuevo lo reemplazará.
                </div>
              )}
            </Col>
          </Row>
          
          <Form.Item name="notes" label="Notas">
            <TextArea rows={3} placeholder="Observaciones adicionales" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Visor de PDF Modal */}
      <Modal 
        title={`Visualizar: ${previewFile?.title}`} 
        open={!!previewFile} 
        onCancel={() => setPreviewFile(null)} 
        footer={null} 
        width="96%" 
        destroyOnClose 
        style={{ top: 10, paddingBottom: 0, margin: 0, maxWidth: '100%' }}
        styles={{ body: { padding: 0, height: '88vh', overflow: 'hidden' } }}
      >
        {previewFile?.file_path && (
          <iframe 
            src={previewFile.file_path} 
            width="100%" 
            height="100%" 
            style={{ border: 'none', display: 'block' }} 
            title="Visor de Documento" 
          />
        )}
      </Modal>
    </div>
  );
}

export default DocumentsPage;
