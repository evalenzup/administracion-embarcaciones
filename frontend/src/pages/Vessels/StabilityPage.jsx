/**
 * SIAE — Módulo de Estabilidad Naval y Pesos en Cubiertas.
 * Evaluación en tiempo real según Cuadernillo de Estabilidad y Criterios OMI (B/O Alpha Helix).
 * Permite estibar equipos en Cubierta Principal y Superior, verificar KGc vs KGmáx y emitir recomendaciones.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card, Table, Tag, Button, Space, Typography, Row, Col, Statistic,
  Modal, Form, Input, InputNumber, Select, Alert, Divider, Badge,
  Progress, Drawer, Descriptions, Tooltip, Popconfirm, message, Tabs,
  Radio, Empty, Segmented, AutoComplete
} from 'antd';
import {
  CompassOutlined, PlusOutlined, DeleteOutlined, CheckCircleOutlined,
  WarningOutlined, CloseCircleOutlined, ReloadOutlined, EyeOutlined,
  SaveOutlined, HistoryOutlined, ExperimentOutlined, InfoCircleOutlined,
  SwapOutlined, ArrowUpOutlined, ArrowDownOutlined, RocketOutlined,
  AppstoreOutlined, TableOutlined, EditOutlined
} from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import DeckStowagePlan2D from './components/DeckStowagePlan2D';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

// Equipos oceanográficos predefinidos según Anexos 5, 6 y 8 (B/O Alpha Helix)
const PRESET_EQUIPMENT = [
  // ── CUBIERTA PRINCIPAL (Cota Z = 4.95 m) ──
  { item_name: 'Pórtico / Marco en A (U-Frame)', weight_tons: 2.80, zg_above_deck_m: 2.10, default_deck: 'CUBIERTA_PRINCIPAL', zone_code: 'U-FRAME (Espejo de Popa)' },
  { item_name: 'Winche Auxiliar Principal (60x49")', weight_tons: 4.50, zg_above_deck_m: 0.90, default_deck: 'CUBIERTA_PRINCIPAL', zone_code: 'Winche G (Crujía Cda. 48-51)' },
  { item_name: 'Contenedor Laboratorio Húmedo (20ft)', weight_tons: 5.50, zg_above_deck_m: 1.30, default_deck: 'CUBIERTA_PRINCIPAL', zone_code: 'Área A1 — Banda Superior (6.08 m²)' },
  { item_name: 'Cajas de Muestras y Redes Bongo', weight_tons: 0.90, zg_above_deck_m: 0.60, default_deck: 'CUBIERTA_PRINCIPAL', zone_code: 'Área A2 — Popa Banda Superior (6.70 m²)' },
  { item_name: 'Draga Box Corer / Reineck', weight_tons: 1.10, zg_above_deck_m: 0.70, default_deck: 'CUBIERTA_PRINCIPAL', zone_code: 'Área A3 — Popa Banda Inferior (6.70 m²)' },
  { item_name: 'Compresor Sísmico / Geofísico', weight_tons: 3.20, zg_above_deck_m: 0.85, default_deck: 'CUBIERTA_PRINCIPAL', zone_code: 'Área A4 — Banda Inferior (6.08 m²)' },

  // ── CUBIERTA SUPERIOR (Cota Z = 7.04 m — Más pequeña) ──
  { item_name: 'Roseta CTD Seabird 24 botellas (con J-Frame)', weight_tons: 1.20, zg_above_deck_m: 1.10, default_deck: 'CUBIERTA_SUPERIOR', zone_code: 'Caseta de Control & J-Frame (Winche CTD)' },
  { item_name: 'Rack de Instrumental Científico de Cubierta', weight_tons: 1.50, zg_above_deck_m: 0.80, default_deck: 'CUBIERTA_SUPERIOR', zone_code: 'Área A1 — Banda Superior (12.87 m²)' },
  { item_name: 'Rack de Instrumentación Meteorológica', weight_tons: 0.55, zg_above_deck_m: 0.60, default_deck: 'CUBIERTA_SUPERIOR', zone_code: 'Área A1 — Crujía Central (5.98 m²)' },
  { item_name: 'Cajas de Repuestos CTD y Cabos', weight_tons: 0.65, zg_above_deck_m: 0.50, default_deck: 'CUBIERTA_SUPERIOR', zone_code: 'Área A1 — Pasillo Banda (4.69 m²)' },
];

export default function StabilityPage() {
  const { user } = useAuth();

  // Embarcación y Sondeo
  const [vessels, setVessels] = useState([]);
  const [selectedVesselId, setSelectedVesselId] = useState(null);
  const [selectedVessel, setSelectedVessel] = useState(null);
  const [soundings, setSoundings] = useState([]);
  const [selectedSoundingId, setSelectedSoundingId] = useState(null);
  const [selectedSounding, setSelectedSounding] = useState(null);

  // Parámetros de la condición de estabilidad
  const [conditionName, setConditionName] = useState('Condición Crucero Oceanográfico');
  const [evalType, setEvalType] = useState('SALIDA_PUERTO');
  const [notes, setNotes] = useState('');

  // Items de carga estibados en cubierta
  const [cargoItems, setCargoItems] = useState([
    {
      id: 1,
      item_name: 'Pórtico / Marco en A (U-Frame)',
      deck: 'CUBIERTA_PRINCIPAL',
      zone_code: 'U-FRAME (Espejo de Popa)',
      weight_tons: 2.80,
      zg_above_deck_m: 2.10,
      notes: 'Montado en espejo Cda. 60 con cilindros hidráulicos',
    },
    {
      id: 2,
      item_name: 'Winche Auxiliar Principal (60x49")',
      deck: 'CUBIERTA_PRINCIPAL',
      zone_code: 'Winche G (Crujía Cda. 48-51)',
      weight_tons: 4.50,
      zg_above_deck_m: 0.90,
      notes: 'Bancada estructural sobre eje de crujía Cda. 48-51',
    },
    {
      id: 3,
      item_name: 'Roseta CTD Seabird 24 botellas (con J-Frame)',
      deck: 'CUBIERTA_SUPERIOR',
      zone_code: 'Caseta de Control & J-Frame (Winche CTD)',
      weight_tons: 1.20,
      zg_above_deck_m: 1.10,
      notes: 'Operado desde caseta de control y winche auxiliar CTD F',
    },
    {
      id: 4,
      item_name: 'Rack de Instrumental Científico de Cubierta',
      deck: 'CUBIERTA_SUPERIOR',
      zone_code: 'Área A1 — Banda Superior (12.87 m²)',
      weight_tons: 1.50,
      zg_above_deck_m: 0.80,
      notes: 'Estibado en cubierta superior bajo el radio de maniobra de la Grúa 3000# (pluma orientada a proa)',
    },
  ]);

  // Resultado del cálculo en vivo
  const [calcResult, setCalcResult] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [savingCondition, setSavingCondition] = useState(false);

  // Historial de condiciones guardadas
  const [savedConditions, setSavedConditions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState('evaluator');

  // Modo de visualización de estiba: 'plan2d' | 'table' | 'both'
  const [stowageViewMode, setStowageViewMode] = useState('plan2d');

  // Modal para agregar/editar equipo de cubierta
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm] = Form.useForm();

  // Modal de detalle histórico
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [viewingCondition, setViewingCondition] = useState(null);

  // ── 1. Cargar Embarcaciones ─────────────────────────────────
  const fetchVessels = useCallback(async () => {
    try {
      const res = await apiClient.get('/vessels', { params: { limit: 50 } });
      const list = res.data.items || [];
      setVessels(list);
      if (list.length > 0) {
        const alpha = list.find((v) => v.name.toLowerCase().includes('alpha helix')) || list[0];
        setSelectedVesselId(alpha.id);
        setSelectedVessel(alpha);
      }
    } catch {
      message.error('Error al cargar embarcaciones');
    }
  }, []);

  useEffect(() => {
    fetchVessels();
  }, [fetchVessels]);

  // ── 2. Cargar Sondeos del buque ─────────────────────────────
  const fetchSoundings = useCallback(async () => {
    if (!selectedVesselId) return;
    try {
      const res = await apiClient.get(`/vessels/${selectedVesselId}/soundings`, { params: { limit: 30 } });
      const list = res.data || [];
      setSoundings(list);

      // Preseleccionar el oficial o el primero
      const official = list.find((s) => s.is_official) || list[0];
      if (official) {
        setSelectedSoundingId(official.id);
        setSelectedSounding(official);
      } else {
        setSelectedSoundingId(null);
        setSelectedSounding(null);
      }
    } catch {
      // Sin sondeos previos
    }
  }, [selectedVesselId]);

  // ── 3. Cargar Historial de Condiciones Guardadas ────────────
  const fetchSavedConditions = useCallback(async () => {
    if (!selectedVesselId) return;
    setLoadingHistory(true);
    try {
      const res = await apiClient.get(`/vessels/${selectedVesselId}/stability/conditions`, { params: { limit: 30 } });
      setSavedConditions(res.data || []);
    } catch {
      // Ignorar error si está vacío
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedVesselId]);

  useEffect(() => {
    if (selectedVesselId) {
      fetchSoundings();
      fetchSavedConditions();
    }
  }, [selectedVesselId, fetchSoundings, fetchSavedConditions]);

  // Actualizar selectedSounding cuando cambia el select
  useEffect(() => {
    if (selectedSoundingId && soundings.length > 0) {
      const found = soundings.find((s) => s.id === selectedSoundingId);
      if (found) setSelectedSounding(found);
    }
  }, [selectedSoundingId, soundings]);

  // ── 4. Evaluación en Tiempo Real ────────────────────────────
  const runLiveEvaluation = useCallback(async () => {
    if (!selectedVesselId) return;
    setEvaluating(true);
    try {
      const payload = {
        vessel_id: selectedVesselId,
        sounding_id: selectedSoundingId,
        condition_name: conditionName,
        evaluation_type: evalType,
        cargo_items: cargoItems.map((item) => ({
          equipment_id: item.equipment_id,
          deck: item.deck,
          zone_code: item.zone_code,
          item_name: item.item_name,
          weight_tons: Number(item.weight_tons) || 0,
          zg_above_deck_m: Number(item.zg_above_deck_m) || 1.0,
          notes: item.notes,
        })),
        notes: notes,
      };

      const res = await apiClient.post(`/vessels/${selectedVesselId}/stability/evaluate`, payload);
      setCalcResult(res.data);
    } catch (err) {
      // message.error('Error al evaluar estabilidad');
    } finally {
      setEvaluating(false);
    }
  }, [selectedVesselId, selectedSoundingId, conditionName, evalType, cargoItems, notes]);

  // Ejecutar evaluación en vivo cuando cambian pesos, condición o sondeo
  useEffect(() => {
    runLiveEvaluation();
  }, [runLiveEvaluation]);

  // ── 5. Guardar Condición Oficial ────────────────────────────
  const handleSaveCondition = async () => {
    if (!selectedVesselId) return;
    setSavingCondition(true);
    try {
      const payload = {
        vessel_id: selectedVesselId,
        sounding_id: selectedSoundingId,
        condition_name: conditionName,
        evaluation_type: evalType,
        cargo_items: cargoItems.map((item) => ({
          equipment_id: item.equipment_id,
          deck: item.deck,
          zone_code: item.zone_code,
          item_name: item.item_name,
          weight_tons: Number(item.weight_tons) || 0,
          zg_above_deck_m: Number(item.zg_above_deck_m) || 1.0,
          notes: item.notes,
        })),
        notes: notes,
      };

      await apiClient.post(`/vessels/${selectedVesselId}/stability/conditions`, payload);
      message.success('Condición oficial de estabilidad guardada exitosamente');
      fetchSavedConditions();
      setActiveTab('history');
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al guardar la condición de estabilidad');
    } finally {
      setSavingCondition(false);
    }
  };

  // Eliminar condición histórica
  const handleDeleteCondition = async (id) => {
    try {
      await apiClient.delete(`/stability/conditions/${id}`);
      message.success('Condición eliminada');
      fetchSavedConditions();
    } catch {
      message.error('Error al eliminar la condición');
    }
  };

  // ── 6. Manejo de Items de Carga ─────────────────────────────
  const handleOpenAddItem = (defaultDeck = 'CUBIERTA_PRINCIPAL', defaultZone = '') => {
    setEditingItem(null);
    itemForm.resetFields();
    itemForm.setFieldsValue({
      deck: defaultDeck || 'CUBIERTA_PRINCIPAL',
      zone_code: defaultZone || '',
      zg_above_deck_m: 1.0,
      weight_tons: 1.0,
    });
    setItemModalOpen(true);
  };

  const handleOpenEditItem = (item) => {
    setEditingItem(item);
    itemForm.setFieldsValue(item);
    setItemModalOpen(true);
  };

  const handleSaveItemModal = () => {
    itemForm.validateFields().then((vals) => {
      if (editingItem) {
        setCargoItems((prev) =>
          prev.map((it) => (it.id === editingItem.id ? { ...it, ...vals } : it))
        );
        message.success('Equipo actualizado');
      } else {
        const newItem = {
          ...vals,
          id: Date.now(),
        };
        setCargoItems((prev) => [...prev, newItem]);
        message.success('Equipo agregado a cubierta');
      }
      setItemModalOpen(false);
    });
  };

  const handleDeleteItem = (id) => {
    setCargoItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleAddPreset = (preset) => {
    const newItem = {
      ...preset,
      deck: preset.default_deck,
      id: Date.now(),
    };
    setCargoItems((prev) => [...prev, newItem]);
    message.info(`Agregado: ${preset.item_name} (${preset.weight_tons} t)`);
  };

  // Desglose por cubierta
  const mainDeckItems = useMemo(
    () => cargoItems.filter((i) => i.deck === 'CUBIERTA_PRINCIPAL'),
    [cargoItems]
  );
  const upperDeckItems = useMemo(
    () => cargoItems.filter((i) => i.deck === 'CUBIERTA_SUPERIOR'),
    [cargoItems]
  );

  return (
    <div className="animate-fade-in" style={{ padding: '0 4px' }}>
      {/* ── HEADER PRINCIPAL ── */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }} gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Space direction="vertical" size={2}>
            <Title level={3} style={{ color: '#0A2647', margin: 0 }}>
              ⚓ Cálculo de Estabilidad Naval y Pesos en Cubiertas
            </Title>
            <Text type="secondary">
              Verificación de Criterios OMI, Gráfica No. 1 (KG Máximo), y Anexos 3 y 4 (B/O Alpha Helix)
            </Text>
          </Space>
        </Col>
        <Col xs={24} md={12} style={{ textAlign: 'right' }}>
          <Space wrap>
            <Text strong style={{ color: '#0A2647' }}>Embarcación:</Text>
            <Select
              style={{ width: 250 }}
              value={selectedVesselId}
              onChange={(val) => setSelectedVesselId(val)}
              options={vessels.map((v) => ({
                value: v.id,
                label: `🚢 ${v.name}`,
              }))}
            />
            <Button icon={<ReloadOutlined />} onClick={runLiveEvaluation} title="Recalcular" />
          </Space>
        </Col>
      </Row>

      {/* ── PESTAÑAS: EVALUADOR Y HISTORIAL ── */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        size="large"
        items={[
          {
            key: 'evaluator',
            label: (
              <span>
                <CompassOutlined /> <b>🎯 Evaluador de Estabilidad en Vivo</b>
              </span>
            ),
            children: (
              <div>
                {/* ── BANNER EJECUTIVO DE CUMPLIMIENTO ── */}
                {calcResult && (
                  <Card
                    style={{
                      marginBottom: 16,
                      borderRadius: 14,
                      border:
                        calcResult.status_level === 'APROBADO'
                          ? '2px solid #27AE60'
                          : calcResult.status_level === 'ADVERTENCIA'
                          ? '2px solid #F39C12'
                          : '2px solid #C0392B',
                      background:
                        calcResult.status_level === 'APROBADO'
                          ? 'linear-gradient(135deg, #F4FBF7 0%, #FFFFFF 100%)'
                          : calcResult.status_level === 'ADVERTENCIA'
                          ? 'linear-gradient(135deg, #FEF9E7 0%, #FFFFFF 100%)'
                          : 'linear-gradient(135deg, #FDEDEC 0%, #FFFFFF 100%)',
                    }}
                    styles={{ body: { padding: '16px 20px' } }}
                  >
                    <Row justify="space-between" align="middle" gutter={[16, 16]}>
                      <Col xs={24} lg={8}>
                        <Space align="center" size={12}>
                          {calcResult.status_level === 'APROBADO' ? (
                            <CheckCircleOutlined style={{ fontSize: 44, color: '#27AE60' }} />
                          ) : calcResult.status_level === 'ADVERTENCIA' ? (
                            <WarningOutlined style={{ fontSize: 44, color: '#F39C12' }} />
                          ) : (
                            <CloseCircleOutlined style={{ fontSize: 44, color: '#C0392B' }} />
                          )}
                          <div>
                            <Tag
                              color={
                                calcResult.status_level === 'APROBADO'
                                  ? 'success'
                                  : calcResult.status_level === 'ADVERTENCIA'
                                  ? 'warning'
                                  : 'error'
                              }
                              style={{ fontSize: 13, fontWeight: 700, padding: '3px 10px' }}
                            >
                              {calcResult.status_level === 'APROBADO'
                                ? 'CUMPLE CRITERIOS OMI (APROBADO)'
                                : calcResult.status_level === 'ADVERTENCIA'
                                ? 'MARGEN ESTRECHO (ADVERTENCIA)'
                                : 'NO CUMPLE CRITERIOS (PELIGRO)'}
                            </Tag>
                            <Title level={4} style={{ margin: '4px 0 0', color: '#0A2647' }}>
                              Margen de Seguridad: {(calcResult.stability_margin_m * 100).toFixed(1)} cm
                            </Title>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              KG corregido: <b>{calcResult.kg_corrected_m.toFixed(3)} m</b> ≤ KG máx: <b>{calcResult.kg_max_m.toFixed(3)} m</b>
                            </Text>
                          </div>
                        </Space>
                      </Col>

                      <Col xs={24} lg={16}>
                        <Row gutter={[16, 8]} justify="end">
                          <Col xs={12} sm={6} style={{ textAlign: 'center' }}>
                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>DESPLAZAMIENTO (Δ)</Text>
                            <Text strong style={{ fontSize: 18, color: '#0A2647' }}>
                              {calcResult.displacement_tons.toFixed(1)} <span style={{ fontSize: 12 }}>/ 635 t</span>
                            </Text>
                            <Progress
                              percent={Math.min(100, Math.round((calcResult.displacement_tons / 635) * 100))}
                              size="small"
                              status={calcResult.displacement_tons > 635 ? 'exception' : 'normal'}
                            />
                          </Col>

                          <Col xs={12} sm={6} style={{ textAlign: 'center' }}>
                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>CALADO / TRIM</Text>
                            <Text strong style={{ fontSize: 18, color: '#2980B9' }}>
                              {calcResult.mean_draft_est_m.toFixed(2)} <span style={{ fontSize: 12 }}>m</span>
                            </Text>
                            <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                              Trim: <b>{calcResult.trim_m >= 0 ? `+${calcResult.trim_m.toFixed(2)}` : calcResult.trim_m.toFixed(2)} m</b>
                            </Text>
                          </Col>

                          <Col xs={12} sm={6} style={{ textAlign: 'center' }}>
                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>CBTA. PRINCIPAL</Text>
                            <Text strong style={{ fontSize: 18, color: '#D35400' }}>
                              {calcResult.deck_limits?.main_deck_weight_tons.toFixed(1)} <span style={{ fontSize: 12 }}>/ {calcResult.deck_limits?.main_deck_limit_tons.toFixed(1)} t</span>
                            </Text>
                            <Progress
                              percent={Math.min(100, Math.round((calcResult.deck_limits?.main_deck_weight_tons / (calcResult.deck_limits?.main_deck_limit_tons || 30)) * 100))}
                              size="small"
                              status={calcResult.deck_limits?.main_deck_compliant ? 'normal' : 'exception'}
                            />
                          </Col>

                          <Col xs={12} sm={6} style={{ textAlign: 'center' }}>
                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>CBTA. SUPERIOR</Text>
                            <Text strong style={{ fontSize: 18, color: '#8E44AD' }}>
                              {calcResult.deck_limits?.upper_deck_weight_tons.toFixed(1)} <span style={{ fontSize: 12 }}>/ {calcResult.deck_limits?.upper_deck_limit_tons.toFixed(1)} t</span>
                            </Text>
                            <Progress
                              percent={Math.min(100, Math.round((calcResult.deck_limits?.upper_deck_weight_tons / (calcResult.deck_limits?.upper_deck_limit_tons || 25)) * 100))}
                              size="small"
                              status={calcResult.deck_limits?.upper_deck_compliant ? 'normal' : 'exception'}
                            />
                          </Col>
                        </Row>
                      </Col>
                    </Row>
                  </Card>
                )}

                {/* ── PARÁMETROS DE LA CONDICIÓN Y VÍNCULO A SONDEO ── */}
                <Card
                  title="1. Configuración de la Condición y Estado de Tanques"
                  style={{ marginBottom: 16, borderRadius: 12 }}
                >
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={8}>
                      <Text strong style={{ display: 'block', marginBottom: 4 }}>Nombre de la Condición:</Text>
                      <Input
                        value={conditionName}
                        onChange={(e) => setConditionName(e.target.value)}
                        placeholder="Ej. Crucero Oceanográfico GOLFO-2026 Zarpe"
                      />
                    </Col>

                    <Col xs={24} sm={12} md={6}>
                      <Text strong style={{ display: 'block', marginBottom: 4 }}>Condición de Operación:</Text>
                      <Radio.Group
                        value={evalType}
                        onChange={(e) => setEvalType(e.target.value)}
                        buttonStyle="solid"
                      >
                        <Radio.Button value="SALIDA_PUERTO">⚓ Salida de Puerto (100%)</Radio.Button>
                        <Radio.Button value="LLEGADA_PUERTO">🏁 Llegada (10% Crítica)</Radio.Button>
                        <Radio.Button value="SIMULACION">⚙️ Simulación</Radio.Button>
                      </Radio.Group>
                    </Col>

                    <Col xs={24} sm={12} md={10}>
                      <Text strong style={{ display: 'block', marginBottom: 4 }}>
                        Sondeo de Tanques Aplicado:
                      </Text>
                      <Select
                        style={{ width: '100%' }}
                        value={selectedSoundingId}
                        onChange={(val) => setSelectedSoundingId(val)}
                        placeholder="Seleccione un sondeo oficial..."
                      >
                        {soundings.map((s) => (
                          <Option key={s.id} value={s.id}>
                            #{s.id} · {s.sounding_type} ({s.total_liquids_tons.toFixed(1)} t) · {s.is_official ? '🟢 OFICIAL' : '📝 Diario'}
                          </Option>
                        ))}
                      </Select>
                      {selectedSounding && (
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                          Combustible: <b>{selectedSounding.total_fuel_tons.toFixed(1)} t</b> · Agua: <b>{selectedSounding.total_fresh_water_tons.toFixed(1)} t</b> · Lastre: <b>{selectedSounding.total_ballast_tons.toFixed(1)} t</b> · FSM: <b>{selectedSounding.total_fsm_moments.toFixed(1)} t·m</b>
                        </Text>
                      )}
                    </Col>
                  </Row>
                </Card>

                {/* ── ESTIBA DE EQUIPOS EN CUBIERTAS ── */}
                <Card
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#0A2647' }}>
                        2. Estiba de Equipos y Carga en Cubiertas (Principal y Superior)
                      </span>
                      <Space wrap size={10}>
                        <Segmented
                          value={stowageViewMode}
                          onChange={setStowageViewMode}
                          options={[
                            {
                              value: 'plan2d',
                              label: (
                                <span>
                                  <AppstoreOutlined /> <b>Plano Visual 2D</b>
                                </span>
                              ),
                            },
                            {
                              value: 'table',
                              label: (
                                <span>
                                  <TableOutlined /> <b>Tabla de Equipos</b>
                                </span>
                              ),
                            },
                            {
                              value: 'both',
                              label: (
                                <span>
                                  <SwapOutlined /> <b>Vista Combinada</b>
                                </span>
                              ),
                            },
                          ]}
                        />
                        <Select
                          placeholder="+ Equipo típico..."
                          style={{ width: 230 }}
                          onChange={(idx) => handleAddPreset(PRESET_EQUIPMENT[idx])}
                          value={null}
                          options={PRESET_EQUIPMENT.map((p, idx) => ({
                            value: idx,
                            label: `${p.item_name} (${p.weight_tons} t)`,
                          }))}
                        />
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenAddItem()}>
                          Nuevo Equipo
                        </Button>
                      </Space>
                    </div>
                  }
                  style={{ marginBottom: 16, borderRadius: 12 }}
                  styles={{ body: { padding: '16px 20px' } }}
                >
                  {/* Plano Cenital Visual 2D Interactivo */}
                  {(stowageViewMode === 'plan2d' || stowageViewMode === 'both') && (
                    <DeckStowagePlan2D
                      cargoItems={cargoItems}
                      calcResult={calcResult}
                      evalType={evalType}
                      onOpenAddItem={handleOpenAddItem}
                      onOpenEditItem={handleOpenEditItem}
                      onDeleteItem={handleDeleteItem}
                      onAddPreset={handleAddPreset}
                      presetEquipment={PRESET_EQUIPMENT}
                    />
                  )}

                  {/* Separador cuando ambas vistas están activas */}
                  {stowageViewMode === 'both' && (
                    <Divider style={{ margin: '24px 0 16px' }}>
                      <span style={{ color: '#0A2647', fontWeight: 600 }}>
                        📋 Detalle Tabular de Carga en Cubiertas
                      </span>
                    </Divider>
                  )}

                  {/* Tabla detallada de equipos */}
                  {(stowageViewMode === 'table' || stowageViewMode === 'both') && (
                    <div>
                      <Table
                        dataSource={cargoItems}
                        rowKey="id"
                        pagination={false}
                        size="middle"
                        columns={[
                          {
                            title: 'Equipo / Carga',
                            dataIndex: 'item_name',
                            render: (val, r) => (
                              <div>
                                <Text strong>{val}</Text>
                                {r.notes && (
                                  <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                                    {r.notes}
                                  </Text>
                                )}
                              </div>
                            ),
                          },
                          {
                            title: 'Cubierta',
                            dataIndex: 'deck',
                            render: (val) =>
                              val === 'CUBIERTA_PRINCIPAL' ? (
                                <Tag color="orange">Cubierta Principal (4.95 m)</Tag>
                              ) : (
                                <Tag color="purple">Cubierta Superior (7.04 m)</Tag>
                              ),
                          },
                          {
                            title: 'Zona / Cuaderna',
                            dataIndex: 'zone_code',
                            render: (val) => val || <Text type="secondary">—</Text>,
                          },
                          {
                            title: 'Peso (t)',
                            dataIndex: 'weight_tons',
                            render: (val) => <Text strong style={{ color: '#0A2647' }}>{Number(val).toFixed(2)} t</Text>,
                          },
                          {
                            title: 'h s/cubierta (m)',
                            dataIndex: 'zg_above_deck_m',
                            render: (val) => `${Number(val).toFixed(2)} m`,
                          },
                          {
                            title: 'ZG total (m)',
                            render: (_, r) => {
                              const base = r.deck === 'CUBIERTA_PRINCIPAL' ? 4.95 : 7.04;
                              const zg = base + Number(r.zg_above_deck_m);
                              return `${zg.toFixed(2)} m`;
                            },
                          },
                          {
                            title: 'Momento Z',
                            render: (_, r) => {
                              const base = r.deck === 'CUBIERTA_PRINCIPAL' ? 4.95 : 7.04;
                              const zg = base + Number(r.zg_above_deck_m);
                              const mom = Number(r.weight_tons) * zg;
                              return `${mom.toFixed(2)} t·m`;
                            },
                          },
                          {
                            title: 'Acciones',
                            key: 'actions',
                            render: (_, record) => (
                              <Space>
                                <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenEditItem(record)}>
                                  Editar
                                </Button>
                                <Popconfirm
                                  title="¿Quitar equipo de la cubierta?"
                                  onConfirm={() => handleDeleteItem(record.id)}
                                >
                                  <Button size="small" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                              </Space>
                            ),
                          },
                        ]}
                      />

                      {cargoItems.length === 0 && (
                        <Empty
                          description="No hay equipos estibados en cubierta. Agregue equipos con el botón superior o desde el plano."
                          style={{ padding: '20px 0' }}
                        />
                      )}
                    </div>
                  )}
                </Card>

                {/* ── MOTOR DE RECOMENDACIONES NÁUTICAS ── */}
                {calcResult && calcResult.recommendations && calcResult.recommendations.length > 0 && (
                  <Card
                    title="3. Recomendaciones Operativas y de Seguridad (Motor Naval SIAE)"
                    style={{ marginBottom: 16, borderRadius: 12 }}
                  >
                    <Space direction="vertical" style={{ width: '100%' }} size={10}>
                      {calcResult.recommendations.map((rec, idx) => (
                        <Alert
                          key={idx}
                          type={
                            rec.severity === 'CRITICAL'
                              ? 'error'
                              : rec.severity === 'WARNING'
                              ? 'warning'
                              : rec.severity === 'SUCCESS'
                              ? 'success'
                              : 'info'
                          }
                          showIcon
                          message={<Text strong>{rec.title}</Text>}
                          description={
                            <div>
                              <Paragraph style={{ margin: '4px 0', fontSize: 13 }}>
                                {rec.message}
                              </Paragraph>
                              {rec.action && (
                                <Text strong style={{ color: '#0A2647', fontSize: 12 }}>
                                  👉 Acción recomendada: {rec.action}
                                </Text>
                              )}
                            </div>
                          }
                          style={{ borderRadius: 8 }}
                        />
                      ))}
                    </Space>
                  </Card>
                )}

                {/* ── RESUMEN TABULAR Y GUARDADO ── */}
                {calcResult && (
                  <Card
                    title="4. Tabla Hidrostática Resumen (Equivalente a TABLA A oficial)"
                    style={{ marginBottom: 20, borderRadius: 12 }}
                    extra={
                      <Button
                        type="primary"
                        size="large"
                        icon={<SaveOutlined />}
                        loading={savingCondition}
                        onClick={handleSaveCondition}
                        style={{
                          background: '#0A2647',
                          borderColor: '#0A2647',
                          fontWeight: 600,
                          borderRadius: 8,
                        }}
                      >
                        💾 Guardar como Condición Oficial
                      </Button>
                    }
                  >
                    <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 4 }}>
                      <Descriptions.Item label="Desplazamiento Rosca (Δ₀)">
                        {calcResult.lightship_weight_tons.toFixed(3)} t (KG: {calcResult.lightship_kg_m.toFixed(3)} m)
                      </Descriptions.Item>
                      <Descriptions.Item label="Líquidos en Tanques (W)">
                        {calcResult.liquids_weight_tons.toFixed(3)} t
                      </Descriptions.Item>
                      <Descriptions.Item label="Carga Cubierta Principal">
                        {calcResult.cargo_weight_main_deck_tons.toFixed(3)} t
                      </Descriptions.Item>
                      <Descriptions.Item label="Carga Cubierta Superior">
                        {calcResult.cargo_weight_upper_deck_tons.toFixed(3)} t
                      </Descriptions.Item>

                      <Descriptions.Item label="DESPLAZAMIENTO TOTAL (Δ)">
                        <Text strong style={{ fontSize: 15, color: '#0A2647' }}>
                          {calcResult.displacement_tons.toFixed(3)} t
                        </Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="KG sin corregir">
                        {calcResult.kg_uncorrected_m.toFixed(3)} m
                      </Descriptions.Item>
                      <Descriptions.Item label="Corrección Superficie Libre (CSL)">
                        +{calcResult.csl_m.toFixed(3)} m (ΣFSM: {calcResult.total_fsm_moments.toFixed(1)} t·m)
                      </Descriptions.Item>
                      <Descriptions.Item label="KG CORREGIDO (KGc = KG + CSL)">
                        <Text strong style={{ fontSize: 15, color: '#D35400' }}>
                          {calcResult.kg_corrected_m.toFixed(3)} m
                        </Text>
                      </Descriptions.Item>

                      <Descriptions.Item label="KG Máximo Admisible (Gráfica 1)">
                        <Text strong style={{ fontSize: 15, color: '#27AE60' }}>
                          {calcResult.kg_max_m.toFixed(3)} m
                        </Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="Margen de Estabilidad (KGmáx - KGc)">
                        <Tag color={calcResult.stability_margin_m >= 0.05 ? 'success' : calcResult.stability_margin_m >= 0 ? 'warning' : 'error'} style={{ fontSize: 14, fontWeight: 700 }}>
                          {(calcResult.stability_margin_m * 100).toFixed(1)} cm
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Calado Medio Estimado">
                        {calcResult.mean_draft_est_m.toFixed(2)} m
                      </Descriptions.Item>
                      <Descriptions.Item label="Asiento (Trim)">
                        {calcResult.trim_m >= 0 ? `+${calcResult.trim_m.toFixed(2)} m (Apopado)` : `${calcResult.trim_m.toFixed(2)} m (Aproado)`}
                      </Descriptions.Item>
                    </Descriptions>
                  </Card>
                )}
              </div>
            ),
          },
          {
            key: 'history',
            label: (
              <span>
                <HistoryOutlined /> <b>📊 Historial de Condiciones Oficiales Guardadas</b>
              </span>
            ),
            children: (
              <Card style={{ borderRadius: 12 }}>
                <Table
                  dataSource={savedConditions}
                  rowKey="id"
                  loading={loadingHistory}
                  pagination={{ pageSize: 15 }}
                  columns={[
                    {
                      title: 'ID',
                      dataIndex: 'id',
                      width: 65,
                      render: (id) => <Text code>#{id}</Text>,
                    },
                    {
                      title: 'Condición',
                      dataIndex: 'condition_name',
                      render: (val, r) => (
                        <div>
                          <Text strong>{val}</Text>
                          <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                            Tipo: {r.evaluation_type}
                          </Text>
                        </div>
                      ),
                    },
                    {
                      title: 'Estado Criterios OMI',
                      dataIndex: 'status_level',
                      render: (val) => (
                        <Tag
                          color={
                            val === 'APROBADO' ? 'success' : val === 'ADVERTENCIA' ? 'warning' : 'error'
                          }
                          style={{ fontWeight: 600 }}
                        >
                          {val}
                        </Tag>
                      ),
                    },
                    {
                      title: 'Desplazamiento (Δ)',
                      dataIndex: 'displacement_tons',
                      render: (val) => `${val?.toFixed(1)} t`,
                    },
                    {
                      title: 'KGc (m)',
                      dataIndex: 'kg_corrected_m',
                      render: (val) => `${val?.toFixed(3)} m`,
                    },
                    {
                      title: 'KG máx (m)',
                      dataIndex: 'kg_max_m',
                      render: (val) => `${val?.toFixed(3)} m`,
                    },
                    {
                      title: 'Margen',
                      dataIndex: 'stability_margin_m',
                      render: (val) => (
                        <Text strong style={{ color: val >= 0.05 ? '#27AE60' : val >= 0 ? '#F39C12' : '#C0392B' }}>
                          {(val * 100)?.toFixed(1)} cm
                        </Text>
                      ),
                    },
                    {
                      title: 'Carga Cubiertas',
                      dataIndex: 'total_cargo_weight_tons',
                      render: (val) => `${val?.toFixed(1)} t`,
                    },
                    {
                      title: 'Acciones',
                      key: 'actions',
                      render: (_, record) => (
                        <Space>
                          <Tooltip title="Ver detalle">
                            <Button
                              type="text"
                              icon={<EyeOutlined />}
                              onClick={() => {
                                setViewingCondition(record);
                                setDetailModalOpen(true);
                              }}
                            />
                          </Tooltip>
                          <Popconfirm
                            title="¿Eliminar esta condición de estabilidad?"
                            onConfirm={() => handleDeleteCondition(record.id)}
                            okText="Sí, eliminar"
                            cancelText="Cancelar"
                          >
                            <Button type="text" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* ── MODAL AGREGAR / EDITAR EQUIPO DE CUBIERTA ── */}
      <Modal
        title={editingItem ? 'Editar Equipo de Cubierta' : 'Agregar Equipo / Carga a Cubierta'}
        open={itemModalOpen}
        onCancel={() => setItemModalOpen(false)}
        onOk={handleSaveItemModal}
        okText="Aceptar"
        cancelText="Cancelar"
      >
        <Form form={itemForm} layout="vertical">
          <Form.Item name="item_name" label="Nombre del Equipo o Carga" rules={[{ required: true }]}>
            <Input placeholder="Ej. Winche auxiliar, Roseta CTD, Panga" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="deck" label="Cubierta de Estiba" rules={[{ required: true }]}>
                <Select>
                  <Option value="CUBIERTA_PRINCIPAL">Cubierta Principal (Base 4.95 m)</Option>
                  <Option value="CUBIERTA_SUPERIOR">Cubierta Superior (Base 7.04 m)</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                noStyle
                shouldUpdate={(prevVals, currVals) => prevVals.deck !== currVals.deck}
              >
                {({ getFieldValue }) => {
                  const isUpper = getFieldValue('deck') === 'CUBIERTA_SUPERIOR';
                  const zoneOptions = isUpper
                    ? [
                        { value: 'Caseta de Control & J-Frame (Winche CTD)' },
                        { value: 'Área A1 — Banda Superior (12.87 m²)' },
                        { value: 'Área A1 — Crujía Central (5.98 m²)' },
                        { value: 'Área A1 — Pasillo Banda (4.69 m²)' },
                      ]
                    : [
                        { value: 'U-FRAME (Espejo de Popa)' },
                        { value: 'Área A1 — Banda Superior (6.08 m²)' },
                        { value: 'Área A2 — Popa Banda Superior (6.70 m²)' },
                        { value: 'Área A3 — Popa Banda Inferior (6.70 m²)' },
                        { value: 'Área A4 — Banda Inferior (6.08 m²)' },
                        { value: 'Área A4 Suplementaria (2.58 m²)' },
                        { value: 'Winche G (Crujía Cda. 48-51)' },
                      ];
                  return (
                    <Form.Item name="zone_code" label="Zona / Cuaderna">
                      <AutoComplete
                        options={zoneOptions}
                        placeholder="Seleccione o escriba zona..."
                        filterOption={(inputValue, option) =>
                          option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                        }
                      />
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="weight_tons" label="Peso (toneladas)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0.01} step={0.1} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="zg_above_deck_m"
                label="Altura C.G. sobre cubierta (m)"
                rules={[{ required: true }]}
                tooltip="Distancia vertical desde el piso de la cubierta hasta el centro de gravedad del equipo"
              >
                <InputNumber style={{ width: '100%' }} min={0} step={0.1} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Notas de Trinca y Estiba">
            <Input placeholder="Ej. Trincado con cadenas y tensores al cáncamo C-12" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── MODAL DETALLE DE CONDICIÓN HISTÓRICA ── */}
      <Modal
        title={`Detalle de Condición #${viewingCondition?.id} — ${viewingCondition?.condition_name}`}
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setDetailModalOpen(false)}>
            Cerrar
          </Button>,
        ]}
        width={850}
      >
        {viewingCondition && (
          <div>
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 4 }} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Desplazamiento Total">{viewingCondition.displacement_tons?.toFixed(2)} t</Descriptions.Item>
              <Descriptions.Item label="KG Corregido">{viewingCondition.kg_corrected_m?.toFixed(3)} m</Descriptions.Item>
              <Descriptions.Item label="KG Máximo Admisible">{viewingCondition.kg_max_m?.toFixed(3)} m</Descriptions.Item>
              <Descriptions.Item label="Margen">{(viewingCondition.stability_margin_m * 100)?.toFixed(1)} cm</Descriptions.Item>
              <Descriptions.Item label="Estado">
                <Tag color={viewingCondition.status_level === 'APROBADO' ? 'success' : 'error'}>
                  {viewingCondition.status_level}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Líquidos en Tanques">{viewingCondition.liquids_weight_tons?.toFixed(2)} t</Descriptions.Item>
              <Descriptions.Item label="FSM Total">{viewingCondition.total_fsm_moments?.toFixed(2)} t·m</Descriptions.Item>
              <Descriptions.Item label="Peso en Cubiertas">{viewingCondition.total_cargo_weight_tons?.toFixed(2)} t</Descriptions.Item>
            </Descriptions>

            <Title level={5} style={{ color: '#0A2647' }}>Equipos Estibados en Cubiertas:</Title>
            <Table
              dataSource={viewingCondition.cargo_items || []}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                { title: 'Equipo', dataIndex: 'item_name' },
                { title: 'Cubierta', dataIndex: 'deck' },
                { title: 'Zona', dataIndex: 'zone_code' },
                { title: 'Peso', dataIndex: 'weight_tons', render: (v) => `${v?.toFixed(2)} t` },
                { title: 'ZG Total', dataIndex: 'zg_total_m', render: (v) => `${v?.toFixed(2)} m` },
                { title: 'Momento Z', dataIndex: 'mom_z', render: (v) => `${v?.toFixed(2)} t·m` },
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
