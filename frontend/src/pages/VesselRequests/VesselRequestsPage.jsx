import { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker, Typography, Card, message, Popconfirm, Tooltip, Row, Col, Badge, InputNumber, Radio, Steps, Tabs, Alert } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, CheckOutlined, CompassOutlined, DownOutlined, RightOutlined, AimOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap, Tooltip as MapTooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

// Fix Leaflet default icons in webpack/vite bundles
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const startIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
});
const endIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
});

const STATUS_MAP = {
  borrador: { label: 'Borrador', color: 'blue', badge: 'processing' },
  pendiente: { label: 'Pendiente', color: 'orange', badge: 'warning' },
  aprobada: { label: 'Aprobada', color: 'green', badge: 'success' },
  rechazada: { label: 'Rechazada', color: 'red', badge: 'error' },
  cancelada: { label: 'Cancelada', color: 'gray', badge: 'default' }
};

const ROLE_OPTIONS = [
  { value: 'investigador_principal', label: '🔬 Investigador Principal' },
  { value: 'coinvestigador',         label: '🔬 Co-investigador' },
  { value: 'tecnico',                label: '🔧 Técnico' },
  { value: 'estudiante',             label: '🎓 Estudiante' },
  { value: 'capitan',                label: '⚓ Capitán' },
  { value: 'primer_oficial',         label: '⚓ Primer Oficial' },
  { value: 'marinero',               label: '⚓ Marinero' },
  { value: 'jefe_maquinas',          label: '⚙️ Jefe de Máquinas' },
  { value: 'medico',                 label: '🩺 Médico' },
  { value: 'otro',                   label: '👤 Otro' },
];

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click: (e) => onMapClick(e.latlng)
  });
  return null;
}

