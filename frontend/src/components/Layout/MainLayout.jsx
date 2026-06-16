/**
 * SIAE — Layout principal con sidebar, header y contenido.
 * El menú se filtra según los permisos del usuario.
 */

import { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Space, Typography, Breadcrumb, Modal, Form, Input, message } from 'antd';
import {
  DashboardOutlined,
  FileTextOutlined,
  ToolOutlined,
  InboxOutlined,
  BookOutlined,
  CompassOutlined,
  TeamOutlined,
  UserOutlined,
  SafetyOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  UsergroupAddOutlined,
  KeyOutlined,
  QuestionCircleOutlined,
  MailOutlined,
  CalendarOutlined,
  ThunderboltOutlined,
  DollarOutlined,
  HistoryOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';

const ShipIcon = () => (
  <span role="img" className="anticon anticon-ship" style={{ display: 'inline-flex', alignItems: 'center' }}>
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 17h20l-2 4H4l-2-4z" />
      <path d="M5 17v-4h10v4" />
      <path d="M10 13V5M10 7h4l-2-2H10" />
    </svg>
  </span>
);

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

// Definición de items del menú con permisos requeridos
const menuConfig = [
  {
    type: 'group',
    label: 'Inicio',
    children: [
      {
        key: '/',
        icon: <DashboardOutlined />,
        label: 'Dashboard',
        permission: { module: 'dashboard', action: 'view' },
      },
      {
        key: '/agenda',
        icon: <CalendarOutlined />,
        label: 'Calendario',
      },
    ]
  },
  {
    type: 'group',
    label: 'Operaciones',
    children: [
      {
        key: '/requests',
        icon: <MailOutlined />,
        label: 'Solicitudes',
        permission: { module: 'vessel_requests', action: 'view' },
      },
      {
        key: '/cruises',
        icon: <CompassOutlined />,
        label: 'Cruceros',
        permission: { module: 'cruises', action: 'view' },
      },
      {
        key: '/billing',
        icon: <DollarOutlined />,
        label: 'Facturación y Cobros',
        permission: { module: 'billing', action: 'view' },
      },
    ]
  },
  {
    type: 'group',
    label: 'Finanzas',
    children: [
      {
        key: '/finance/petty-cash',
        icon: <WalletOutlined />,
        label: 'Fondo Fijo',
        permission: { module: 'petty_cash', action: 'view' },
      },
    ]
  },
  {
    type: 'group',
    label: 'Gestión Técnica',
    children: [
      {
        key: '/vessels',
        icon: <ShipIcon />,
        label: 'Embarcaciones',
        permission: { module: 'vessels', action: 'view' },
      },
      {
        key: '/documents',
        icon: <FileTextOutlined />,
        label: 'Documentación',
        permission: { module: 'documents', action: 'view' },
      },
      {
        key: '/equipment',
        icon: <SettingOutlined />,
        label: 'Equipos y Sist.',
        permission: { module: 'equipment', action: 'view' },
      },
      {
        key: '/maintenance',
        icon: <ToolOutlined />,
        label: 'Mantenimiento',
        permission: { module: 'maintenance', action: 'view' },
      },
      {
        key: '/inventory',
        icon: <InboxOutlined />,
        label: 'Inventario',
        permission: { module: 'inventory', action: 'view' },
      },
      {
        key: '/logbooks',
        icon: <BookOutlined />,
        label: 'Bitácoras',
        permission: { module: 'logbooks', action: 'view' },
      },
      {
        key: '/fuel-logs',
        icon: <ThunderboltOutlined />,
        label: 'Combustible',
        permission: { module: 'fuel_logs', action: 'view' },
      },
    ]
  },
  {
    type: 'group',
    label: 'Catálogos',
    children: [
      {
        key: '/personnel',
        icon: <TeamOutlined />,
        label: 'Personal DEO',
        permission: { module: 'personnel', action: 'view' },
      },
      {
        key: '/participants',
        icon: <UsergroupAddOutlined />,
        label: 'Participantes de cruc.',
        permission: { module: 'participants', action: 'view' },
      },
    ]
  },
  {
    type: 'group',
    label: 'Administración',
    children: [
      {
        key: '/admin/users',
        icon: <UserOutlined />,
        label: 'Usuarios',
        permission: { module: 'users', action: 'view' },
      },
      {
        key: '/admin/roles',
        icon: <SafetyOutlined />,
        label: 'Roles y Permisos',
        permission: { module: 'roles', action: 'view' },
      },
      {
        key: '/admin/ports',
        icon: <CompassOutlined />,
        label: 'Puertos',
        permission: { module: 'ports', action: 'view' },
      },
      {
        key: '/admin/audit',
        icon: <HistoryOutlined />,
        label: 'Actividad del Sistema',
        permission: { module: 'users', action: 'view' },
      },
    ]
  },
  { type: 'divider' },
  {
    key: '/help',
    icon: <QuestionCircleOutlined />,
    label: 'Ayuda y Manuales',
  },
];

// Mapa de rutas a breadcrumbs
const breadcrumbMap = {
  '/': 'Dashboard',
  '/agenda': 'Calendario de Disponibilidad',
  '/vessels': 'Embarcaciones',
  '/requests': 'Gestión de Solicitudes',
  '/documents': 'Documentación',
  '/equipment': 'Equipos y Sistemas',
  '/maintenance': 'Mantenimiento',
  '/inventory': 'Inventario',
  '/logbooks': 'Bitácoras',
  '/cruises': 'Cruceros',
  '/participants': 'Participantes de Crucero',
  '/personnel': 'Personal DEO',
  '/admin/users': 'Usuarios',
  '/admin/roles': 'Roles y Permisos',
  '/admin/ports': 'Puertos',
  '/admin/audit': 'Actividad del Sistema',
  '/fuel-logs': 'Combustible',
  '/billing': 'Facturación y Cobros',
  '/finance/petty-cash': 'Fondo Fijo (Caja Chica)',
  '/help': 'Ayuda y Manuales',
};

function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [changePasswordForm] = Form.useForm();

  const handleChangePassword = async () => {
    try {
      const values = await changePasswordForm.validateFields();
      setChangingPassword(true);

      await apiClient.put('/auth/change-password', {
        current_password: values.current_password,
        new_password: values.new_password
      });

      message.success('Contraseña actualizada correctamente');
      setChangePasswordOpen(false);
      changePasswordForm.resetFields();
    } catch (error) {
      if (error.response?.data?.detail) {
        message.error(error.response.data.detail);
      } else {
        message.error('Error al cambiar la contraseña');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  // Filtrar menú según permisos
  const filteredMenu = menuConfig
    .map((item) => {
      if (item.type === 'divider') return { type: 'divider' };
      
      if (item.type === 'group') {
        const filteredChildren = (item.children || [])
          .filter((child) => {
            if (!child.permission) return true;
            return hasPermission(child.permission.module, child.permission.action);
          })
          .map((child) => ({
            key: child.key,
            icon: child.icon,
            label: child.label,
          }));

        if (filteredChildren.length > 0) {
          return {
            type: 'group',
            label: item.label,
            children: filteredChildren,
          };
        }
        return null;
      }

      if (item.permission && !hasPermission(item.permission.module, item.permission.action)) {
        return null;
      }
      return {
        key: item.key,
        icon: item.icon,
        label: item.label,
      };
    })
    .filter(Boolean);

  // Dropdown del usuario
  const userMenuItems = [
    {
      key: 'my-profile',
      icon: <UserOutlined />,
      label: 'Mi Perfil',
    },
    {
      key: 'change-password',
      icon: <KeyOutlined />,
      label: 'Cambiar Contraseña',
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Cerrar Sesión',
      danger: true,
    },
  ];

  const handleUserMenu = ({ key }) => {
    if (key === 'logout') {
      logout();
      navigate('/login');
    } else if (key === 'change-password') {
      setChangePasswordOpen(true);
    } else if (key === 'my-profile') {
      navigate('/participants?self=true');
    }
  };

  // Obtener breadcrumb actual
  const currentPath = location.pathname;
  const currentTitle = breadcrumbMap[currentPath] || 'Inicio';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Sidebar */}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={250}
        style={styles.sider}
        breakpoint="lg"
        onBreakpoint={(broken) => setCollapsed(broken)}
      >
        {/* Logo */}
        <div style={{
          ...styles.logo,
          height: collapsed ? 64 : 150,
          flexDirection: 'column',
          transition: 'all 0.3s',
        }} className="siae-logo">
          <img
            src="/SIAE_Logo_shield_Isotipo_dark.svg"
            alt="SIAE"
            style={{
              width: collapsed ? 44 : 88,
              height: collapsed ? 44 : 88,
              transition: 'all 0.3s',
            }}
          />
          {!collapsed && (
            <div style={{
              color: '#fff',
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 4,
              marginTop: 10,
              textAlign: 'center',
              lineHeight: 1,
            }}>
              SIAE
            </div>
          )}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[currentPath]}
          items={filteredMenu}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>

      <Layout>
        {/* Header */}
        <Header style={styles.header}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <div
                onClick={() => setCollapsed(!collapsed)}
                style={styles.trigger}
              >
                {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              </div>
              <Breadcrumb
                items={[
                  { title: 'SIAE' },
                  { title: currentTitle },
                ]}
                style={{ margin: 0 }}
              />
            </Space>

            <Dropdown
              menu={{ items: userMenuItems, onClick: handleUserMenu }}
              placement="bottomRight"
              arrow
            >
              <Space style={{ cursor: 'pointer' }}>
                <Avatar
                  style={{ backgroundColor: '#1B4F72' }}
                  icon={<UserOutlined />}
                  size="small"
                />
                <Text strong style={{ fontSize: 13 }}>
                  {user?.full_name || 'Usuario'}
                </Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        {/* Contenido */}
        <Content style={styles.content}>
          <Outlet />
        </Content>
      </Layout>

      {/* Modal Cambiar Contraseña */}
      <Modal
        title={<span style={{ color: '#0A2647', fontWeight: 600 }}>Cambiar Contraseña</span>}
        open={changePasswordOpen}
        onCancel={() => {
          setChangePasswordOpen(false);
          changePasswordForm.resetFields();
        }}
        onOk={handleChangePassword}
        confirmLoading={changingPassword}
        okText="Cambiar Contraseña"
        cancelText="Cancelar"
        destroyOnClose
        width={400}
      >
        <Form form={changePasswordForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="current_password"
            label="Contraseña Actual"
            rules={[{ required: true, message: 'Ingresa tu contraseña actual' }]}
          >
            <Input.Password placeholder="Contraseña actual" />
          </Form.Item>
          <Form.Item
            name="new_password"
            label="Nueva Contraseña"
            rules={[
              { required: true, message: 'Ingresa tu nueva contraseña' },
              { min: 6, message: 'Mínimo 6 caracteres' }
            ]}
          >
            <Input.Password placeholder="Nueva contraseña" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="Confirmar Nueva Contraseña"
            dependencies={['new_password']}
            rules={[
              { required: true, message: 'Confirma tu nueva contraseña' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Las contraseñas no coinciden'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="Confirmar contraseña" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}

const styles = {
  sider: {
    background: '#0A2647',
    boxShadow: '2px 0 12px rgba(0,0,0,0.15)',
    overflow: 'auto',
    height: '100vh',
    position: 'sticky',
    top: 0,
    left: 0,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 64,
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  header: {
    background: '#fff',
    padding: '0 24px',
    display: 'flex',
    alignItems: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    height: 64,
  },
  trigger: {
    fontSize: 18,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 6,
    transition: 'background 0.2s',
    color: '#1B4F72',
  },
  content: {
    margin: 0,
    padding: 24,
    minHeight: 'calc(100vh - 64px)',
    background: '#F0F4F8',
  },
};

export default MainLayout;
