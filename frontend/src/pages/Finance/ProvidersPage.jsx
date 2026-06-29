/**
 * SIAE — Módulo de Catálogo de Proveedores (Finanzas)
 * Permite gestionar proveedores, editar sus nombres comerciales
 * y ver un historial consolidado de servicios y facturas de caja chica asociadas.
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
  TeamOutlined,
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  SyncOutlined,
  FileTextOutlined,
  WalletOutlined,
  DollarOutlined,
  ArrowRightOutlined,
  DownloadOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const host = '';

export default function ProvidersPage() {
  const { hasPermission } = useAuth();

  // Estados principales
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Filtros de búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState(true);

  // Modal Crear Proveedor
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [createForm] = Form.useForm();

  // Modal Editar Proveedor
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm] = Form.useForm();

  // Modal Previsualizar PDF Facturas
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');

  const handleDownloadPdf = async () => {
    if (!pdfPreviewUrl) return;
    try {
      message.loading({ content: "Descargando archivo PDF...", key: "pdfDownload" });
      const response = await fetch(pdfPreviewUrl);
      const blob = await response.blob();
      const filename = pdfPreviewUrl.split('/').pop() || 'factura.pdf';
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      message.success({ content: "PDF descargado con éxito.", key: "pdfDownload", duration: 2 });
    } catch (error) {
      message.error({ content: "Error al descargar el archivo PDF.", key: "pdfDownload", duration: 3 });
    }
  };

  const handlePreviewPdf = (pdfPath) => {
    if (!pdfPath) return;
    const url = pdfPath.startsWith('http') ? pdfPath : `${host}${pdfPath}`;
    setPdfPreviewUrl(url);
    setPdfPreviewOpen(true);
  };

  // Cargar lista de proveedores
  const loadProviders = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/providers', {
        params: {
          search: searchTerm || undefined,
          active_only: activeFilter,
        },
      });
      setProviders(res.data);
    } catch (err) {
      message.error('Error al cargar la lista de proveedores.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, [activeFilter]);

  const handleSearch = () => {
    loadProviders();
  };

  // Cargar detalles estadísticos e historial del proveedor
  const loadProviderDetail = async (id) => {
    setDetailLoading(true);
    try {
      const res = await apiClient.get(`/providers/${id}`);
      setSelectedProvider(res.data);
    } catch (err) {
      message.error('Error al cargar la información del proveedor.');
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleViewDetail = (record) => {
    setSelectedProvider({ ...record, stats: {}, services: [], petty_cash: [] });
    setDrawerOpen(true);
    loadProviderDetail(record.id);
  };

  // Crear proveedor manualmente
  const handleCreateProvider = async () => {
    try {
      const values = await createForm.validateFields();
      setSavingProvider(true);

      await apiClient.post('/providers', {
        rfc: values.rfc.toUpperCase().trim(),
        legal_name: values.legal_name?.trim() || null,
        commercial_name: values.commercial_name?.trim() || null,
      });

      message.success('Proveedor registrado con éxito.');
      createForm.resetFields();
      setCreateModalOpen(false);
      loadProviders();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Error al guardar el proveedor.';
      message.error(errorMsg);
      console.error(err);
    } finally {
      setSavingProvider(false);
    }
  };

  // Abrir modal edición
  const handleOpenEditModal = (provider, e) => {
    if (e) e.stopPropagation();
    setEditingProvider(provider);
    editForm.setFieldsValue({
      commercial_name: provider.commercial_name || '',
      is_active: provider.is_active,
    });
    setEditModalOpen(true);
  };

  // Guardar cambios de edición
  const handleSaveEdit = async () => {
    try {
      const values = await editForm.validateFields();
      setSavingEdit(true);

      const res = await apiClient.put(`/providers/${editingProvider.id}`, {
        commercial_name: values.commercial_name?.trim() || null,
        is_active: values.is_active,
      });

      message.success('Proveedor actualizado correctamente.');
      setEditModalOpen(false);
      
      // Si el drawer está abierto para este proveedor, refrescar
      if (selectedProvider && selectedProvider.id === editingProvider.id) {
        loadProviderDetail(editingProvider.id);
      }
      loadProviders();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Error al actualizar el proveedor.';
      message.error(errorMsg);
      console.error(err);
    } finally {
      setSavingEdit(false);
    }
  };

  // Eliminar o desactivar proveedor
  const handleDeleteProvider = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      const res = await apiClient.delete(`/providers/${id}`);
      if (res.data.status === 'deactivated') {
        message.warning(res.data.message);
      } else {
        message.success(res.data.message);
      }
      if (selectedProvider?.id === id) {
        setDrawerOpen(false);
      }
      loadProviders();
    } catch (err) {
      message.error('Error al eliminar el proveedor.');
      console.error(err);
    }
  };

  const columns = [
    {
      title: 'Nombre Comercial',
      dataIndex: 'commercial_name',
      key: 'commercial_name',
      render: (text, record) => (
        <Text strong style={{ color: text ? '#1890ff' : '#595959' }}>
          {text || record.legal_name || 'Sin Nombre Comercial'}
        </Text>
      ),
      sorter: (a, b) => (a.commercial_name || a.legal_name || '').localeCompare(b.commercial_name || b.legal_name || ''),
      defaultSortOrder: 'ascend',
    },
    {
      title: 'RFC',
      dataIndex: 'rfc',
      key: 'rfc',
      render: (text) => <Text code>{text}</Text>,
      sorter: (a, b) => (a.rfc || '').localeCompare(b.rfc || ''),
    },
    {
      title: 'Razón Social (SAT)',
      dataIndex: 'legal_name',
      key: 'legal_name',
      render: (text) => text || <Text type="secondary">—</Text>,
      sorter: (a, b) => (a.legal_name || '').localeCompare(b.legal_name || ''),
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
      sorter: (a, b) => (a.is_active ? 1 : 0) - (b.is_active ? 1 : 0),
    },
    {
      title: 'Fecha Registro',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => dayjs(date).format('DD/MM/YYYY'),
      sorter: (a, b) => dayjs(a.created_at || 0).unix() - dayjs(b.created_at || 0).unix(),
    },
    {
      title: 'Acciones',
      key: 'actions',
      render: (_, record) => (
        <Space size="middle" onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Ver historial y estadísticas">
            <Button
              type="text"
              icon={<EyeOutlined style={{ color: '#1890ff' }} />}
              onClick={() => handleViewDetail(record)}
            />
          </Tooltip>
          {hasPermission('providers', 'edit') && (
            <Tooltip title="Editar nombre comercial">
              <Button
                type="text"
                icon={<EditOutlined style={{ color: '#fa8c16' }} />}
                onClick={(e) => handleOpenEditModal(record, e)}
              />
            </Tooltip>
          )}
          {hasPermission('providers', 'delete') && (
            <Popconfirm
              title="¿Está seguro de eliminar o desactivar este proveedor?"
              onConfirm={(e) => handleDeleteProvider(record.id, e)}
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
          <Title level={2} style={{ margin: 0 }}>
            <TeamOutlined style={{ marginRight: 8, color: '#1890ff' }} />
            Catálogo de Proveedores
          </Title>
          <Text type="secondary">
            Administración centralizada de proveedores generados automáticamente de facturas XML o ingresados de forma manual.
          </Text>
        </div>
        {hasPermission('providers', 'create') && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalOpen(true)}
            size="large"
            style={{ borderRadius: 8, boxShadow: '0 4px 10px rgba(24, 144, 255, 0.2)' }}
          >
            Registrar Proveedor Manual
          </Button>
        )}
      </div>

      {/* KPIs */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <Statistic
              title="Total Proveedores"
              value={providers.length}
              prefix={<TeamOutlined style={{ color: '#1890ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', background: '#f6ffed' }}>
            <Statistic
              title="Proveedores Activos"
              value={providers.filter((p) => p.is_active).length}
              valueStyle={{ color: '#52c41a' }}
              prefix={<Badge status="success" />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', background: '#fff1f0' }}>
            <Statistic
              title="Proveedores Inactivos"
              value={providers.filter((p) => !p.is_active).length}
              valueStyle={{ color: '#f5222d' }}
              prefix={<Badge status="error" />}
            />
          </Card>
        </Col>
      </Row>

      {/* Buscadores y Filtros */}
      <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <Input
            placeholder="Buscar por RFC, Razón Social o Nombre Comercial..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 350, borderRadius: 8 }}
          />
          <Select
            value={activeFilter}
            onChange={(val) => setActiveFilter(val)}
            style={{ width: 180 }}
          >
            <Select.Option value={true}>Solo Activos</Select.Option>
            <Select.Option value={false}>Mostrar Todos</Select.Option>
          </Select>
          <Button type="primary" onClick={handleSearch} style={{ borderRadius: 8 }}>
            Buscar
          </Button>
          <Button
            onClick={() => {
              setSearchTerm('');
              setActiveFilter(true);
              setLoading(true);
              apiClient.get('/providers', { params: { active_only: true } }).then((res) => {
                setProviders(res.data);
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
          dataSource={providers}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          style={{ cursor: 'pointer' }}
          onRow={(record) => ({
            onClick: () => handleViewDetail(record),
          })}
        />
      </Card>

      {/* Drawer de Detalle Histórico Consolidado */}
      <Drawer
        title={
          selectedProvider ? (
            <Space>
              <Title level={4} style={{ margin: 0, color: '#002c8c' }}>
                {selectedProvider.commercial_name || selectedProvider.legal_name || 'Proveedor'}
              </Title>
              <Tag color={selectedProvider.is_active ? 'green' : 'red'}>
                {selectedProvider.is_active ? 'Activo' : 'Inactivo'}
              </Tag>
            </Space>
          ) : (
            'Cargando...'
          )
        }
        width={750}
        onClose={() => setDrawerOpen(false)}
        visible={drawerOpen}
        bodyStyle={{ paddingBottom: 60 }}
      >
        {selectedProvider && (
          <div>
            <Descriptions title="Ficha del Proveedor" bordered column={2} size="small">
              <Descriptions.Item label="Nombre Comercial" span={2}>
                <Space>
                  <Text strong>{selectedProvider.commercial_name || 'No especificado'}</Text>
                  {hasPermission('providers', 'edit') && (
                    <Button
                      type="link"
                      icon={<EditOutlined />}
                      size="small"
                      onClick={(e) => handleOpenEditModal(selectedProvider, e)}
                    >
                      Renombrar
                    </Button>
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="RFC">
                <Text code>{selectedProvider.rfc}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Razón Social (SAT)">
                {selectedProvider.legal_name || <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Creado el">
                {dayjs(selectedProvider.created_at).format('DD/MM/YYYY HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label="Última Modificación">
                {dayjs(selectedProvider.updated_at).format('DD/MM/YYYY HH:mm')}
              </Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '20px 0' }} />

            {/* Estadísticas de gasto */}
            <Title level={5}>Resumen de Gastos del Departamento</Title>
            {selectedProvider.stats ? (
              <Row gutter={16} style={{ marginBottom: 20 }}>
                <Col span={8}>
                  <Card bordered style={{ background: '#f9f0ff', borderRadius: 8, padding: '10px 0' }}>
                    <Statistic
                      title="Servicios Contratados"
                      value={selectedProvider.stats.services_count || 0}
                      prefix={<FileTextOutlined style={{ color: '#722ed1' }} />}
                    />
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary">Total: </Text>
                      <Text strong style={{ color: '#722ed1' }}>
                        {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(selectedProvider.stats.services_total || 0)}
                      </Text>
                    </div>
                  </Card>
                </Col>
                <Col span={8}>
                  <Card bordered style={{ background: '#e6f7ff', borderRadius: 8, padding: '10px 0' }}>
                    <Statistic
                      title="Facturas Fondo Fijo"
                      value={selectedProvider.stats.petty_cash_count || 0}
                      prefix={<WalletOutlined style={{ color: '#1890ff' }} />}
                    />
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary">Total: </Text>
                      <Text strong style={{ color: '#1890ff' }}>
                        {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(selectedProvider.stats.petty_cash_total || 0)}
                      </Text>
                    </div>
                  </Card>
                </Col>
                <Col span={8}>
                  <Card bordered style={{ background: '#f6ffed', borderRadius: 8, padding: '10px 0' }}>
                    <Statistic
                      title="Gasto Acumulado"
                      value={selectedProvider.stats.total_spent || 0}
                      valueStyle={{ color: '#3f8600' }}
                      formatter={(val) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val)}
                      prefix={<DollarOutlined />}
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
                    <FileTextOutlined />
                    Servicios de Terceros ({selectedProvider.services?.length || 0})
                  </span>
                }
                key="1"
              >
                <Table
                  dataSource={selectedProvider.services || []}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 5 }}
                  columns={[
                    {
                      title: 'Folio',
                      dataIndex: 'internal_folio',
                      key: 'internal_folio',
                      render: (text, record) => {
                        if (record.invoice_pdf_file) {
                          return (
                            <Button 
                              type="link" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreviewPdf(record.invoice_pdf_file);
                              }}
                              style={{ padding: 0, fontWeight: 'bold', height: 'auto' }}
                            >
                              {text}
                            </Button>
                          );
                        }
                        return <Text strong>{text}</Text>;
                      },
                      width: 120,
                    },
                    {
                      title: 'e-Pisa',
                      dataIndex: 'episa_folio',
                      key: 'episa_folio',
                      width: 120,
                    },
                    {
                      title: 'Presupuesto',
                      dataIndex: 'budget_amount',
                      key: 'budget_amount',
                      render: (amount) => (
                        <Text strong>
                          {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount)}
                        </Text>
                      ),
                      width: 130,
                    },
                    {
                      title: 'Estado',
                      dataIndex: 'status',
                      key: 'status',
                      render: (status) => {
                        const colors = { solicitado: 'blue', aprobado_hacienda: 'orange', en_proceso_pago: 'purple', pagado: 'green', cancelado: 'red' };
                        return <Tag color={colors[status] || 'default'}>{status}</Tag>;
                      },
                      width: 130,
                    },
                    {
                      title: 'Fecha',
                      dataIndex: 'created_at',
                      key: 'created_at',
                      render: (date) => dayjs(date).format('DD/MM/YYYY'),
                      width: 110,
                    },
                  ]}
                />
              </TabPane>
              <TabPane
                tab={
                  <span>
                    <WalletOutlined />
                    Fondo Fijo / Caja Chica ({selectedProvider.petty_cash?.length || 0})
                  </span>
                }
                key="2"
              >
                <Table
                  dataSource={selectedProvider.petty_cash || []}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 5 }}
                  columns={[
                    {
                      title: 'Folio Factura',
                      dataIndex: 'folio',
                      key: 'folio',
                      render: (text, record) => {
                        const displayVal = text || record.uuid?.substring(0, 8) || 'Manual';
                        if (record.pdf_filename) {
                          return (
                            <Button 
                              type="link" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreviewPdf(record.pdf_filename);
                              }}
                              style={{ padding: 0, fontWeight: 'bold', height: 'auto' }}
                            >
                              {displayVal}
                            </Button>
                          );
                        }
                        return <Text strong>{displayVal}</Text>;
                      },
                      width: 120,
                    },
                    {
                      title: 'Categoría',
                      dataIndex: 'category_name',
                      key: 'category_name',
                      render: (text) => (
                        <Tag color="default" style={{ whiteSpace: 'normal', height: 'auto', display: 'inline-block', maxWidth: '100%' }}>
                          {text}
                        </Tag>
                      ),
                      width: 180,
                    },
                    {
                      title: 'Concepto / Descripción',
                      dataIndex: 'description',
                      key: 'description',
                      ellipsis: true,
                    },
                    {
                      title: 'Total Facturado',
                      dataIndex: 'total',
                      key: 'total',
                      render: (amount) => (
                        <Text strong style={{ color: '#3f8600' }}>
                          {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount)}
                        </Text>
                      ),
                      width: 130,
                    },
                    {
                      title: 'Fecha',
                      dataIndex: 'created_at',
                      key: 'created_at',
                      render: (date) => dayjs(date).format('DD/MM/YYYY'),
                      width: 110,
                    },
                  ]}
                />
              </TabPane>
            </Tabs>
          </div>
        )}
      </Drawer>

      {/* Modal Crear Proveedor */}
      <Modal
        title="Registrar Nuevo Proveedor Manual"
        visible={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={handleCreateProvider}
        confirmLoading={savingProvider}
        okText="Registrar"
        cancelText="Cancelar"
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="rfc"
            label="RFC del Proveedor"
            rules={[
              { required: true, message: 'El RFC es obligatorio.' },
              { pattern: /^[A-Z&Ññ]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{3}$/i, message: 'Formato de RFC no válido.' },
            ]}
          >
            <Input placeholder="Ej. ABC010101XYZ" maxLength={13} style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item
            name="legal_name"
            label="Razón Social Oficial (SAT)"
            rules={[{ required: true, message: 'La Razón Social oficial es obligatoria.' }]}
          >
            <Input placeholder="Ej. COMPUTADORAS Y SERVICIOS S.A. DE C.V." maxLength={200} />
          </Form.Item>
          <Form.Item
            name="commercial_name"
            label="Nombre Comercial / Identificador Familiar (Opcional)"
          >
            <Input placeholder="Ej. Compuservicios Ensenada" maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Editar Proveedor */}
      <Modal
        title="Editar Datos del Proveedor"
        visible={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleSaveEdit}
        confirmLoading={savingEdit}
        okText="Guardar"
        cancelText="Cancelar"
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="commercial_name"
            label="Nombre Comercial / Identificador Familiar"
          >
            <Input placeholder="Ej. Compuservicios Ensenada" maxLength={200} />
          </Form.Item>
          <Form.Item
            name="is_active"
            label="Estado del Proveedor"
            valuePropName="checked"
          >
            <Input type="checkbox" style={{ display: 'none' }} />
            {/* Usar checkbox nativo estilizado o select en lugar de un checkbox oculto */}
            <Select style={{ width: '100%' }}>
              <Select.Option value={true}>Activo</Select.Option>
              <Select.Option value={false}>Inactivo</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Previsualización PDF */}
      <Modal
        title={<strong>Previsualización de Documento</strong>}
        visible={pdfPreviewOpen}
        onCancel={() => {
          setPdfPreviewOpen(false);
          setPdfPreviewUrl('');
        }}
        footer={[
          <Button key="close" onClick={() => {
            setPdfPreviewOpen(false);
            setPdfPreviewUrl('');
          }}>
            Cerrar
          </Button>,
          <Button 
            key="download" 
            icon={<DownloadOutlined />} 
            onClick={handleDownloadPdf}
          >
            Descargar PDF
          </Button>,
          <Button key="open-tab" type="primary" href={pdfPreviewUrl} target="_blank">
            Abrir en pestaña nueva
          </Button>
        ]}
        width={850}
        style={{ top: 40 }}
        destroyOnHidden
      >
        {pdfPreviewUrl ? (
          <div style={{ height: '65vh', background: '#f0f2f5', borderRadius: 8, overflow: 'hidden' }}>
            <iframe 
              src={`${pdfPreviewUrl}#toolbar=0`} 
              width="100%" 
              height="100%" 
              style={{ border: 'none' }}
              title="Previsualización de PDF"
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
