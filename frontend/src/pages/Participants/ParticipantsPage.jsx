/**
 * SIAE — Catálogo de Participantes de Crucero.
 *
 * Directorio reutilizable de todas las personas que han embarcado
 * en embarcaciones de CICESE. Se diferencia del módulo de Personal
 * (empleados CICESE con datos de RH) al estar enfocado en:
 *   - Investigadores externos de otras instituciones
 *   - Estudiantes, técnicos visitantes
 *   - Personal CICESE (con vínculo a su registro de Personal)
 *   - Foto y documento de identidad para tramitar el PIS (ASIPONAV)
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker,
  Typography, Card, message, Popconfirm, Tooltip, Row, Col, Statistic,
  Avatar, Upload, Divider, Switch, Alert, Badge,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  UserOutlined, CameraOutlined, IdcardOutlined, TeamOutlined,
  BankOutlined, GlobalOutlined, UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { CanAccess } from '../../components/common/CanAccess';
import { useAuth } from '../../context/AuthContext';

const { Title, Text } = Typography;
const { Search } = Input;

const ID_TYPE_OPTIONS = [
  { value: 'ine',       label: 'INE / Credencial de elector' },
  { value: 'pasaporte', label: 'Pasaporte' },
  { value: 'otro',      label: 'Otro documento oficial' },
];

const ID_TYPE_LABELS = { ine: 'INE', pasaporte: 'Pasaporte', otro: 'ID' };

// ── Semáforo del documento de identidad ───────────────────────
function DocStatus({ expiry }) {
  if (!expiry) return <Badge status="default" text="Sin doc." />;
  const d = dayjs(expiry);
  const days = d.diff(dayjs(), 'day');
  if (days < 0)   return <Badge status="error"   text={`Vencido hace ${Math.abs(days)}d`} />;
  if (days <= 60) return <Badge status="warning" text={`Vence en ${days}d`} />;
  return <Badge status="success" text={d.format('DD/MM/YYYY')} />;
}

// ── Drawer de detalle ─────────────────────────────────────────
function ParticipantDetailModal({ participant, open, onClose, onRefresh }) {
  const { user } = useAuth();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc]     = useState(false);

  if (!participant) return null;

  const is_admin = user?.is_superadmin || user?.roles?.some(r => r.name === 'Administrador');
  const isSelf = user?.participant_profile_id === participant.id;
  const isOwnerOrAdmin = is_admin || (participant.created_by_id === user?.id) || isSelf;
  const hasDoc = participant.id_document_number && participant.id_document_number !== '';
  const isExpired = participant.id_document_expiry && dayjs(participant.id_document_expiry).isBefore(dayjs(), 'day');
  const canUploadDoc = isOwnerOrAdmin || !hasDoc || isExpired;

  const handlePhotoUpload = async ({ file }) => {
    const fd = new FormData();
    fd.append('file', file);
    setUploadingPhoto(true);
    try {
      await apiClient.post(`/participants/${participant.id}/photo`, fd,
        { headers: { 'Content-Type': 'multipart/form-data' } });
      message.success('Foto actualizada');
      onRefresh();
    } catch { message.error('Error al subir foto'); }
    finally { setUploadingPhoto(false); }
    return false;
  };

  const handleDocUpload = async ({ file }) => {
    const fd = new FormData();
    fd.append('file', file);
    setUploadingDoc(true);
    try {
      await apiClient.post(`/participants/${participant.id}/document`, fd,
        { headers: { 'Content-Type': 'multipart/form-data' } });
      message.success('Documento actualizado');
      onRefresh();
    } catch { message.error('Error al subir documento'); }
    finally { setUploadingDoc(false); }
    return false;
  };

  const photoSrc = participant.photo_url
    ? participant.photo_url : null;

  const photoEl = photoSrc ? (
    <img
      src={photoSrc}
      alt={participant.full_name}
      style={{
        maxWidth: '180px',
        maxHeight: '180px',
        borderRadius: '8px',
        cursor: isOwnerOrAdmin ? 'pointer' : 'default',
        border: '1px solid #d9d9d9',
        padding: '4px',
        backgroundColor: '#fff',
        objectFit: 'contain',
        marginBottom: 8
      }}
    />
  ) : (
    <Avatar size={96} icon={<UserOutlined />}
      style={{ cursor: isOwnerOrAdmin ? 'pointer' : 'default', background: '#0A2647', marginBottom: 8 }} />
  );

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={500}
      title={<Space><UserOutlined />{participant.full_name}</Space>}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        {isOwnerOrAdmin ? (
          <Upload showUploadList={false} accept=".jpg,.jpeg,.png,.webp"
            customRequest={handlePhotoUpload}>
            <Tooltip title="Clic para cambiar foto">
              {photoEl}
            </Tooltip>
          </Upload>
        ) : (
          photoEl
        )}
        <br />
        {isOwnerOrAdmin && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {uploadingPhoto ? 'Subiendo...' : 'Clic en la foto para cambiarla'}
          </Text>
        )}
      </div>

      <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12 }}>
        Información general
      </Divider>
      <Row gutter={[16, 8]}>
        <Col span={12}><Text type="secondary">Institución</Text><br /><Text>{participant.institution || '—'}</Text></Col>
        <Col span={12}><Text type="secondary">Nacionalidad</Text><br /><Text>{participant.nationality || '—'}</Text></Col>
        <Col span={12}><Text type="secondary">Correo</Text><br /><Text>{participant.email || '—'}</Text></Col>
        <Col span={12}><Text type="secondary">Teléfono</Text><br /><Text>{participant.phone || '—'}</Text></Col>
        <Col span={24}>
          <Text type="secondary">Tipo</Text><br />
          {participant.is_cicese_staff
            ? <Tag color="#0A2647">🏛️ Personal CICESE</Tag>
            : <Tag color="#6b7280">🌍 Externo</Tag>}
          <Text style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>
            {participant.cruise_count} crucero{participant.cruise_count !== 1 ? 's' : ''} registrado{participant.cruise_count !== 1 ? 's' : ''}
          </Text>
        </Col>
      </Row>

      <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, marginTop: 16 }}>
        🪪 Identificación Oficial
      </Divider>
      <Row gutter={[16, 8]} align="middle">
        <Col span={14}>
          <Text type="secondary">
            {ID_TYPE_LABELS[participant.id_document_type] || 'Documento'}
          </Text><br />
          <Text>{participant.id_document_number || '—'}</Text>
          <br />
          <DocStatus expiry={participant.id_document_expiry} />
        </Col>
        <Col span={10} style={{ textAlign: 'right' }}>
          <Space direction="vertical" size={6}>
            {canUploadDoc && (
              <CanAccess module="participants" action="edit">
                <Upload showUploadList={false} accept=".jpg,.jpeg,.png,.pdf"
                  customRequest={handleDocUpload}>
                  <Button icon={<IdcardOutlined />} size="small" loading={uploadingDoc}>
                    {participant.id_document_url ? 'Reemplazar ID' : 'Subir ID'}
                  </Button>
                </Upload>
              </CanAccess>
            )}
            {isOwnerOrAdmin && participant.id_document_url && (
              <Button size="small" icon={<UploadOutlined style={{ transform: 'rotate(180deg)' }} />}
                onClick={() => window.open(participant.id_document_url, '_blank')}>
                Ver documento
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      {participant.notes && (
        <>
          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12, marginTop: 16 }}>Notas</Divider>
          <Text type="secondary">{participant.notes}</Text>
        </>
      )}
    </Modal>
  );
}

// ── Modal crear / editar ───────────────────────────────────────
function ParticipantEditModal({ open, onClose, onSaved, participant, selfRegistration }) {
  const { user } = useAuth();
  const is_admin = user?.is_superadmin || user?.roles?.some(r => r.name === 'Administrador');
  const isSelf = participant && user?.participant_profile_id === participant.id;
  const isOwnerOrAdmin = is_admin || !participant || (participant.created_by_id === user?.id) || isSelf;
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [isInternal, setIsInternal] = useState(false);
  const [personnelList, setPersonnelList] = useState([]);
  const [loadingPersonnel, setLoadingPersonnel] = useState(false);
  
  // Estados para archivos temporales
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [docFile, setDocFile] = useState(null);

  const isEditing = !!participant;

  useEffect(() => {
    if (!open) return;
    setLoadingPersonnel(true);
    apiClient.get('/personnel', { params: { limit: 300 } })
      .then(r => setPersonnelList(r.data.items || []))
      .catch(() => {})
      .finally(() => setLoadingPersonnel(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (participant) {
      const vals = { ...participant };
      if (vals.id_document_expiry) vals.id_document_expiry = dayjs(vals.id_document_expiry);
      form.setFieldsValue(vals);
      setIsInternal(!!participant.personnel_id);
    } else {
      form.resetFields();
      if (selfRegistration && user) {
        form.setFieldsValue({
          first_name: user.full_name?.split(' ')[0] || '',
          last_name: user.full_name?.split(' ').slice(1).join(' ') || '',
          email: user.email || '',
          institution: 'CICESE',
          nationality: 'Mexicana'
        });
      } else {
        form.setFieldsValue({ institution: 'CICESE', nationality: 'Mexicana' });
      }
      setIsInternal(false);
    }
    // Limpiar estados de archivos al abrir
    setPhotoFile(null);
    setPhotoPreview(null);
    setDocFile(null);
  }, [open, participant, form]);

  const handlePersonnelSelect = (personnelId) => {
    const person = personnelList.find(p => p.id === personnelId);
    if (!person) return;
    form.setFieldsValue({
      first_name: person.first_name, last_name: person.last_name,
      institution: 'CICESE', nationality: person.nationality || 'Mexicana',
      email: person.email, phone: person.phone,
      id_document_number: person.passport_number || undefined,
      id_document_type:   person.passport_number ? 'pasaporte' : undefined,
      id_document_expiry: person.passport_expiry ? dayjs(person.passport_expiry) : undefined,
    });
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (values.id_document_expiry) values.id_document_expiry = values.id_document_expiry.format('YYYY-MM-DD');
      if (!isInternal) values.personnel_id = null;
      setSaving(true);

      let savedParticipant = null;
      if (isEditing) {
        const r = await apiClient.put(`/participants/${participant.id}`, values);
        savedParticipant = r.data;
        message.success('Perfil actualizado');
      } else {
        const r = await apiClient.post('/participants', values);
        savedParticipant = r.data;
        message.success('Participante registrado en el catálogo');
      }

      // Si hay archivos seleccionados, subirlos usando el ID asignado/existente
      if (savedParticipant && (photoFile || docFile)) {
        const pid = savedParticipant.id;

        if (photoFile) {
          const fd = new FormData();
          fd.append('file', photoFile);
          try {
            await apiClient.post(`/participants/${pid}/photo`, fd, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
          } catch {
            message.error('Error al subir la fotografía de perfil');
          }
        }

        if (docFile) {
          const fd = new FormData();
          fd.append('file', docFile);
          try {
            await apiClient.post(`/participants/${pid}/document`, fd, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
          } catch {
            message.error('Error al subir la identificación oficial');
          }
        }
      }

      onSaved();
    } catch (err) {
      if (err.response?.data?.detail) message.error(err.response.data.detail);
    } finally {
      setSaving(false);
    }
  };

  const currentPhotoSrc = photoPreview || (participant?.photo_url ? participant.photo_url : null);

  return (
    <Modal
      title={<Space><TeamOutlined />{isEditing ? 'Editar participante' : 'Nuevo participante'}</Space>}
      open={open} onCancel={onClose} onOk={handleSave}
      confirmLoading={saving} okText={isEditing ? 'Guardar' : 'Registrar'}
      width={580} destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        {/* Vista previa de fotografía */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          {currentPhotoSrc ? (
            <img
              src={currentPhotoSrc}
              alt="Vista previa"
              style={{
                maxWidth: '150px',
                maxHeight: '150px',
                borderRadius: '8px',
                border: '1px solid #d9d9d9',
                padding: '4px',
                backgroundColor: '#fff',
                objectFit: 'contain',
                marginBottom: 8
              }}
            />
          ) : (
            <Avatar
              size={80}
              icon={<UserOutlined />}
              style={{ background: '#0A2647', marginBottom: 8 }}
            />
          )}
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>
            {photoFile ? `Fotografía seleccionada: ${photoFile.name}` : 'Vista previa de la fotografía'}
          </Text>
        </div>

        {/* Toggle interno/externo */}
        {!isEditing && (
          <div style={{ background: '#f0f5ff', border: '1px solid #d6e4ff', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Text strong style={{ color: '#0A2647' }}>
                {isInternal ? '🏛️ Personal CICESE' : '🌍 Participante externo'}
              </Text><br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {isInternal ? 'Vinculado al catálogo de Personal' : 'Investigador, estudiante o técnico de otra institución'}
              </Text>
            </div>
            <Switch checked={isInternal} onChange={(v) => { setIsInternal(v); form.resetFields(['personnel_id','first_name','last_name','institution']); }}
              checkedChildren="CICESE" unCheckedChildren="Externo" />
          </div>
        )}

        {isInternal && (
          <Form.Item name="personnel_id" label="Seleccionar del catálogo de Personal"
            rules={[{ required: true }]}>
            <Select showSearch loading={loadingPersonnel}
              placeholder="Buscar por nombre..."
              filterOption={(i, o) => o.label?.toLowerCase().includes(i.toLowerCase())}
              onChange={handlePersonnelSelect}
              options={personnelList.map(p => ({ value: p.id, label: `${p.full_name}${p.employee_number ? ` (#${p.employee_number})` : ''}` }))} />
          </Form.Item>
        )}

        <Row gutter={16}>
          <Col span={12}><Form.Item name="first_name" label="Nombre(s)" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={12}><Form.Item name="last_name" label="Apellidos" rules={[{ required: true }]}><Input /></Form.Item></Col>
        </Row>
        <Row gutter={16}>
          <Col span={14}><Form.Item name="institution" label="Institución"><Input prefix={<BankOutlined style={{ color: '#ccc' }} />} placeholder="CICESE, UNAM, SCRIPPS..." /></Form.Item></Col>
          <Col span={10}><Form.Item name="nationality" label="Nacionalidad"><Input /></Form.Item></Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}><Form.Item name="email" label="Correo"><Input /></Form.Item></Col>
          <Col span={12}><Form.Item name="phone" label="Teléfono"><Input /></Form.Item></Col>
        </Row>

        {isOwnerOrAdmin && (
          <>
            <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12 }}>📸 Fotografía de Rostro</Divider>
            <Form.Item label="Archivo de Fotografía (JPG, PNG, WEBP)" style={{ marginBottom: 16 }}>
              <Upload
                maxCount={1}
                accept=".jpg,.jpeg,.png,.webp"
                beforeUpload={(file) => {
                  setPhotoFile(file);
                  const reader = new FileReader();
                  reader.onload = (e) => setPhotoPreview(e.target.result);
                  reader.readAsDataURL(file);
                  return false; // Evitar subida automática inmediata
                }}
                onRemove={() => {
                  setPhotoFile(null);
                  setPhotoPreview(null);
                }}
                fileList={photoFile ? [photoFile] : []}
              >
                <Button icon={<CameraOutlined />}>Seleccionar fotografía</Button>
              </Upload>
              {participant?.photo_url && !photoFile && (
                <div style={{ marginTop: 6 }}>
                  <Text type="success" style={{ fontSize: 12 }}>
                    ✓ Fotografía ya subida.{' '}
                    <a href={participant.photo_url} target="_blank" rel="noreferrer">
                      Ver foto actual
                    </a>
                  </Text>
                </div>
              )}
            </Form.Item>
          </>
        )}

        <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12 }}>🪪 Identificación Oficial</Divider>
        <Row gutter={16}>
          <Col span={9}><Form.Item name="id_document_type" label="Tipo"><Select allowClear options={ID_TYPE_OPTIONS} /></Form.Item></Col>
          <Col span={9}><Form.Item name="id_document_number" label="Número"><Input /></Form.Item></Col>
          <Col span={6}><Form.Item name="id_document_expiry" label="Vence"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
        </Row>

        <Form.Item label="Archivo de Identificación (PDF o Imagen)" style={{ marginBottom: 16 }}>
          <Upload
            maxCount={1}
            accept=".jpg,.jpeg,.png,.pdf"
            beforeUpload={(file) => {
              setDocFile(file);
              return false; // Evitar subida automática inmediata
            }}
            onRemove={() => setDocFile(null)}
            fileList={docFile ? [docFile] : []}
          >
            <Button icon={<UploadOutlined />}>Seleccionar archivo de identificación</Button>
          </Upload>
          {participant?.id_document_url && !docFile && (
            <div style={{ marginTop: 6 }}>
              <Text type="success" style={{ fontSize: 12 }}>
                ✓ Identificación ya subida.{' '}
                <a href={participant.id_document_url} target="_blank" rel="noreferrer">
                  Ver identificación actual
                </a>
              </Text>
            </div>
          )}
        </Form.Item>

        <Form.Item name="notes" label="Notas"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
  );
}

