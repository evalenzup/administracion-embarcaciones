/**
 * SIAE — Módulo de Catálogo de Proyectos (Operaciones)
 * Permite gestionar proyectos de investigación y vincularlos a solicitudes de embarcación y planes de crucero.
 */

import React, { useState, useEffect } from 'react';
import {
  Row,
  Col,
  Card,
  Table,
  Button,
  Tag,
  Space,
  Input,
  Select,
  Tooltip,
  Modal,
  Form,
  Typography,
  message,
  Popconfirm,
  Badge,
  Drawer,
  Tabs,
  Descriptions,
  Statistic,
  Divider,
} from 'antd';
import {
  AppstoreOutlined,
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  SyncOutlined,
  CompassOutlined,
  MailOutlined,
  DollarOutlined,
  FileTextOutlined,
  UserOutlined,
  BankOutlined,
  DeploymentUnitOutlined,
  CheckCircleOutlined,
  ApartmentOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Title, Text } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;

export default function ProjectsPage() {
  const { hasPermission } = useAuth();

  // Estados principales
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Estadísticas calculadas
  const stats = {
    total: projects.length,
    active: projects.filter((p) => p.is_active).length,
    departmentsCount: new Set(projects.map((p) => p.department).filter(Boolean)).size,
  };

  // Filtros de búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState(true);

  // Modal Crear Proyecto
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [createForm] = Form.useForm();

  // Modal Editar Proyecto
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm] = Form.useForm();

  // Cargar lista de proyectos
  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/projects', {
        params: {
          search: searchTerm || undefined,
          active_only: activeFilter,
        },
      });
      setProjects(res.data);
    } catch (err) {
      message.error('Error al cargar la lista de proyectos.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [activeFilter]);

  const handleSearch = () => {
    loadProjects();
  };

  // Cargar detalles estadísticos e historial del proyecto
  const loadProjectDetail = async (id) => {
    setDetailLoading(true);
    try {
      const res = await apiClient.get(`/projects/${id}`);
      setSelectedProject(res.data);
    } catch (err) {
      message.error('Error al cargar la información del proyecto.');
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleViewDetail = (record) => {
    setSelectedProject({ ...record, stats: { cruises_count: 0, vessel_requests_count: 0 }, cruises: [], vessel_requests: [] });
    setDrawerOpen(true);
    loadProjectDetail(record.id);
  };

  // Crear proyecto
  const handleCreateProject = async () => {
    try {
      const values = await createForm.validateFields();
      setSavingProject(true);

      await apiClient.post('/projects', {
        account_number: values.account_number.trim(),
        name: values.name.trim(),
        responsible_name: values.responsible_name.trim(),
        department: values.department.trim(),
        division: values.division.trim()
      });

      message.success('Proyecto registrado con éxito.');
      createForm.resetFields();
      setCreateModalOpen(false);
      loadProjects();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Error al guardar el proyecto.';
      message.error(errorMsg);
      console.error(err);
    } finally {
      setSavingProject(false);
    }
  };

  // Abrir modal edición
  const handleOpenEditModal = (project, e) => {
    if (e) e.stopPropagation();
    setEditingProject(project);
    editForm.setFieldsValue({
      account_number: project.account_number,
      name: project.name,
      responsible_name: project.responsible_name,
      department: project.department,
      division: project.division,
      is_active: project.is_active,
    });
    setEditModalOpen(true);
  };

  // Guardar cambios de edición
  const handleSaveEdit = async () => {
    try {
      const values = await editForm.validateFields();
      setSavingEdit(true);

      await apiClient.put(`/projects/${editingProject.id}`, {
        account_number: values.account_number.trim(),
        name: values.name.trim(),
        responsible_name: values.responsible_name.trim(),
        department: values.department.trim(),
        division: values.division.trim(),
        is_active: values.is_active,
      });

      message.success('Proyecto actualizado correctamente.');
      setEditModalOpen(false);
      
      // Si el drawer está abierto para este proyecto, refrescar
      if (selectedProject && selectedProject.id === editingProject.id) {
        loadProjectDetail(editingProject.id);
      }
      loadProjects();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Error al actualizar el proyecto.';
      message.error(errorMsg);
      console.error(err);
    } finally {
      setSavingEdit(false);
    }
  };

  // Eliminar o desactivar proyecto
  const handleDeleteProject = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      const res = await apiClient.delete(`/projects/${id}`);
      if (res.data.status === 'deactivated') {
        message.warning(res.data.message);
      } else {
        message.success(res.data.message);
      }
      if (selectedProject?.id === id) {
        setDrawerOpen(false);
      }
      loadProjects();
    } catch (err) {
      message.error('Error al eliminar el proyecto.');
      console.error(err);
    }
  };

  const columns = [
    {
      title: 'No. Cuenta',
      dataIndex: 'account_number',
      key: 'account_number',
      render: (text) => <Text code>{text}</Text>,
      width: 140,
      sorter: (a, b) => (a.account_number || '').localeCompare(b.account_number || ''),
      defaultSortOrder: 'ascend',
    },
    {
      title: 'Nombre del Proyecto',
      dataIndex: 'name',
      key: 'name',
      width: 250,
      ellipsis: true,
      render: (text) => (
        <Text strong style={{ color: '#1B4F72' }}>
          {text}
        </Text>
      ),
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
    },
    {
      title: 'Responsable (PI)',
      dataIndex: 'responsible_name',
      key: 'responsible_name',
      width: 200,
      ellipsis: true,
      sorter: (a, b) => (a.responsible_name || '').localeCompare(b.responsible_name || ''),
    },
    {
      title: 'Departamento',
      dataIndex: 'department',
      key: 'department',
      width: 180,
      ellipsis: true,
      sorter: (a, b) => (a.department || '').localeCompare(b.department || ''),
    },
    {
      title: 'Estado',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active) => (
        <Tag color={active ? 'green' : 'red'}>
          {active ? 'Activo' : 'Inactivo'}
        </Tag>
      ),
      width: 110,
      align: 'center',
      sorter: (a, b) => (a.is_active ? 1 : 0) - (b.is_active ? 1 : 0),
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 120,
      fixed: 'right',
      align: 'center',
      render: (_, record) => (
        <Space size="middle" onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Ver detalles y cruceros">
            <Button
              type="text"
              icon={<EyeOutlined style={{ color: '#1890ff' }} />}
              onClick={() => handleViewDetail(record)}
            />
          </Tooltip>
          {hasPermission('projects', 'edit') && (
            <Tooltip title="Editar proyecto">
              <Button
                type="text"
                icon={<EditOutlined style={{ color: '#fa8c16' }} />}
                onClick={(e) => handleOpenEditModal(record, e)}
              />
            </Tooltip>
          )}
          {hasPermission('projects', 'delete') && (
            <Popconfirm
              title="¿Está seguro de eliminar o desactivar este proyecto?"
              onConfirm={(e) => handleDeleteProject(record.id, e)}
              okText="Sí"
              cancelText="No"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Eliminar / Desactivar">
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={2} style={{ margin: 0, color: '#0A2647' }}>
            <AppstoreOutlined style={{ marginRight: 8, color: '#1890ff' }} />
            Catálogo de Proyectos
          </Title>
          <Text type="secondary">
            Administración de proyectos de investigación científica y logística de la DEO.
          </Text>
        </div>
        {hasPermission('projects', 'create') && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={() => setCreateModalOpen(true)}
            style={{ borderRadius: 8 }}
          >
            Nuevo Proyecto
          </Button>
        )}
      </div>

      {/* Tarjetas de Métricas Rápidas */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <Statistic title="Total Proyectos Registrados" value={stats.total} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <Statistic
              title="Proyectos Activos"
              value={stats.active}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <Statistic
              title="Departamentos Involucrados"
              value={stats.departmentsCount}
              valueStyle={{ color: '#1890ff' }}
              prefix={<ApartmentOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Filtros y Tabla */}
      <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <Input
            placeholder="Buscar por nombre, no. cuenta, PI o departamento..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: 340, borderRadius: 8 }}
            allowClear
          />
          <Select
            placeholder="Filtrar por estado"
            value={activeFilter}
            onChange={(val) => setActiveFilter(val)}
            style={{ width: 180 }}
          >
            <Option value={true}>Solo Activos</Option>
            <Option value={false}>Solo Inactivos</Option>
            <Option value={null}>Todos los Estados</Option>
          </Select>
          <Button
            onClick={() => {
              setSearchTerm('');
              setActiveFilter(true);
              setLoading(true);
              apiClient.get('/projects', { params: { active_only: true } }).then((res) => {
                setProjects(res.data);
                setLoading(false);
              });
            }}
            icon={<SyncOutlined />}
            style={{ borderRadius: 8 }}
          >
            Restablecer
          </Button>
        </div>

        <Table
          dataSource={projects}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          style={{ cursor: 'pointer' }}
          scroll={{ x: 1000 }}
          onRow={(record) => ({
            onClick: () => handleViewDetail(record),
          })}
        />
      </Card>

      {/* Drawer de Detalle Histórico Consolidado */}
      <Drawer
        title={
          selectedProject ? (
            <Space>
              <Title level={4} style={{ margin: 0, color: '#0A2647' }}>
                {selectedProject.name}
              </Title>
              <Tag color={selectedProject.is_active ? 'green' : 'red'}>
                {selectedProject.is_active ? 'Activo' : 'Inactivo'}
              </Tag>
            </Space>
          ) : (
            'Cargando...'
          )
        }
        width={780}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        bodyStyle={{ paddingBottom: 60 }}
      >
        {selectedProject && (
          <div>
            <Descriptions title="Información del Proyecto" bordered column={2} size="small">
              <Descriptions.Item label="Número de Cuenta">
                <Text code strong>{selectedProject.account_number}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Responsable (PI)">
                {selectedProject.responsible_name}
              </Descriptions.Item>
              <Descriptions.Item label="Departamento">
                {selectedProject.department}
              </Descriptions.Item>
              <Descriptions.Item label="División">
                {selectedProject.division}
              </Descriptions.Item>
              <Descriptions.Item label="Creado el" span={2}>
                {dayjs(selectedProject.created_at).format('DD/MM/YYYY HH:mm')}
              </Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '20px 0' }} />

            {/* Estadísticas de cruceros y solicitudes */}
            <Title level={5} style={{ color: '#0A2647' }}>Resumen de Actividad</Title>
            {selectedProject.stats ? (
              <Row gutter={16} style={{ marginBottom: 20 }}>
                <Col span={12}>
                  <Card bordered style={{ background: '#eef5fc', borderRadius: 8, padding: '10px 0' }}>
                    <Statistic
                      title="Cruceros Ejecutados / Programados"
                      value={selectedProject.stats.cruises_count || 0}
                      prefix={<CompassOutlined style={{ color: '#1B4F72' }} />}
                    />
                  </Card>
                </Col>
                <Col span={12}>
                  <Card bordered style={{ background: '#f5f7fa', borderRadius: 8, padding: '10px 0' }}>
                    <Statistic
                      title="Solicitudes de Embarcación"
                      value={selectedProject.stats.vessel_requests_count || 0}
                      prefix={<MailOutlined style={{ color: '#7f8c8d' }} />}
                    />
                  </Card>
                </Col>
              </Row>
            ) : (
              <Text type="secondary">Cargando estadísticas...</Text>
            )}

            <Divider style={{ margin: '20px 0' }} />

            {/* Listado Histórico */}
            <Tabs defaultActiveKey="1" style={{ background: '#ffffff', padding: '0 8px', borderRadius: 8 }}>
              <TabPane
                tab={
                  <span>
                    <CompassOutlined />
                    Cruceros Asociados ({selectedProject.cruises?.length || 0})
                  </span>
                }
                key="1"
              >
                <Table
                  dataSource={selectedProject.cruises || []}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 5 }}
                  columns={[
                    {
                      title: 'Folio Crucero',
                      dataIndex: 'cruise_number',
                      key: 'cruise_number',
                      render: (text) => <Text strong>{text || 'Pendiente'}</Text>,
                      width: 140,
                    },
                    {
                      title: 'Nombre de Campaña',
                      dataIndex: 'name',
                      key: 'name',
                      ellipsis: true,
                    },
                    {
                      title: 'Embarcación',
                      dataIndex: 'vessel_name',
                      key: 'vessel_name',
                      width: 120,
                    },
                    {
                      title: 'Estado',
                      dataIndex: 'status',
                      key: 'status',
                      render: (status) => {
                        const colors = {
                          borrador: 'default',
                          pendiente: 'orange',
                          planificado: 'blue',
                          en_curso: 'purple',
                          completado: 'green',
                          cancelado: 'red',
                        };
                        return <Tag color={colors[status] || 'default'}>{status.toUpperCase()}</Tag>;
                      },
                      width: 120,
                    },
                    {
                      title: 'Salida',
                      dataIndex: 'departure_date',
                      key: 'departure_date',
                      render: (date) => date ? dayjs(date).format('DD/MM/YYYY') : '—',
                      width: 110,
                    },
                  ]}
                />
              </TabPane>
              <TabPane
                tab={
                  <span>
                    <MailOutlined />
                    Solicitudes de Embarcación ({selectedProject.vessel_requests?.length || 0})
                  </span>
                }
                key="2"
              >
                <Table
                  dataSource={selectedProject.vessel_requests || []}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 5 }}
                  columns={[
                    {
                      title: 'ID Solicitud',
                      dataIndex: 'id',
                      key: 'id',
                      render: (text) => <Text strong>#{text}</Text>,
                      width: 100,
                    },
                    {
                      title: 'Solicitante',
                      dataIndex: 'applicant_name',
                      key: 'applicant_name',
                    },
                    {
                      title: 'Embarcación',
                      dataIndex: 'vessel_name',
                      key: 'vessel_name',
                      width: 120,
                    },
                    {
                      title: 'Estado',
                      dataIndex: 'status',
                      key: 'status',
                      render: (status) => {
                        const colors = {
                          pendiente: 'orange',
                          aprobada: 'green',
                          rechazada: 'red',
                        };
                        return <Tag color={colors[status] || 'default'}>{status.toUpperCase()}</Tag>;
                      },
                      width: 120,
                    },
                    {
                      title: 'Salida Planificada',
                      dataIndex: 'departure_date',
                      key: 'departure_date',
                      render: (date) => dayjs(date).format('DD/MM/YYYY'),
                      width: 130,
                    },
                  ]}
                />
              </TabPane>
            </Tabs>
          </div>
        )}
      </Drawer>

      {/* Modal Crear Proyecto */}
      <Modal
        title="Registrar Nuevo Proyecto de Investigación"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={handleCreateProject}
        confirmLoading={savingProject}
        okText="Registrar"
        cancelText="Cancelar"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="account_number"
            label="Número de Cuenta del Proyecto"
            rules={[
              { required: true, message: 'El número de cuenta es obligatorio.' },
              { min: 2, message: 'Debe tener al menos 2 caracteres.' }
            ]}
          >
            <Input placeholder="Ej. 624602 o D1A313" maxLength={100} />
          </Form.Item>
          <Form.Item
            name="name"
            label="Nombre del Proyecto"
            rules={[{ required: true, message: 'El nombre del proyecto es obligatorio.' }]}
          >
            <Input placeholder="Ej. Mantenimiento y Operación del B/O Alpha Helix" maxLength={300} />
          </Form.Item>
          <Form.Item
            name="responsible_name"
            label="Nombre del Responsable / PI"
            rules={[{ required: true, message: 'El nombre del responsable es obligatorio.' }]}
          >
            <Input placeholder="Ej. Dr. Emmanuel Valenzuela" maxLength={200} />
          </Form.Item>
          <Form.Item
            name="department"
            label="Departamento Académico / Administrativo"
            rules={[{ required: true, message: 'El departamento es obligatorio.' }]}
          >
            <Input placeholder="Ej. Embarcaciones Oceanográficas" maxLength={150} />
          </Form.Item>
          <Form.Item
            name="division"
            label="División de Adscripción"
            rules={[{ required: true, message: 'La división es obligatoria.' }]}
          >
            <Input placeholder="Ej. Oceanología" maxLength={150} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Editar Proyecto */}
      <Modal
        title="Editar Datos del Proyecto"
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleSaveEdit}
        confirmLoading={savingEdit}
        okText="Guardar"
        cancelText="Cancelar"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="account_number"
            label="Número de Cuenta del Proyecto"
            rules={[
              { required: true, message: 'El número de cuenta es obligatorio.' },
              { min: 2, message: 'Debe tener al menos 2 caracteres.' }
            ]}
          >
            <Input placeholder="Ej. 624602 o D1A313" maxLength={100} />
          </Form.Item>
          <Form.Item
            name="name"
            label="Nombre del Proyecto"
            rules={[{ required: true, message: 'El nombre del proyecto es obligatorio.' }]}
          >
            <Input placeholder="Ej. Mantenimiento y Operación del B/O Alpha Helix" maxLength={300} />
          </Form.Item>
          <Form.Item
            name="responsible_name"
            label="Nombre del Responsable / PI"
            rules={[{ required: true, message: 'El nombre del responsable es obligatorio.' }]}
          >
            <Input placeholder="Ej. Dr. Emmanuel Valenzuela" maxLength={200} />
          </Form.Item>
          <Form.Item
            name="department"
            label="Departamento Académico / Administrativo"
            rules={[{ required: true, message: 'El departamento es obligatorio.' }]}
          >
            <Input placeholder="Ej. Embarcaciones Oceanográficas" maxLength={150} />
          </Form.Item>
          <Form.Item
            name="division"
            label="División de Adscripción"
            rules={[{ required: true, message: 'La división es obligatoria.' }]}
          >
            <Input placeholder="Ej. Oceanología" maxLength={150} />
          </Form.Item>
          <Form.Item
            name="is_active"
            label="Estado del Proyecto"
          >
            <Select style={{ width: '100%' }}>
              <Select.Option value={true}>Activo</Select.Option>
              <Select.Option value={false}>Inactivo</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
