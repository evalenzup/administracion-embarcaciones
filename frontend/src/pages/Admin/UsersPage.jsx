/**
 * SIAE — Página de administración de usuarios.
 * CRUD completo con tabla, modal de creación/edición y asignación de roles.
 */

import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, Switch, Typography, Card, message, Popconfirm, Tooltip, Row, Col, Input as AntInput } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, CopyOutlined, KeyOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { CanAccess } from '../../components/common/CanAccess';

const { Title } = Typography;
const { Search } = AntInput;

function UsersPage() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [credentialsModalOpen, setCredentialsModalOpen] = useState(false);
  const [participantOptions, setParticipantOptions] = useState([]);
  const [personnelOptions, setPersonnelOptions] = useState([]);

  const generateRandomPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (pagination.current - 1) * pagination.pageSize;
      const params = { skip, limit: pagination.pageSize };
      if (search) params.search = search;

      const response = await apiClient.get('/users', { params });
      setUsers(response.data.items);
      setTotal(response.data.total);
    } catch {
      message.error('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, [pagination, search]);

  const fetchRoles = useCallback(async () => {
    try {
      const response = await apiClient.get('/roles', { params: { limit: 100 } });
      setRoles(response.data.items);
    } catch {
      // Silently fail
    }
  }, []);

  const fetchParticipantOptions = useCallback(async () => {
    try {
      const response = await apiClient.get('/participants/options');
      setParticipantOptions(response.data);
    } catch {
      // Silently fail
    }
  }, []);

  const fetchPersonnelOptions = useCallback(async () => {
    try {
      const response = await apiClient.get('/personnel', { params: { limit: 200 } });
      setPersonnelOptions(response.data.items);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { fetchRoles(); }, [fetchRoles]);
  useEffect(() => { fetchParticipantOptions(); }, [fetchParticipantOptions]);
  useEffect(() => { fetchPersonnelOptions(); }, [fetchPersonnelOptions]);

  const openCreateModal = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ 
      is_active: true, 
      role_ids: [],
      password: generateRandomPassword(),
      participant_profile_id: null,
      personnel_id: null
    });
    setModalOpen(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    form.resetFields();
    form.setFieldsValue({
      email: user.email,
      full_name: user.full_name,
      is_active: user.is_active,
      role_ids: user.roles.map((r) => r.id),
      participant_profile_id: user.participant_profile_id,
      personnel_id: user.personnel_id,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      if (editingUser) {
        await apiClient.put(`/users/${editingUser.id}`, values);
        message.success('Usuario actualizado');
        setModalOpen(false);
      } else {
        await apiClient.post('/users', values);
        message.success('Usuario creado');
        setCreatedCredentials({
          username: values.username,
          password: values.password,
          email: values.email,
          fullName: values.full_name
        });
        setModalOpen(false);
        setCredentialsModalOpen(true);
      }

      fetchUsers();
    } catch (error) {
      if (error.response?.data?.detail) {
        message.error(error.response.data.detail);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userId) => {
    try {
      await apiClient.delete(`/users/${userId}`);
      message.success('Usuario eliminado');
      fetchUsers();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Error al eliminar');
    }
  };

  const handleResetPasswordClick = (user) => {
    Modal.confirm({
      title: '¿Restablecer contraseña?',
      content: `Se generará una nueva contraseña temporal para el usuario ${user.username} (${user.full_name}). Esta acción no se puede deshacer.`,
      okText: 'Restablecer',
      cancelText: 'Cancelar',
      okType: 'danger',
      onOk: async () => {
        const tempPassword = generateRandomPassword();
        try {
          await apiClient.post(`/users/${user.id}/reset-password`, { password: tempPassword });
          message.success('Contraseña restablecida correctamente');
          setCreatedCredentials({
            username: user.username,
            password: tempPassword,
            email: user.email,
            fullName: user.full_name,
            isReset: true
          });
          setCredentialsModalOpen(true);
        } catch (error) {
          message.error(error.response?.data?.detail || 'Error al restablecer la contraseña');
        }
      }
    });
  };

  const columns = [
    {
      title: 'Usuario',
      dataIndex: 'username',
      key: 'username',
      render: (text, record) => (
        <Space>
          <strong>{text}</strong>
          {record.is_superadmin && <Tag color="gold">Superadmin</Tag>}
        </Space>
      ),
      sorter: (a, b) => (a.username || '').localeCompare(b.username || ''),
      defaultSortOrder: 'ascend',
    },
    {
      title: 'Nombre Completo',
      dataIndex: 'full_name',
      key: 'full_name',
      sorter: (a, b) => (a.full_name || '').localeCompare(b.full_name || ''),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      sorter: (a, b) => (a.email || '').localeCompare(b.email || ''),
    },
    {
      title: 'Roles',
      key: 'roles',
      render: (_, record) => (
        <Space wrap>
          {record.roles.map((role) => (
            <Tag key={role.id} color="blue">{role.name}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Estado',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active) => (
        <Tag color={active ? 'success' : 'default'}>
          {active ? 'Activo' : 'Inactivo'}
        </Tag>
      ),
      sorter: (a, b) => (a.is_active ? 1 : 0) - (b.is_active ? 1 : 0),
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space>
          <CanAccess module="users" action="edit">
            <Tooltip title="Editar">
              <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            </Tooltip>
            <Tooltip title="Restablecer Contraseña">
              <Button type="text" icon={<KeyOutlined style={{ color: '#fa8c16' }} />} onClick={() => handleResetPasswordClick(record)} />
            </Tooltip>
          </CanAccess>
          <CanAccess module="users" action="delete">
            {!record.is_superadmin && (
              <Popconfirm
                title="¿Eliminar usuario?"
                description="Esta acción no se puede deshacer"
                onConfirm={() => handleDelete(record.id)}
              >
                <Tooltip title="Eliminar">
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            )}
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
            Gestión de Usuarios
          </Title>
        </Col>
        <Col>
          <Space>
            <Search
              placeholder="Buscar usuario..."
              allowClear
              onSearch={(value) => {
                setSearch(value);
                setPagination({ ...pagination, current: 1 });
              }}
              style={{ width: 250 }}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchUsers} />
            <CanAccess module="users" action="create">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                Nuevo Usuario
              </Button>
            </CanAccess>
          </Space>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (total) => `${total} usuarios`,
            onChange: (page, size) => setPagination({ current: page, pageSize: size }),
          }}
        />
      </Card>

      {/* Modal crear/editar usuario */}
      <Modal
        title={editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText={editingUser ? 'Guardar' : 'Crear'}
        destroyOnClose
        width={500}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {!editingUser && (
            <Form.Item name="username" label="Nombre de usuario" rules={[{ required: true, message: 'Requerido' }]}>
              <Input placeholder="ej: jperez" />
            </Form.Item>
          )}
          {!editingUser && (
            <Form.Item label="Contraseña" required>
              <Row gutter={8}>
                <Col span={17}>
                  <Form.Item
                    name="password"
                    noStyle
                    rules={[{ required: true, min: 6, message: 'Mínimo 6 caracteres' }]}
                  >
                    <Input placeholder="Contraseña" />
                  </Form.Item>
                </Col>
                <Col span={7}>
                  <Button
                    onClick={() => {
                      form.setFieldsValue({ password: generateRandomPassword() });
                    }}
                    style={{ width: '100%' }}
                  >
                    Generar
                  </Button>
                </Col>
              </Row>
            </Form.Item>
          )}
          <Form.Item name="full_name" label="Nombre completo" rules={[{ required: true, message: 'Requerido' }]}>
            <Input placeholder="ej: Juan Pérez" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Email inválido' }]}>
            <Input placeholder="ej: jperez@cicese.mx" />
          </Form.Item>
          <Form.Item name="role_ids" label="Roles">
            <Select mode="multiple" placeholder="Seleccionar roles" optionFilterProp="label"
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
            />
          </Form.Item>
          <Form.Item 
            name="personnel_id" 
            label="Vincular con Personal del DEO (Tripulante)"
          >
            <Select
              allowClear
              showSearch
              placeholder="Buscar por nombre..."
              optionFilterProp="label"
              onChange={(val) => {
                if (val) {
                  form.setFieldsValue({ participant_profile_id: null });
                }
              }}
              options={personnelOptions.map((p) => ({ 
                value: p.id, 
                label: `${p.full_name} (${p.employee_number || 'DEO'})` 
              }))}
            />
          </Form.Item>

          <Form.Item 
            name="participant_profile_id" 
            label="Vincular con Participante del Catálogo (Investigador)"
          >
            <Select
              allowClear
              showSearch
              placeholder="Buscar por nombre..."
              optionFilterProp="label"
              onChange={(val) => {
                if (val) {
                  form.setFieldsValue({ personnel_id: null });
                }
              }}
              options={participantOptions.map((p) => ({ 
                value: p.id, 
                label: `${p.full_name} (${p.institution || 'Externo'})` 
              }))}
            />
          </Form.Item>
          <Form.Item name="is_active" label="Activo" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal de Credenciales Generadas */}
      {(() => {
        const accessUrl = window.location.origin.includes('localhost')
          ? 'http://158.97.12.24:3010'
          : window.location.origin;

        const isReset = createdCredentials?.isReset;

        return (
          <Modal
            title={<span style={{ color: '#0A2647', fontWeight: 600 }}>{isReset ? '¡Contraseña Restablecida Exitosamente!' : '¡Usuario Creado Exitosamente!'}</span>}
            open={credentialsModalOpen}
            onCancel={() => setCredentialsModalOpen(false)}
            footer={[
              <Button key="close" onClick={() => setCredentialsModalOpen(false)}>
                Cerrar
              </Button>,
              <Button
                key="copy"
                type="primary"
                icon={<CopyOutlined />}
                onClick={() => {
                  const text = `Usuario: ${createdCredentials?.username}\nContraseña temporal: ${createdCredentials?.password}\nEmail: ${createdCredentials?.email}\nAcceso: ${accessUrl}`;
                  navigator.clipboard.writeText(text);
                  message.success('Credenciales copiadas al portapapeles');
                }}
              >
                Copiar Credenciales
              </Button>
            ]}
            destroyOnClose
            width={450}
          >
            <div style={{ marginTop: 16 }}>
              <p style={{ color: '#555' }}>
                {isReset
                  ? 'Por favor, copia estas nuevas credenciales temporales y compártelas con el usuario. El usuario podrá cambiar esta contraseña por una personalizada desde su perfil.'
                  : 'Por favor, copia estas credenciales temporales y compártelas con el usuario. El usuario podrá cambiar esta contraseña por una personalizada desde su perfil.'}
              </p>
              <Card style={{ backgroundColor: '#f0f4f8', borderRadius: 8, marginTop: 16, border: '1px solid #dcdcdc' }}>
                <div style={{ marginBottom: 8 }}>
                  <strong>Nombre:</strong> {createdCredentials?.fullName}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>Usuario:</strong> <code style={{ fontSize: 14, backgroundColor: '#fff', padding: '2px 6px', borderRadius: 4, border: '1px solid #e0e0e0' }}>{createdCredentials?.username}</code>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>Contraseña Temporal:</strong> <code style={{ fontSize: 14, backgroundColor: '#fff', padding: '2px 6px', borderRadius: 4, border: '1px solid #e0e0e0', color: '#c0392b', fontWeight: 'bold' }}>{createdCredentials?.password}</code>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>Email:</strong> {createdCredentials?.email}
                </div>
                <div>
                  <strong>Enlace de Acceso:</strong> <a href={accessUrl} target="_blank" rel="noreferrer">{accessUrl}</a>
                </div>
              </Card>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

export default UsersPage;
