import { useEffect, useState } from 'react';
import { Card, Typography, Space, Tag, Spin, Row, Col, Statistic } from 'antd';
import {
  CheckCircleOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;

/**
 * Página de bienvenida — Fase 1.
 * Muestra estado de conexión con el backend y diseño de landing.
 */
function Welcome() {
  const [backendStatus, setBackendStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await axios.get('/api/v1/status');
        setBackendStatus(response.data);
      } catch {
        setBackendStatus({ status: 'error', message: 'No se pudo conectar con el backend' });
      } finally {
        setLoading(false);
      }
    };
    checkBackend();
  }, []);

  return (
    <div style={styles.container}>
      {/* Fondo decorativo */}
      <div style={styles.bgDecoration} />
      <div style={styles.bgDecoration2} />

      <div style={styles.content} className="animate-fade-in">
        {/* Logo y título */}
        <div style={styles.logoSection}>
          <div style={styles.logoIcon}>
            <img
              src="/SIAE_Logo_shield_Isotipo_dark.svg"
              alt="SIAE Logo"
              style={{ width: 100, height: 100 }}
            />
          </div>
          <Title level={1} style={styles.mainTitle}>
            SIAE
          </Title>
          <Text style={styles.subtitle}>
            Sistema de Administración de Embarcaciones
          </Text>
          <Paragraph style={styles.description}>
            Gestión integral de la flota: documentación, mantenimientos,
            inventarios, bitácoras, planes de crucero y personal.
          </Paragraph>
        </div>

        {/* Estado de servicios */}
        <Card style={styles.statusCard} bordered={false}>
          <Title level={4} style={{ marginBottom: 24, color: '#0A2647' }}>
            Estado de Servicios
          </Title>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Spin size="large" />
              <Paragraph style={{ marginTop: 12 }}>Verificando conexión...</Paragraph>
            </div>
          ) : (
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8}>
                <Card size="small" style={styles.serviceCard}>
                  <Space direction="vertical" align="center" style={{ width: '100%' }}>
                    <CloudServerOutlined style={{ fontSize: 28, color: '#1B4F72' }} />
                    <Text strong>Frontend</Text>
                    <Tag color="success" icon={<CheckCircleOutlined />}>Activo</Tag>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card size="small" style={styles.serviceCard}>
                  <Space direction="vertical" align="center" style={{ width: '100%' }}>
                    <SafetyCertificateOutlined style={{ fontSize: 28, color: '#1B4F72' }} />
                    <Text strong>Backend API</Text>
                    <Tag
                      color={backendStatus?.status === 'ok' ? 'success' : 'error'}
                      icon={<CheckCircleOutlined />}
                    >
                      {backendStatus?.status === 'ok' ? 'Activo' : 'Error'}
                    </Tag>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card size="small" style={styles.serviceCard}>
                  <Space direction="vertical" align="center" style={{ width: '100%' }}>
                    <DatabaseOutlined style={{ fontSize: 28, color: '#1B4F72' }} />
                    <Text strong>Base de Datos</Text>
                    <Tag
                      color={backendStatus?.status === 'ok' ? 'success' : 'warning'}
                      icon={<CheckCircleOutlined />}
                    >
                      {backendStatus?.status === 'ok' ? 'Conectada' : 'Verificando'}
                    </Tag>
                  </Space>
                </Card>
              </Col>
            </Row>
          )}
        </Card>

        {/* Módulos planeados */}
        <Card style={styles.modulesCard} bordered={false}>
          <Title level={4} style={{ marginBottom: 20, color: '#0A2647' }}>
            Módulos del Sistema
          </Title>
          <Row gutter={[16, 16]}>
            {modules.map((mod) => (
              <Col xs={12} sm={8} md={6} key={mod.name}>
                <div style={styles.moduleChip}>
                  <span style={{ fontSize: 20 }}>{mod.icon}</span>
                  <Text style={{ fontSize: 12, fontWeight: 500 }}>{mod.name}</Text>
                </div>
              </Col>
            ))}
          </Row>
        </Card>

        {/* Footer */}
        <Text style={styles.footer}>
          CICESE — Departamento de Embarcaciones Oceanográficas · v0.1.0
        </Text>
      </div>
    </div>
  );
}

const modules = [
  { name: 'Embarcaciones', icon: '🚢' },
  { name: 'Documentación', icon: '📋' },
  { name: 'Mantenimiento', icon: '🔧' },
  { name: 'Inventario', icon: '📦' },
  { name: 'Bitácoras', icon: '📖' },
  { name: 'Cruceros', icon: '🗺️' },
  { name: 'Personal DEO', icon: '👥' },
  { name: 'Usuarios', icon: '🔐' },
];

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0A2647 0%, #144272 30%, #205295 60%, #2C74B3 100%)',
    position: 'relative',
    overflow: 'hidden',
    padding: '40px 20px',
  },
  bgDecoration: {
    position: 'absolute',
    top: '-20%',
    right: '-10%',
    width: '500px',
    height: '500px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  bgDecoration2: {
    position: 'absolute',
    bottom: '-15%',
    left: '-5%',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  content: {
    maxWidth: 700,
    width: '100%',
    position: 'relative',
    zIndex: 1,
  },
  logoSection: {
    textAlign: 'center',
    marginBottom: 32,
  },
  logoIcon: {
    width: 140,
    height: 140,
    borderRadius: 32,
    background: 'linear-gradient(135deg, #1B4F72, #2C74B3)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  },
  mainTitle: {
    color: '#ffffff',
    fontSize: 48,
    fontWeight: 700,
    letterSpacing: 6,
    marginBottom: 4,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 18,
    fontWeight: 300,
    display: 'block',
    marginBottom: 12,
  },
  description: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    maxWidth: 500,
    margin: '0 auto',
  },
  statusCard: {
    borderRadius: 16,
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
    marginBottom: 20,
    backdropFilter: 'blur(10px)',
  },
  serviceCard: {
    borderRadius: 12,
    textAlign: 'center',
    background: '#F8FAFC',
    border: '1px solid #E8EDF2',
  },
  modulesCard: {
    borderRadius: 16,
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
    marginBottom: 24,
  },
  moduleChip: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '14px 8px',
    borderRadius: 12,
    background: '#F0F4F8',
    border: '1px solid #E2E8F0',
    transition: 'all 0.2s ease',
    cursor: 'default',
  },
  footer: {
    display: 'block',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
};

export default Welcome;