function MapFitter({ waypoints, modalReady, departurePort, returnPort }) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (!modalReady) {
      hasFittedRef.current = false;
    }
  }, [modalReady]);

  useEffect(() => {
    const allCoords = [];
    if (departurePort && departurePort.latitude != null && departurePort.longitude != null) {
      allCoords.push([departurePort.latitude, departurePort.longitude]);
    }
    waypoints.forEach(w => {
      if (w.latitude != null && w.longitude != null) {
        allCoords.push([w.latitude, w.longitude]);
      }
    });
    if (returnPort && returnPort.latitude != null && returnPort.longitude != null) {
      allCoords.push([returnPort.latitude, returnPort.longitude]);
    }

    if (modalReady && allCoords.length > 0 && !hasFittedRef.current) {
      const timer = setTimeout(() => {
        map.invalidateSize();
        if (allCoords.length === 1) {
          map.setView(allCoords[0], 12);
        } else {
          const bounds = L.latLngBounds(allCoords);
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
        }
        hasFittedRef.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [map, waypoints, modalReady, departurePort, returnPort]);

  useEffect(() => {
    if (modalReady) {
      const timer = setTimeout(() => {
        map.invalidateSize();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [map, modalReady]);

  return null;
}

function MapFlyer({ activeWaypoint, markerRefs, waypoints }) {
  const map = useMap();
  useEffect(() => {
    if (activeWaypoint !== null && waypoints && waypoints[activeWaypoint]) {
      const wp = waypoints[activeWaypoint];
      if (wp.latitude != null && wp.longitude != null && isFinite(wp.latitude) && isFinite(wp.longitude)) {
        const currentZoom = map.getZoom();
        const targetZoom = Math.max(currentZoom, 14);
        map.flyTo([wp.latitude, wp.longitude], targetZoom, { animate: true, duration: 0.8 });
        const timer = setTimeout(() => {
          const marker = markerRefs.current[activeWaypoint];
          if (marker && typeof marker.openPopup === 'function') {
            marker.openPopup();
          }
        }, 850);
        return () => clearTimeout(timer);
      }
    }
  }, [activeWaypoint, map, waypoints, markerRefs]);
  return null;
}

function VesselRequestsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [portsList, setPortsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });
  const [filterVessel, setFilterVessel] = useState(null);
  const [filterStatus, setFilterStatus] = useState(null);
  const [projectsList, setProjectsList] = useState([]);
  const [showCustomProjectInput, setShowCustomProjectInput] = useState(false);
  
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [reviewingRequest, setReviewingRequest] = useState(null);
  
  const [currentStep, setCurrentStep] = useState(0);
  const [dailyItineraries, setDailyItineraries] = useState([]);
  const [selectedScientists, setSelectedScientists] = useState([]);
  const [selectedEquipments, setSelectedEquipments] = useState([]);
  const [selectedWaypoints, setSelectedWaypoints] = useState([]);
  const [participantOptions, setParticipantOptions] = useState([]);
  const [searchingParticipants, setSearchingParticipants] = useState(false);

  const [form] = Form.useForm();
  const [reviewForm] = Form.useForm();
  const [sciForm] = Form.useForm();
  const [eqForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const selectedVesselId = Form.useWatch('vessel_id', form);
  const selectedVesselObj = vessels.find(v => v.id === selectedVesselId);
  const datesVal = Form.useWatch('dates', form);

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

  const fetchPorts = useCallback(async () => {
    try {
      const res = await apiClient.get('/ports/options');
      setPortsList(res.data);
    } catch {
      message.error('Error al cargar puertos');
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
    fetchPorts();
  }, [fetchVessels, fetchProjects, fetchPorts]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (datesVal && datesVal.length === 2 && selectedVesselObj?.requires_daily_navigation) {
      const [start, end] = datesVal;
      const daysCount = end.diff(start, 'day') + 1;
      const newDays = [];
      for (let i = 0; i < daysCount; i++) {
        const currentDate = start.add(i, 'day').format('YYYY-MM-DD');
        const existing = dailyItineraries.find(d => d.date === currentDate);
        newDays.push({
          date: currentDate,
          departure_time: existing?.departure_time || '08:00',
          return_time: existing?.return_time || '18:00',
          zone: existing?.zone || ''
        });
      }
      setDailyItineraries(newDays);
    } else {
      setDailyItineraries([]);
    }
  }, [datesVal, selectedVesselObj]);

  const searchParticipants = async (search = '') => {
    setSearchingParticipants(true);
    try {
      const res = await apiClient.get('/participants/options', { params: { search } });
      setParticipantOptions(res.data);
    } catch {
      message.error('Error al buscar participantes');
    } finally {
      setSearchingParticipants(false);
    }
  };

  useEffect(() => {
    if (drawerOpen && currentStep === 1) {
      searchParticipants();
    }
  }, [drawerOpen, currentStep]);

  const openCreate = () => {
    setEditingRequest(null);
    form.resetFields();
    sciForm.resetFields();
    eqForm.resetFields();
    setShowCustomProjectInput(false);
    form.setFieldsValue({
      scientific_leader: user?.full_name || '',
      cruise_responsible: '',
      scientists_count: 5
    });
    setDailyItineraries([]);
    setSelectedScientists([]);
    setSelectedEquipments([]);
    setSelectedWaypoints([]);
    setCurrentStep(0);
    setDrawerOpen(true);
  };

  const openEdit = (req) => {
    setEditingRequest(req);
    form.resetFields();
    sciForm.resetFields();
    eqForm.resetFields();
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
      dates: [dayjs(req.departure_date), dayjs(req.return_date)],
      departure_port_id: req.departure_port_id,
      return_port_id: req.return_port_id
    });

    setDailyItineraries(req.daily_itineraries || []);
    setSelectedScientists(req.scientists_list || []);
    setSelectedEquipments(req.equipments_list || []);
    setSelectedWaypoints(req.waypoints_list || []);
    setCurrentStep(0);
    setDrawerOpen(true);
  };

  const handleSave = async (submitStatus) => {
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
        return_date: end.toISOString(),
        status: submitStatus,
        departure_port_id: values.departure_port_id,
        return_port_id: values.return_port_id,
        daily_itineraries: dailyItineraries,
        scientists_list: selectedScientists,
        equipments_list: selectedEquipments,
        waypoints_list: selectedWaypoints
      };

      setSaving(true);
      if (editingRequest) {
        await apiClient.put(`/vessel-requests/${editingRequest.id}`, payload);
        message.success(submitStatus === 'borrador' ? 'Borrador actualizado con éxito' : 'Solicitud enviada con éxito');
      } else {
        await apiClient.post('/vessel-requests', payload);
        message.success(submitStatus === 'borrador' ? 'Borrador guardado con éxito' : 'Solicitud enviada con éxito');
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
          {is_admin && r.status === 'pendiente' && (
            <Tooltip title="Aprobar / Rechazar">
              <Button type="primary" size="small" onClick={() => openReview(r)}>Revisar</Button>
            </Tooltip>
          )}

          {(!is_admin || r.applicant_id === user?.id) && ['pendiente', 'borrador'].includes(r.status) && (
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

  const sciColumns = [
    { title: 'Nombre', dataIndex: 'name', key: 'name' },
    { title: 'Institución', dataIndex: 'institution', key: 'institution' },
    {
      title: 'Rol',
      dataIndex: 'role_in_cruise',
      key: 'role_in_cruise',
      render: (role) => {
        const option = ROLE_OPTIONS.find(o => o.value === role);
        return option ? option.label : role;
      }
    },
    {
      title: 'Acción',
      key: 'action',
      render: (_, record, idx) => (
        <Button type="link" danger icon={<DeleteOutlined />} onClick={() => {
          const updated = [...selectedScientists];
          updated.splice(idx, 1);
          setSelectedScientists(updated);
        }} />
      )
    }
  ];

  const eqColumns = [
    { title: 'Equipo', dataIndex: 'item_name', key: 'item_name' },
    { title: 'Cantidad', dataIndex: 'quantity', key: 'quantity' },
    { title: 'Notas', dataIndex: 'notes', key: 'notes' },
    {
      title: 'Acción',
      key: 'action',
      render: (_, record, idx) => (
        <Button type="link" danger icon={<DeleteOutlined />} onClick={() => {
          const updated = [...selectedEquipments];
          updated.splice(idx, 1);
          setSelectedEquipments(updated);
        }} />
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

      {/* Modal: Crear / Editar Solicitud (Stepper) */}
      <Modal
        title={editingRequest ? 'Editar Solicitud de Embarcación' : 'Nueva Solicitud de Embarcación'}
        width={780}
        onCancel={() => setDrawerOpen(false)}
        open={drawerOpen}
        destroyOnClose
        footer={
          <div style={{ textAlign: 'right', marginTop: 12 }}>
            <Space>
              <Button onClick={() => setDrawerOpen(false)}>Cancelar</Button>
              {currentStep === 1 && (
                <Button onClick={() => setCurrentStep(0)}>Atrás</Button>
              )}
              {currentStep === 0 && (
                <Button type="primary" onClick={async () => {
                  try {
                    await form.validateFields();
                    setCurrentStep(1);
                  } catch (err) {
                    message.error('Por favor, completa los campos requeridos del Paso 1.');
                  }
                }}>
                  Siguiente (Detalles del Crucero)
                </Button>
              )}
              <Button type="dashed" onClick={() => handleSave('borrador')} loading={saving}>
                Guardar Borrador
              </Button>
              <Button type="primary" onClick={() => handleSave('pendiente')} loading={saving} style={{ background: '#2e7d32', borderColor: '#2e7d32' }}>
                Enviar Solicitud
              </Button>
            </Space>
          </div>
        }
      >
        <Steps
          current={currentStep}
          onChange={(step) => {
            if (step === 1) {
              form.validateFields().then(() => setCurrentStep(1)).catch(() => {
                message.error('Por favor, completa los campos obligatorios antes de continuar.');
              });
            } else {
              setCurrentStep(0);
            }
          }}
          size="small"
          style={{ marginBottom: 24, marginTop: 12 }}
          items={[
            { title: 'Datos de la Reserva' },
            { title: 'Detalles del Crucero' }
          ]}
        />

        {currentStep === 0 ? (
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

            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="departure_port_id" label="Puerto de Salida" rules={[{ required: true, message: 'El puerto de salida es requerido' }]}>
                  <Select placeholder="Seleccionar puerto" options={portsList.map(p => ({ value: p.id, label: p.name }))} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="return_port_id" label="Puerto de Regreso" rules={[{ required: true, message: 'El puerto de regreso es requerido' }]}>
                  <Select placeholder="Seleccionar puerto" options={portsList.map(p => ({ value: p.id, label: p.name }))} />
                </Form.Item>
              </Col>
            </Row>

            {selectedVesselObj?.requires_daily_navigation && dailyItineraries.length > 0 && (
              <Card title="Itinerario Diario (Navegación Diaria)" size="small" style={{ marginBottom: 16, borderColor: '#1B4F72' }}>
                <Paragraph style={{ fontSize: 12, color: '#666' }}>
                  Esta embarcación no realiza pernoctación en mar. Por favor, detalla la salida y regreso para cada día:
                </Paragraph>
                {dailyItineraries.map((day, idx) => (
                  <div key={day.date} style={{ padding: '8px 0', borderBottom: idx < dailyItineraries.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                    <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                      📅 {dayjs(day.date).format('DD/MM/YYYY')}
                    </Text>
                    <Row gutter={12}>
                      <Col span={6}>
                        <Form.Item label="Salida" style={{ margin: 0 }}>
                          <Input
                            value={day.departure_time}
                            placeholder="08:00"
                            onChange={(e) => {
                              const updated = [...dailyItineraries];
                              updated[idx].departure_time = e.target.value;
                              setDailyItineraries(updated);
                            }}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item label="Regreso" style={{ margin: 0 }}>
                          <Input
                            value={day.return_time}
                            placeholder="18:00"
                            onChange={(e) => {
                              const updated = [...dailyItineraries];
                              updated[idx].return_time = e.target.value;
                              setDailyItineraries(updated);
                            }}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item label="Zona / Actividad" style={{ margin: 0 }}>
                          <Input
                            value={day.zone}
                            placeholder="ej. Bahía de Ensenada / Muestreo CTD"
                            onChange={(e) => {
                              const updated = [...dailyItineraries];
                              updated[idx].zone = e.target.value;
                              setDailyItineraries(updated);
                            }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </div>
                ))}
              </Card>
            )}

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
        ) : (
          <div>
            <Tabs defaultActiveKey="scientists">
              <Tabs.TabPane tab="🔬 Científicos" key="scientists">
                <div style={{ marginBottom: 16, background: '#fafafa', padding: 12, borderRadius: 8 }}>
                  <Form form={sciForm} layout="vertical" onFinish={(vals) => {
                    const matched = participantOptions.find(o => o.id === vals.participant_id);
                    if (!matched) return;
                    
                    if (selectedScientists.some(s => s.participant_id === matched.id)) {
                      message.warning('Este participante ya ha sido agregado.');
                      return;
                    }
                    
                    setSelectedScientists([
                      ...selectedScientists,
                      {
                        participant_id: matched.id,
                        name: matched.full_name,
                        institution: matched.institution,
                        role_in_cruise: vals.role_in_cruise || 'investigador_principal',
                        is_principal_investigator: vals.role_in_cruise === 'investigador_principal',
                        is_cruise_leader: vals.is_cruise_leader || false,
                        notes: vals.notes || ''
                      }
                    ]);
                    sciForm.resetFields(['participant_id', 'is_cruise_leader', 'notes']);
                  }}>
                    <Row gutter={12} align="bottom">
                      <Col span={14}>
                        <Form.Item name="participant_id" label="Científico (Buscar del Catálogo)" rules={[{ required: true, message: 'Selecciona una persona' }]}>
                          <Select
                            showSearch
                            filterOption={false}
                            onSearch={searchParticipants}
                            placeholder="Buscar por nombre o institución..."
                            options={participantOptions.map(p => ({ value: p.id, label: `${p.full_name} (${p.institution})` }))}
                            loading={searchingParticipants}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={10}>
                        <Form.Item name="role_in_cruise" label="Rol" initialValue="investigador_principal" rules={[{ required: true }]}>
                          <Select options={ROLE_OPTIONS.filter(o => ['investigador_principal', 'coinvestigador', 'tecnico', 'estudiante', 'otro'].includes(o.value))} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={12} align="bottom" style={{ marginTop: 8 }}>
                      <Col span={16}>
                        <Form.Item name="notes" label="Notas / Tarea" style={{ marginBottom: 0 }}>
                          <Input placeholder="ej. Encargado de colecta de plancton" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item style={{ marginBottom: 0 }}>
                          <Button type="primary" htmlType="submit" icon={<PlusOutlined />} block>
                            Agregar
                          </Button>
                        </Form.Item>
                      </Col>
                    </Row>
                  </Form>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                    ¿No está en el catálogo? <a href="/participants" target="_blank">Regístralo aquí</a> y escribe de nuevo para buscarlo.
                  </Text>
                </div>
                <Table size="small" columns={sciColumns} dataSource={selectedScientists} rowKey="participant_id" pagination={false} />
              </Tabs.TabPane>
              
              <Tabs.TabPane tab="📦 Equipamiento" key="equipment">
                <div style={{ marginBottom: 16, background: '#fafafa', padding: 12, borderRadius: 8 }}>
                  <Form form={eqForm} layout="vertical" onFinish={(vals) => {
                    setSelectedEquipments([
                      ...selectedEquipments,
                      {
                        item_name: vals.item_name,
                        quantity: vals.quantity || 1,
                        notes: vals.notes || ''
                      }
                    ]);
                    eqForm.resetFields();
                  }}>
                    <Row gutter={12} align="bottom">
                      <Col span={10}>
                        <Form.Item name="item_name" label="Nombre del Equipo" rules={[{ required: true, message: 'Ingresa el nombre del equipo' }]}>
                          <Input placeholder="ej. Red Bongo, Botella Niskin" />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item name="quantity" label="Cant." initialValue={1} rules={[{ required: true }]}>
                          <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item name="notes" label="Notas / Especificaciones">
                          <Input placeholder="ej. Requiere conexión 110V" />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item>
                          <Button type="primary" htmlType="submit" icon={<PlusOutlined />} block>
                            Agregar
                          </Button>
                        </Form.Item>
                      </Col>
                    </Row>
                  </Form>
                </div>
                <Table size="small" columns={eqColumns} dataSource={selectedEquipments} rowKey={(r, i) => i} pagination={false} />
              </Tabs.TabPane>
              
              <Tabs.TabPane tab="🗺️ Waypoints / Estaciones" key="waypoints">
                <Alert
                  message="Planificación de Ruta"
                  description="Configura los puertos de salida y regreso en el Paso 1, y luego haz clic en el botón de abajo para trazar tus estaciones en un mapa interactivo de Leaflet a pantalla completa."
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
                <div style={{ textAlign: 'center', padding: '36px 0', border: '1px dashed #d9d9d9', borderRadius: 8, background: '#fafafa', marginBottom: 16 }}>
                  <Button
                    type="primary"
                    size="large"
                    icon={<CompassOutlined />}
                    onClick={() => setMapModalOpen(true)}
                    style={{ background: '#0A2647', borderColor: '#0A2647', fontWeight: 600 }}
                  >
                    Planificar Estaciones en Mapa
                  </Button>
                </div>
                <Table
                  size="small"
                  columns={[
                    { title: 'Orden', dataIndex: 'order_index', key: 'order_index', render: (_, __, idx) => idx + 1 },
                    { title: 'Nombre', dataIndex: 'name', key: 'name' },
                    { title: 'Latitud', dataIndex: 'latitude', key: 'latitude', render: (val) => val?.toFixed(5) },
                    { title: 'Longitud', dataIndex: 'longitude', key: 'longitude', render: (val) => val?.toFixed(5) },
                    { title: 'Actividad', dataIndex: 'activity', key: 'activity' },
                    { title: 'Duración (h)', dataIndex: 'duration_hours', key: 'duration_hours' }
                  ]}
                  dataSource={selectedWaypoints}
                  rowKey={(r, i) => i}
                  pagination={false}
                />
              </Tabs.TabPane>
            </Tabs>
          </div>
        )}
      </Modal>

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

      {/* Modal para Planificación de Estaciones (Idéntico a Configurar Crucero) */}
      <RequestWaypointMapModal
        open={mapModalOpen}
        onClose={() => setMapModalOpen(false)}
        waypoints={selectedWaypoints}
        onSave={(wps) => setSelectedWaypoints(wps)}
        departurePort={portsList.find(p => p.id === form.getFieldValue('departure_port_id'))}
        returnPort={portsList.find(p => p.id === form.getFieldValue('return_port_id'))}
        maxSpeed={selectedVesselObj?.max_speed_knots}
      />
    </div>
  );
}

// Modal Idéntico de Mapas para Solicitud de Embarcaciones
function RequestWaypointMapModal({ open, onClose, waypoints: initialWaypoints, onSave, departurePort, returnPort, maxSpeed }) {
  const [waypoints, setWaypoints] = useState([]);
  const [activeWaypoint, setActiveWaypoint] = useState(null);
  const [expandedIndex, setExpandedIndex] = useState(null);
  const markerRefs = useRef({});

  useEffect(() => {
    if (open) {
      setWaypoints(
        (initialWaypoints || []).map((w, idx) => ({
          ...w,
          order_index: idx
        }))
      );
      setExpandedIndex(null);
    }
  }, [open, initialWaypoints]);

  const handleMapClick = ({ lat, lng }) => {
    const idx = waypoints.length;
    setWaypoints(prev => [...prev, {
      order_index: idx,
      latitude: parseFloat(lat.toFixed(5)),
      longitude: parseFloat(lng.toFixed(5)),
      name: `Estación ${idx + 1}`,
      description: '',
      activity: '',
      duration_hours: null,
    }]);
  };

  const removeWaypoint = (i) => {
    setWaypoints(prev => prev.filter((_, idx) => idx !== i).map((w, idx) => ({ ...w, order_index: idx })));
    setExpandedIndex(null);
  };

  const moveWaypoint = (index, direction) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === waypoints.length - 1) return;
    
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    setWaypoints(prev => {
      const newList = [...prev];
      const temp = newList[index];
      newList[index] = newList[targetIndex];
      newList[targetIndex] = temp;
      
      return newList.map((wp, idx) => ({
        ...wp,
        order_index: idx
      }));
    });
  };

  const updateWaypoint = (i, field, value) => {
    setWaypoints(prev => {
      const nw = [...prev];
      nw[i] = { ...nw[i], [field]: value };
      return nw;
    });
  };

  const toggleExpand = (idx) => {
    setExpandedIndex(prev => prev === idx ? null : idx);
  };

  const scrollToWaypoint = (idx) => {
    setExpandedIndex(idx);
    const el = document.getElementById(`waypoint-card-${idx}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.transition = 'box-shadow 0.3s';
      el.style.boxShadow = '0 0 8px 2px #1677FF';
      setTimeout(() => {
        if (el) el.style.boxShadow = 'none';
      }, 1500);
    }
  };

  const focusOnMap = (idx) => {
    setActiveWaypoint(idx);
    setTimeout(() => setActiveWaypoint(null), 1000);
  };

  const handleSave = () => {
    if (maxSpeed) {
      const overSpeed = waypoints.find(wp => wp.speed_knots > maxSpeed);
      if (overSpeed) {
        message.error(`La velocidad de ${overSpeed.name} excede la máxima permitida de la embarcación (${maxSpeed} nudos).`);
        return;
      }
    }
    onSave(waypoints);
    onClose();
  };

  const tripPoints = [];
  if (departurePort && departurePort.latitude != null && departurePort.longitude != null) {
    tripPoints.push({
      latitude: departurePort.latitude,
      longitude: departurePort.longitude,
      name: departurePort.name,
      isPort: true
    });
  }
  waypoints.forEach(w => {
    if (w.latitude != null && w.longitude != null) {
      tripPoints.push(w);
    }
  });
  if (returnPort && returnPort.latitude != null && returnPort.longitude != null) {
    tripPoints.push({
      latitude: returnPort.latitude,
      longitude: returnPort.longitude,
      name: returnPort.name,
      isPort: true
    });
  }

  const positions = tripPoints.map(w => [w.latitude, w.longitude]);

  return (
    <Modal
      title={
        <Space>
          <CompassOutlined style={{ color: '#0A2647' }} />
          <span>Planificación de Ruta y Estaciones</span>
        </Space>
      }
      width="90vw"
      style={{ top: 20 }}
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      okText="Guardar Ruta"
      cancelText="Cancelar"
      destroyOnClose
    >
      <style>{`
        .waypoint-number-tooltip {
          background: #0A2647 !important;
          color: white !important;
          border: 1px solid white !important;
          border-radius: 50% !important;
          width: 20px !important;
          height: 20px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: 10px !important;
          font-weight: bold !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3) !important;
          padding: 0 !important;
        }
        .waypoint-number-tooltip::before {
          display: none !important;
        }
      `}</style>

      <Row>
        <Col span={16}>
          <div style={{ height: '70vh', minHeight: 500, width: '100%', border: '1px solid #ccc', borderRadius: '8px 0 0 8px', overflow: 'hidden' }}>
            <MapContainer center={[23.6, -110.0]} zoom={6} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='© OpenStreetMap contributors'
              />
              <MapFitter waypoints={waypoints} modalReady={open} departurePort={departurePort} returnPort={returnPort} />
              <MapFlyer activeWaypoint={activeWaypoint} markerRefs={markerRefs} waypoints={waypoints} />
              <MapClickHandler onMapClick={handleMapClick} />

              {positions.length > 1 && (
                <Polyline positions={positions} color="#0A2647" weight={2} dashArray="8 4" />
              )}

              {/* Puerto de Salida */}
              {departurePort && departurePort.latitude != null && departurePort.longitude != null && (
                <Marker position={[departurePort.latitude, departurePort.longitude]} icon={startIcon}>
                  <Popup>
                    <strong>⚓ Puerto de Salida:</strong> {departurePort.name}
                  </Popup>
                </Marker>
              )}

              {/* Puerto de Regreso */}
              {returnPort && returnPort.latitude != null && returnPort.longitude != null && (
                <Marker position={[returnPort.latitude, returnPort.longitude]} icon={endIcon}>
                  <Popup>
                    <strong>⚓ Puerto de Regreso:</strong> {returnPort.name}
                  </Popup>
                </Marker>
              )}

              {/* Waypoints */}
              {waypoints.map((wp, i) => (
                <Marker
                  key={i}
                  position={[wp.latitude, wp.longitude]}
                  draggable={true}
                  ref={(r) => { markerRefs.current[i] = r; }}
                  eventHandlers={{
                    click: () => scrollToWaypoint(i),
                    dragend: (e) => {
                      const marker = e.target;
                      const pos = marker.getLatLng();
                      updateWaypoint(i, 'latitude', parseFloat(pos.lat.toFixed(5)));
                      updateWaypoint(i, 'longitude', parseFloat(pos.lng.toFixed(5)));
                    }
                  }}
                >
                  <MapTooltip permanent direction="top" offset={[0, -10]} className="waypoint-number-tooltip">
                    {i + 1}
                  </MapTooltip>
                  <Popup>
                    <div style={{ minWidth: 150 }}>
                      <strong>{wp.name}</strong><br />
                      Lat: {wp.latitude.toFixed(5)}<br />
                      Lon: {wp.longitude.toFixed(5)}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </Col>

        <Col span={8} style={{ height: '70vh', minHeight: 500, display: 'flex', flexDirection: 'column', background: '#f9f9f9', border: '1px solid #ccc', borderLeft: 'none', borderRadius: '0 8px 8px 0', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e8e8e8', background: '#fff', flexShrink: 0 }}>
            <Text strong style={{ fontSize: 14 }}>🗺️ Estaciones Planificadas ({waypoints.length})</Text>
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>💡 Haz clic en el mapa para agregar estaciones, o arrastra las marcas para moverlas.</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {waypoints.map((wp, i) => (
              <Card
                id={`waypoint-card-${i}`}
                size="small"
                key={i}
                style={{
                  marginBottom: 12,
                  borderRadius: 8,
                  boxShadow: expandedIndex === i ? '0 2px 8px rgba(0,0,0,0.1)' : undefined
                }}
                title={
                  <div onClick={() => toggleExpand(i)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', width: '100%', gap: 8 }}>
                    {expandedIndex === i ? <DownOutlined style={{ fontSize: 11 }} /> : <RightOutlined style={{ fontSize: 11 }} />}
                    <Badge status="processing" />
                    <Input
                      value={wp.name}
                      onChange={e => updateWaypoint(i, 'name', e.target.value)}
                      onClick={e => e.stopPropagation()}
                      variant="borderless"
                      style={{ padding: 0, fontWeight: 'bold', fontSize: 13 }}
                    />
                  </div>
                }
                extra={
                  <Space size={2}>
                    <Tooltip title="Subir">
                      <Button type="text" size="small" disabled={i === 0} icon={<ArrowUpOutlined style={{ fontSize: 12 }} />} onClick={e => { e.stopPropagation(); moveWaypoint(i, 'up'); }} />
                    </Tooltip>
                    <Tooltip title="Bajar">
                      <Button type="text" size="small" disabled={i === waypoints.length - 1} icon={<ArrowDownOutlined style={{ fontSize: 12 }} />} onClick={e => { e.stopPropagation(); moveWaypoint(i, 'down'); }} />
                    </Tooltip>
                    <Tooltip title="Ver en mapa">
                      <Button type="text" size="small" style={{ color: '#1677FF' }} icon={<AimOutlined style={{ fontSize: 12 }} />} onClick={e => { e.stopPropagation(); focusOnMap(i); }} />
                    </Tooltip>
                    <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 12 }} />} onClick={e => { e.stopPropagation(); removeWaypoint(i); }} />
                  </Space>
                }
              >
                {expandedIndex === i && (
                  <div style={{ marginTop: 8 }}>
                    <Row gutter={[8, 8]}>
                      <Col span={12}>
                        <Text type="secondary" style={{ fontSize: 11 }}>Latitud</Text>
                        <InputNumber size="small" style={{ width: '100%' }} value={wp.latitude} onChange={v => updateWaypoint(i, 'latitude', v)} precision={5} />
                      </Col>
                      <Col span={12}>
                        <Text type="secondary" style={{ fontSize: 11 }}>Longitud</Text>
                        <InputNumber size="small" style={{ width: '100%' }} value={wp.longitude} onChange={v => updateWaypoint(i, 'longitude', v)} precision={5} />
                      </Col>
                      <Col span={24}>
                        <Text type="secondary" style={{ fontSize: 11 }}>Actividad / Tareas</Text>
                        <Input size="small" value={wp.activity || ''} onChange={e => updateWaypoint(i, 'activity', e.target.value)} placeholder="Ej. Lance CTD, arrastre" />
                      </Col>
                      <Col span={24}>
                        <Text type="secondary" style={{ fontSize: 11 }}>Duración estimada (horas)</Text>
                        <InputNumber size="small" style={{ width: '100%' }} value={wp.duration_hours} onChange={v => updateWaypoint(i, 'duration_hours', v)} min={0} step={0.5} />
                      </Col>
                    </Row>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </Col>
      </Row>
    </Modal>
  );
}

export default VesselRequestsPage;
