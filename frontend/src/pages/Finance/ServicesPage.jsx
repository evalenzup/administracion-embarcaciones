/**
 * SIAE — Módulo de Solicitudes de Servicios de Terceros (Finanzas)
 * Permite gestionar el flujo completo de solicitudes de servicios, documentando
 * cada etapa, tiempos de espera, bitácora de observaciones y validación de archivos.
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
  Modal,
  Form,
  InputNumber,
  Tooltip,
  Typography,
  message,
  Popconfirm,
  Badge,
  Drawer,
  Steps,
  Timeline,
  Divider,
  Upload,
  Descriptions,
  DatePicker,
} from 'antd';
import {
  AppstoreOutlined,
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  DeleteOutlined,
  SyncOutlined,
  ArrowRightOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  MessageOutlined,
  PaperClipOutlined,
  UploadOutlined,
  EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// Mapeo estético de etapas
const stageConfig = {
  solicitado: {
    label: 'Solicitado',
    color: 'blue',
    icon: <ClockCircleOutlined />,
    badgeStatus: 'processing',
    bg: 'linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%)',
    border: '1px solid #91d5ff',
    textColor: '#1890ff',
  },
  aprobado_hacienda: {
    label: 'Aprobado por Hacienda',
    color: 'orange',
    icon: <ClockCircleOutlined />,
    badgeStatus: 'warning',
    bg: 'linear-gradient(135deg, #fff7e6 0%, #ffd591 100%)',
    border: '1px solid #ffd591',
    textColor: '#fa8c16',
  },
  en_proceso_pago: {
    label: 'En Proceso de Pago',
    color: 'purple',
    icon: <ClockCircleOutlined />,
    badgeStatus: 'default',
    bg: 'linear-gradient(135deg, #f9f0ff 0%, #d3adf7 100%)',
    border: '1px solid #d3adf7',
    textColor: '#722ed1',
  },
  pagado: {
    label: 'Pagado',
    color: 'green',
    icon: <CheckCircleOutlined />,
    badgeStatus: 'success',
    bg: 'linear-gradient(135deg, #f6ffed 0%, #b7eb8f 100%)',
    border: '1px solid #b7eb8f',
    textColor: '#52c41a',
  },
  cancelado: {
    label: 'Cancelado',
    color: 'red',
    icon: <CloseCircleOutlined />,
    badgeStatus: 'error',
    bg: 'linear-gradient(135deg, #fff1f0 0%, #ffccc7 100%)',
    border: '1px solid #ffccc7',
    textColor: '#f5222d',
  },
};

export default function ServicesPage() {
  const { hasPermission } = useAuth();

  // Estados principales
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Filtros de búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(undefined);

  // Modal para Nueva Solicitud
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [savingService, setSavingService] = useState(false);
  const [createForm] = Form.useForm();
  const [budgetFileList, setBudgetFileList] = useState([]);
  const [providers, setProviders] = useState([]);
  const [isNewProvider, setIsNewProvider] = useState(false);

  // Modal de Transición de Etapa
  const [transitionModalOpen, setTransitionModalOpen] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState(null); // 'aprobado_hacienda', 'en_proceso_pago', 'pagado', 'cancelado'
  const [transitionForm] = Form.useForm();
  const [savingTransition, setSavingTransition] = useState(false);

  // Archivos adjuntos para transición
  const [authEmailFileList, setAuthEmailFileList] = useState([]);
  const [xmlFileList, setXmlFileList] = useState([]);
  const [pdfFileList, setPdfFileList] = useState([]);
  const [conformityFileList, setConformityFileList] = useState([]);
  const [paymentFileList, setPaymentFileList] = useState([]);

  // Modal de edición de historial de etapas
  const [editHistoryModalOpen, setEditHistoryModalOpen] = useState(false);
  const [editingHistoryItem, setEditingHistoryItem] = useState(null);
  const [savingHistoryEdit, setSavingHistoryEdit] = useState(false);
  const [historyEditForm] = Form.useForm();

  const handleOpenEditHistoryModal = (item) => {
    setEditingHistoryItem(item);
    historyEditForm.setFieldsValue({
      entered_at: dayjs(item.entered_at),
      notes: item.notes || '',
    });
    setEditHistoryModalOpen(true);
  };

  const handleSaveHistoryEdit = async () => {
    try {
      const values = await historyEditForm.validateFields();
      setSavingHistoryEdit(true);

      const res = await apiClient.put(
        `/services/${selectedService.id}/history/${editingHistoryItem.id}`,
        {
          entered_at: values.entered_at.format('YYYY-MM-DDTHH:mm:ss'),
          notes: values.notes?.trim() || null,
        }
      );

      message.success('Fecha de la etapa actualizada correctamente.');
      setEditHistoryModalOpen(false);
      setSelectedService(res.data);
      loadServices();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Error al actualizar la fecha de la etapa.';
      message.error(errorMsg);
      console.error(err);
    } finally {
      setSavingHistoryEdit(false);
    }
  };

  const handleReplaceDocument = async (documentType, file) => {
    try {
      const formData = new FormData();
      formData.append('document_type', documentType);
      formData.append('file', file);

      message.loading({ content: 'Subiendo archivo...', key: 'uploading_doc' });

      const res = await apiClient.put(
        `/services/${selectedService.id}/documents`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      message.success({ content: 'Documento actualizado correctamente.', key: 'uploading_doc' });
      setSelectedService(res.data);
      loadServices();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Error al actualizar el documento.';
      message.error({ content: errorMsg, key: 'uploading_doc' });
      console.error(err);
    }
  };

  // Bitácora / Observación rápida
  const [newObservation, setNewObservation] = useState('');
  const [observationDate, setObservationDate] = useState(dayjs());
  const [savingObservation, setSavingObservation] = useState(false);

  // Cargar lista de servicios
  const loadServices = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/services', {
        params: {
          status: statusFilter,
          search: searchTerm || undefined,
        },
      });
      setServices(res.data);
    } catch (err) {
      message.error('Error al cargar las solicitudes de servicios.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadProvidersList = async () => {
    try {
      const res = await apiClient.get('/providers?active_only=true');
      setProviders(res.data);
    } catch (err) {
      console.error('Error al cargar proveedores:', err);
    }
  };

  useEffect(() => {
    loadServices();
    loadProvidersList();
  }, [statusFilter]);

  // Buscar con debounce básico al presionar enter o buscar manualmente
  const handleSearch = () => {
    loadServices();
  };

  // Cargar detalle completo de una solicitud
  const loadServiceDetail = async (id) => {
    setDetailLoading(true);
    try {
      const res = await apiClient.get(`/services/${id}`);
      setSelectedService(res.data);
      // Si el drawer está abierto, refrescamos el seleccionado
    } catch (err) {
      message.error('Error al cargar el detalle del servicio.');
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleViewDetail = (record) => {
    setSelectedService(record);
    setDrawerOpen(true);
    setNewObservation('');
    setObservationDate(dayjs());
    loadServiceDetail(record.id);
  };

  // Registro de nueva solicitud
  const handleCreateService = async () => {
    try {
      const values = await createForm.validateFields();
      setSavingService(true);

      const formData = new FormData();
      if (values.provider_id && values.provider_id !== 'NEW') {
        formData.append('provider_id', values.provider_id);
      }
      if (values.provider_name) {
        formData.append('provider_name', values.provider_name);
      }
      formData.append('description', values.description);
      formData.append('episa_folio', values.episa_folio);
      formData.append('budget_amount', values.budget_amount);
      if (values.date) {
        formData.append('date', values.date.format('YYYY-MM-DDTHH:mm:ss'));
      }

      if (budgetFileList.length > 0) {
        formData.append('budget_file', budgetFileList[0]);
      }

      await apiClient.post('/services', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      message.success('Solicitud de servicio registrada con éxito.');
      createForm.resetFields();
      setBudgetFileList([]);
      setCreateModalOpen(false);
      loadServices();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Error al guardar la solicitud.';
      message.error(errorMsg);
      console.error(err);
    } finally {
      setSavingService(false);
    }
  };

  // Apertura de modal de transición
  const showTransitionModal = (targetStage) => {
    setTransitionTarget(targetStage);
    transitionForm.resetFields();
    transitionForm.setFieldsValue({ date: dayjs() });
    setAuthEmailFileList([]);
    setXmlFileList([]);
    setPdfFileList([]);
    setConformityFileList([]);
    setPaymentFileList([]);
    setTransitionModalOpen(true);
  };

  // Guardar transición de etapa
  const handleSaveTransition = async () => {
    try {
      const values = await transitionForm.validateFields();
      setSavingTransition(true);

      const formData = new FormData();
      formData.append('status', transitionTarget);
      if (values.notes) {
        formData.append('notes', values.notes);
      }
      if (values.date) {
        formData.append('date', values.date.format('YYYY-MM-DDTHH:mm:ss'));
      }

      if (transitionTarget === 'aprobado_hacienda') {
        if (authEmailFileList.length > 0) {
          formData.append('authorization_email_file', authEmailFileList[0]);
        }
      } else if (transitionTarget === 'en_proceso_pago') {
        if (xmlFileList.length === 0 || pdfFileList.length === 0) {
          message.error('Los archivos XML y PDF de la factura son obligatorios.');
          setSavingTransition(false);
          return;
        }
        formData.append('xml_file', xmlFileList[0]);
        formData.append('pdf_file', pdfFileList[0]);
        if (conformityFileList.length > 0) {
          formData.append('conformity_file', conformityFileList[0]);
        }
      } else if (transitionTarget === 'pagado') {
        if (paymentFileList.length > 0) {
          formData.append('payment_file', paymentFileList[0]);
        }
      }

      const res = await apiClient.put(`/services/${selectedService.id}/stage`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      message.success(`Servicio actualizado a etapa: ${stageConfig[transitionTarget].label}`);
      setTransitionModalOpen(false);
      
      // Refrescar detail y lista general
      setSelectedService(res.data);
      loadServiceDetail(selectedService.id);
      loadServices();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Error al actualizar la etapa del servicio.';
      message.error(errorMsg);
      console.error(err);
    } finally {
      setSavingTransition(false);
    }
  };

  // Agregar observación/incidencia rápida
  const handleAddObservation = async () => {
    if (!newObservation.trim()) return;
    setSavingObservation(true);
    try {
      await apiClient.post(`/services/${selectedService.id}/observations`, {
        notes: newObservation,
        created_at: observationDate ? observationDate.toISOString() : undefined,
      });
      message.success('Observación registrada en la bitácora.');
      setNewObservation('');
      setObservationDate(dayjs());
      // Refrescar detail
      loadServiceDetail(selectedService.id);
      loadServices();
    } catch (err) {
      message.error('Error al agregar la observación.');
      console.error(err);
    } finally {
      setSavingObservation(false);
    }
  };

  // Eliminar solicitud
  const handleDeleteService = async (id) => {
    try {
      await apiClient.delete(`/services/${id}`);
      message.success('Solicitud de servicio eliminada permanentemente.');
      if (selectedService?.id === id) {
        setDrawerOpen(false);
      }
      loadServices();
    } catch (err) {
      message.error('Error al eliminar la solicitud.');
      console.error(err);
    }
  };

  // Conteos para KPIs
  const counts = {
    total: services.length,
    solicitado: services.filter((s) => s.status === 'solicitado').length,
    aprobado_hacienda: services.filter((s) => s.status === 'aprobado_hacienda').length,
    en_proceso_pago: services.filter((s) => s.status === 'en_proceso_pago').length,
    pagado: services.filter((s) => s.status === 'pagado').length,
    cancelado: services.filter((s) => s.status === 'cancelado').length,
  };

  const columns = [
    {
      title: 'Folio e-Pisa',
      dataIndex: 'episa_folio',
      key: 'episa_folio',
      render: (text) => <Tag color="blue">{text}</Tag>,
      sorter: (a, b) => (a.episa_folio || '').localeCompare(b.episa_folio || ''),
    },
    {
      title: 'Proveedor',
      key: 'provider_name',
      render: (_, record) => {
        const p = record.provider;
        const name = p ? (p.commercial_name || p.legal_name) : record.provider_name;
        return <Text strong>{name}</Text>;
      },
    },
    {
      title: 'Descripción',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Monto Presupuesto',
      dataIndex: 'budget_amount',
      key: 'budget_amount',
      render: (amount) => (
        <Text strong>
          {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount)}
        </Text>
      ),
    },
    {
      title: 'Estado',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const conf = stageConfig[status];
        return (
          <Tag color={conf.color} icon={conf.icon}>
            {conf.label}
          </Tag>
        );
      },
    },
    {
      title: 'Fecha Solicitud',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => dayjs(date).format('DD/MM/YYYY HH:mm'),
      sorter: (a, b) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Acciones',
      key: 'actions',
      render: (_, record) => (
        <Space size="middle">
          <Tooltip title="Ver detalle">
            <Button
              type="text"
              icon={<EyeOutlined style={{ color: '#1890ff' }} />}
              onClick={(e) => {
                e.stopPropagation();
                handleViewDetail(record);
              }}
            />
          </Tooltip>
          {hasPermission('services', 'delete') && (
            <span onClick={(e) => e.stopPropagation()}>
              <Popconfirm
                title="¿Está seguro de eliminar esta solicitud de servicio de forma permanente?"
                onConfirm={() => handleDeleteService(record.id)}
                okText="Sí, eliminar"
                cancelText="No"
                okButtonProps={{ danger: true }}
              >
                <Tooltip title="Eliminar definitivamente">
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                  />
                </Tooltip>
              </Popconfirm>
            </span>
          )}
        </Space>
      ),
    },
  ];

  // Determinar los pasos del ciclo de vida
  const getStepIndex = (status) => {
    const steps = ['solicitado', 'aprobado_hacienda', 'en_proceso_pago', 'pagado'];
    if (status === 'cancelado') return -1;
    return steps.indexOf(status);
  };

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            <AppstoreOutlined style={{ marginRight: 8, color: '#1890ff' }} />
            Módulo de Servicios de Terceros
          </Title>
          <Text type="secondary">
            Administración del ciclo de vida y documentación de solicitudes de servicios externos.
          </Text>
        </div>
        {hasPermission('services', 'create') && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalOpen(true)}
            size="large"
            style={{ borderRadius: 8, boxShadow: '0 4px 10px rgba(24, 144, 255, 0.2)' }}
          >
            Registrar Presupuesto / Servicio
          </Button>
        )}
      </div>

      {/* KPIs Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={12} md={4}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', background: 'linear-gradient(135deg, #ffffff 0%, #f5f5f5 100%)' }}>
            <Badge status="default" text="Total General" style={{ fontWeight: 600 }} />
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 10, color: '#262626' }}>{counts.total}</div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={4}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', background: stageConfig.solicitado.bg }}>
            <Badge status={stageConfig.solicitado.badgeStatus} text="Solicitado" style={{ fontWeight: 600 }} />
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 10, color: stageConfig.solicitado.textColor }}>{counts.solicitado}</div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={4}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', background: stageConfig.aprobado_hacienda.bg }}>
            <Badge status={stageConfig.aprobado_hacienda.badgeStatus} text="Aprobado Hacienda" style={{ fontWeight: 600 }} />
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 10, color: stageConfig.aprobado_hacienda.textColor }}>{counts.aprobado_hacienda}</div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={4}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', background: stageConfig.en_proceso_pago.bg }}>
            <Badge status={stageConfig.en_proceso_pago.badgeStatus} text="En Proceso Pago" style={{ fontWeight: 600 }} />
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 10, color: stageConfig.en_proceso_pago.textColor }}>{counts.en_proceso_pago}</div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={4}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', background: stageConfig.pagado.bg }}>
            <Badge status={stageConfig.pagado.badgeStatus} text="Pagado" style={{ fontWeight: 600 }} />
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 10, color: stageConfig.pagado.textColor }}>{counts.pagado}</div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={4}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', background: stageConfig.cancelado.bg }}>
            <Badge status={stageConfig.cancelado.badgeStatus} text="Cancelados" style={{ fontWeight: 600 }} />
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 10, color: stageConfig.cancelado.textColor }}>{counts.cancelado}</div>
          </Card>
        </Col>
      </Row>

      {/* Filtros y Tabla */}
      <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <Input
            placeholder="Buscar por proveedor, folios o descripción..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 320, borderRadius: 8 }}
          />
          <Select
            placeholder="Filtrar por etapa"
            allowClear
            value={statusFilter}
            onChange={(val) => setStatusFilter(val)}
            style={{ width: 200 }}
          >
            <Option value="solicitado">Solicitado</Option>
            <Option value="aprobado_hacienda">Aprobado por Hacienda</Option>
            <Option value="en_proceso_pago">En Proceso de Pago</Option>
            <Option value="pagado">Pagado</Option>
            <Option value="cancelado">Cancelado</Option>
          </Select>
          <Button type="primary" onClick={handleSearch} style={{ borderRadius: 8 }}>
            Buscar
          </Button>
          <Button
            onClick={() => {
              setSearchTerm('');
              setStatusFilter(undefined);
              // Forzar recarga con estado limpio
              setLoading(true);
              apiClient.get('/services').then((res) => {
                setServices(res.data);
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
          dataSource={services}
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

      {/* Drawer de Detalle Completo */}
      <Drawer
        title={
          selectedService ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '95%' }}>
              <Space>
                <Title level={4} style={{ margin: 0, color: '#002c8c' }}>
                  {selectedService.internal_folio}
                </Title>
                <Tag color={stageConfig[selectedService.status].color}>
                  {stageConfig[selectedService.status].label}
                </Tag>
              </Space>
              {selectedService.status !== 'pagado' && selectedService.status !== 'cancelado' && (
                <Space>
                  {selectedService.status === 'solicitado' && (
                    <Button
                      type="primary"
                      onClick={() => showTransitionModal('aprobado_hacienda')}
                      style={{ background: '#fa8c16', borderColor: '#fa8c16' }}
                    >
                      Aprobar en Hacienda <ArrowRightOutlined />
                    </Button>
                  )}
                  {selectedService.status === 'aprobado_hacienda' && (
                    <Button
                      type="primary"
                      onClick={() => showTransitionModal('en_proceso_pago')}
                      style={{ background: '#722ed1', borderColor: '#722ed1' }}
                    >
                      Enviar a Pago (Subir Facturas) <ArrowRightOutlined />
                    </Button>
                  )}
                  {selectedService.status === 'en_proceso_pago' && (
                    <Button
                      type="primary"
                      onClick={() => showTransitionModal('pagado')}
                      style={{ background: '#52c41a', borderColor: '#52c41a' }}
                    >
                      Marcar como Pagado <CheckCircleOutlined />
                    </Button>
                  )}
                  <Button
                    type="primary"
                    danger
                    onClick={() => showTransitionModal('cancelado')}
                  >
                    Cancelar Servicio
                  </Button>
                </Space>
              )}
            </div>
          ) : (
            'Cargando...'
          )
        }
        width={750}
        onClose={() => setDrawerOpen(false)}
        visible={drawerOpen}
        bodyStyle={{ paddingBottom: 80 }}
      >
        {selectedService && (
          <div>
            {/* Lifeline Stepper (except cancelado) */}
            {selectedService.status !== 'cancelado' ? (
              <Steps
                current={getStepIndex(selectedService.status)}
                size="small"
                style={{ marginBottom: 24, padding: '12px 20px', background: '#f5f5f5', borderRadius: 8 }}
              >
                <Steps.Step title="Solicitado" description={selectedService.stage_durations?.solicitado ? `Espera: ${selectedService.stage_durations.solicitado}` : ''} />
                <Steps.Step title="Hacienda" description={selectedService.stage_durations?.aprobado_hacienda ? `Espera: ${selectedService.stage_durations.aprobado_hacienda}` : ''} />
                <Steps.Step title="En Proceso Pago" description={selectedService.stage_durations?.en_proceso_pago ? `Espera: ${selectedService.stage_durations.en_proceso_pago}` : ''} />
                <Steps.Step title="Pagado" />
              </Steps>
            ) : (
              <div style={{ padding: '16px', background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 8, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
                <CloseCircleOutlined style={{ fontSize: 24, color: '#f5222d' }} />
                <div>
                  <Text strong style={{ color: '#cf1322' }}>Servicio Cancelado</Text>
                  <br />
                  <Text type="secondary">Consulte las notas en el historial a continuación.</Text>
                </div>
              </div>
            )}

            <Descriptions title="Información General" bordered column={2} size="small">
              <Descriptions.Item label="Proveedor" span={2}>
                <Space direction="vertical" size={2}>
                  <Text strong>
                    {selectedService.provider ? (selectedService.provider.commercial_name || selectedService.provider.legal_name) : selectedService.provider_name}
                  </Text>
                  {selectedService.provider && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Razón Social: {selectedService.provider.legal_name} | RFC: <Text code style={{ fontSize: 11 }}>{selectedService.provider.rfc}</Text>
                    </Text>
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Folio e-Pisa">
                <Tag color="blue">{selectedService.episa_folio}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Monto Presupuesto">
                <Text strong style={{ color: '#3f8600' }}>
                  {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(selectedService.budget_amount)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Registrado Por">
                {selectedService.created_by_name}
              </Descriptions.Item>
              <Descriptions.Item label="Creado el">
                {dayjs(selectedService.created_at).format('DD/MM/YYYY HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label="Última modificación">
                {dayjs(selectedService.updated_at).format('DD/MM/YYYY HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label="Descripción del Servicio" span={2}>
                <Paragraph style={{ margin: 0 }}>{selectedService.description}</Paragraph>
              </Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '20px 0' }} />

            {/* Document Repositories */}
            <Title level={5}>Expediente de Documentos</Title>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#fafafa', padding: 16, borderRadius: 8, border: '1px solid #f0f0f0' }}>
              {/* Presupuesto */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <FilePdfOutlined style={{ color: '#f5222d', fontSize: 18 }} />
                  <Text strong>Archivo de Presupuesto Inicial (e-Pisa)</Text>
                </Space>
                <Space>
                  {selectedService.budget_file && (
                    <Button type="primary" size="small" ghost href={selectedService.budget_file} target="_blank" icon={<EyeOutlined />}>
                      Ver Presupuesto
                    </Button>
                  )}
                  {hasPermission('services', 'edit') && selectedService.budget_file && (
                    <Upload
                      showUploadList={false}
                      beforeUpload={(file) => {
                        handleReplaceDocument('budget', file);
                        return false;
                      }}
                    >
                      <Button size="small" icon={<UploadOutlined />} type="dashed">
                        Reemplazar
                      </Button>
                    </Upload>
                  )}
                  {!selectedService.budget_file && (
                    <Text type="secondary">No cargado</Text>
                  )}
                </Space>
              </div>

              {/* Hacienda Correo */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <PaperClipOutlined style={{ color: '#fa8c16', fontSize: 18 }} />
                  <Text strong>Captura/Correo de Autorización de Hacienda</Text>
                </Space>
                <Space>
                  {selectedService.authorization_email_file && (
                    <Button type="primary" size="small" ghost href={selectedService.authorization_email_file} target="_blank" icon={<EyeOutlined />}>
                      Ver Captura
                    </Button>
                  )}
                  {hasPermission('services', 'edit') && selectedService.authorization_email_file && (
                    <Upload
                      showUploadList={false}
                      beforeUpload={(file) => {
                        handleReplaceDocument('authorization_email', file);
                        return false;
                      }}
                    >
                      <Button size="small" icon={<UploadOutlined />} type="dashed">
                        Reemplazar
                      </Button>
                    </Upload>
                  )}
                  {!selectedService.authorization_email_file && (
                    <Text type="secondary">No cargado (Opcional)</Text>
                  )}
                </Space>
              </div>

              {/* XML Factura */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <FileExcelOutlined style={{ color: '#52c41a', fontSize: 18 }} />
                  <Text strong>Factura XML (Obligatorio en Pago)</Text>
                </Space>
                <Space>
                  {selectedService.invoice_xml_file && (
                    <Button type="primary" size="small" ghost href={selectedService.invoice_xml_file} target="_blank" icon={<EyeOutlined />}>
                      Descargar XML
                    </Button>
                  )}
                  {hasPermission('services', 'edit') && selectedService.invoice_xml_file && (
                    <Upload
                      showUploadList={false}
                      beforeUpload={(file) => {
                        handleReplaceDocument('invoice_xml', file);
                        return false;
                      }}
                    >
                      <Button size="small" icon={<UploadOutlined />} type="dashed">
                        Reemplazar
                      </Button>
                    </Upload>
                  )}
                  {!selectedService.invoice_xml_file && (
                    <Text type="secondary">No cargado</Text>
                  )}
                </Space>
              </div>

              {/* PDF Factura */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <FilePdfOutlined style={{ color: '#f5222d', fontSize: 18 }} />
                  <Text strong>Factura PDF (Obligatorio en Pago)</Text>
                </Space>
                <Space>
                  {selectedService.invoice_pdf_file && (
                    <Button type="primary" size="small" ghost href={selectedService.invoice_pdf_file} target="_blank" icon={<EyeOutlined />}>
                      Ver Factura PDF
                    </Button>
                  )}
                  {hasPermission('services', 'edit') && selectedService.invoice_pdf_file && (
                    <Upload
                      showUploadList={false}
                      beforeUpload={(file) => {
                        handleReplaceDocument('invoice_pdf', file);
                        return false;
                      }}
                    >
                      <Button size="small" icon={<UploadOutlined />} type="dashed">
                        Reemplazar
                      </Button>
                    </Upload>
                  )}
                  {!selectedService.invoice_pdf_file && (
                    <Text type="secondary">No cargado</Text>
                  )}
                </Space>
              </div>

              {/* Carta Conformidad */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <PaperClipOutlined style={{ color: '#722ed1', fontSize: 18 }} />
                  <Text strong>Carta de Conformidad Firmada</Text>
                </Space>
                <Space>
                  {selectedService.conformity_letter_file && (
                    <Button type="primary" size="small" ghost href={selectedService.conformity_letter_file} target="_blank" icon={<EyeOutlined />}>
                      Ver Carta
                    </Button>
                  )}
                  {hasPermission('services', 'edit') && selectedService.conformity_letter_file && (
                    <Upload
                      showUploadList={false}
                      beforeUpload={(file) => {
                        handleReplaceDocument('conformity_letter', file);
                        return false;
                      }}
                    >
                      <Button size="small" icon={<UploadOutlined />} type="dashed">
                        Reemplazar
                      </Button>
                    </Upload>
                  )}
                  {!selectedService.conformity_letter_file && (
                    <Text type="secondary">No cargado (Opcional)</Text>
                  )}
                </Space>
              </div>

              {/* Comprobante de Pago */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />
                  <Text strong>Comprobante de Pago Completo</Text>
                </Space>
                <Space>
                  {selectedService.payment_receipt_file && (
                    <Button type="primary" size="small" ghost href={selectedService.payment_receipt_file} target="_blank" icon={<EyeOutlined />}>
                      Ver Comprobante
                    </Button>
                  )}
                  {hasPermission('services', 'edit') && selectedService.payment_receipt_file && (
                    <Upload
                      showUploadList={false}
                      beforeUpload={(file) => {
                        handleReplaceDocument('payment_receipt', file);
                        return false;
                      }}
                    >
                      <Button size="small" icon={<UploadOutlined />} type="dashed">
                        Reemplazar
                      </Button>
                    </Upload>
                  )}
                  {!selectedService.payment_receipt_file && (
                    <Text type="secondary">No cargado (Opcional)</Text>
                  )}
                </Space>
              </div>
            </div>

            <Divider style={{ margin: '20px 0' }} />

            {/* Bitácora de Observaciones y Transición */}
            <Title level={5}>
              <MessageOutlined style={{ marginRight: 8 }} />
              Bitácora de Observaciones / Correcciones
            </Title>
            <div style={{ maxHeight: 250, overflowY: 'auto', paddingRight: 10, marginBottom: 16 }}>
              {selectedService.observations && selectedService.observations.length > 0 ? (
                <Timeline mode="left">
                  {selectedService.observations.map((obs) => (
                    <Timeline.Item key={obs.id} label={dayjs(obs.created_at).format('DD/MM/YY HH:mm')}>
                      <Text strong style={{ color: '#002c8c' }}>{obs.user_name || 'Sistema'}</Text>
                      <br />
                      <Text>{obs.notes}</Text>
                    </Timeline.Item>
                  ))}
                </Timeline>
              ) : (
                <Text type="secondary">No hay observaciones registradas en esta solicitud.</Text>
              )}
            </div>

            <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, border: '1px solid #f0f0f0', marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center' }}>
                <Text type="secondary" style={{ fontSize: 13 }}>Fecha de la observación:</Text>
                <DatePicker
                  showTime
                  format="DD/MM/YYYY HH:mm"
                  value={observationDate}
                  onChange={(date) => setObservationDate(date)}
                  style={{ width: 200, borderRadius: 6 }}
                  placeholder="Seleccione fecha/hora"
                />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <TextArea
                  rows={2}
                  placeholder="Escriba un comentario o reporte de corrección..."
                  value={newObservation}
                  onChange={(e) => setNewObservation(e.target.value)}
                  maxLength={400}
                  style={{ borderRadius: 6 }}
                />
                <Button
                  type="primary"
                  onClick={handleAddObservation}
                  loading={savingObservation}
                  style={{ alignSelf: 'flex-end', borderRadius: 6 }}
                >
                  Agregar
                </Button>
              </div>
            </div>

            <Divider style={{ margin: '20px 0' }} />

            {/* Línea de tiempo cronológica de etapas */}
            <Title level={5}>Historial de Etapas</Title>
            <Timeline mode="left" style={{ marginTop: 16 }}>
              {selectedService.history &&
                selectedService.history.map((hist) => {
                  const conf = stageConfig[hist.stage] || { label: hist.stage, color: 'gray' };
                  return (
                    <Timeline.Item
                      key={hist.id}
                      label={dayjs(hist.entered_at).format('DD/MM/YYYY HH:mm')}
                      color={conf.color}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text strong>
                          Etapa: <Tag color={conf.color}>{conf.label}</Tag>
                        </Text>
                        {hasPermission('services', 'edit') && (
                          <Tooltip title="Editar fecha u observaciones de esta etapa">
                            <Button
                              type="text"
                              icon={<EditOutlined style={{ color: '#fa8c16', fontSize: 13 }} />}
                              size="small"
                              onClick={() => handleOpenEditHistoryModal(hist)}
                            />
                          </Tooltip>
                        )}
                      </div>
                      <br />
                      <Text type="secondary">Por: {hist.user_name}</Text>
                      {hist.notes && (
                        <div>
                          <Text type="warning" style={{ fontStyle: 'italic' }}>
                            Nota: {hist.notes}
                          </Text>
                        </div>
                      )}
                      {selectedService.stage_durations?.[hist.stage] && (
                        <div style={{ marginTop: 2 }}>
                          <Text strong style={{ color: '#8c8c8c', fontSize: 12 }}>
                            Duración en esta etapa: {selectedService.stage_durations[hist.stage]}
                          </Text>
                        </div>
                      )}
                    </Timeline.Item>
                  );
                })}
            </Timeline>
          </div>
        )}
      </Drawer>

      {/* Modal para Crear Solicitud */}
      <Modal
        title="Registrar Nueva Solicitud de Servicio / Presupuesto"
        visible={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={handleCreateService}
        confirmLoading={savingService}
        okText="Registrar"
        cancelText="Cancelar"
        width={600}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" initialValues={{ budget_amount: 0, date: dayjs() }}>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="provider_id"
                label="Proveedor"
                rules={[{ required: !isNewProvider, message: 'Seleccione un proveedor o elija registrar uno nuevo.' }]}
              >
                <Select
                  placeholder="Seleccione un proveedor del catálogo"
                  showSearch
                  filterOption={(input, option) => {
                    if (!option || option.value === 'NEW') return true;
                    const provider = providers.find(p => p.id === option.value);
                    if (!provider) return false;
                    const searchStr = `${provider.commercial_name || ''} ${provider.legal_name || ''} ${provider.rfc || ''}`.toLowerCase();
                    return searchStr.includes(input.toLowerCase());
                  }}
                  onChange={(val) => {
                    if (val === 'NEW') {
                      setIsNewProvider(true);
                      createForm.setFieldsValue({ provider_name: '' });
                    } else {
                      setIsNewProvider(false);
                      const p = providers.find(x => x.id === val);
                      createForm.setFieldsValue({ provider_name: p ? (p.commercial_name || p.legal_name) : '' });
                    }
                  }}
                >
                  {providers.map(p => (
                    <Option key={p.id} value={p.id}>
                      {p.commercial_name ? `${p.commercial_name} (${p.rfc})` : `${p.legal_name} (${p.rfc})`}
                    </Option>
                  ))}
                  <Option value="NEW" style={{ color: '#1890ff', fontWeight: 'bold' }}>
                    + Registrar nuevo / Escribir nombre...
                  </Option>
                </Select>
              </Form.Item>
              <Form.Item name="provider_name" noStyle>
                <Input type="hidden" />
              </Form.Item>
            </Col>
            {isNewProvider && (
              <Col span={24}>
                <Form.Item
                  name="provider_name"
                  label="Nombre del Proveedor Nuevo"
                  rules={[{ required: true, message: 'El nombre del proveedor es obligatorio.' }]}
                >
                  <Input placeholder="Ej. Computadoras y Servicios S.A." maxLength={100} />
                </Form.Item>
              </Col>
            )}
            <Col span={8}>
              <Form.Item
                name="episa_folio"
                label="Folio e-Pisa"
                rules={[{ required: true, message: 'El folio e-Pisa es obligatorio.' }]}
              >
                <Input placeholder="Ej. EP-2026-045" maxLength={50} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="budget_amount"
                label="Monto Presupuestado (MXN)"
                rules={[{ required: true, message: 'El monto presupuestado es obligatorio.' }]}
              >
                <InputNumber
                  min={0.01}
                  precision={2}
                  style={{ width: '100%' }}
                  formatter={(value) => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="date"
                label="Fecha de Solicitud"
                rules={[{ required: true, message: 'La fecha es obligatoria.' }]}
              >
                <DatePicker 
                  style={{ width: '100%' }} 
                  format="DD/MM/YYYY"
                  placeholder="Seleccione fecha"
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item
                name="description"
                label="Descripción del Servicio / Detalle"
                rules={[{ required: true, message: 'La descripción del servicio es obligatoria.' }]}
              >
                <TextArea rows={3} placeholder="Describa el servicio solicitado en detalle..." maxLength={500} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="Archivo PDF del Presupuesto (Opcional)">
                <Upload
                  accept=".pdf"
                  beforeUpload={(file) => {
                    setBudgetFileList([file]);
                    return false;
                  }}
                  onRemove={() => setBudgetFileList([])}
                  fileList={budgetFileList}
                >
                  <Button icon={<UploadOutlined />}>Seleccionar PDF del Presupuesto</Button>
                </Upload>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal de Transición de Etapa */}
      <Modal
        title={`Cambiar Etapa: Avanzar a ${transitionTarget ? stageConfig[transitionTarget].label : ''}`}
        visible={transitionModalOpen}
        onCancel={() => setTransitionModalOpen(false)}
        onOk={handleSaveTransition}
        confirmLoading={savingTransition}
        okText="Actualizar Estado"
        cancelText="Cancelar"
        width={550}
        destroyOnClose
      >
        <Form form={transitionForm} layout="vertical">
          <Form.Item
            name="date"
            label="Fecha del Evento / Transición"
            rules={[{ required: true, message: 'La fecha del evento es obligatoria.' }]}
          >
            <DatePicker 
              style={{ width: '100%' }} 
              format="DD/MM/YYYY"
              placeholder="Seleccione la fecha de esta etapa"
            />
          </Form.Item>
          <Divider style={{ margin: '16px 0' }} />

          {transitionTarget === 'aprobado_hacienda' && (
            <Row gutter={16}>
              <Col span={24}>
                <Form.Item label="Captura/Correo del Oficio o Aprobación (Opcional)">
                  <Upload
                    accept="image/*,.pdf"
                    beforeUpload={(file) => {
                      setAuthEmailFileList([file]);
                      return false;
                    }}
                    onRemove={() => setAuthEmailFileList([])}
                    fileList={authEmailFileList}
                  >
                    <Button icon={<UploadOutlined />}>Subir Captura de Correo</Button>
                  </Upload>
                </Form.Item>
              </Col>
            </Row>
          )}

          {transitionTarget === 'en_proceso_pago' && (
            <Row gutter={16}>
              <Col span={24}>
                <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', padding: '10px 14px', borderRadius: 6, marginBottom: 16 }}>
                  <Text type="warning" strong>Importante: </Text>
                  <Text>Es obligatorio adjuntar tanto la factura PDF como la XML para avanzar a proceso de pago.</Text>
                </div>
              </Col>
              <Col span={12}>
                <Form.Item label="Factura XML (Obligatorio)" required>
                  <Upload
                    accept=".xml"
                    beforeUpload={(file) => {
                      setXmlFileList([file]);
                      return false;
                    }}
                    onRemove={() => setXmlFileList([])}
                    fileList={xmlFileList}
                  >
                    <Button icon={<UploadOutlined />}>Seleccionar XML</Button>
                  </Upload>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Factura PDF (Obligatorio)" required>
                  <Upload
                    accept=".pdf"
                    beforeUpload={(file) => {
                      setPdfFileList([file]);
                      return false;
                    }}
                    onRemove={() => setPdfFileList([])}
                    fileList={pdfFileList}
                  >
                    <Button icon={<UploadOutlined />}>Seleccionar PDF</Button>
                  </Upload>
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="Carta de Conformidad Escaneada (Opcional)">
                  <Upload
                    accept="image/*,.pdf"
                    beforeUpload={(file) => {
                      setConformityFileList([file]);
                      return false;
                    }}
                    onRemove={() => setConformityFileList([])}
                    fileList={conformityFileList}
                  >
                    <Button icon={<UploadOutlined />}>Seleccionar Carta Firmada</Button>
                  </Upload>
                </Form.Item>
              </Col>
            </Row>
          )}

          {transitionTarget === 'pagado' && (
            <Row gutter={16}>
              <Col span={24}>
                <Form.Item label="Comprobante de Pago Electrónico (Opcional)">
                  <Upload
                    accept="image/*,.pdf"
                    beforeUpload={(file) => {
                      setPaymentFileList([file]);
                      return false;
                    }}
                    onRemove={() => setPaymentFileList([])}
                    fileList={paymentFileList}
                  >
                    <Button icon={<UploadOutlined />}>Seleccionar Comprobante de Pago</Button>
                  </Upload>
                </Form.Item>
              </Col>
            </Row>
          )}

          {transitionTarget === 'cancelado' && (
            <Row gutter={16}>
              <Col span={24}>
                <Form.Item
                  name="notes"
                  label="Motivo de Cancelación (Obligatorio)"
                  rules={[{ required: true, message: 'Debe especificar el motivo de cancelación.' }]}
                >
                  <TextArea rows={3} placeholder="Ej. El proveedor canceló la cotización / presupuesto no aprobado..." maxLength={300} />
                </Form.Item>
              </Col>
            </Row>
          )}

          {transitionTarget !== 'cancelado' && (
            <Form.Item name="notes" label="Notas de Transición / Comentario (Opcional)">
              <TextArea rows={2} placeholder="Agregue información útil para esta etapa..." maxLength={300} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* Modal para Editar Historial de Etapas */}
      <Modal
        title={`Editar Etapa: ${editingHistoryItem ? (stageConfig[editingHistoryItem.stage]?.label || editingHistoryItem.stage) : ''}`}
        visible={editHistoryModalOpen}
        onCancel={() => setEditHistoryModalOpen(false)}
        onOk={handleSaveHistoryEdit}
        confirmLoading={savingHistoryEdit}
        okText="Guardar"
        cancelText="Cancelar"
        width={450}
        destroyOnClose
      >
        <Form form={historyEditForm} layout="vertical">
          <Form.Item
            name="entered_at"
            label="Fecha y Hora de la Etapa"
            rules={[{ required: true, message: 'Por favor seleccione la fecha y hora.' }]}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              style={{ width: '100%' }}
              placeholder="Seleccione fecha y hora"
            />
          </Form.Item>
          <Form.Item
            name="notes"
            label="Observaciones / Notas"
          >
            <TextArea
              rows={3}
              placeholder="Notas aclaratorias sobre esta etapa..."
              maxLength={400}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
