import React, { useState } from 'react';
import { Card, Tag, Select, Button, Space, Typography, Switch, Badge, Segmented, Tooltip } from 'antd';
import { 
  ThunderboltOutlined, 
  DashboardOutlined, 
  CompassOutlined, 
  GlobalOutlined, 
  CloseOutlined,
  DownOutlined,
  UpOutlined,
  SafetyCertificateOutlined,
  ExperimentOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { formatTijuanaDateTime } from '../../utils/hurricaneDateUtils';
import HurricaneModelInfoModal from './HurricaneModelInfoModal';

const { Text, Title } = Typography;

export default function HurricaneTrackerPanel({
  activeStorms = [],
  selectedStormId,
  onSelectStorm,
  stormDetails,
  loading = false,
  showCone = true,
  onToggleShowCone,
  selectedModel = 'NOAA',
  onSelectModel,
  onSelectWaypoint,
  selectedWaypointIndex = null,
  onClose,
  style,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [modelInfoModalOpen, setModelInfoModalOpen] = useState(false);

  const currentCat = stormDetails?.category_info || { label: 'Sin Datos', color: '#1890ff', code: 'TS' };

  // Obtener puntos de pronóstico según el modelo seleccionado
  const models = stormDetails?.models || {};
  const hasGfsModel = Boolean(models.GFS);

  let activeModelData = models[selectedModel];
  if (!activeModelData && selectedModel === 'ALL') {
    activeModelData = models.NOAA || stormDetails;
  }
  if (!activeModelData) {
    activeModelData = stormDetails;
  }

  const forecastPoints = activeModelData?.forecast_track || stormDetails?.forecast_track || [];

  const defaultRight = typeof window !== 'undefined' && window.innerWidth >= 1200 ? 234 : 14;

  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        right: defaultRight,
        zIndex: 1000,
        width: 370,
        maxWidth: 'calc(100vw - 32px)',
        pointerEvents: 'auto',
        ...style,
      }}
    >
      <Card
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          background: 'rgba(255, 255, 255, 0.97)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid #cbd5e1',
          boxShadow: '0 10px 25px -5px rgba(10, 38, 71, 0.18), 0 8px 10px -6px rgba(10, 38, 71, 0.1)',
        }}
        styles={{
          body: {
            padding: '14px 16px',
            maxHeight: collapsed ? 'auto' : '82vh',
            overflowY: 'auto',
          },
        }}
      >
        {/* Cabecera Principal */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24, lineHeight: 1 }} className="hurricane-spinner">🌀</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Title level={4} style={{ color: '#0A2647', margin: 0, fontWeight: 700, letterSpacing: '0.5px' }}>
                  {stormDetails?.name ? stormDetails.name.toUpperCase() : 'SEGUIMIENTO'}
                </Title>
                <Tag
                  color={currentCat.color}
                  style={{
                    fontWeight: 700,
                    borderRadius: 6,
                    border: 'none',
                    color: '#ffffff',
                    margin: 0,
                  }}
                >
                  {currentCat.code} ({currentCat.name || currentCat.label})
                </Tag>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                {stormDetails?.is_live ? (
                  <Badge status="processing" color="#16a34a" text={<Text style={{ color: '#16a34a', fontSize: 11, fontWeight: 600 }}>EN VIVO</Text>} />
                ) : (
                  <Badge color="#ea580c" text={<Text style={{ color: '#ea580c', fontSize: 11, fontWeight: 600 }}>ARCHIVO HISTÓRICO</Text>} />
                )}
                <Text type="secondary" style={{ fontSize: 11 }}>
                  · {stormDetails?.basin === 'EP' ? 'Pacífico Oriental' : stormDetails?.basin === 'AT' ? 'Atlántico' : 'Pacífico'}
                </Text>
              </div>
            </div>
          </div>

          <Space size={2}>
            <Button
              type="text"
              size="small"
              icon={collapsed ? <DownOutlined style={{ color: '#0A2647' }} /> : <UpOutlined style={{ color: '#0A2647' }} />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ color: '#0A2647' }}
            />
            {onClose && (
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined style={{ color: '#64748b' }} />}
                onClick={onClose}
                style={{ color: '#64748b' }}
              />
            )}
          </Space>
        </div>

        {!collapsed && (
          <>
            {/* Selector de Ciclones Activos / Históricos */}
            <div style={{ marginTop: 6, marginBottom: 10 }}>
              <Text style={{ color: '#475569', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                SELECCIONAR CICLÓN O TORMENTA:
              </Text>
              <Select
                value={selectedStormId}
                onChange={onSelectStorm}
                loading={loading}
                style={{ width: '100%' }}
                options={[
                  {
                    label: <span style={{ color: '#0284c7', fontWeight: 700, fontSize: 11 }}>🛰️ CICLONES ACTIVOS (EN VIVO)</span>,
                    options: activeStorms
                      .filter((s) => s.is_live)
                      .map((s) => ({
                        value: s.id,
                        label: (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>🌀 {s.name}</span>
                            <Tag color={s.category_info?.color} style={{ fontSize: 10, margin: 0, padding: '0 5px', fontWeight: 700 }}>
                              {s.category_info?.code || s.classification}
                            </Tag>
                          </div>
                        ),
                      })),
                  },
                  {
                    label: <span style={{ color: '#d97706', fontWeight: 700, fontSize: 11 }}>📜 HISTÓRICOS OFICIALES NHC</span>,
                    options: activeStorms
                      .filter((s) => !s.is_live)
                      .map((s) => ({
                        value: s.id,
                        label: (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>⚡ {s.name} ({s.year || '2023'})</span>
                            <Tag color={s.category_info?.color} style={{ fontSize: 10, margin: 0, padding: '0 5px', fontWeight: 700 }}>
                              {s.category_info?.code}
                            </Tag>
                          </div>
                        ),
                      })),
                  },
                ]}
              />
            </div>

            {/* Selector de Modelo de Trayectoria (NOAA vs GFS Numérico vs Comparar) */}
            {hasGfsModel && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ color: '#475569', fontSize: 11, fontWeight: 600 }}>
                    MODELO DE PRONÓSTICO:
                  </Text>
                  <Tooltip title="¿Cómo se calcula cada modelo? Haz clic para ver la metodología completa">
                    <Button
                      type="link"
                      size="small"
                      icon={<InfoCircleOutlined style={{ fontSize: 12, color: '#0284c7' }} />}
                      onClick={() => setModelInfoModalOpen(true)}
                      style={{
                        padding: 0,
                        height: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        fontSize: 11,
                        color: '#0284c7',
                        fontWeight: 600,
                      }}
                    >
                      Metodología
                    </Button>
                  </Tooltip>
                </div>
                <Segmented
                  block
                  value={selectedModel}
                  onChange={onSelectModel}
                  options={[
                    {
                      label: (
                        <span style={{ fontSize: 11, fontWeight: selectedModel === 'NOAA' ? 700 : 500 }}>
                          🛰️ NOAA
                        </span>
                      ),
                      value: 'NOAA',
                    },
                    {
                      label: (
                        <span style={{ fontSize: 11, fontWeight: selectedModel === 'GFS' ? 700 : 500 }}>
                          🌐 GFS (SIAE)
                        </span>
                      ),
                      value: 'GFS',
                    },
                    {
                      label: (
                        <span style={{ fontSize: 11, fontWeight: selectedModel === 'ALL' ? 700 : 500 }}>
                          ⚖️ Comparar
                        </span>
                      ),
                      value: 'ALL',
                    },
                  ]}
                />
              </div>
            )}

            {/* Métricas Principales del Ciclón */}
            {stormDetails && (
              <div
                style={{
                  background: '#f8fafc',
                  borderRadius: 8,
                  padding: '10px 12px',
                  marginBottom: 10,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ThunderboltOutlined style={{ color: '#e11d48', fontSize: 16 }} />
                    <div>
                      <Text style={{ color: '#64748b', fontSize: 10, display: 'block', fontWeight: 500 }}>VIENTO SOSTENIDO</Text>
                      <Text style={{ color: '#0f172a', fontWeight: 700, fontSize: 13 }}>
                        {stormDetails.intensity_kts} kt{' '}
                        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>
                          ({Math.round(stormDetails.intensity_kts * 1.852)} km/h)
                        </span>
                      </Text>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <DashboardOutlined style={{ color: '#2563eb', fontSize: 16 }} />
                    <div>
                      <Text style={{ color: '#64748b', fontSize: 10, display: 'block', fontWeight: 500 }}>PRESIÓN CENTRAL</Text>
                      <Text style={{ color: '#0f172a', fontWeight: 700, fontSize: 13 }}>
                        {stormDetails.pressure_hpa ? `${stormDetails.pressure_hpa} hPa` : '—'}
                      </Text>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CompassOutlined style={{ color: '#059669', fontSize: 16 }} />
                    <div>
                      <Text style={{ color: '#64748b', fontSize: 10, display: 'block', fontWeight: 500 }}>DESPLAZAMIENTO</Text>
                      <Text style={{ color: '#0f172a', fontWeight: 600, fontSize: 12 }}>
                        {stormDetails.movement?.dir_cardinal || 'NW'}{' '}
                        {stormDetails.movement?.speed_kts ? `a ${stormDetails.movement.speed_kts} kt` : '—'}
                      </Text>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <GlobalOutlined style={{ color: '#d97706', fontSize: 16 }} />
                    <div>
                      <Text style={{ color: '#64748b', fontSize: 10, display: 'block', fontWeight: 500 }}>UBICACIÓN ACTUAL</Text>
                      <Text style={{ color: '#0f172a', fontWeight: 600, fontSize: 12 }}>
                        {stormDetails.current_position?.lat?.toFixed(1)}°N, {Math.abs(stormDetails.current_position?.lon || 0).toFixed(1)}°W
                      </Text>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN: DESCRIPCIÓN DEL MODELO ACTIVO CON BOTÓN DE INFO */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                background: selectedModel === 'GFS' ? '#eff6ff' : selectedModel === 'ALL' ? '#f5f3ff' : '#fffbeb',
                borderRadius: 8,
                border: `1px solid ${selectedModel === 'GFS' ? '#bfdbfe' : selectedModel === 'ALL' ? '#ddd6fe' : '#fef3c7'}`,
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {selectedModel === 'GFS' ? (
                  <ExperimentOutlined style={{ color: '#0284c7', fontSize: 14 }} />
                ) : (
                  <SafetyCertificateOutlined style={{ color: selectedModel === 'ALL' ? '#7c3aed' : '#d97706', fontSize: 14 }} />
                )}
                <Text style={{ color: '#334155', fontSize: 11, fontWeight: 600 }}>
                  {selectedModel === 'GFS'
                    ? 'Modelo GFS 0.25° (Vórtice Numérico SIAE)'
                    : selectedModel === 'ALL'
                    ? 'Comparativa: NOAA Oficial vs GFS Numérico'
                    : 'Pronóstico Oficial: National Hurricane Center (NOAA)'}
                </Text>
              </div>

              <Tooltip title="Ver detalles y metodología del modelo">
                <Button
                  type="text"
                  size="small"
                  icon={<InfoCircleOutlined style={{ color: '#0284c7', fontSize: 13 }} />}
                  onClick={() => setModelInfoModalOpen(true)}
                  style={{
                    padding: 0,
                    width: 22,
                    height: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                />
              </Tooltip>
            </div>

            {/* Opciones de Capa: Cono de Incertidumbre */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>📐</span>
                <div>
                  <Text style={{ color: '#0f172a', fontSize: 11, fontWeight: 600, display: 'block' }}>
                    Cono de Incertidumbre
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: 10 }}>
                    Margen de dispersión probabilístico del modelo
                  </Text>
                </div>
              </div>
              <Switch size="small" checked={showCone} onChange={onToggleShowCone} />
            </div>

            {/* Lista / Timeline de Waypoints Pronosticados */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ color: '#0A2647', fontSize: 11, fontWeight: 700 }}>
                  {selectedModel === 'GFS'
                    ? 'TRAYECTORIA GFS NUMÉRICO (SIAE):'
                    : selectedModel === 'ALL'
                    ? 'HITOS (NOAA OFICIAL):'
                    : 'TRAYECTORIA PRONOSTICADA (NOAA):'}
                </Text>
                <Text style={{ color: '#64748b', fontSize: 10 }}>Clic para centrar</Text>
              </div>

              {forecastPoints.length === 0 ? (
                <div style={{ padding: '12px 8px', textAlign: 'center', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Sin puntos de pronóstico disponibles</Text>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto', paddingRight: 2 }}>
                  {forecastPoints.map((pt, idx) => {
                    const cat = pt.cat_info || { code: 'TS', color: '#1890ff' };
                    const timeInfo = formatTijuanaDateTime(pt.date_str);
                    const isSelected = selectedWaypointIndex === idx;

                    return (
                      <div
                        key={idx}
                        onClick={() => onSelectWaypoint && onSelectWaypoint(pt, idx)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          background: isSelected ? '#e0f2fe' : '#f8fafc',
                          border: isSelected ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
                          borderRadius: 6,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected ? '0 0 0 1px #0284c7' : 'none',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = '#f0f9ff';
                            e.currentTarget.style.borderColor = '#bae6fd';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = '#f8fafc';
                            e.currentTarget.style.borderColor = '#e2e8f0';
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <Tag
                            color={cat.color}
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              margin: 0,
                              minWidth: 32,
                              textAlign: 'center',
                              borderRadius: 4,
                              padding: '0 4px',
                              color: '#ffffff',
                              flexShrink: 0,
                            }}
                          >
                            {cat.code}
                          </Tag>
                          <div style={{ minWidth: 0, overflow: 'hidden' }}>
                            <Text style={{ color: '#0A2647', fontSize: 11, fontWeight: 700, display: 'block', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                              {timeInfo.localStr || pt.date_str}
                            </Text>
                            <Text style={{ color: '#64748b', fontSize: 10, display: 'block', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                              {timeInfo.utcStr && timeInfo.utcStr !== timeInfo.localStr ? `${timeInfo.utcStr} · ` : ''}
                              {pt.lat.toFixed(1)}°N, {Math.abs(pt.lon).toFixed(1)}°W
                            </Text>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 6 }}>
                          <Text style={{ color: '#0f172a', fontSize: 11, fontWeight: 700, display: 'block' }}>
                            {pt.wind_kts} kt
                          </Text>
                          <Text style={{ color: '#64748b', fontSize: 9 }}>
                            {Math.round(pt.wind_kts * 1.852)} km/h
                          </Text>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Modal explicativo de la metodología del modelo */}
      <HurricaneModelInfoModal
        open={modelInfoModalOpen}
        onClose={() => setModelInfoModalOpen(false)}
      />
    </div>
  );
}
