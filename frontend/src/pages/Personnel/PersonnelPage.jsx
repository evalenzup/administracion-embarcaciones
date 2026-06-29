/**
 * SIAE — Página de Personal.
 * Gestión del personal con semáforo de documentos (STCW, libreta de mar, cert. médico, pasaporte).
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker,
  Typography, Card, message, Popconfirm, Tooltip, Row, Col, Statistic,
  Badge, Alert, Descriptions, Drawer, Avatar, Upload,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  IdcardOutlined, WarningOutlined, UserOutlined, UploadOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { CanAccess } from '../../components/common/CanAccess';

const { Title, Text } = Typography;
const { Search } = Input;

const ROLE_MAP = {
  capitan:        { label: 'Capitán',          color: '#0A2647' },
  primer_oficial: { label: '1er Oficial',       color: '#1B4F72' },
  jefe_maquinas:  { label: 'Jefe de Máquinas',  color: '#E67E22' },
  marinero:       { label: 'Marinero',          color: '#2980B9' },
  mecanico:       { label: 'Mecánico',          color: '#D35400' },
  electronico:    { label: 'Electrónico',       color: '#8E44AD' },
  investigador:   { label: 'Investigador',      color: '#27AE60' },
  asistente:      { label: 'Asistente',         color: '#16A085' },
  administrativo: { label: 'Administrativo',    color: '#7F8C8D' },
  otro:           { label: 'Otro',              color: '#95A5A6' },
};

const STATUS_MAP = {
  activo:   { label: 'Activo',   badge: 'success' },
  inactivo: { label: 'Inactivo', badge: 'warning' },
  baja:     { label: 'Baja',     badge: 'error'   },
};

function AlertBadge({ alerts }) {
  if (!alerts || alerts.length === 0) return <Badge status="success" text="OK" />;
  const hasExpired = alerts.some(a => a.status === 'vencido');
  return (
    <Tooltip title={alerts.map(a => `${a.doc}: ${a.status === 'vencido' ? 'Vencido' : `Vence en ${a.days}d`}`).join(' | ')}>
      <Badge status={hasExpired ? 'error' : 'warning'}
        text={<Text style={{ fontSize: 11, color: hasExpired ? '#F5222D' : '#FAAD14' }}>
          {hasExpired ? '🔴' : '🟡'} {alerts.length} alerta{alerts.length > 1 ? 's' : ''}
        </Text>} />
    </Tooltip>
  );
}

// ── Drawer de detalle de persona ──────────────────────────────
function PersonDetailDrawer({
  person,
  open,
  onClose,
  onPhotoUpload,
  onIdDocUpload,
  onSeamansBookUpload,
  uploadingPhoto,
  uploadingDoc,
  uploadingSeamansBook
}) {
  if (!person) return null;
  const dateOrDash = (d) => d ? dayjs(d).format('DD/MM/YYYY') : '—';
  const hasExpired = person.document_alerts?.some(a => a.status === 'vencido');

  const photoSrc = person.photo_url || null;
  const photoEl = photoSrc ? (
    <img
      src={photoSrc}
      alt={person.full_name}
      style={{
        width: '120px',
        height: '120px',
        borderRadius: '50%',
        border: '3px solid #0A2647',
        padding: '3px',
        backgroundColor: '#fff',
        objectFit: 'cover',
        cursor: 'pointer',
        boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
        transition: 'transform 0.2s ease',
      }}
      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
    />
  ) : (
    <Avatar size={120} icon={<UserOutlined />}
      style={{
        cursor: 'pointer',
        background: 'linear-gradient(135deg, #0A2647 0%, #1677ff 100%)',
        boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }} />
  );

  return (
    <Drawer
      title={<Space><UserOutlined /> Detalle de Personal</Space>}
      open={open}
      onClose={onClose}
      width={480}
    >
      {/* Sección Foto de Perfil */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
        <CanAccess module="personnel" action="edit" fallback={photoEl}>
          <Upload showUploadList={false} accept=".jpg,.jpeg,.png,.webp" customRequest={onPhotoUpload}>
            <Tooltip title="Subir / cambiar fotografía">
              <div style={{ position: 'relative', cursor: 'pointer' }}>
                {photoEl}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  background: '#1677ff',
                  color: '#fff',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                  border: '2px solid #fff'
                }}>
                  <PlusOutlined style={{ fontSize: 14 }} />
                </div>
              </div>
            </Tooltip>
          </Upload>
        </CanAccess>
        
        <div style={{ marginTop: 8, height: 18 }}>
          {uploadingPhoto && <Text type="secondary" style={{ fontSize: 12 }}>Subiendo fotografía...</Text>}
        </div>

        <Title level={4} style={{ margin: '8px 0 2px 0', color: '#0A2647' }}>{person.full_name}</Title>
        
        <Space style={{ marginTop: 4 }}>
          <Badge status={STATUS_MAP[person.status]?.badge} text={STATUS_MAP[person.status]?.label} />
          <Tag color={ROLE_MAP[person.role]?.color}>{ROLE_MAP[person.role]?.label}</Tag>
        </Space>
      </div>

      {person.document_alerts?.length > 0 && (
        <Alert type={hasExpired ? 'error' : 'warning'} showIcon icon={<WarningOutlined />}
          style={{ margin: '12px 0' }}
          message={`${person.document_alerts.length} documento(s) requieren atención`}
          description={person.document_alerts.map(a =>
            `• ${a.doc}: ${a.status === 'vencido' ? `vencido hace ${Math.abs(a.days)} días` : `vence en ${a.days} días`}`
          ).join('\n')} />
      )}

      <Descriptions column={1} size="small" bordered style={{ marginTop: 12 }}>
        <Descriptions.Item label="No. Empleado">{person.employee_number || '—'}</Descriptions.Item>
        <Descriptions.Item label="Correo">{person.email || '—'}</Descriptions.Item>
        <Descriptions.Item label="Teléfono">{person.phone || '—'}</Descriptions.Item>
        <Descriptions.Item label="Contacto emergencia">{person.emergency_contact || '—'} {person.emergency_phone || ''}</Descriptions.Item>
        <Descriptions.Item label="Fecha ingreso">{dateOrDash(person.hire_date)}</Descriptions.Item>
        <Descriptions.Item label="Tipo de sangre">{person.blood_type || '—'}</Descriptions.Item>
      </Descriptions>

      <Title level={5} style={{ marginTop: 24, marginBottom: 8 }}>🗂️ Vigencias</Title>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Pasaporte">{person.passport_number || '—'} | Vence: {dateOrDash(person.passport_expiry)}</Descriptions.Item>
        <Descriptions.Item label="Libreta de Mar">{person.seamans_book || '—'} | Vence: {dateOrDash(person.seamans_book_expiry)}</Descriptions.Item>
        <Descriptions.Item label="Cert. Médico">Vence: {dateOrDash(person.medical_cert_expiry)}</Descriptions.Item>
        <Descriptions.Item label="STCW">Vence: {dateOrDash(person.stcw_expiry)}</Descriptions.Item>
      </Descriptions>

      {/* Sección Documentos Digitalizados */}
      <Title level={5} style={{ marginTop: 24, marginBottom: 8 }}>📄 Documentos Digitalizados</Title>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Identificación */}
        <Card size="small" style={{ borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <Row justify="space-between" align="middle" wrap={false}>
            <Col flex="auto">
              <Space align="start">
                <FilePdfOutlined style={{ fontSize: 24, color: '#F5222D', marginTop: 2 }} />
                <div>
                  <Text strong style={{ fontSize: 13 }}>Identificación Oficial</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {person.id_document_url ? 'Documento cargado' : 'Sin documento escaneado'}
                  </Text>
                </div>
              </Space>
            </Col>
            <Col flex="none">
              <Space>
                {person.id_document_url && (
                  <Button 
                    size="small" 
                    icon={<UploadOutlined style={{ transform: 'rotate(180deg)' }} />}
                    onClick={() => window.open(person.id_document_url, '_blank')}
                  >
                    Ver
                  </Button>
                )}
                <CanAccess module="personnel" action="edit">
                  <Upload showUploadList={false} accept=".jpg,.jpeg,.png,.pdf" customRequest={onIdDocUpload}>
                    <Button size="small" icon={<PlusOutlined />} loading={uploadingDoc}>
                      {person.id_document_url ? 'Reemplazar' : 'Subir'}
                    </Button>
                  </Upload>
                </CanAccess>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Libreta de mar */}
        <Card size="small" style={{ borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <Row justify="space-between" align="middle" wrap={false}>
            <Col flex="auto">
              <Space align="start">
                <FilePdfOutlined style={{ fontSize: 24, color: '#1890ff', marginTop: 2 }} />
                <div>
                  <Text strong style={{ fontSize: 13 }}>Libreta de Mar</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {person.seamans_book_url ? 'Documento cargado' : 'Sin documento escaneado'}
                  </Text>
                </div>
              </Space>
            </Col>
            <Col flex="none">
              <Space>
                {person.seamans_book_url && (
                  <Button 
                    size="small" 
                    icon={<UploadOutlined style={{ transform: 'rotate(180deg)' }} />}
                    onClick={() => window.open(person.seamans_book_url, '_blank')}
                  >
                    Ver
                  </Button>
                )}
                <CanAccess module="personnel" action="edit">
                  <Upload showUploadList={false} accept=".jpg,.jpeg,.png,.pdf" customRequest={onSeamansBookUpload}>
                    <Button size="small" icon={<PlusOutlined />} loading={uploadingSeamansBook}>
                      {person.seamans_book_url ? 'Reemplazar' : 'Subir'}
                    </Button>
                  </Upload>
                </CanAccess>
              </Space>
            </Col>
          </Row>
        </Card>
      </div>

      {person.system_user && (
        <>
          <Title level={5} style={{ marginTop: 16, marginBottom: 8 }}>🔗 Usuario del sistema</Title>
          <Text code>{person.system_user.username}</Text> — {person.system_user.full_name}
        </>
      )}
      {person.notes && (
        <>
          <Title level={5} style={{ marginTop: 16, marginBottom: 8 }}>📝 Notas</Title>
          <Text>{person.notes}</Text>
        </>
      )}
    </Drawer>
  );
}

// ── Página principal ──────────────────────────────────────────
function PersonnelPage() {
  const [people, setPeople] = useState([]);
  const [systemUsers, setSystemUsers] = useState([]);
  const [summary, setSummary] = useState({ total: 0, activo: 0, con_alertas: 0, vencidos: 0 });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState(null);
  const [filterAlerts, setFilterAlerts] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);
  const [detailPerson, setDetailPerson] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // Estados para archivos temporales en el modal de Crear/Editar
  const [modalPhotoFile, setModalPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [modalIdDocFile, setModalIdDocFile] = useState(null);
  const [modalSeamansBookFile, setModalSeamansBookFile] = useState(null);

  // Estados de carga de subida de archivos
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadingSeamansBook, setUploadingSeamansBook] = useState(false);

  const handlePhotoUpload = async ({ file }) => {
    if (!detailPerson) return;
    const fd = new FormData();
    fd.append('file', file);
    setUploadingPhoto(true);
    try {
      const res = await apiClient.post(`/personnel/${detailPerson.id}/photo`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success('Fotografía actualizada');
      setDetailPerson(res.data);
      fetchPeople();
    } catch {
      message.error('Error al subir fotografía');
    } finally {
      setUploadingPhoto(false);
    }
    return false;
  };

  const handleIdDocUpload = async ({ file }) => {
    if (!detailPerson) return;
    const fd = new FormData();
    fd.append('file', file);
    setUploadingDoc(true);
    try {
      const res = await apiClient.post(`/personnel/${detailPerson.id}/id-document`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success('Identificación oficial actualizada');
      setDetailPerson(res.data);
      fetchPeople();
    } catch {
      message.error('Error al subir identificación oficial');
    } finally {
      setUploadingDoc(false);
    }
    return false;
  };

  const handleSeamansBookUpload = async ({ file }) => {
    if (!detailPerson) return;
    const fd = new FormData();
    fd.append('file', file);
    setUploadingSeamansBook(true);
    try {
      const res = await apiClient.post(`/personnel/${detailPerson.id}/seamans-book`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success('Libreta de Mar actualizada');
      setDetailPerson(res.data);
      fetchPeople();
    } catch {
      message.error('Error al subir Libreta de Mar');
    } finally {
      setUploadingSeamansBook(false);
    }
    return false;
  };

  const fetchPeople = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (pagination.current - 1) * pagination.pageSize;
      const params = { skip, limit: pagination.pageSize };
      if (search) params.search = search;
      if (filterRole) params.role = filterRole;
      if (filterAlerts) params.with_alerts = true;
      const r = await apiClient.get('/personnel', { params });
      setPeople(r.data.items);
      setTotal(r.data.total);
    } catch { message.error('Error al cargar personal'); }
    finally { setLoading(false); }
  }, [pagination, search, filterRole, filterAlerts]);

  const fetchSummary = async () => {
    try {
      const r = await apiClient.get('/personnel/summary');
      setSummary(r.data);
    } catch { /* */ }
  };

  const fetchSystemUsers = async () => {
    try {
      const r = await apiClient.get('/users/options');
      setSystemUsers(r.data || []);
    } catch { /* */ }
  };

  useEffect(() => { fetchPeople(); }, [fetchPeople]);
  useEffect(() => { fetchSummary(); fetchSystemUsers(); }, []);

  const openCreate = () => {
    setEditingPerson(null);
    setModalPhotoFile(null);
    setPhotoPreview(null);
    setModalIdDocFile(null);
    setModalSeamansBookFile(null);
    form.resetFields();
    form.setFieldsValue({ role: 'marinero', status: 'activo', nationality: 'Mexicana' });
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditingPerson(p);
    setModalPhotoFile(null);
    setPhotoPreview(null);
    setModalIdDocFile(null);
    setModalSeamansBookFile(null);
    const vals = { ...p };
    ['hire_date','birth_date','passport_expiry','seamans_book_expiry','medical_cert_expiry','stcw_expiry'].forEach(f => {
      if (vals[f]) vals[f] = dayjs(vals[f]);
    });
    form.setFieldsValue(vals);
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const dateFields = ['hire_date','birth_date','passport_expiry','seamans_book_expiry','medical_cert_expiry','stcw_expiry'];
      dateFields.forEach(f => { if (values[f]) values[f] = values[f].format('YYYY-MM-DD'); });
      setSaving(true);
      
      let savedPerson = null;
      if (editingPerson) {
        const res = await apiClient.put(`/personnel/${editingPerson.id}`, values);
        savedPerson = res.data;
        message.success('Persona actualizada');
      } else {
        const res = await apiClient.post('/personnel', values);
        savedPerson = res.data;
        message.success('Persona registrada');
      }

      // Si hay archivos seleccionados, subirlos usando el ID de la persona
      if (savedPerson && (modalPhotoFile || modalIdDocFile || modalSeamansBookFile)) {
        const pid = savedPerson.id;

        if (modalPhotoFile) {
          const fd = new FormData();
          fd.append('file', modalPhotoFile);
          try {
            await apiClient.post(`/personnel/${pid}/photo`, fd, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
          } catch {
            message.error('Error al subir la fotografía de perfil');
          }
        }

        if (modalIdDocFile) {
          const fd = new FormData();
          fd.append('file', modalIdDocFile);
          try {
            await apiClient.post(`/personnel/${pid}/id-document`, fd, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
          } catch {
            message.error('Error al subir la identificación oficial');
          }
        }

        if (modalSeamansBookFile) {
          const fd = new FormData();
          fd.append('file', modalSeamansBookFile);
          try {
            await apiClient.post(`/personnel/${pid}/seamans-book`, fd, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
          } catch {
            message.error('Error al subir la Libreta de Mar');
          }
        }
      }

      setModalOpen(false);
      fetchPeople(); fetchSummary();
    } catch (err) {
      if (err.response?.data?.detail) message.error(err.response.data.detail);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    await apiClient.delete(`/personnel/${id}`);
    message.success('Registro eliminado');
    fetchPeople(); fetchSummary();
  };

  const columns = [
    {
      title: 'Persona',
      key: 'name',
      render: (_, r) => (
        <Space>
          <Avatar size={36}
            src={r.photo_url || null}
            icon={<UserOutlined />}
            style={{ background: '#0A2647', flexShrink: 0 }}
          />
          <div>
            <Button type="link" style={{ padding: 0, fontWeight: 600 }} onClick={() => setDetailPerson(r)}>
              {r.full_name}
            </Button>
            {r.employee_number && <><br /><Text type="secondary" style={{ fontSize: 11 }}>#{r.employee_number}</Text></>}
          </div>
        </Space>
      ),
      sorter: (a, b) => (a.full_name || '').localeCompare(b.full_name || ''),
      defaultSortOrder: 'ascend',
    },
    {
      title: 'Puesto', dataIndex: 'role', width: 160,
      render: (r) => <Tag color={ROLE_MAP[r]?.color}>{ROLE_MAP[r]?.label}</Tag>,
      sorter: (a, b) => (a.role || '').localeCompare(b.role || ''),
    },
    {
      title: 'Estado', dataIndex: 'status', width: 100,
      render: (s) => <Badge status={STATUS_MAP[s]?.badge} text={STATUS_MAP[s]?.label} />,
      sorter: (a, b) => (a.status || '').localeCompare(b.status || ''),
    },
    { title: 'Email', dataIndex: 'email', width: 200, render: (v) => v || '—' },
    {
      title: 'Documentos', key: 'docs', width: 140,
      render: (_, r) => <AlertBadge alerts={r.document_alerts} />,
    },
    {
      title: 'Ingreso', dataIndex: 'hire_date', width: 110,
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '—',
      sorter: (a, b) => dayjs(a.hire_date || 0).unix() - dayjs(b.hire_date || 0).unix(),
    },
    {
      title: 'Acciones', key: 'actions', width: 110,
      render: (_, r) => (
        <Space>
          <Tooltip title="Ver detalle"><Button type="text" icon={<IdcardOutlined />} onClick={() => setDetailPerson(r)} /></Tooltip>
          <CanAccess module="personnel" action="edit">
            <Tooltip title="Editar"><Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          </CanAccess>
          <CanAccess module="personnel" action="delete">
            <Popconfirm title="¿Eliminar registro?" onConfirm={() => handleDelete(r.id)}>
              <Tooltip title="Eliminar"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>
          </CanAccess>
        </Space>
      ),
    },
  ];

  const rowClassName = (r) =>
    r.document_alerts?.some(a => a.status === 'vencido') ? 'row-danger' :
    r.document_alerts?.length > 0 ? 'row-warning' : '';

  return (
    <div className="animate-fade-in">
      {/* Summary */}
      <Row gutter={12} style={{ marginBottom: 20 }}>
        {[
          { key: 'total',       label: 'Total Personal DEO', color: '#1677FF', bg: '#f0f5ff' },
          { key: 'activo',      label: 'Activos',           color: '#52C41A', bg: '#f6ffed' },
          { key: 'con_alertas', label: 'Con Alertas',       color: '#FAAD14', bg: '#fffbf0', clickable: true },
          { key: 'vencidos',    label: 'Doc. Vencidos',     color: '#F5222D', bg: '#fff1f0', clickable: true },
        ].map(({ key, label, color, bg, clickable }) => (
          <Col xs={12} md={6} key={key}>
            <Card size="small" style={{ borderRadius: 10, borderLeft: `3px solid ${color}`, background: bg, cursor: clickable ? 'pointer' : 'default' }}
              onClick={() => clickable && setFilterAlerts(!filterAlerts)}>
              <Statistic title={label} value={summary[key]} valueStyle={{ color, fontSize: 20 }} />
            </Card>
          </Col>
        ))}
      </Row>
 
      {/* Toolbar */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Title level={3} style={{ color: '#0A2647', margin: 0 }}>👥 Personal DEO</Title>
          <Text type="secondary">{total} registros</Text>
        </Col>
        <Col>
          <Space wrap>
            <Search placeholder="Buscar..." allowClear onSearch={(v) => { setSearch(v); setPagination({...pagination, current: 1}); }} style={{ width: 180 }} />
            <Select placeholder="Puesto" allowClear style={{ width: 160 }}
              onChange={(v) => { setFilterRole(v); setPagination({...pagination, current: 1}); }}
              options={Object.entries(ROLE_MAP).map(([k,v]) => ({ value: k, label: v.label }))} />
            <Button
              type={filterAlerts ? 'primary' : 'default'}
              icon={<WarningOutlined />}
              onClick={() => { setFilterAlerts(!filterAlerts); setPagination({...pagination, current: 1}); }}>
              Solo alertas
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => { fetchPeople(); fetchSummary(); }} />
            <CanAccess module="personnel" action="create">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo Registro</Button>
            </CanAccess>
          </Space>
        </Col>
      </Row>
 
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <style>{`.row-danger td{background:#fff1f0!important}.row-warning td{background:#fffbf0!important}`}</style>
        <Table columns={columns} dataSource={people} rowKey="id" loading={loading} rowClassName={rowClassName}
          pagination={{ current: pagination.current, pageSize: pagination.pageSize, total, showSizeChanger: true,
            showTotal: (t) => `${t} registros`, onChange: (p, s) => setPagination({ current: p, pageSize: s }) }} />
      </Card>
 
      {/* Modal create/edit */}
      <Modal title={editingPerson ? `Editar: ${editingPerson.full_name}` : 'Nuevo Registro de Personal DEO'}
        open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSave}
        confirmLoading={saving} okText={editingPerson ? 'Guardar' : 'Crear'} destroyOnClose width={700}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {/* Fotografía de Rostro Centrada */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
            <Upload
              showUploadList={false}
              accept=".jpg,.jpeg,.png,.webp"
              beforeUpload={(file) => {
                setModalPhotoFile(file);
                const reader = new FileReader();
                reader.onload = (e) => setPhotoPreview(e.target.result);
                reader.readAsDataURL(file);
                return false;
              }}
              onRemove={() => {
                setModalPhotoFile(null);
                setPhotoPreview(null);
              }}
            >
              <Tooltip title="Subir o cambiar fotografía">
                <div style={{ position: 'relative', cursor: 'pointer' }}>
                  {photoPreview || editingPerson?.photo_url ? (
                    <img
                      src={photoPreview || editingPerson.photo_url}
                      alt="Vista previa"
                      style={{
                        width: '110px',
                        height: '110px',
                        borderRadius: '50%',
                        border: '3px solid #0A2647',
                        padding: '3px',
                        backgroundColor: '#fff',
                        objectFit: 'cover',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                        transition: 'transform 0.2s ease',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
                    />
                  ) : (
                    <Avatar
                      size={110}
                      icon={<UserOutlined />}
                      style={{
                        background: 'linear-gradient(135deg, #0A2647 0%, #1677ff 100%)',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    />
                  )}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    background: '#1677ff',
                    color: '#fff',
                    borderRadius: '50%',
                    width: 30,
                    height: 30,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                    border: '2px solid #fff'
                  }}>
                    <PlusOutlined style={{ fontSize: 12 }} />
                  </div>
                </div>
              </Tooltip>
            </Upload>
            <Text type="secondary" style={{ fontSize: 11, marginTop: 8, fontWeight: 500 }}>
              {modalPhotoFile ? 'Nueva fotografía seleccionada' : 'Fotografía del Personal'}
            </Text>
          </div>

          <Row gutter={16}>
            <Col span={12}><Form.Item name="first_name" label="Nombre(s)" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="last_name" label="Apellidos" rules={[{ required: true }]}><Input /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="employee_number" label="No. Empleado"><Input /></Form.Item></Col>
            <Col span={8}>
              <Form.Item name="role" label="Puesto" rules={[{ required: true }]}>
                <Select options={Object.entries(ROLE_MAP).map(([k,v]) => ({ value: k, label: v.label }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="Estado">
                <Select options={Object.entries(STATUS_MAP).map(([k,v]) => ({ value: k, label: v.label }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="email" label="Correo"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="phone" label="Teléfono"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="emergency_contact" label="Contacto de emergencia"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="emergency_phone" label="Tel. emergencia"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="hire_date" label="Fecha ingreso"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col span={8}><Form.Item name="birth_date" label="Fecha nacimiento"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col span={8}><Form.Item name="blood_type" label="Tipo de sangre"><Input placeholder="A+, B-, O+..." /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="curp" label="CURP"><Input maxLength={18} /></Form.Item></Col>
            <Col span={12}><Form.Item name="rfc" label="RFC"><Input maxLength={13} /></Form.Item></Col>
          </Row>

          {/* Documentos */}
          <Card size="small" title="🗂️ Documentos de vigencia y copias digitales" style={{ marginBottom: 12 }}>
            
            {/* Sección: Pasaporte o Identificación */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 4, marginBottom: 12 }}>
                <Text strong style={{ color: '#0A2647', fontSize: 13 }}>
                  🪪 Pasaporte o Identificación
                </Text>
              </div>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="passport_number" label="Número" style={{ marginBottom: 0 }}>
                    <Input placeholder="Ingresar número" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="passport_expiry" label="Vence" style={{ marginBottom: 0 }}>
                    <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Seleccionar fecha" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Documento" style={{ marginBottom: 0 }}>
                    <Space size="small" align="center">
                      <Upload
                        maxCount={1}
                        accept=".jpg,.jpeg,.png,.pdf"
                        beforeUpload={(file) => {
                          setModalIdDocFile(file);
                          return false;
                        }}
                        onRemove={() => setModalIdDocFile(null)}
                        fileList={modalIdDocFile ? [modalIdDocFile] : []}
                      >
                        <Button icon={<UploadOutlined />}>
                          {editingPerson?.id_document_url || modalIdDocFile ? 'Reemplazar' : 'Subir'}
                        </Button>
                      </Upload>
                      {editingPerson?.id_document_url && !modalIdDocFile && (
                        <Button 
                          icon={<FilePdfOutlined style={{ color: '#F5222D' }} />} 
                          onClick={() => window.open(editingPerson.id_document_url, '_blank')}
                        >
                          Ver
                        </Button>
                      )}
                    </Space>
                  </Form.Item>
                </Col>
              </Row>
            </div>

            {/* Sección: Libreta de Mar */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 4, marginBottom: 12 }}>
                <Text strong style={{ color: '#0A2647', fontSize: 13 }}>
                  ⚓ Libreta de Mar
                </Text>
              </div>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="seamans_book" label="Número" style={{ marginBottom: 0 }}>
                    <Input placeholder="Ingresar número" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="seamans_book_expiry" label="Vence" style={{ marginBottom: 0 }}>
                    <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Seleccionar fecha" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Documento" style={{ marginBottom: 0 }}>
                    <Space size="small" align="center">
                      <Upload
                        maxCount={1}
                        accept=".jpg,.jpeg,.png,.pdf"
                        beforeUpload={(file) => {
                          setModalSeamansBookFile(file);
                          return false;
                        }}
                        onRemove={() => setModalSeamansBookFile(null)}
                        fileList={modalSeamansBookFile ? [modalSeamansBookFile] : []}
                      >
                        <Button icon={<UploadOutlined />}>
                          {editingPerson?.seamans_book_url || modalSeamansBookFile ? 'Reemplazar' : 'Subir'}
                        </Button>
                      </Upload>
                      {editingPerson?.seamans_book_url && !modalSeamansBookFile && (
                        <Button 
                          icon={<FilePdfOutlined style={{ color: '#1890ff' }} />} 
                          onClick={() => window.open(editingPerson.seamans_book_url, '_blank')}
                        >
                          Ver
                        </Button>
                      )}
                    </Space>
                  </Form.Item>
                </Col>
              </Row>
            </div>

            {/* Sección: Médicos y STCW */}
            <div>
              <div style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 4, marginBottom: 12 }}>
                <Text strong style={{ color: '#0A2647', fontSize: 13 }}>
                  🩺 Certificaciones y Vigencias Médicas
                </Text>
              </div>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="medical_cert_expiry" label="Vence cert. médico" style={{ marginBottom: 0 }}>
                    <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Seleccionar fecha" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="stcw_expiry" label="Vence STCW" style={{ marginBottom: 0 }}>
                    <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Seleccionar fecha" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  {/* Spacer */}
                </Col>
              </Row>
            </div>
          </Card>

          <Form.Item label="Usuario del sistema vinculado" style={{ marginBottom: 16 }}>
            {editingPerson?.system_user ? (
              <Input 
                value={`${editingPerson.system_user.username} — ${editingPerson.system_user.full_name}`} 
                disabled 
                style={{ color: 'rgba(0, 0, 0, 0.85)', backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
              />
            ) : (
              <Input 
                value="Ninguno" 
                disabled 
                style={{ color: 'rgba(0, 0, 0, 0.45)', backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
              />
            )}
          </Form.Item>
          <Form.Item name="notes" label="Notas">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Drawer detalle */}
      <PersonDetailDrawer 
        person={detailPerson} 
        open={!!detailPerson} 
        onClose={() => setDetailPerson(null)} 
        onPhotoUpload={handlePhotoUpload}
        onIdDocUpload={handleIdDocUpload}
        onSeamansBookUpload={handleSeamansBookUpload}
        uploadingPhoto={uploadingPhoto}
        uploadingDoc={uploadingDoc}
        uploadingSeamansBook={uploadingSeamansBook}
      />
    </div>
  );
}

export default PersonnelPage;
