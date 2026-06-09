/**
 * SIAE — Página de Login con diseño premium náutico.
 */

import { useState } from 'react';
import { Form, Input, Button, Typography, Card, Space, Divider } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined, CalendarOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

function LoginPage() {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setLoading(true);
    const result = await login(values.username, values.password);
    if (result.success) {
      navigate('/');
    }
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      {/* Decoraciones de fondo */}
      <div style={styles.bgOrb1} />
      <div style={styles.bgOrb2} />
      <div style={styles.bgOrb3} />

      <div style={styles.loginWrapper} className="animate-fade-in">
        {/* Logo */}
        <div style={styles.logoSection}>
          <div style={styles.logoIcon}>
            <img
              src="/SIAE_Logo_shield_Isotipo_dark.svg"
              alt="SIAE Logo"
              style={{ width: 100, height: 100 }}
            />
          </div>
          <Title level={2} style={styles.title}>SIAE</Title>
          <Text style={styles.subtitle}>Sistema Integral de Administración de Embarcaciones</Text>
        </div>

        {/* Formulario */}
        <Card style={styles.card} bordered={false}>
          <Form
            name="login"
            size="large"
            onFinish={onFinish}
            autoComplete="off"
            layout="vertical"
          >
            <Form.Item
              name="username"
              rules={[{ required: true, message: 'Ingresa tu usuario' }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: '#1B4F72' }} />}
                placeholder="Usuario"
                style={styles.input}
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: 'Ingresa tu contraseña' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#1B4F72' }} />}
                placeholder="Contraseña"
                style={styles.input}
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                icon={<LoginOutlined />}
                style={styles.button}
              >
                Iniciar Sesión
              </Button>
            </Form.Item>
          </Form>
          <Divider style={{ margin: '16px 0' }} />
          <Button
            type="link"
            block
            icon={<CalendarOutlined />}
            onClick={() => navigate('/agenda')}
            style={{ color: '#1B4F72', fontWeight: 500 }}
          >
            Ver Agenda de Embarcaciones
          </Button>
        </Card>

        <Text style={styles.footer}>
          CICESE — Departamento de Embarcaciones Oceanográficas
        </Text>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0A2647 0%, #144272 40%, #205295 70%, #2C74B3 100%)',
    position: 'relative',
    overflow: 'hidden',
    padding: '20px',
  },
  bgOrb1: {
    position: 'absolute',
    top: '10%',
    right: '15%',
    width: 300,
    height: 300,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(44,116,179,0.15) 0%, transparent 70%)',
    animation: 'float 6s ease-in-out infinite',
  },
  bgOrb2: {
    position: 'absolute',
    bottom: '15%',
    left: '10%',
    width: 250,
    height: 250,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(39,174,96,0.1) 0%, transparent 70%)',
    animation: 'float 8s ease-in-out infinite reverse',
  },
  bgOrb3: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 400,
    height: 400,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)',
    transform: 'translate(-50%, -50%)',
  },
  loginWrapper: {
    width: '100%',
    maxWidth: 400,
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
    background: 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.15)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  },
  title: {
    color: '#ffffff',
    marginBottom: 4,
    letterSpacing: 4,
    fontWeight: 700,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
  card: {
    borderRadius: 16,
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    background: 'rgba(255,255,255,0.95)',
    backdropFilter: 'blur(20px)',
    padding: '8px 8px 0',
  },
  input: {
    borderRadius: 10,
    height: 48,
  },
  button: {
    height: 48,
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 15,
    background: 'linear-gradient(135deg, #1B4F72, #2C74B3)',
    border: 'none',
    boxShadow: '0 4px 16px rgba(27,79,114,0.4)',
  },
  footer: {
    display: 'block',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    marginTop: 24,
  },
};

export default LoginPage;
