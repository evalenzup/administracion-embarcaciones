/**
 * SIAE — Página de administración de roles y permisos.
 * CRUD de roles con asignación visual de permisos por módulo.
 */

import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Typography, Card, message, Popconfirm, Tooltip, Row, Col, Checkbox, Divider } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, SafetyOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { CanAccess } from '../../components/common/CanAccess';

const { Title, Text } = Typography;

// Agrupar permisos por módulo para display
function groupPermissionsByModule(permissions) {
  const grouped = {};
  permissions.forEach((p) => {
    if (!grouped[p.module]) grouped[p.module] = [];
    grouped[p.module].push(p);
  });
  return grouped;
}

const MODULE_LABELS = {
  vessels: 'Embarcaciones',
  documents: 'Documentación',
  maintenance: 'Mantenimiento',
  inventory: 'Inventario',
  logbooks: 'Bitácoras',
  cruises: 'Cruceros',
  personnel: 'Personal DEO',
  users: 'Usuarios',
  roles: 'Roles',
  dashboard: 'Dashboard',
};

const ACTION_LABELS = {
  view: 'Ver',
  create: 'Crear',
  edit: 'Editar',
  delete: 'Eliminar',
};

function RolesPage() {
  const [rolesData, setRolesData] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [selectedPermIds, setSelectedPermIds] = useState([]);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/roles', { params: { limit: 100 } });
      setRolesData(response.data.items);
    } catch {
      message.error('Error al cargar roles');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPermissions = useCallback(async () => {
    try {
      const response = await apiClient.get('/roles/permissions');
      setPermissions(response.data.items);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);
  useEffect(() => { fetchPermissions(); }, [fetchPermissions]);

  const groupedPerms = groupPermissionsByModule(permissions);

  const openCreateModal = () => {
    setEditingRole(null);
    form.resetFields();
    setSelectedPermIds([]);
    setModalOpen(true);
  };

  const openEditModal = (role) => {
    setEditingRole(role);
    form.setFieldsValue({ name: role.name, description: role.description });
    setSelectedPermIds(role.permissions.map((p) => p.id));
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = { ...values, permission_ids: selectedPermIds };

      if (editingRole) {
        await apiClient.put(`/roles/${editingRole.id}`, payload);
        message.success('Rol actualizado');
      } else {
        await apiClient.post('/roles', payload);
        message.success('Rol creado');
      }

      setModalOpen(false);
      fetchRoles();
    } catch (error) {
      if (error.response?.data?.detail) {
        message.error(error.response.data.detail);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (roleId) => {
    try {
      await apiClient.delete(`/roles/${roleId}`);
      message.success('Rol eliminado');
      fetchRoles();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Error al eliminar');
    }
  };

  const togglePermission = (permId) => {
    setSelectedPermIds((prev) =>
      prev.includes(permId)
        ? prev.filter((id) => id !== permId)
        : [...prev, permId]
    );
  };

  const toggleModule = (modulePerms) => {
    const ids = modulePerms.map((p) => p.id);
    const allSelected = ids.every((id) => selectedPermIds.includes(id));
    if (allSelected) {
      setSelectedPermIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedPermIds((prev) => [...new Set([...prev, ...ids])]);
    }
  };

  const columns = [
    {
      title: 'Rol',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <Space>
          <SafetyOutlined style={{ color: '#1B4F72' }} />
          <strong>{name}</strong>
          {record.is_system_role && <Tag color="blue">Sistema</Tag>}
        </Space>
      ),
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      defaultSortOrder: 'ascend',
    },
    {
      title: 'Descripción',
      dataIndex: 'description',
      key: 'description',
      sorter: (a, b) => (a.description || '').localeCompare(b.description || ''),
    },
    {
      title: 'Permisos',
      key: 'permissions',
      render: (_, record) => (
        <Tag color="cyan">{record.permissions.length} permisos</Tag>
      ),
      sorter: (a, b) => (a.permissions?.length || 0) - (b.permissions?.length || 0),
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <CanAccess module="roles" action="edit">
            <Tooltip title="Editar">
              <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            </Tooltip>
          </CanAccess>
          <CanAccess module="roles" action="delete">
            {!record.is_system_role && (
              <Popconfirm
                title="¿Eliminar rol?"
                description="Los usuarios con este rol perderán sus permisos"
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
            Roles y Permisos
          </Title>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchRoles} />
            <CanAccess module="roles" action="create">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                Nuevo Rol
              </Button>
            </CanAccess>
          </Space>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={rolesData}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      {/* Modal crear/editar rol */}
      <Modal
        title={editingRole ? `Editar Rol: ${editingRole.name}` : 'Nuevo Rol'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText={editingRole ? 'Guardar' : 'Crear'}
        destroyOnClose
        width={650}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Nombre del rol" rules={[{ required: true, message: 'Requerido' }]}>
            <Input placeholder="ej: Supervisor" />
          </Form.Item>
          <Form.Item name="description" label="Descripción">
            <Input placeholder="ej: Supervisión de operaciones" />
          </Form.Item>
        </Form>

        <Divider style={{ marginBottom: 12 }}>Permisos</Divider>

        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          {Object.entries(groupedPerms).map(([module, perms]) => (
            <div key={module} style={{ marginBottom: 12, padding: '8px 12px', background: '#F8FAFC', borderRadius: 8 }}>
              <div style={{ marginBottom: 6 }}>
                <Checkbox
                  indeterminate={
                    perms.some((p) => selectedPermIds.includes(p.id)) &&
                    !perms.every((p) => selectedPermIds.includes(p.id))
                  }
                  checked={perms.every((p) => selectedPermIds.includes(p.id))}
                  onChange={() => toggleModule(perms)}
                >
                  <Text strong>{MODULE_LABELS[module] || module}</Text>
                </Checkbox>
              </div>
              <Space wrap style={{ marginLeft: 24 }}>
                {perms.map((perm) => (
                  <Checkbox
                    key={perm.id}
                    checked={selectedPermIds.includes(perm.id)}
                    onChange={() => togglePermission(perm.id)}
                  >
                    {ACTION_LABELS[perm.action] || perm.action}
                  </Checkbox>
                ))}
              </Space>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Text type="secondary">{selectedPermIds.length} permisos seleccionados</Text>
        </div>
      </Modal>
    </div>
  );
}

export default RolesPage;
