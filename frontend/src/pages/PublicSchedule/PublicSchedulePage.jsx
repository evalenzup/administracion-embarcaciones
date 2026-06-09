import { useState, useEffect } from 'react';
import { Calendar, Badge, Card, Space, Typography, Row, Col, DatePicker, Select, Tag, Button, List, Timeline, Divider, Alert, Tooltip } from 'antd';
import { CalendarOutlined, SearchOutlined, CompassOutlined, ArrowRightOutlined, InfoCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

function PublicSchedulePage() {
  const { isAuthenticated } = useAuth();
  const [cruises, setCruises] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [selectedVesselFilter, setSelectedVesselFilter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [availabilityResults, setAvailabilityResults] = useState([]);
  const [searchRange, setSearchRange] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [crRes, vsRes] = await Promise.all([
          apiClient.get('/cruises/public-schedule'),
          apiClient.get('/vessels/options')
        ]);
        setCruises(crRes.data.items);
        setVessels(vsRes.data);
      } catch (err) {
        console.error('Error cargando datos de la agenda:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Filtrar cruceros según la embarcación seleccionada en el selector del calendario
  const filteredCruises = selectedVesselFilter
    ? cruises.filter(c => c.vessel_id === selectedVesselFilter)
    : cruises;

  // Datos del día para el calendario
  const getListData = (value) => {
    const dayStr = value.format('YYYY-MM-DD');
    return filteredCruises.filter(c => {
      const dep = dayjs(c.departure_date).format('YYYY-MM-DD');
      const ret = dayjs(c.return_date).format('YYYY-MM-DD');
      return dayStr >= dep && dayStr <= ret;
    }).map(c => {
      let type = 'success';
      if (c.status === 'en_curso') type = 'processing';
      if (c.status === 'completado') type = 'warning';
      return {
        type,
        content: `${c.vessel?.name}: ${c.name}`
      };
    });
  };

  const cellRender = (current, info) => {
    if (info.type === 'date') {
      const listData = getListData(current);
      return (
        <div style={{ padding: '2px 4px', fontSize: 10, overflow: 'hidden', height: '100%' }}>
          {listData.map((item, index) => (
            <div key={index} style={{ marginBottom: 2, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              <Badge status={item.type} text={<span style={{ fontSize: 9, color: '#333' }}>{item.content}</span>} />
            </div>
          ))}
        </div>
      );
    }
    return info.originNode;
  };

  // Buscar disponibilidad
  const handleCheckAvailability = (dates) => {
    setSearchRange(dates);
    if (!dates || dates.length < 2) {
      setAvailabilityResults([]);
      return;
    }
    const [start, end] = dates;
    const startStr = start.format('YYYY-MM-DD');
    const endStr = end.format('YYYY-MM-DD');

    const results = vessels.map(v => {
      const overlaps = cruises.filter(c => {
        if (c.vessel_id !== v.id) return false;
        const dep = dayjs(c.departure_date).format('YYYY-MM-DD');
        const ret = dayjs(c.return_date).format('YYYY-MM-DD');
        return (startStr <= ret) && (endStr >= dep);
      });
      return {
        vessel: v,
        isAvailable: overlaps.length === 0,
        conflicts: overlaps
      };
    });
    setAvailabilityResults(results);
  };

  const upcomingCruises = cruises
    .filter(c => dayjs(c.departure_date).isAfter(dayjs()))
    .sort((a, b) => dayjs(a.departure_date).diff(dayjs(b.departure_date)))
    .slice(0, 5);

  return (
    <div style={styles.container}>
      {/* Fondo decorativo con gradiente marino */}
      <div style={styles.bgDecoration} />
      
      {/* Cabecera */}
      <div style={styles.header}>
        <Row justify="space-between" align="middle" style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <Col>
            <Space align="center" size={12}>
              <div style={styles.logoIcon}>
                <img src="/SIAE_Logo_shield_Isotipo_dark.svg" alt="SIAE Isotipo" style={{ width: 42, height: 42 }} />
              </div>
              <div>
                <Title level={3} style={{ color: '#fff', margin: 0, fontWeight: 700, letterSpacing: 0.5 }}>SIAE — Calendario de Disponibilidad</Title>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Consulta de disponibilidad y programación de las embarcaciones de investigación del DEO</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              {isAuthenticated ? (
                <Button type="primary" icon={<CompassOutlined />} style={{ background: '#1677FF' }} onClick={() => navigate('/')}>
                  Volver al Panel
                </Button>
              ) : (
                <>
                  <Button type="primary" ghost style={{ borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }} onClick={() => navigate('/login')}>
                    Iniciar Sesión
                  </Button>
                  <Button type="primary" icon={<CompassOutlined />} style={{ background: '#1677FF' }} onClick={() => navigate('/login?redirect=requests')}>
                    Solicitar Embarcación
                  </Button>
                </>
              )}
            </Space>
          </Col>
        </Row>
      </div>

      {/* Contenido Principal */}
      <div style={styles.content}>
        <Row gutter={[20, 20]}>
          {/* Columna Izquierda: Calendario */}
          <Col xs={24} lg={17}>
            <Card style={{ borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }} styles={{ body: { padding: 20 } }}>
              <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
                <Col>
                  <Title level={4} style={{ color: '#0A2647', margin: 0 }}><CalendarOutlined /> Calendario de Reservas</Title>
                </Col>
                <Col>
                  <Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>Filtrar por barco:</Text>
                    <Select
                      placeholder="Todas las embarcaciones"
                      allowClear
                      style={{ width: 220 }}
                      onChange={setSelectedVesselFilter}
                      options={vessels.map(v => ({ value: v.id, label: v.name }))}
                    />
                  </Space>
                </Col>
              </Row>
              <Calendar cellRender={cellRender} loading={loading} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }} />
            </Card>
          </Col>

          {/* Columna Derecha: Buscador de Disponibilidad y Timeline */}
          <Col xs={24} lg={7}>
            {/* Buscador de Disponibilidad */}
            <Card style={{ borderRadius: 16, marginBottom: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
              <Title level={4} style={{ color: '#0A2647', marginTop: 0, marginBottom: 16 }}><SearchOutlined /> Verificar Disponibilidad</Title>
              <Paragraph style={{ fontSize: 13, color: '#666' }}>Elige un rango de fechas para verificar qué barcos están libres de cruceros programados:</Paragraph>
              <RangePicker
                style={{ width: '100%', marginBottom: 16 }}
                format="DD/MM/YYYY"
                onChange={handleCheckAvailability}
              />

              {availabilityResults.length > 0 ? (
                <List
                  dataSource={availabilityResults}
                  renderItem={item => (
                    <List.Item style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <Row justify="space-between" align="middle" style={{ width: '100%' }}>
                        <Col>
                          <Text strong style={{ fontSize: 13 }}>{item.vessel.name}</Text>
                        </Col>
                        <Col>
                          {item.isAvailable ? (
                            <Tag color="#E6F4EA" style={{ color: '#137333', borderColor: '#CEEAD6', borderRadius: 6, fontWeight: 500 }}>Disponible</Tag>
                          ) : (
                            <Tooltip title={item.conflicts.map(c => c.name).join(', ')}>
                              <Tag color="#FCE8E6" style={{ color: '#C5221F', borderColor: '#FAD2CF', borderRadius: 6, fontWeight: 500 }}>Ocupado</Tag>
                            </Tooltip>
                          )}
                        </Col>
                      </Row>
                    </List.Item>
                  )}
                />
              ) : searchRange ? (
                <Alert type="info" showIcon message="Cargando disponibilidad..." style={{ fontSize: 12 }} />
              ) : (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#999', fontSize: 12 }}>
                  <InfoCircleOutlined style={{ marginRight: 4 }} /> Selecciona fechas para buscar
                </div>
              )}
            </Card>

            {/* Próximos Cruceros */}
            <Card style={{ borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
              <Title level={4} style={{ color: '#0A2647', marginTop: 0, marginBottom: 20 }}><CompassOutlined /> Próximos Cruceros</Title>
              {upcomingCruises.length > 0 ? (
                <Timeline mode="left">
                  {upcomingCruises.map(c => (
                    <Timeline.Item key={c.id} color="blue" label={<span style={{ fontSize: 11, color: '#888' }}>{dayjs(c.departure_date).format('DD/MM')}</span>}>
                      <div style={{ fontSize: 12, marginTop: -4 }}>
                        <Text strong style={{ display: 'block', fontSize: 13, color: '#0A2647' }}>{c.name}</Text>
                        <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>🚢 {c.vessel?.name}</Text>
                        <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>🧪 Líder: {c.scientific_leader || '—'}</Text>
                      </div>
                    </Timeline.Item>
                  ))}
                </Timeline>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#999', fontSize: 12 }}>
                  No hay cruceros planificados próximamente.
                </div>
              )}
            </Card>
          </Col>
        </Row>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <Divider style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
        <Row justify="space-between" align="middle" style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <Col><Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>© 2026 CICESE — Departamento de Embarcaciones Oceanográficas</Text></Col>
          <Col>
            <Space>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>SIAE v0.1.0</Text>
            </Space>
          </Col>
        </Row>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#f4f7f6',
    position: 'relative',
    overflow: 'hidden',
  },
  bgDecoration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '240px',
    background: 'linear-gradient(135deg, #0A2647 0%, #144272 50%, #205295 100%)',
    zIndex: 0,
  },
  header: {
    padding: '20px 40px',
    position: 'relative',
    zIndex: 1,
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  logoIcon: {
    width: 50,
    height: 50,
    borderRadius: 12,
    background: 'rgba(255,255,255,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  },
  content: {
    flex: 1,
    padding: '30px 40px',
    maxWidth: 1200,
    margin: '0 auto',
    width: '100%',
    position: 'relative',
    zIndex: 1,
  },
  footer: {
    padding: '20px 40px 40px 40px',
    background: '#0A2647',
    position: 'relative',
    zIndex: 1,
  },
};

export default PublicSchedulePage;