// ── Página principal ──────────────────────────────────────────
function ParticipantsPage() {
  const { user, refreshUser } = useAuth();
  const is_admin = user?.is_superadmin || user?.roles?.some(r => r.name === 'Administrador');
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading]           = useState(false);
  const [total, setTotal]               = useState(0);
  const [pagination, setPagination]     = useState({ current: 1, pageSize: 15 });
  const [search, setSearch]             = useState('');
  const [modalOpen, setModalOpen]       = useState(false);
  const [detailOpen, setDetailOpen]     = useState(false);
  const [editing, setEditing]           = useState(null);
  const [detail, setDetail]             = useState(null);
  const [stats, setStats]               = useState({ total: 0, cicese: 0, externos: 0, con_doc: 0 });
  const [isSelfRegister, setIsSelfRegister] = useState(false);

  const fetchParticipants = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (pagination.current - 1) * pagination.pageSize;
      const params = { skip, limit: pagination.pageSize, only_active: true };
      if (search) params.search = search;
      const r = await apiClient.get('/participants', { params });
      setParticipants(r.data.items);
      setTotal(r.data.total);
      // Stats locales
      const items = r.data.items;
      setStats({
        total:   r.data.total,
        cicese:  items.filter(p => p.is_cicese_staff).length,
        externos: items.filter(p => !p.is_cicese_staff).length,
        con_doc: items.filter(p => p.id_document_url).length,
      });
    } catch { message.error('Error al cargar participantes'); }
    finally { setLoading(false); }
  }, [pagination, search]);

  useEffect(() => { fetchParticipants(); }, [fetchParticipants]);
  
  // Detect self=true in URL to open own profile
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('self') === 'true') {
      if (user?.participant_profile_id) {
        apiClient.get(`/participants/${user.participant_profile_id}`)
          .then((res) => {
            setDetail(res.data);
            setDetailOpen(true);
          })
          .catch(() => {
            message.error('Error al cargar tu perfil de participante');
          });
      } else {
        setEditing(null);
        setIsSelfRegister(true);
        setModalOpen(true);
        message.info('Por favor completa tu perfil de participante para vincular tu cuenta.');
      }
    }
  }, [user]);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit   = (p) => { setEditing(p); setModalOpen(true); };
  const openDetail = (p) => { setDetail(p); setDetailOpen(true); };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/participants/${id}`);
      message.success('Participante desactivado');
      fetchParticipants();
    } catch { message.error('Error al desactivar'); }
  };

  const columns = [
    {
      title: 'Participante', key: 'name',
      render: (_, r) => (
        <Space>
          <Avatar size={36}
            src={r.photo_url ? r.photo_url : null}
            icon={<UserOutlined />}
            style={{ background: r.is_cicese_staff ? '#0A2647' : '#6b7280', flexShrink: 0 }}
          />
          <div>
            <Button type="link" style={{ padding: 0, fontWeight: 600 }} onClick={() => openDetail(r)}>
              {r.full_name}
            </Button>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>
              🏛️ {r.institution || '—'}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Tipo', key: 'tipo', width: 120,
      render: (_, r) => r.is_cicese_staff
        ? <Tag color="#0A2647">CICESE</Tag>
        : <Tag color="#6b7280">Externo</Tag>,
    },
    {
      title: 'Identificación Oficial', key: 'doc', width: 180,
      render: (_, r) => (
        <div>
          {r.id_document_number
            ? <Text style={{ fontSize: 12 }}>{ID_TYPE_LABELS[r.id_document_type] || 'ID'}: {r.id_document_number}</Text>
            : <Text type="secondary" style={{ fontSize: 12 }}>Sin documento</Text>}
          <br />
          <DocStatus expiry={r.id_document_expiry} />
        </div>
      ),
    },
    {
      title: 'Cruceros', key: 'cruises', width: 90, align: 'center',
      render: (_, r) => (
        <Tag color={r.cruise_count > 0 ? '#1677ff' : '#d9d9d9'}>
          {r.cruise_count} 🧭
        </Tag>
      ),
    },
    {
      title: 'Acciones', key: 'actions', width: 110,
      render: (_, r) => {
        const isRecordOwnerOrAdmin = is_admin || (r.created_by_id === user?.id) || (user?.participant_profile_id === r.id);
        const isSelf = user?.participant_profile_id === r.id;
        return (
          <Space>
            <Tooltip title="Ver detalle"><Button type="text" icon={<UserOutlined />} onClick={() => openDetail(r)} /></Tooltip>
            {isRecordOwnerOrAdmin && (
              <CanAccess module="participants" action="edit">
                <Tooltip title="Editar"><Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
              </CanAccess>
            )}
            {isRecordOwnerOrAdmin && !isSelf && (
              <CanAccess module="participants" action="delete">
                <Popconfirm title="¿Desactivar este participante?" onConfirm={() => handleDelete(r.id)}>
                  <Tooltip title="Desactivar"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
                </Popconfirm>
              </CanAccess>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div className="animate-fade-in">
      {/* Stats */}
      <Row gutter={12} style={{ marginBottom: 20 }}>
        {[
          { label: 'Total en catálogo', value: total,           color: '#1677FF', bg: '#f0f5ff' },
          { label: 'Personal CICESE',   value: stats.cicese,    color: '#0A2647', bg: '#f0f5ff' },
          { label: 'Participantes ext.', value: stats.externos, color: '#6b7280', bg: '#fafafa' },
          { label: 'Con documento ID',  value: stats.con_doc,   color: '#52C41A', bg: '#f6ffed' },
        ].map(({ label, value, color, bg }) => (
          <Col xs={12} md={6} key={label}>
            <Card size="small" style={{ borderRadius: 10, borderLeft: `3px solid ${color}`, background: bg }}>
              <Statistic title={label} value={value} valueStyle={{ color, fontSize: 20 }} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Toolbar */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Title level={3} style={{ color: '#0A2647', margin: 0 }}>👥 Participantes de Crucero</Title>
          <Text type="secondary">{total} personas en el catálogo</Text>
        </Col>
        <Col>
          <Space wrap>
            <Search placeholder="Buscar por nombre o institución..." allowClear
              onSearch={(v) => { setSearch(v); setPagination({ ...pagination, current: 1 }); }}
              style={{ width: 240 }} />
            <Button icon={<ReloadOutlined />} onClick={fetchParticipants} />
            <CanAccess module="participants" action="create">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}
                style={{ background: '#0A2647' }}>
                Nuevo participante
              </Button>
            </CanAccess>
          </Space>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Table columns={columns} dataSource={participants} rowKey="id" loading={loading}
          pagination={{
            current: pagination.current, pageSize: pagination.pageSize, total,
            showSizeChanger: true, showTotal: (t) => `${t} participantes`,
            onChange: (p, s) => setPagination({ current: p, pageSize: s }),
          }} />
      </Card>

      {/* Modal crear/editar */}
      <ParticipantEditModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setIsSelfRegister(false); }}
        onSaved={async () => {
          fetchParticipants();
          setModalOpen(false);
          setIsSelfRegister(false);
          if (!user?.participant_profile_id) {
            await refreshUser();
            message.success('Perfil de participante creado y vinculado exitosamente.');
          }
        }}
        participant={editing}
        selfRegistration={isSelfRegister}
      />

      {/* Modal detalle con upload de foto/doc */}
      <ParticipantDetailModal
        participant={detail}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onRefresh={() => { fetchParticipants(); setDetail(prev => participants.find(p => p.id === prev?.id) || prev); }}
      />
    </div>
  );
}

export default ParticipantsPage;
