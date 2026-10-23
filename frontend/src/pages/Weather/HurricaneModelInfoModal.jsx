import React, { useState } from 'react';
import { Modal, Tabs, Typography, Tag, Card, Alert, Table, Divider, Space } from 'antd';
import {
  SafetyCertificateOutlined,
  ExperimentOutlined,
  BranchesOutlined,
  CompassOutlined,
  GlobalOutlined,
  ThunderboltOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  RadarChartOutlined
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

export default function HurricaneModelInfoModal({ open, onClose }) {
  const [activeTab, setActiveTab] = useState('noaa');

  const comparisonColumns = [
    {
      title: 'Característica',
      dataIndex: 'feature',
      key: 'feature',
      width: '28%',
      render: (text) => <Text strong style={{ color: '#0A2647', fontSize: 12 }}>{text}</Text>,
    },
    {
      title: (
        <span style={{ color: '#047857' }}>
          🛰️ Pronóstico Oficial NOAA
        </span>
      ),
      dataIndex: 'noaa',
      key: 'noaa',
      width: '36%',
      render: (text) => <span style={{ fontSize: 12, color: '#334155' }}>{text}</span>,
    },
    {
      title: (
        <span style={{ color: '#0284c7' }}>
          🌐 Vórtice Numérico GFS (SIAE)
        </span>
      ),
      dataIndex: 'gfs',
      key: 'gfs',
      width: '36%',
      render: (text) => <span style={{ fontSize: 12, color: '#334155' }}>{text}</span>,
    },
  ];

  const comparisonData = [
    {
      key: '1',
      feature: 'Fuente de datos',
      noaa: 'National Hurricane Center (NHC / NOAA, Miami) y CPHC (Honolulu).',
      gfs: 'Malla global GFS 0.25° (~27 km) procesada autónomamente en SIAE.',
    },
    {
      key: '2',
      feature: 'Metodología',
      noaa: 'Consenso de meteorólogos especialistas + Ensamble multimodelo (HWRF, HMON, ECMWF, GFS, UKMET) + Aviones cazahuracanes.',
      gfs: 'Algoritmo hidrodinámico de detección de ojo y cálculo de vorticidad ciclónica en mallas de viento a 10m.',
    },
    {
      key: '3',
      feature: 'Cono de Incertidumbre',
      noaa: 'Basado en el error histórico empírico a 5 años del NHC (67% de probabilidad estadística).',
      gfs: 'Cono analítico dinámico generado en función del tiempo de integración del modelo numérico.',
    },
    {
      key: '4',
      feature: 'Frecuencia de refresco',
      noaa: 'Boletines oficiales cada 6 horas (03, 09, 15, 21 UTC) o intermedios en costa.',
      gfs: 'Actualizado automáticamente con cada nueva corrida GFS descargada (00, 06, 12, 18Z).',
    },
    {
      key: '5',
      feature: 'Uso recomendado',
      noaa: 'Referencia primaria oficial para decisiones de zarpe, resguardo en puerto y alertas marítimas.',
      gfs: 'Evaluación hidrodinámica integrada: ver la interacción del ojo con el campo de partículas de viento y oleaje en tiempo real.',
    },
  ];

  const tabItems = [
    {
      key: 'noaa',
      label: (
        <span style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <SafetyCertificateOutlined style={{ color: '#10b981' }} />
          🛰️ Pronóstico Oficial NOAA (NHC)
        </span>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <Text strong style={{ fontSize: 14, color: '#0A2647' }}>
                National Hurricane Center (NHC / NOAA)
              </Text>
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                Estándar mundial oficial para seguimiento de ciclones tropicales en el Pacífico y Atlántico.
              </Text>
            </div>
            <Tag color="success" style={{ fontWeight: 700, borderRadius: 12, padding: '2px 10px' }}>
              ✓ Fuente Oficial Internacional
            </Tag>
          </div>

          <Card size="small" style={{ background: '#f8fafc', borderColor: '#e2e8f0', borderRadius: 8 }}>
            <Title level={5} style={{ margin: '0 0 8px 0', fontSize: 13, color: '#0A2647' }}>
              🔬 ¿Cómo se genera el pronóstico oficial de la NOAA?
            </Title>
            <Paragraph style={{ margin: 0, fontSize: 12, color: '#334155', lineHeight: 1.6 }}>
              El National Hurricane Center no depende de un solo modelo matemático. Un equipo de meteorólogos especialistas analiza continuamente:
            </Paragraph>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, fontSize: 12, color: '#334155', lineHeight: 1.6 }}>
              <li>
                <strong>Aviones Cazahuracanes (NOAA / USAF):</strong> Vuelos de reconocimiento que lanzan sondas (dropsondes) directamente al ojo del ciclón para medir presión barométrica exacta, temperatura y vientos máximos.
              </li>
              <li>
                <strong>Satélites Geoestacionarios (GOES-16 / GOES-18):</strong> Imágenes infrarrojas y de vapor de agua en alta resolución para técnica Dvorak de estimación de intensidad.
              </li>
              <li>
                <strong>Ensamble Multimodelo de Supercómputo:</strong> Combinación ponderada de modelos numéricos globales y regionales especializados (HWRF, HMON, GFS, ECMWF europeo, UKMET británico).
              </li>
            </ul>
          </Card>

          <Card size="small" style={{ background: '#fffbeb', borderColor: '#fef3c7', borderRadius: 8 }}>
            <Title level={5} style={{ margin: '0 0 6px 0', fontSize: 13, color: '#92400e' }}>
              📐 ¿Qué significa el Cono de Incertidumbre Oficial?
            </Title>
            <Paragraph style={{ margin: 0, fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>
              El cono del NHC representa el área donde el <strong>centro del ciclón</strong> permanecerá con una probabilidad del <strong>67% (dos tercios)</strong>. Se construye trazando círculos alrededor de cada punto de pronóstico basados en el margen de error estadístico histórico de los últimos 5 años:
            </Paragraph>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6, marginTop: 8 }}>
              <div style={{ background: 'rgba(255,255,255,0.8)', padding: '4px 8px', borderRadius: 6, border: '1px solid #fde68a', textAlign: 'center' }}>
                <Text style={{ fontSize: 10, color: '#92400e', display: 'block' }}>24 Horas</Text>
                <Text strong style={{ fontSize: 12, color: '#78350f' }}>± 35 - 45 MN</Text>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.8)', padding: '4px 8px', borderRadius: 6, border: '1px solid #fde68a', textAlign: 'center' }}>
                <Text style={{ fontSize: 10, color: '#92400e', display: 'block' }}>48 Horas</Text>
                <Text strong style={{ fontSize: 12, color: '#78350f' }}>± 65 - 80 MN</Text>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.8)', padding: '4px 8px', borderRadius: 6, border: '1px solid #fde68a', textAlign: 'center' }}>
                <Text style={{ fontSize: 10, color: '#92400e', display: 'block' }}>72 Horas</Text>
                <Text strong style={{ fontSize: 12, color: '#78350f' }}>± 95 - 120 MN</Text>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.8)', padding: '4px 8px', borderRadius: 6, border: '1px solid #fde68a', textAlign: 'center' }}>
                <Text style={{ fontSize: 10, color: '#92400e', display: 'block' }}>120 Horas (5 Días)</Text>
                <Text strong style={{ fontSize: 12, color: '#78350f' }}>± 180 - 220 MN</Text>
              </div>
            </div>
          </Card>
        </div>
      ),
    },
    {
      key: 'gfs',
      label: (
        <span style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ExperimentOutlined style={{ color: '#0284c7' }} />
          🌐 Vórtice Numérico GFS (SIAE)
        </span>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <Text strong style={{ fontSize: 14, color: '#0A2647' }}>
                Algoritmo Autónomo de Extracción de Vórtices (SIAE)
              </Text>
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                Cálculo numérico directo ejecutado en el backend del CICESE sobre mallas GFS a 0.25° (~27 km).
              </Text>
            </div>
            <Tag color="processing" style={{ fontWeight: 700, borderRadius: 12, padding: '2px 10px' }}>
              ⚙️ Algoritmo Numérico Local
            </Tag>
          </div>

          <Card size="small" style={{ background: '#f0f9ff', borderColor: '#bae6fd', borderRadius: 8 }}>
            <Title level={5} style={{ margin: '0 0 8px 0', fontSize: 13, color: '#0369a1' }}>
              🌪️ ¿Cómo rastrea el SIAE el ojo del ciclón en el modelo GFS?
            </Title>
            <Paragraph style={{ margin: 0, fontSize: 12, color: '#0c4a6e', lineHeight: 1.6 }}>
              Para cada paso de tiempo del pronóstico numérico ($t = 0h, 6h, 12h, ..., 120h$), el sistema ejecuta un algoritmo físico en cuatro fases:
            </Paragraph>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ background: '#0284c7', color: '#ffffff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  1
                </span>
                <div>
                  <Text strong style={{ fontSize: 12, color: '#0369a1' }}>Detección de Circulación Tangencial (Vorticidad):</Text>
                  <Text style={{ fontSize: 12, color: '#334155', display: 'block' }}>
                    Calcula la integral de línea de circulación ciclónica antihoraria (∮ v · dr) alrededor de centros candidatos en una ventana de búsqueda de radio R ≈ 100 km.
                  </Text>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ background: '#0284c7', color: '#ffffff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  2
                </span>
                <div>
                  <Text strong style={{ fontSize: 12, color: '#0369a1' }}>Localización Precisa del Ojo (Mínimo de Viento):</Text>
                  <Text style={{ fontSize: 12, color: '#334155', display: 'block' }}>
                    Dentro de la zona de máxima circulación, identifica la coordenada exacta del ojo donde el viento en superficie presenta su mínimo local (calma central).
                  </Text>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ background: '#0284c7', color: '#ffffff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  3
                </span>
                <div>
                  <Text strong style={{ fontSize: 12, color: '#0369a1' }}>Suavizado Cinemático con Conservación de Inercia:</Text>
                  <Text style={{ fontSize: 12, color: '#334155', display: 'block' }}>
                    Aplica un filtro spline dinámico que une los puntos temporales evitando desplazamientos o saltos erráticos no físicos generados por el mallado discreto.
                  </Text>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ background: '#0284c7', color: '#ffffff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  4
                </span>
                <div>
                  <Text strong style={{ fontSize: 12, color: '#0369a1' }}>Clasificación Saffir-Simpson y Cono de Envolvente:</Text>
                  <Text style={{ fontSize: 12, color: '#334155', display: 'block' }}>
                    Evalúa el anillo de vientos máximos sostenidos para clasificar la categoría (TS, Cat 1 a 5) y genera el cono de dispersión R(t) = R₀ + α·t.
                  </Text>
                </div>
              </div>
            </div>
          </Card>
        </div>
      ),
    },
    {
      key: 'compare',
      label: (
        <span style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <BranchesOutlined style={{ color: '#7c3aed' }} />
          ⚖️ Comparación y Criterio Náutico
        </span>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Alert
            type="info"
            showIcon
            message="Protocolo de Toma de Decisiones para Embarcaciones del CICESE"
            description={
              <span style={{ fontSize: 12, lineHeight: 1.5 }}>
                • <strong>Para Decisiones de Zarpe, Derrota y Resguardo en Puerto:</strong> Tome siempre como referencia primaria el <strong>Pronóstico Oficial NOAA</strong>, ya que cuenta con la supervisión de meteorólogos especializados y datos de reconocimiento aéreo en vivo.<br />
                • <strong>Para Evaluación Hidrodinámica de Ruta:</strong> Utilice el <strong>Modelo GFS (SIAE)</strong> para observar cómo interactúa la circulación del vórtice directamente con las partículas de viento y el oleaje de fondo modelados en el mapa.
              </span>
            }
            style={{ borderRadius: 8 }}
          />

          <Table
            columns={comparisonColumns}
            dataSource={comparisonData}
            pagination={false}
            size="small"
            bordered
            style={{ borderRadius: 8, overflow: 'hidden' }}
          />
        </div>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={740}
      style={{ top: 24 }}
      styles={{
        body: { padding: '16px 24px 20px 24px' },
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🌀</span>
          <div>
            <Title level={4} style={{ margin: 0, color: '#0A2647', fontWeight: 700, fontSize: 16 }}>
              Metodología de Pronóstico y Seguimiento de Ciclones
            </Title>
            <Text type="secondary" style={{ fontSize: 11, fontWeight: 400 }}>
              Explicación técnica de fuentes, algoritmos numéricos y conos de incertidumbre
            </Text>
          </div>
        </div>
      }
    >
      <Divider style={{ margin: '12px 0 16px 0' }} />
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        type="card"
      />
    </Modal>
  );
}
