/**
 * SIAE — Actividad del Sistema (Logs de Auditoría).
 * Filtros avanzados y vista de detalles de acciones realizadas.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select,
  DatePicker, Typography, Card, Row, Col, message, Tooltip, Divider, Avatar
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, HistoryOutlined, EyeOutlined,
  InfoCircleOutlined, UserOutlined, CalendarOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const ACTION_COLORS = {
  create: 'success',
  update: 'processing',
  delete: 'error',
  login: 'default',
};

const ACTION_LABELS = {
  create: 'CREACIÓN',
  update: 'EDICIÓN',
  delete: 'ELIMINACIÓN',
  login: 'INICIO SESIÓN',
};

const MODULE_NAMES = {
  vessels: 'Embarcaciones',
  users: 'Usuarios',
  roles: 'Roles y Permisos',
  documents: 'Documentos',
  maintenance: 'Mantenimiento',
  inventory: 'Inventario',
  logbooks: 'Bitácoras',
  cruises: 'Cruceros',
  personnel: 'Personal DEO',
  ports: 'Puertos',
  billing: 'Facturación y Cobros',
  vessel_requests: 'Solicitudes',
  fuel_logs: 'Combustibles',
};

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [selectedLog, setSelectedLog] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Filters State
  const [username, setUsername] = useState('');
  const [module, setModule] = useState(undefined);
  const [action, setAction] = useState(undefined);
  const [dateRange, setDateRange] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (pagination.current - 1) * pagination.pageSize;
      const params = {
        skip,
        limit: pagination.pageSize,
      };

      if (username) params.username = username;
      if (module) params.module = module;
      if (action) params.action = action;
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.start_date = dateRange[0].format('YYYY-MM-DD');
        params.end_date = dateRange[1].format('YYYY-MM-DD');
      }

      const response = await apiClient.get('/audit', { params });
      setLogs(response.data.items);
      setTotal(response.data.total);
    } catch {
      message.error('Error al cargar la actividad del sistema');
    } finally {
      setLoading(false);
    }
  }, [pagination, username, module, action, dateRange]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleResetFilters = () => {
    setUsername('');
    setModule(undefined);
    setAction(undefined);
    setDateRange(null);
    setPagination({ ...pagination, current: 1 });
  };

  const handleOpenDetail = (log) => {
    setSelectedLog(log);
    setDetailModalOpen(true);
  };

  const columns = [
    {
      title: 'Fecha / Hora',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (date) => dayjs(date).format('DD/MM/YYYY HH:mm:ss'),
    },
    {
      title: 'Usuario',
      dataIndex: 'username',
      key: 'username',
      width: 140,
      render: (user) => (
        <Space size={6}>
          <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
          <Text strong>{user}</Text>
        </Space>
      ),
    },
    {
      title: 'Acción',
      dataIndex: 'action',
      key: 'action',
      width: 130,
      render: (act) => {
        const val = act?.toLowerCase();
        return (
          <Tag color={ACTION_COLORS[val] || 'default'} style={{ fontWeight: 600 }}>
            {ACTION_LABELS[val] || act?.toUpperCase()}
          </Tag>
        );
      },
    },
    {
      title: 'Módulo',
      dataIndex: 'module',
      key: 'module',
      width: 160,
      render: (mod) => <Tag color="cyan">{MODULE_NAMES[mod] || mod}</Tag>,
    },
    {
      title: 'Descripción',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 80,
      fixed: 'right',
      render: (_, record) => (
        <Tooltip title="Ver detalles completo">
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => handleOpenDetail(record)}
          />
        </Tooltip>
      ),
    },
  ];

  // Formato de JSON bonito
  const renderPrettyDetails = (detailsStr) => {
    if (!detailsStr) return <Text type="secondary" style={{ fontStyle: 'italic' }}>Sin detalles adicionales registrados.</Text>;
    try {
      // Intentar parsear si es JSON
      const parsed = JSON.parse(detailsStr);
      return (
        <pre style={{
          background: '#f6f8fa',
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid #e1e4e8',
          fontSize: '12px',
          overflowX: 'auto',
          margin: 0,
          maxHeight: '300px'
        }}>
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      // Si no es JSON válido, retornar texto plano
      return (
        <pre style={{
          background: '#f6f8fa',
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid #e1e4e8',
          fontSize: '12px',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          margin: 0,
          maxHeight: '300px'
        }}>
          {detailsStr}
        </pre>
      );
    }
  };

  return (
    <div className="animate-fade-in">
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <Title level={3} style={{ color: '#0A2647', margin: 0 }}>
            <HistoryOutlined style={{ marginRight: 8 }} />
            Actividad del Sistema
          </Title>
          <Text type="secondary">Registro histórico de acciones de auditoría realizadas por los usuarios.</Text>
        </Col>
      </Row>

      {/* Panel de Filtros */}
      <Card style={{ borderRadius: 12, marginBottom: 16 }} styles={{ body: { padding: '16px 20px' } }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 12 }}>Usuario</Text></div>
            <Input
              placeholder="Buscar por nombre..."
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setPagination({ ...pagination, current: 1 });
              }}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 12 }}>Módulo</Text></div>
            <Select
              placeholder="Todos los módulos"
              style={{ width: '100%' }}
              value={module}
              onChange={(value) => {
                setModule(value);
                setPagination({ ...pagination, current: 1 });
              }}
              allowClear
            >
              {Object.entries(MODULE_NAMES).map(([key, name]) => (
                <Option key={key} value={key}>{name}</Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={5}>
            <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 12 }}>Acción</Text></div>
            <Select
              placeholder="Todas las acciones"
              style={{ width: '100%' }}
              value={action}
              onChange={(value) => {
                setAction(value);
                setPagination({ ...pagination, current: 1 });
              }}
              allowClear
            >
              {Object.entries(ACTION_LABELS).map(([key, label]) => (
                <Option key={key} value={key}>{label}</Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 12 }}>Rango de Fechas</Text></div>
            <RangePicker
              style={{ width: '100%' }}
              value={dateRange}
              onChange={(dates) => {
                setDateRange(dates);
                setPagination({ ...pagination, current: 1 });
              }}
              placeholder={['Inicio', 'Fin']}
            />
          </Col>
          <Col xs={24} md={2} style={{ display: 'flex', gap: 8, alignSelf: 'flex-end', height: 32 }}>
            <Button
              type="default"
              icon={<ReloadOutlined />}
              onClick={handleResetFilters}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              Limpiar
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Tabla de Logs */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `${t} registros`,
            onChange: (p, s) => setPagination({ current: p, pageSize: s }),
          }}
        />
      </Card>

      {/* Modal de Detalle */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <InfoCircleOutlined style={{ color: '#1890ff' }} />
            <span>Detalle de Actividad</span>
          </div>
        }
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setDetailModalOpen(false)}>
            Cerrar
          </Button>
        ]}
        width={650}
        destroyOnClose
      >
        {selectedLog && (
          <div style={{ marginTop: 16 }}>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <div style={{ marginBottom: 2 }}><Text type="secondary" style={{ fontSize: 12 }}>Usuario</Text></div>
                <Text strong style={{ fontSize: 14 }}>{selectedLog.username}</Text>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 2 }}><Text type="secondary" style={{ fontSize: 12 }}>Fecha / Hora</Text></div>
                <Text strong style={{ fontSize: 14 }}>
                  {dayjs(selectedLog.created_at).format('DD/MM/YYYY HH:mm:ss')}
                </Text>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 2 }}><Text type="secondary" style={{ fontSize: 12 }}>Módulo afectado</Text></div>
                <Tag color="cyan">{MODULE_NAMES[selectedLog.module] || selectedLog.module}</Tag>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 2 }}><Text type="secondary" style={{ fontSize: 12 }}>Acción ejecutada</Text></div>
                <Tag color={ACTION_COLORS[selectedLog.action?.toLowerCase()] || 'default'}>
                  {ACTION_LABELS[selectedLog.action?.toLowerCase()] || selectedLog.action?.toUpperCase()}
                </Tag>
              </Col>
              {selectedLog.ip_address && (
                <Col span={24}>
                  <div style={{ marginBottom: 2 }}><Text type="secondary" style={{ fontSize: 12 }}>Dirección IP</Text></div>
                  <Text code>{selectedLog.ip_address}</Text>
                </Col>
              )}
              <Col span={24}>
                <div style={{ marginBottom: 2 }}><Text type="secondary" style={{ fontSize: 12 }}>Descripción</Text></div>
                <Paragraph style={{ margin: 0, fontSize: 13 }}>{selectedLog.description}</Paragraph>
              </Col>
            </Row>

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ marginBottom: 8 }}>
              <Text strong style={{ fontSize: 13 }}>Metadatos / Detalles del cambio:</Text>
            </div>
            {renderPrettyDetails(selectedLog.details)}
          </div>
        )}
      </Modal>
    </div>
  );
}
