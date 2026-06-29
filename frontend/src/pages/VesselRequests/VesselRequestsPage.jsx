import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker, Typography, Card, message, Popconfirm, Tooltip, Row, Col, Badge, InputNumber, Drawer, Radio, Steps } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, CheckOutlined, CloseOutlined, CompassOutlined, MailOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

const STATUS_MAP = {
  pendiente: { label: 'Pendiente', color: 'orange', badge: 'warning' },
  aprobada: { label: 'Aprobada', color: 'green', badge: 'success' },
  rechazada: { label: 'Rechazada', color: 'red', badge: 'error' },
  cancelada: { label: 'Cancelada', color: 'gray', badge: 'default' }
};

function VesselRequestsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });
  const [filterVessel, setFilterVessel] = useState(null);
  const [filterStatus, setFilterStatus] = useState(null);
  const [projectsList, setProjectsList] = useState([]);
  const [showCustomProjectInput, setShowCustomProjectInput] = useState(false);
  
  // Modals / Drawers State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [reviewingRequest, setReviewingRequest] = useState(null);
  
  const [form] = Form.useForm();
  const [reviewForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const selectedVesselId = Form.useWatch('vessel_id', form);
  const selectedVesselObj = vessels.find(v => v.id === selectedVesselId);

  const is_admin = user?.is_superadmin || user?.roles?.some(r => r.name === 'Administrador');

  const fetchVessels = useCallback(async () => {
    try {
      const res = await apiClient.get('/vessels/options');
      setVessels(res.data);
    } catch {
      message.error('Error al cargar barcos');
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await apiClient.get('/projects', { params: { active_only: true } });
      setProjectsList(res.data);
    } catch {
      message.error('Error al cargar proyectos');
    }
  }, []);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (pagination.current - 1) * pagination.pageSize;
      const params = { skip, limit: pagination.pageSize };
      if (filterVessel) params.vessel_id = filterVessel;
      if (filterStatus) params.status = filterStatus;
      
      const res = await apiClient.get('/vessel-requests', { params });
      setRequests(res.data.items);
      setTotal(res.data.total);
    } catch {
      message.error('Error al cargar solicitudes');
    } finally {
      setLoading(false);
    }
  }, [pagination, filterVessel, filterStatus]);

  useEffect(() => {
    fetchVessels();
    fetchProjects();
  }, [fetchVessels, fetchProjects]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const openCreate = () => {
    setEditingRequest(null);
    form.resetFields();
    setShowCustomProjectInput(false);
    form.setFieldsValue({
      scientific_leader: user?.full_name || '',
      cruise_responsible: '',
      scientists_count: 5
    });
    setDrawerOpen(true);
  };

  const openEdit = (req) => {
    setEditingRequest(req);
    form.resetFields();
    const isCustomProject = !req.project_id && req.project_name;
    setShowCustomProjectInput(isCustomProject);
    form.setFieldsValue({
      vessel_id: req.vessel_id,
      project_id: req.project_id || (req.project_name ? 'otro' : undefined),
      project_name: req.project_name,
      scientific_leader: req.scientific_leader,
      cruise_responsible: req.cruise_responsible || '',
      scientists_count: req.scientists_count,
      objective: req.objective,
      study_area: req.study_area,
      dates: [dayjs(req.departure_date), dayjs(req.return_date)]
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      const selectedVessel = vessels.find(v => v.id === values.vessel_id);
      if (selectedVessel && selectedVessel.max_passengers !== null && values.scientists_count > selectedVessel.max_passengers) {
        message.error(`El número de investigadores excede la capacidad máxima de la embarcación (${selectedVessel.max_passengers} personas).`);
        return;
      }

      const [start, end] = values.dates;

      let pId = null;
      let pName = '';
      if (values.project_id && values.project_id !== 'otro') {
        pId = values.project_id;
        const matchedProj = projectsList.find(p => p.id === pId);
        pName = matchedProj ? matchedProj.name : '';
      } else {
        pName = values.project_name || '';
      }
      
      const payload = {
        vessel_id: values.vessel_id,
        project_id: pId,
        project_name: pName,
        scientific_leader: values.scientific_leader,
        cruise_responsible: values.cruise_responsible,
        scientists_count: values.scientists_count,
        objective: values.objective,
        study_area: values.study_area,
        departure_date: start.toISOString(),
        return_date: end.toISOString()
      };

      setSaving(true);
      if (editingRequest) {
        await apiClient.put(`/vessel-requests/${editingRequest.id}`, payload);
        message.success('Solicitud actualizada con éxito');
      } else {
        await apiClient.post('/vessel-requests', payload);
        message.success('Solicitud enviada con éxito');
      }
      setDrawerOpen(false);
      fetchRequests();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al guardar la solicitud');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/vessel-requests/${id}`);
      message.success('Solicitud eliminada');
      fetchRequests();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al eliminar');
    }
  };

  const openReview = (req) => {
    setReviewingRequest(req);
    reviewForm.resetFields();
    reviewForm.setFieldsValue({
      status: 'aprobada',
      admin_notes: ''
    });
    setReviewModalOpen(true);
  };

  const handleReview = async () => {
    try {
      const values = await reviewForm.validateFields();
      setSaving(true);
      await apiClient.post(`/vessel-requests/${reviewingRequest.id}/review`, values);
      message.success(values.status === 'aprobada' ? 'Solicitud aprobada (Plan de Crucero generado)' : 'Solicitud rechazada');
      setReviewModalOpen(false);
      fetchRequests();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al procesar la revisión');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Proyecto / Campaña',
      key: 'project',
      width: 300,
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{r.project_name}</Text>
          {r.project && (
            <><br /><Text type="secondary" style={{ fontSize: 11 }}>💳 Cuenta: {r.project.account_number}</Text></>
          )}
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>🧪 Líder: {r.scientific_leader}</Text>
          {r.cruise_responsible && (
            <><br /><Text type="secondary" style={{ fontSize: 11 }}>👤 Responsable: {r.cruise_responsible}</Text></>
          )}
          {is_admin && (
            <><br /><Text type="secondary" style={{ fontSize: 10 }}>👤 Solicitante: {r.applicant?.full_name}</Text></>
          )}
        </div>
      ),
      sorter: (a, b) => (a.project_name || '').localeCompare(b.project_name || ''),
    },
    {
      title: 'Embarcación',
      key: 'vessel',
      render: (_, r) => <Text>{r.vessel?.name}</Text>,
      width: 140,
      sorter: (a, b) => (a.vessel?.name || '').localeCompare(b.vessel?.name || ''),
    },
    {
      title: 'Fechas',
      key: 'dates',
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          <div>📅 Salida: {dayjs(r.departure_date).format('DD/MM/YYYY')}</div>
          <div>📅 Regreso: {dayjs(r.return_date).format('DD/MM/YYYY')}</div>
        </div>
      ),
      width: 180,
      sorter: (a, b) => dayjs(a.departure_date || 0).unix() - dayjs(b.departure_date || 0).unix(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Estado',
      dataIndex: 'status',
      width: 120,
      render: (st) => {
        const v = STATUS_MAP[st] || STATUS_MAP.pendiente;
        return <Tag color={v.color}>{v.label}</Tag>;
      },
      sorter: (a, b) => (a.status || '').localeCompare(b.status || ''),
    },
    {
      title: 'Notas Administrador',
      dataIndex: 'admin_notes',
      render: (notes) => notes ? <Text type="secondary" style={{ fontSize: 11 }}>{notes}</Text> : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>,
      width: 200
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 160,
      render: (_, r) => (
        <Space>
          {/* Acción para Administrador: Revisar */}
          {is_admin && r.status === 'pendiente' && (
            <Tooltip title="Aprobar / Rechazar">
              <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => openReview(r)}>Revisar</Button>
            </Tooltip>
          )}

          {/* Acción para Solicitante: Editar/Cancelar */}
          {(!is_admin || r.applicant_id === user?.id) && r.status === 'pendiente' && (
            <>
              <Tooltip title="Editar">
                <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
              </Tooltip>
              <Popconfirm title="¿Eliminar esta solicitud?" onConfirm={() => handleDelete(r.id)}>
                <Tooltip title="Eliminar">
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </>
          )}

          {/* Acción si está aprobada: Configurar Crucero */}
          {r.status === 'aprobada' && (
            <Button
              type="dashed"
              size="small"
              icon={<CompassOutlined />}
              onClick={() => navigate('/cruises')}
            >
              Configurar Crucero
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ color: '#0A2647', margin: 0 }}>🚢 Gestión de Solicitudes</Title>
          <Text type="secondary">Solicita embarcaciones para proyectos de investigación y consulta el estado de las mismas</Text>
        </Col>
        <Col>
          <Space wrap>
            <Select
              placeholder="Filtrar por Barco"
              allowClear
              style={{ width: 180 }}
              onChange={setFilterVessel}
              options={vessels.map(v => ({ value: v.id, label: v.name }))}
            />
            <Select
              placeholder="Filtrar por Estado"
              allowClear
              style={{ width: 150 }}
              onChange={setFilterStatus}
              options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchRequests} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nueva Solicitud</Button>
          </Space>
        </Col>
      </Row>

      {/* Guía Visual de Pasos */}
      {!is_admin && (
        <Card style={{ borderRadius: 12, marginBottom: 20, background: '#f8fafd', border: '1px solid #e6f0fa' }} styles={{ body: { padding: '16px 24px' } }}>
          <Steps
            current={
              requests.some(r => r.status === 'aprobada')
                ? 3
                : requests.some(r => r.status === 'pendiente')
                ? 2
                : 1
            }
            size="small"
            items={[
              {
                title: 'Disponibilidad',
                description: <a href="/agenda" style={{ fontSize: 11 }}>Ver calendario</a>,
              },
              {
                title: 'Crear Solicitud',
                description: <span style={{ fontSize: 11 }}>Formulario actual</span>,
              },
              {
                title: 'Aprobación DEO',
                description: <span style={{ fontSize: 11 }}>Revisión por personal</span>,
              },
              {
                title: 'Plan de Crucero',
                description: <a href="/cruises" style={{ fontSize: 11 }}>Configurar derrotero</a>,
              },
            ]}
          />
        </Card>
      )}

      {/* Tabla de Resultados */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={requests}
          rowKey="id"
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, s) => setPagination({ current: p, pageSize: s })
          }}
        />
      </Card>

      {/* Drawer: Crear / Editar Solicitud */}
      <Drawer
        title={editingRequest ? 'Editar Solicitud' : 'Nueva Solicitud de Embarcación'}
        width={550}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancelar</Button>
            <Button type="primary" onClick={handleSave} loading={saving}>Enviar Solicitud</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="vessel_id" label="Embarcación" rules={[{ required: true, message: 'La embarcación es requerida' }]}>
            <Select placeholder="Seleccionar barco" options={vessels.map(v => ({ value: v.id, label: v.name }))} />
          </Form.Item>

          <Form.Item name="project_id" label="Proyecto de Investigación" rules={[{ required: true, message: 'Selecciona un proyecto del catálogo o captura manualmente' }]}>
            <Select
              showSearch
              placeholder="Seleccionar proyecto del catálogo"
              optionFilterProp="children"
              onChange={(val) => {
                setShowCustomProjectInput(val === 'otro');
                if (val !== 'otro') {
                  const matchedProj = projectsList.find(p => p.id === val);
                  if (matchedProj) {
                    form.setFieldsValue({ 
                      project_name: matchedProj.name,
                      scientific_leader: matchedProj.responsible_name,
                      cruise_responsible: matchedProj.responsible_name
                    });
                  }
                } else {
                  form.setFieldsValue({ project_name: '', scientific_leader: user?.full_name || '', cruise_responsible: '' });
                }
              }}
            >
              <Select.OptGroup label="Catálogo de Proyectos">
                {projectsList.map(p => (
                  <Select.Option key={p.id} value={p.id}>
                    {p.account_number} — {p.name} ({p.responsible_name})
                  </Select.Option>
                ))}
              </Select.OptGroup>
              <Select.OptGroup label="Alternativa">
                <Select.Option value="otro">✍️ Otro (Capturar manualmente)</Select.Option>
              </Select.OptGroup>
            </Select>
          </Form.Item>

          {showCustomProjectInput && (
            <Form.Item 
              name="project_name" 
              label="Nombre del Proyecto / Campaña (Manual)" 
              rules={[{ required: true, message: 'El nombre es requerido' }]}
            >
              <Input placeholder="ej. Muestreo de Fitoplancton Golfo de California" />
            </Form.Item>
          )}

          <Form.Item name="scientific_leader" label="Jefe de Crucero (Investigador Principal)" rules={[{ required: true, message: 'El líder es requerido' }]}>
            <Input placeholder="Nombre del investigador a cargo" />
          </Form.Item>

          <Form.Item name="cruise_responsible" label="Responsable del Crucero (No necesariamente se embarca)">
            <Input placeholder="Nombre de la persona responsable del crucero (opcional)" />
          </Form.Item>

          <Form.Item name="dates" label="Rango de Fechas (Salida y Regreso)" rules={[{ required: true, message: 'Las fechas son requeridas' }]}>
            <RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>

          <Form.Item
            name="scientists_count"
            label="Personas estimadas a embarcar (sin contar tripulación)"
            extra={selectedVesselObj && selectedVesselObj.max_passengers !== null ? `Capacidad máxima de la embarcación seleccionada: ${selectedVesselObj.max_passengers} investigadores` : undefined}
          >
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>

          <Form.Item name="study_area" label="Área de Estudio">
            <TextArea rows={2} placeholder="Describa la zona geográfica del muestreo" />
          </Form.Item>

          <Form.Item name="objective" label="Objetivo del Crucero">
            <TextArea rows={3} placeholder="Describa brevemente los objetivos de la campaña" />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Modal: Revisar Solicitud */}
      <Modal
        title={`Revisar Solicitud: ${reviewingRequest?.project_name}`}
        open={reviewModalOpen}
        onCancel={() => setReviewModalOpen(false)}
        onOk={handleReview}
        confirmLoading={saving}
        okText="Confirmar Decisión"
        cancelText="Cerrar"
        destroyOnClose
      >
        <Form form={reviewForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="status" label="Decisión" rules={[{ required: true }]}>
            <Radio.Group buttonStyle="solid">
              <Radio.Button value="aprobada" style={{ borderColor: '#52c41a', color: '#52c41a' }}>Aprobar Solicitud</Radio.Button>
              <Radio.Button value="rechazada" style={{ borderColor: '#f5222d', color: '#f5222d' }}>Rechazar Solicitud</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item name="admin_notes" label="Comentarios / Retroalimentación para el Solicitante">
            <TextArea rows={3} placeholder="Ingresa motivos de rechazo o especificaciones para el plan de crucero..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default VesselRequestsPage;
