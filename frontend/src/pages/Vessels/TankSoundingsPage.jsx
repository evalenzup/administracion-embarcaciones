/**
 * SIAE — Gestión de Sondeos de Tanques e Inventario de Líquidos.
 * Módulo para captura de sondeos diarios y pre-zarpe por parte del personal de máquinas.
 * Calcula en tiempo real volúmenes, pesos, momentos Z y efectos de superficie libre (FSM).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card, Table, Tag, Button, Space, Typography, Row, Col, Statistic,
  Modal, Form, Input, InputNumber, Select, DatePicker, Slider,
  Tooltip, Popconfirm, message, Tabs, Alert, Divider, Badge,
  Progress, Drawer, Descriptions, Collapse
} from 'antd';
import {
  DashboardOutlined, PlusOutlined, HistoryOutlined, CheckCircleOutlined,
  WarningOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined,
  ThunderboltOutlined, ExperimentOutlined, CompassOutlined,
  SwapOutlined, SaveOutlined, ArrowUpOutlined, ArrowDownOutlined,
  InfoCircleOutlined, SettingOutlined, CheckOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

// ── Tipos de Sondeo ──────────────────────────────────────────
const SOUNDING_TYPES = [
  { value: 'PRE_ZARPE', label: '⚓ Pre-Zarpe (Oficial para Crucero)', color: 'blue' },
  { value: 'RUTINA_DIARIA', label: '📝 Rutina Diaria (Máquinas)', color: 'green' },
  { value: 'OPERACION_CRUCERO', label: '🌊 Operación en Crucero', color: 'cyan' },
  { value: 'TRANSFERENCIA_INTERNA', label: '🔄 Transferencia / Lastrado', color: 'purple' },
  { value: 'POST_ARRIBO', label: '🏁 Post-Arribo (Llegada)', color: 'orange' },
  { value: 'OTRO', label: '🔹 Otro', color: 'default' },
];

// Colores y configuración por tipo de fluido
const FLUID_CONFIG = {
  COMBUSTIBLE: {
    label: 'Combustible Diésel',
    color: '#D35400',
    bgColor: '#FEF5E7',
    icon: '⛽',
    defaultDensity: 0.85,
    densityDesc: '0.85 t/m³',
  },
  AGUA_DULCE: {
    label: 'Agua Dulce Potable',
    color: '#2980B9',
    bgColor: '#EBF5FB',
    icon: '💧',
    defaultDensity: 1.00,
    densityDesc: '1.00 t/m³',
  },
  AGUA_LASTRE: {
    label: 'Agua de Lastre',
    color: '#16A085',
    bgColor: '#E8F8F5',
    icon: '⚖️',
    defaultDensity: 1.03,
    densityDesc: '1.03 t/m³ (Agua marina)',
  },
  AGUAS_NEGRAS: {
    label: 'Aguas Negras / Grises',
    color: '#6C3483',
    bgColor: '#F4ECF7',
    icon: '🚽',
    defaultDensity: 1.02,
    densityDesc: '1.02 t/m³',
  },
  ACEITE: {
    label: 'Aceite Lubricante',
    color: '#7D3C98',
    bgColor: '#F4ECF7',
    icon: '🛢️',
    defaultDensity: 0.90,
    densityDesc: '0.90 t/m³',
  },
  OTRO: {
    label: 'Otro Fluido',
    color: '#7F8C8D',
    bgColor: '#F2F4F4',
    icon: '📦',
    defaultDensity: 1.00,
    densityDesc: '1.00 t/m³',
  },
};

const FLUID_OPTIONS = [
  { value: 'COMBUSTIBLE', label: '⛽ Combustible Diésel (0.85 t/m³)' },
  { value: 'AGUA_DULCE', label: '💧 Agua Dulce Potable (1.00 t/m³)' },
  { value: 'AGUA_LASTRE', label: '⚖️ Agua de Lastre (1.03 t/m³)' },
  { value: 'AGUAS_NEGRAS', label: '🚽 Aguas Negras / Grises (1.02 t/m³)' },
  { value: 'ACEITE', label: '🛢️ Aceite Lubricante (0.90 t/m³)' },
  { value: 'OTRO', label: '📦 Otro Fluido (1.00 t/m³)' },
];

// Función normalizadora para garantizar mapeo perfecto sin importar formato
const getFluidKey = (fluidType) => {
  if (!fluidType) return 'OTRO';
  const upper = String(fluidType).trim().toUpperCase();
  if (upper === 'LASTRE' || upper === 'AGUA_LASTRE') return 'AGUA_LASTRE';
  if (upper === 'COMBUSTIBLE') return 'COMBUSTIBLE';
  if (upper === 'AGUA_DULCE') return 'AGUA_DULCE';
  if (upper === 'AGUAS_NEGRAS') return 'AGUAS_NEGRAS';
  if (upper === 'ACEITE') return 'ACEITE';
  if (FLUID_CONFIG[upper]) return upper;
  return 'OTRO';
};

const getFluidConfig = (fluidType) => {
  const key = getFluidKey(fluidType);
  return FLUID_CONFIG[key] || FLUID_CONFIG.OTRO;
};

export default function TankSoundingsPage() {
  const { user } = useAuth();

  // Estados principales
  const [vessels, setVessels] = useState([]);
  const [selectedVesselId, setSelectedVesselId] = useState(null);
  const [selectedVessel, setSelectedVessel] = useState(null);
  const [tanks, setTanks] = useState([]);
  const [loadingTanks, setLoadingTanks] = useState(false);
  const [soundings, setSoundings] = useState([]);
  const [loadingSoundings, setLoadingSoundings] = useState(false);
  const [latestSounding, setLatestSounding] = useState(null);

  // Pestaña activa
  const [activeTab, setActiveTab] = useState('capture');

  // Estado para la captura en vivo del nuevo sondeo
  const [captureHeader, setCaptureHeader] = useState({
    sounding_type: 'RUTINA_DIARIA',
    sounding_datetime: dayjs(),
    draft_fwd_m: null,
    draft_aft_m: null,
    is_official: false,
    notes: '',
  });

  // tankInputs: { [tank_id]: { fill_percentage: 0, sounding_cm: null, density_applied: null } }
  const [tankInputs, setTankInputs] = useState({});
  const [savingSounding, setSavingSounding] = useState(false);

  // Modal de detalle de sondeo histórico
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [viewingSounding, setViewingSounding] = useState(null);

  // Modal para editar parámetros de tanque del catálogo
  const [editTankModalOpen, setEditTankModalOpen] = useState(false);
  const [editingTank, setEditingTank] = useState(null);
  const [tankForm] = Form.useForm();
  const [savingTank, setSavingTank] = useState(false);

  // ── 1. Cargar Embarcaciones ─────────────────────────────────
  const fetchVessels = useCallback(async () => {
    try {
      const res = await apiClient.get('/vessels', { params: { limit: 50 } });
      const list = res.data.items || [];
      setVessels(list);

      // Preseleccionar B/O Alpha Helix si existe, o la primera
      if (list.length > 0) {
        const alpha = list.find((v) => v.name.toLowerCase().includes('alpha helix')) || list[0];
        setSelectedVesselId((prev) => prev || alpha.id);
        setSelectedVessel((prev) => prev || alpha);
      }
    } catch {
      message.error('Error al cargar la lista de embarcaciones');
    }
  }, []);

  useEffect(() => {
    fetchVessels();
  }, [fetchVessels]);

  // Actualizar objeto selectedVessel cuando cambia el ID
  useEffect(() => {
    if (selectedVesselId && vessels.length > 0) {
      const found = vessels.find((v) => v.id === selectedVesselId);
      if (found) setSelectedVessel(found);
    }
  }, [selectedVesselId, vessels]);

  // ── 2. Cargar Tanques del buque ─────────────────────────────
  const fetchTanks = useCallback(async () => {
    if (!selectedVesselId) return;
    setLoadingTanks(true);
    try {
      const res = await apiClient.get(`/vessels/${selectedVesselId}/tanks`);
      const tankList = res.data || [];
      setTanks(tankList);

      // Inicializar tankInputs si están vacíos
      setTankInputs((prev) => {
        const next = { ...prev };
        tankList.forEach((t) => {
          if (next[t.id] === undefined) {
            next[t.id] = {
              fill_percentage: 0,
              sounding_cm: null,
              density_applied: t.design_density,
            };
          }
        });
        return next;
      });
    } catch {
      message.error('Error al cargar los tanques de la embarcación');
    } finally {
      setLoadingTanks(false);
    }
  }, [selectedVesselId]);

  // ── 3. Cargar Historial y Último Sondeo ──────────────────────
  const fetchSoundings = useCallback(async () => {
    if (!selectedVesselId) return;
    setLoadingSoundings(true);
    try {
      const [histRes, latestRes] = await Promise.all([
        apiClient.get(`/vessels/${selectedVesselId}/soundings`, { params: { limit: 40 } }),
        apiClient.get(`/vessels/${selectedVesselId}/soundings/latest`),
      ]);
      setSoundings(histRes.data || []);
      setLatestSounding(latestRes.data || null);

      // Si hay un último sondeo oficial y los inputs están en 0, precargar los valores
      if (latestRes.data && latestRes.data.items && latestRes.data.items.length > 0) {
        setTankInputs((prev) => {
          const hasUserInput = Object.values(prev).some((v) => v.fill_percentage > 0);
          if (hasUserInput) return prev; // No sobreescribir si el usuario ya movió sliders

          const next = { ...prev };
          latestRes.data.items.forEach((item) => {
            next[item.tank_id] = {
              fill_percentage: item.fill_percentage,
              sounding_cm: item.sounding_cm,
              density_applied: item.density_applied,
            };
          });
          return next;
        });

        // Prellenar calados del último si no se han puesto
        setCaptureHeader((prev) => ({
          ...prev,
          draft_fwd_m: prev.draft_fwd_m ?? latestRes.data.draft_fwd_m,
          draft_aft_m: prev.draft_aft_m ?? latestRes.data.draft_aft_m,
        }));
      }
    } catch {
      // Ignorar 404 si aún no hay sondeos
    } finally {
      setLoadingSoundings(false);
    }
  }, [selectedVesselId]);

  useEffect(() => {
    if (selectedVesselId) {
      fetchTanks();
      fetchSoundings();
    }
  }, [selectedVesselId, fetchTanks, fetchSoundings]);

  // ── Cálculos en Vivo en el Frontend ─────────────────────────
  const liveCalculations = useMemo(() => {
    let totFuelM3 = 0, totFuelTons = 0;
    let totWaterM3 = 0, totWaterTons = 0;
    let totBallastM3 = 0, totBallastTons = 0;
    let totLiquidsTons = 0;
    let totMomZ = 0;
    let totFSM = 0;
    const slackTanks = [];

    const computedItems = tanks.map((tank) => {
      const input = tankInputs[tank.id] || { fill_percentage: 0, density_applied: tank.design_density };
      const pct = Math.max(0, Math.min(100, Number(input.fill_percentage) || 0));
      const density = input.density_applied || tank.design_density;

      const volumeM3 = (tank.capacity_m3 * pct) / 100;
      const weightTons = volumeM3 * density;
      const momZ = weightTons * tank.zg_m;

      // Criterio Slack: 0.5% < pct < 98%
      const isSlack = pct > 0.5 && pct < 98.0;

      // FSM: i * rho * (weight / max_weight)
      let fsm = 0;
      if (isSlack && tank.fsm_inertia_i > 0 && tank.max_weight_tons > 0) {
        fsm = density * tank.fsm_inertia_i * (weightTons / tank.max_weight_tons);
        slackTanks.push({
          tank,
          pct,
          weightTons,
          fsm,
        });
      }

      // Sumatorias por tipo de fluido
      const fluidKey = getFluidKey(tank.fluid_type);
      if (fluidKey === 'COMBUSTIBLE') {
        totFuelM3 += volumeM3;
        totFuelTons += weightTons;
      } else if (fluidKey === 'AGUA_DULCE') {
        totWaterM3 += volumeM3;
        totWaterTons += weightTons;
      } else if (fluidKey === 'AGUA_LASTRE') {
        totBallastM3 += volumeM3;
        totBallastTons += weightTons;
      }

      totLiquidsTons += weightTons;
      totMomZ += momZ;
      totFSM += fsm;

      return {
        tank,
        pct,
        density,
        volumeM3,
        weightTons,
        momZ,
        isSlack,
        fsm,
      };
    });

    // Trim en vivo
    let trimM = null;
    if (captureHeader.draft_fwd_m !== null && captureHeader.draft_aft_m !== null &&
        captureHeader.draft_fwd_m !== undefined && captureHeader.draft_aft_m !== undefined) {
      trimM = Number(captureHeader.draft_aft_m) - Number(captureHeader.draft_fwd_m);
    }

    return {
      computedItems,
      totFuelM3,
      totFuelTons,
      totWaterM3,
      totWaterTons,
      totBallastM3,
      totBallastTons,
      totLiquidsTons,
      totMomZ,
      totFSM,
      slackTanks,
      trimM,
    };
  }, [tanks, tankInputs, captureHeader.draft_fwd_m, captureHeader.draft_aft_m]);

  // Actualizar porcentaje de un tanque
  const handleTankPctChange = (tankId, value) => {
    setTankInputs((prev) => ({
      ...prev,
      [tankId]: {
        ...(prev[tankId] || {}),
        fill_percentage: value,
      },
    }));
  };

  // Presets operacionales rápidos
  const applyPreset = (type) => {
    const next = { ...tankInputs };
    if (type === 'salida_100') {
      // Condición de Salida: Diésel al 95%, Agua Dulce al 100%, Lastres vacíos o mínimos
      tanks.forEach((t) => {
        const k = getFluidKey(t.fluid_type);
        if (k === 'COMBUSTIBLE') next[t.id] = { ...next[t.id], fill_percentage: 95 };
        else if (k === 'AGUA_DULCE') next[t.id] = { ...next[t.id], fill_percentage: 100 };
        else if (k === 'AGUA_LASTRE') next[t.id] = { ...next[t.id], fill_percentage: 0 };
      });
      message.info('Aplicada condición preestablecida: Salida de Puerto (100% consumibles)');
    } else if (type === 'llegada_10') {
      // Condición de Llegada: Diésel al 10%, Agua Dulce al 10%, Lastre compensatorio en doble fondo
      tanks.forEach((t) => {
        const k = getFluidKey(t.fluid_type);
        if (k === 'COMBUSTIBLE') next[t.id] = { ...next[t.id], fill_percentage: 10 };
        else if (k === 'AGUA_DULCE') next[t.id] = { ...next[t.id], fill_percentage: 10 };
        else if (k === 'AGUA_LASTRE') {
          // Lastres DB / TK / DF al 85% para compensar pérdida de peso bajo
          if (t.tank_code.includes('DB') || t.tank_code.includes('TK8') || t.tank_code.includes('TK9') || t.tank_code.includes('DF')) {
            next[t.id] = { ...next[t.id], fill_percentage: 85 };
          } else {
            next[t.id] = { ...next[t.id], fill_percentage: 0 };
          }
        }
      });
      message.info('Aplicada condición preestablecida: Llegada de Puerto (10% consumibles + lastre)');
    } else if (type === 'vaciar_lastres') {
      tanks.forEach((t) => {
        const k = getFluidKey(t.fluid_type);
        if (k === 'AGUA_LASTRE') next[t.id] = { ...next[t.id], fill_percentage: 0 };
      });
      message.info('Todos los tanques de lastre vaciados (0%)');
    }
    setTankInputs(next);
  };

  // Guardar ronda de sondeo
  const handleSaveSounding = async (forceOfficial = false) => {
    if (!selectedVesselId) {
      message.warning('Seleccione una embarcación');
      return;
    }

    setSavingSounding(true);
    try {
      const itemsPayload = tanks.map((t) => {
        const inp = tankInputs[t.id] || { fill_percentage: 0 };
        return {
          tank_id: t.id,
          fill_percentage: Number(inp.fill_percentage) || 0,
          sounding_cm: inp.sounding_cm ? Number(inp.sounding_cm) : null,
          density_applied: inp.density_applied ? Number(inp.density_applied) : t.design_density,
        };
      });

      const payload = {
        vessel_id: selectedVesselId,
        sounding_type: captureHeader.sounding_type,
        sounding_datetime: captureHeader.sounding_datetime?.toISOString() || new Date().toISOString(),
        draft_fwd_m: captureHeader.draft_fwd_m !== null && captureHeader.draft_fwd_m !== '' ? Number(captureHeader.draft_fwd_m) : null,
        draft_aft_m: captureHeader.draft_aft_m !== null && captureHeader.draft_aft_m !== '' ? Number(captureHeader.draft_aft_m) : null,
        is_official: forceOfficial || captureHeader.is_official,
        notes: captureHeader.notes,
        items: itemsPayload,
      };

      const res = await apiClient.post(`/vessels/${selectedVesselId}/soundings`, payload);
      message.success(`Ronda de sondeos registrada correctamente (${res.data.total_liquids_tons.toFixed(1)} t a bordo)`);

      // Refrescar lista y último
      fetchSoundings();
      setActiveTab('history');
    } catch (err) {
      const errDetail = err.response?.data?.detail || 'Error al guardar el sondeo de tanques';
      message.error(errDetail);
    } finally {
      setSavingSounding(false);
    }
  };

  // Establecer un sondeo histórico como oficial
  const handleSetOfficial = async (soundingId) => {
    try {
      await apiClient.post(`/soundings/${soundingId}/set-official`);
      message.success('Sondeo establecido como OFICIAL PRE-ZARPE');
      fetchSoundings();
    } catch {
      message.error('Error al actualizar el estado oficial del sondeo');
    }
  };

  // Eliminar un sondeo histórico
  const handleDeleteSounding = async (soundingId) => {
    try {
      await apiClient.delete(`/soundings/${soundingId}`);
      message.success('Sondeo eliminado');
      fetchSoundings();
    } catch {
      message.error('Error al eliminar el sondeo');
    }
  };

  // Editar parámetros de tanque del catálogo
  const handleOpenEditTank = (tank) => {
    setEditingTank(tank);
    tankForm.setFieldsValue({
      ...tank,
      fluid_type: getFluidKey(tank.fluid_type),
    });
    setEditTankModalOpen(true);
  };

  const handleSaveTank = async () => {
    try {
      const values = await tankForm.validateFields();
      if (values.capacity_m3 && values.design_density) {
        values.max_weight_tons = Number((values.capacity_m3 * values.design_density).toFixed(3));
      }
      setSavingTank(true);
      await apiClient.put(`/vessels/${selectedVesselId}/tanks/${editingTank.id}`, values);
      message.success(`Tanque ${editingTank.tank_code} actualizado correctamente`);
      setEditTankModalOpen(false);
      fetchTanks();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Error al guardar cambios del tanque');
    } finally {
      setSavingTank(false);
    }
  };

  // Agrupación de tanques por fluido
  const tanksByFluid = useMemo(() => {
    const groups = { COMBUSTIBLE: [], AGUA_DULCE: [], AGUA_LASTRE: [], AGUAS_NEGRAS: [], ACEITE: [], OTRO: [] };
    tanks.forEach((t) => {
      const key = getFluidKey(t.fluid_type);
      if (groups[key]) groups[key].push(t);
      else groups.OTRO.push(t);
    });
    return groups;
  }, [tanks]);

  return (
    <div className="animate-fade-in" style={{ padding: '0 4px' }}>
      {/* ── HEADER PRINCIPAL ── */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }} gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Space direction="vertical" size={2}>
            <Title level={3} style={{ color: '#0A2647', margin: 0 }}>
              ⛽ Sondeo de Tanques e Inventario de Líquidos
            </Title>
            <Text type="secondary">
              Control de niveles, cálculo de peso, momentos verticales y momento de superficie libre (FSM)
            </Text>
          </Space>
        </Col>
        <Col xs={24} md={12} style={{ textAlign: 'right' }}>
          <Space wrap>
            <Text strong style={{ color: '#0A2647' }}>Embarcación:</Text>
            <Select
              style={{ width: 260 }}
              value={selectedVesselId}
              onChange={(val) => setSelectedVesselId(val)}
              options={vessels.map((v) => ({
                value: v.id,
                label: `🚢 ${v.name} (${v.vessel_type || 'Buque'})`,
              }))}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                fetchTanks();
                fetchSoundings();
              }}
              title="Recargar datos"
            />
          </Space>
        </Col>
      </Row>

      {/* ── BANNER DE ESTADO OFICIAL VIGENTE ── */}
      {latestSounding ? (
        <Card
          style={{
            marginBottom: 20,
            borderRadius: 12,
            border: latestSounding.is_official ? '1.5px solid #27AE60' : '1px solid #d9d9d9',
            background: latestSounding.is_official
              ? 'linear-gradient(135deg, #F4FBF7 0%, #FFFFFF 100%)'
              : '#FAFAFA',
          }}
          styles={{ body: { padding: '16px 20px' } }}
        >
          <Row justify="space-between" align="middle" gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Space direction="vertical" size={4}>
                <Space wrap align="center">
                  <Tag color={latestSounding.is_official ? 'success' : 'blue'} style={{ fontSize: 13, padding: '3px 10px', fontWeight: 600 }}>
                    {latestSounding.is_official ? '🟢 SONDEO OFICIAL PRE-ZARPE' : '📝 ÚLTIMO SONDEO REGISTRADO'}
                  </Tag>
                  <Text strong style={{ fontSize: 14 }}>
                    {dayjs(latestSounding.sounding_datetime).format('DD/MM/YYYY HH:mm')} hrs
                  </Text>
                  {latestSounding.performed_by && (
                    <Text type="secondary">
                      · Registrado por: <b>{latestSounding.performed_by.full_name}</b>
                    </Text>
                  )}
                </Space>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Tipo: <b>{SOUNDING_TYPES.find((t) => t.value === latestSounding.sounding_type)?.label || latestSounding.sounding_type}</b>
                  {latestSounding.draft_fwd_m !== null && latestSounding.draft_aft_m !== null && (
                    <> · Calados: Proa <b>{latestSounding.draft_fwd_m?.toFixed(2)} m</b>, Popa <b>{latestSounding.draft_aft_m?.toFixed(2)} m</b> (Trim: <b>{latestSounding.trim_m > 0 ? `+${latestSounding.trim_m?.toFixed(2)} m (Apopado)` : latestSounding.trim_m < 0 ? `${latestSounding.trim_m?.toFixed(2)} m (Aproado)` : '0.00 m (Aguas iguales)'}</b>)</>
                  )}
                </Text>
              </Space>
            </Col>
            <Col xs={24} lg={10} style={{ textAlign: 'right' }}>
              <Space size={16} wrap>
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>COMBUSTIBLE</Text>
                  <Text strong style={{ fontSize: 18, color: '#D35400' }}>
                    {latestSounding.total_fuel_tons.toFixed(1)} <span style={{ fontSize: 12 }}>t</span>
                  </Text>
                </div>
                <Divider type="vertical" style={{ height: 35 }} />
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>AGUA DULCE</Text>
                  <Text strong style={{ fontSize: 18, color: '#2980B9' }}>
                    {latestSounding.total_fresh_water_tons.toFixed(1)} <span style={{ fontSize: 12 }}>t</span>
                  </Text>
                </div>
                <Divider type="vertical" style={{ height: 35 }} />
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>LASTRE</Text>
                  <Text strong style={{ fontSize: 18, color: '#16A085' }}>
                    {latestSounding.total_ballast_tons.toFixed(1)} <span style={{ fontSize: 12 }}>t</span>
                  </Text>
                </div>
                <Divider type="vertical" style={{ height: 35 }} />
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>CORR. FSM</Text>
                  <Text strong style={{ fontSize: 18, color: latestSounding.total_fsm_moments > 15 ? '#C0392B' : '#7F8C8D' }}>
                    {latestSounding.total_fsm_moments.toFixed(1)} <span style={{ fontSize: 12 }}>t·m</span>
                  </Text>
                </div>
              </Space>
            </Col>
          </Row>
        </Card>
      ) : (
        <Alert
          type="info"
          showIcon
          message="No hay sondeos previos registrados para este buque"
          description="Capture la primera ronda de sondeo en la pestaña siguiente para inicializar el inventario de fluidos."
          style={{ marginBottom: 20, borderRadius: 10 }}
        />
      )}

      {/* ── PESTAÑAS PRINCIPALES ── */}
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k)}
        type="card"
        size="large"
        items={[
          {
            key: 'capture',
            label: (
              <span>
                <DashboardOutlined /> <b>📝 Captura de Sondeo (Máquinas)</b>
              </span>
            ),
            children: (
              <div>
                {/* Parámetros de la Ronda */}
                <Card
                  title="1. Datos Generales de la Ronda y Calados Observados"
                  style={{ marginBottom: 16, borderRadius: 12 }}
                  extra={
                    <Space>
                      <Button size="small" onClick={() => applyPreset('salida_100')}>
                        ⚓ Preset Salida 100%
                      </Button>
                      <Button size="small" onClick={() => applyPreset('llegada_10')}>
                        🏁 Preset Llegada 10%
                      </Button>
                      <Button size="small" danger onClick={() => applyPreset('vaciar_lastres')}>
                        ⚖️ Vaciar Lastres
                      </Button>
                    </Space>
                  }
                >
                  <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} md={6}>
                      <Text strong style={{ display: 'block', marginBottom: 4 }}>Fecha y Hora del Sondeo:</Text>
                      <DatePicker
                        showTime
                        style={{ width: '100%' }}
                        format="YYYY-MM-DD HH:mm"
                        value={captureHeader.sounding_datetime}
                        onChange={(d) => setCaptureHeader({ ...captureHeader, sounding_datetime: d })}
                      />
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                      <Text strong style={{ display: 'block', marginBottom: 4 }}>Tipo de Operación:</Text>
                      <Select
                        style={{ width: '100%' }}
                        value={captureHeader.sounding_type}
                        onChange={(v) => setCaptureHeader({ ...captureHeader, sounding_type: v })}
                        options={SOUNDING_TYPES}
                      />
                    </Col>
                    <Col xs={12} sm={6} md={3}>
                      <Text strong style={{ display: 'block', marginBottom: 4 }}>Calado Proa (m):</Text>
                      <InputNumber
                        style={{ width: '100%' }}
                        min={0}
                        max={10}
                        step={0.05}
                        placeholder="ej. 3.40"
                        value={captureHeader.draft_fwd_m}
                        onChange={(v) => setCaptureHeader({ ...captureHeader, draft_fwd_m: v })}
                      />
                    </Col>
                    <Col xs={12} sm={6} md={3}>
                      <Text strong style={{ display: 'block', marginBottom: 4 }}>Calado Popa (m):</Text>
                      <InputNumber
                        style={{ width: '100%' }}
                        min={0}
                        max={10}
                        step={0.05}
                        placeholder="ej. 3.75"
                        value={captureHeader.draft_aft_m}
                        onChange={(v) => setCaptureHeader({ ...captureHeader, draft_aft_m: v })}
                      />
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                      <Text strong style={{ display: 'block', marginBottom: 4 }}>Asiento (Trim Calculado):</Text>
                      <div style={{ padding: '4px 0' }}>
                        {liveCalculations.trimM !== null ? (
                          <Tag
                            color={liveCalculations.trimM > 0 ? 'blue' : liveCalculations.trimM < 0 ? 'orange' : 'green'}
                            style={{ fontSize: 14, padding: '4px 10px' }}
                          >
                            {liveCalculations.trimM > 0
                              ? `📐 +${liveCalculations.trimM.toFixed(2)} m (Apopante)`
                              : liveCalculations.trimM < 0
                              ? `📐 ${liveCalculations.trimM.toFixed(2)} m (Aproante)`
                              : '⚖️ 0.00 m (Aguas Iguales)'}
                          </Tag>
                        ) : (
                          <Text type="secondary">Ingrese calados proa y popa</Text>
                        )}
                      </div>
                    </Col>
                    <Col xs={24}>
                      <Text strong style={{ display: 'block', marginBottom: 4 }}>Observaciones de Máquinas:</Text>
                      <Input
                        placeholder="Ej. Sondeo previo a crucero oceanográfico. Válvulas de intercomunicación cerradas."
                        value={captureHeader.notes}
                        onChange={(e) => setCaptureHeader({ ...captureHeader, notes: e.target.value })}
                      />
                    </Col>
                  </Row>
                </Card>

                {/* Alerta de Tanques Slack si existen */}
                {liveCalculations.slackTanks.length > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    style={{ marginBottom: 16, borderRadius: 10 }}
                    message={
                      <span>
                        <b>Atención Hidrostática:</b> {liveCalculations.slackTanks.length} tanques en condición <b>Slack</b> (llenado entre 0.5% y 98%).
                        Momento total de superficie libre a considerar en estabilidad: <b>{liveCalculations.totFSM.toFixed(2)} t·m</b>.
                      </span>
                    }
                    description={
                      <div style={{ marginTop: 4 }}>
                        <Space wrap size={[6, 6]}>
                          {liveCalculations.slackTanks.map((s) => (
                            <Tag key={s.tank.id} color="warning">
                              {s.tank.tank_code} ({s.pct.toFixed(0)}% · FSM: {s.fsm.toFixed(2)} t·m)
                            </Tag>
                          ))}
                        </Space>
                      </div>
                    }
                  />
                )}

                {/* Acordeones de Tanques por Fluido */}
                <Card title="2. Ingreso de Porcentajes de Llenado / Sondeos por Tanque" style={{ marginBottom: 16, borderRadius: 12 }}>
                  <Collapse
                    defaultActiveKey={['COMBUSTIBLE', 'AGUA_DULCE', 'AGUA_LASTRE']}
                    style={{ background: '#ffffff' }}
                    items={[
                      // ⛽ COMBUSTIBLE (7 Tanques)
                      {
                        key: 'COMBUSTIBLE',
                        label: (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <Space>
                              <span style={{ fontSize: 18 }}>⛽</span>
                              <Text strong style={{ fontSize: 15, color: '#D35400' }}>
                                Tanques de Combustible Diésel ({tanksByFluid.COMBUSTIBLE?.length || 0} tanques)
                              </Text>
                            </Space>
                            <Space size={16} style={{ marginRight: 16 }}>
                              <Text type="secondary">
                                Volumen: <b>{liveCalculations.totFuelM3.toFixed(1)} m³</b>
                              </Text>
                              <Tag color="orange" style={{ fontSize: 13, fontWeight: 600 }}>
                                Peso: {liveCalculations.totFuelTons.toFixed(1)} t
                              </Tag>
                            </Space>
                          </div>
                        ),
                        children: renderTankList(tanksByFluid.COMBUSTIBLE, tankInputs, handleTankPctChange, FLUID_CONFIG.COMBUSTIBLE),
                      },
                      // 💧 AGUA DULCE (2 Tanques)
                      {
                        key: 'AGUA_DULCE',
                        label: (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <Space>
                              <span style={{ fontSize: 18 }}>💧</span>
                              <Text strong style={{ fontSize: 15, color: '#2980B9' }}>
                                Tanques de Agua Dulce Potable ({tanksByFluid.AGUA_DULCE?.length || 0} tanques)
                              </Text>
                            </Space>
                            <Space size={16} style={{ marginRight: 16 }}>
                              <Text type="secondary">
                                Volumen: <b>{liveCalculations.totWaterM3.toFixed(1)} m³</b>
                              </Text>
                              <Tag color="blue" style={{ fontSize: 13, fontWeight: 600 }}>
                                Peso: {liveCalculations.totWaterTons.toFixed(1)} t
                              </Tag>
                            </Space>
                          </div>
                        ),
                        children: renderTankList(tanksByFluid.AGUA_DULCE, tankInputs, handleTankPctChange, FLUID_CONFIG.AGUA_DULCE),
                      },
                      // ⚖️ AGUA DE LASTRE (13 Tanques)
                      {
                        key: 'AGUA_LASTRE',
                        label: (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <Space>
                              <span style={{ fontSize: 18 }}>⚖️</span>
                              <Text strong style={{ fontSize: 15, color: '#16A085' }}>
                                Tanques de Agua de Lastre ({tanksByFluid.AGUA_LASTRE?.length || 0} tanques)
                              </Text>
                            </Space>
                            <Space size={16} style={{ marginRight: 16 }}>
                              <Text type="secondary">
                                Volumen: <b>{liveCalculations.totBallastM3.toFixed(1)} m³</b>
                              </Text>
                              <Tag color="cyan" style={{ fontSize: 13, fontWeight: 600 }}>
                                Peso: {liveCalculations.totBallastTons.toFixed(1)} t
                              </Tag>
                            </Space>
                          </div>
                        ),
                        children: renderTankList(tanksByFluid.AGUA_LASTRE, tankInputs, handleTankPctChange, FLUID_CONFIG.AGUA_LASTRE),
                      },
                      // 📦 OTROS TANQUES (Si los hay)
                      ...(((tanksByFluid.ACEITE?.length || 0) + (tanksByFluid.AGUAS_NEGRAS?.length || 0) + (tanksByFluid.OTRO?.length || 0) > 0) ? [{
                        key: 'OTRO',
                        label: (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <Space>
                              <span style={{ fontSize: 18 }}>📦</span>
                              <Text strong style={{ fontSize: 15, color: '#7F8C8D' }}>
                                Otros Tanques / Aceite ({((tanksByFluid.ACEITE?.length || 0) + (tanksByFluid.AGUAS_NEGRAS?.length || 0) + (tanksByFluid.OTRO?.length || 0))} tanques)
                              </Text>
                            </Space>
                          </div>
                        ),
                        children: renderTankList([
                          ...(tanksByFluid.ACEITE || []),
                          ...(tanksByFluid.AGUAS_NEGRAS || []),
                          ...(tanksByFluid.OTRO || [])
                        ], tankInputs, handleTankPctChange, FLUID_CONFIG.OTRO),
                      }] : []),
                    ]}
                  />
                </Card>

                {/* ── BARRA FLOTANTE DE TOTALES Y BOTÓN DE GUARDADO ── */}
                <Card
                  style={{
                    position: 'sticky',
                    bottom: 12,
                    zIndex: 100,
                    borderRadius: 14,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    border: '1.5px solid #0A2647',
                    background: '#0A2647',
                    color: '#FFFFFF',
                  }}
                  styles={{ body: { padding: '14px 24px' } }}
                >
                  <Row justify="space-between" align="middle" gutter={[16, 16]}>
                    <Col xs={24} md={14}>
                      <Space size={24} wrap>
                        <div>
                          <Text style={{ color: '#BDC3C7', fontSize: 11, display: 'block' }}>TOTAL COMBUSTIBLE</Text>
                          <Text strong style={{ color: '#F39C12', fontSize: 17 }}>
                            {liveCalculations.totFuelTons.toFixed(1)} t
                          </Text>
                        </div>
                        <div>
                          <Text style={{ color: '#BDC3C7', fontSize: 11, display: 'block' }}>TOTAL AGUA DULCE</Text>
                          <Text strong style={{ color: '#5DADE2', fontSize: 17 }}>
                            {liveCalculations.totWaterTons.toFixed(1)} t
                          </Text>
                        </div>
                        <div>
                          <Text style={{ color: '#BDC3C7', fontSize: 11, display: 'block' }}>TOTAL LASTRE</Text>
                          <Text strong style={{ color: '#48C9B0', fontSize: 17 }}>
                            {liveCalculations.totBallastTons.toFixed(1)} t
                          </Text>
                        </div>
                        <Divider type="vertical" style={{ height: 32, borderColor: '#34495E' }} />
                        <div>
                          <Text style={{ color: '#BDC3C7', fontSize: 11, display: 'block' }}>PESO LÍQUIDOS (W)</Text>
                          <Text strong style={{ color: '#FFFFFF', fontSize: 19 }}>
                            {liveCalculations.totLiquidsTons.toFixed(2)} t
                          </Text>
                        </div>
                        <div>
                          <Text style={{ color: '#BDC3C7', fontSize: 11, display: 'block' }}>TOTAL FSM</Text>
                          <Text strong style={{ color: liveCalculations.totFSM > 20 ? '#E74C3C' : '#F1C40F', fontSize: 17 }}>
                            {liveCalculations.totFSM.toFixed(2)} t·m
                          </Text>
                        </div>
                      </Space>
                    </Col>
                    <Col xs={24} md={10} style={{ textAlign: 'right' }}>
                      <Space wrap>
                        <Button
                          size="large"
                          loading={savingSounding}
                          onClick={() => handleSaveSounding(false)}
                          style={{ borderRadius: 8 }}
                        >
                          💾 Guardar Sondeo
                        </Button>
                        <Button
                          type="primary"
                          size="large"
                          icon={<CheckCircleOutlined />}
                          loading={savingSounding}
                          onClick={() => handleSaveSounding(true)}
                          style={{
                            background: '#27AE60',
                            borderColor: '#27AE60',
                            fontWeight: 600,
                            borderRadius: 8,
                          }}
                        >
                          🌟 Guardar como Oficial Pre-Zarpe
                        </Button>
                      </Space>
                    </Col>
                  </Row>
                </Card>
              </div>
            ),
          },
          {
            key: 'history',
            label: (
              <span>
                <HistoryOutlined /> <b>📊 Historial de Sondeos</b>
              </span>
            ),
            children: (
              <Card style={{ borderRadius: 12 }}>
                <Table
                  dataSource={soundings}
                  rowKey="id"
                  loading={loadingSoundings}
                  pagination={{ pageSize: 15 }}
                  columns={[
                    {
                      title: 'ID',
                      dataIndex: 'id',
                      width: 65,
                      render: (id) => <Text code>#{id}</Text>,
                    },
                    {
                      title: 'Fecha y Hora',
                      dataIndex: 'sounding_datetime',
                      render: (val, record) => (
                        <Space direction="vertical" size={0}>
                          <Text strong>{dayjs(val).format('DD/MM/YYYY HH:mm')}</Text>
                          {record.is_official && (
                            <Tag color="success" icon={<CheckOutlined />}>
                              Oficial Pre-Zarpe
                            </Tag>
                          )}
                        </Space>
                      ),
                    },
                    {
                      title: 'Tipo de Sondeo',
                      dataIndex: 'sounding_type',
                      render: (val) => {
                        const t = SOUNDING_TYPES.find((x) => x.value === val);
                        return <Tag color={t?.color || 'default'}>{t?.label || val}</Tag>;
                      },
                    },
                    {
                      title: 'Responsable',
                      dataIndex: 'performed_by',
                      render: (val) => val?.full_name || <Text type="secondary">N/A</Text>,
                    },
                    {
                      title: 'Calados / Asiento',
                      render: (_, r) =>
                        r.draft_fwd_m !== null && r.draft_aft_m !== null ? (
                          <Text style={{ fontSize: 12 }}>
                            Fwd: {r.draft_fwd_m?.toFixed(2)}m · Aft: {r.draft_aft_m?.toFixed(2)}m
                            <br />
                            <b>Trim: {r.trim_m?.toFixed(2)} m</b>
                          </Text>
                        ) : (
                          <Text type="secondary">Sin calados</Text>
                        ),
                    },
                    {
                      title: 'Combustible',
                      dataIndex: 'total_fuel_tons',
                      render: (val, r) => (
                        <span>
                          <b>{val?.toFixed(1)} t</b>
                          <br />
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {r.total_fuel_m3?.toFixed(1)} m³
                          </Text>
                        </span>
                      ),
                    },
                    {
                      title: 'Agua Dulce',
                      dataIndex: 'total_fresh_water_tons',
                      render: (val, r) => (
                        <span>
                          <b>{val?.toFixed(1)} t</b>
                          <br />
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {r.total_fresh_water_m3?.toFixed(1)} m³
                          </Text>
                        </span>
                      ),
                    },
                    {
                      title: 'Lastre',
                      dataIndex: 'total_ballast_tons',
                      render: (val, r) => (
                        <span>
                          <b>{val?.toFixed(1)} t</b>
                          <br />
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {r.total_ballast_m3?.toFixed(1)} m³
                          </Text>
                        </span>
                      ),
                    },
                    {
                      title: 'Total Líquidos',
                      dataIndex: 'total_liquids_tons',
                      render: (val) => <Tag color="blue" style={{ fontWeight: 600 }}>{val?.toFixed(1)} t</Tag>,
                    },
                    {
                      title: 'Corr. FSM',
                      dataIndex: 'total_fsm_moments',
                      render: (val) => (
                        <Text style={{ color: val > 20 ? '#C0392B' : '#7F8C8D', fontWeight: 600 }}>
                          {val?.toFixed(1)} t·m
                        </Text>
                      ),
                    },
                    {
                      title: 'Acciones',
                      key: 'actions',
                      render: (_, record) => (
                        <Space>
                          <Tooltip title="Ver detalle de los 22 tanques">
                            <Button
                              type="text"
                              icon={<EyeOutlined />}
                              onClick={() => {
                                setViewingSounding(record);
                                setDetailModalOpen(true);
                              }}
                            />
                          </Tooltip>
                          {!record.is_official && (
                            <Tooltip title="Marcar como Oficial Pre-Zarpe">
                              <Button
                                type="text"
                                icon={<CheckCircleOutlined style={{ color: '#27AE60' }} />}
                                onClick={() => handleSetOfficial(record.id)}
                              />
                            </Tooltip>
                          )}
                          <Popconfirm
                            title="¿Eliminar este registro de sondeo?"
                            onConfirm={() => handleDeleteSounding(record.id)}
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
          {
            key: 'catalog',
            label: (
              <span>
                <SettingOutlined /> <b>⚙️ Catálogo e Hidrostática de Tanques</b>
              </span>
            ),
            children: (
              <Card
                title={`Catálogo de Tanques e Inercias Hidrostáticas: ${selectedVessel?.name || 'Embarcación'}`}
                style={{ borderRadius: 12 }}
                extra={
                  <Text type="secondary">
                    Total: <b>{tanks.length} tanques configurados</b>
                  </Text>
                }
              >
                <Table
                  dataSource={tanks}
                  rowKey="id"
                  loading={loadingTanks}
                  pagination={false}
                  columns={[
                    {
                      title: '#',
                      dataIndex: 'order_index',
                      width: 50,
                      render: (val, _, idx) => val || idx + 1,
                    },
                    {
                      title: 'Código',
                      dataIndex: 'tank_code',
                      render: (val) => <Text code strong>{val}</Text>,
                    },
                    {
                      title: 'Nombre y Ubicación',
                      dataIndex: 'name',
                      render: (val, r) => (
                        <div>
                          <Text strong>{val}</Text>
                          {r.frame_location && (
                            <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                              Cuadernas: {r.frame_location}
                            </Text>
                          )}
                        </div>
                      ),
                    },
                    {
                      title: 'Fluido',
                      dataIndex: 'fluid_type',
                      render: (val) => {
                        const cfg = getFluidConfig(val);
                        return (
                          <Tag style={{ background: cfg.bgColor, color: cfg.color, borderColor: cfg.color, fontWeight: 600 }}>
                            {cfg.icon} {cfg.label}
                          </Tag>
                        );
                      },
                    },
                    {
                      title: 'Capacidad Máx.',
                      dataIndex: 'capacity_m3',
                      render: (val) => `${val?.toFixed(2)} m³`,
                    },
                    {
                      title: 'Densidad',
                      dataIndex: 'design_density',
                      render: (val) => `${val?.toFixed(3)} t/m³`,
                    },
                    {
                      title: 'Peso Máx.',
                      dataIndex: 'max_weight_tons',
                      render: (val) => <Text strong>{val?.toFixed(2)} t</Text>,
                    },
                    {
                      title: 'ZG (m)',
                      dataIndex: 'zg_m',
                      render: (val) => `${val?.toFixed(3)} m`,
                    },
                    {
                      title: 'Inercia FSM (i)',
                      dataIndex: 'fsm_inertia_i',
                      render: (val) => (
                        <Text style={{ color: val > 0 ? '#C0392B' : '#7F8C8D' }}>
                          {val > 0 ? `${val?.toFixed(3)} m⁴` : '0.000'}
                        </Text>
                      ),
                    },
                    {
                      title: 'Acciones',
                      key: 'actions',
                      render: (_, record) => (
                        <Button
                          size="small"
                          icon={<SettingOutlined />}
                          onClick={() => handleOpenEditTank(record)}
                        >
                          Editar
                        </Button>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* ── MODAL DETALLE DE SONDEO HISTÓRICO ── */}
      <Modal
        title={`Detalle de Sondeo #${viewingSounding?.id} — ${dayjs(viewingSounding?.sounding_datetime).format('DD/MM/YYYY HH:mm')}`}
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setDetailModalOpen(false)}>
            Cerrar
          </Button>,
        ]}
        width={900}
      >
        {viewingSounding && (
          <div>
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 4 }} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Tipo">{viewingSounding.sounding_type}</Descriptions.Item>
              <Descriptions.Item label="Oficial">
                {viewingSounding.is_official ? <Tag color="success">Sí (Oficial)</Tag> : <Tag>No</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="Calado Proa">{viewingSounding.draft_fwd_m?.toFixed(2) ?? 'N/A'} m</Descriptions.Item>
              <Descriptions.Item label="Calado Popa">{viewingSounding.draft_aft_m?.toFixed(2) ?? 'N/A'} m</Descriptions.Item>
              <Descriptions.Item label="Combustible">{viewingSounding.total_fuel_tons?.toFixed(2)} t</Descriptions.Item>
              <Descriptions.Item label="Agua Dulce">{viewingSounding.total_fresh_water_tons?.toFixed(2)} t</Descriptions.Item>
              <Descriptions.Item label="Lastre">{viewingSounding.total_ballast_tons?.toFixed(2)} t</Descriptions.Item>
              <Descriptions.Item label="FSM Total">{viewingSounding.total_fsm_moments?.toFixed(2)} t·m</Descriptions.Item>
            </Descriptions>

            <Table
              dataSource={viewingSounding.items || []}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: 'Tanque',
                  render: (_, r) => <Text strong>{r.tank?.tank_code || `TK-${r.tank_id}`}</Text>,
                },
                {
                  title: 'Fluido',
                  render: (_, r) => {
                    const fluid = r.tank?.fluid_type;
                    const cfg = getFluidConfig(fluid);
                    return (
                      <Tag style={{ background: cfg.bgColor, color: cfg.color, borderColor: cfg.color, fontWeight: 500 }}>
                        {cfg.icon} {cfg.label}
                      </Tag>
                    );
                  },
                },
                {
                  title: 'Llenado',
                  dataIndex: 'fill_percentage',
                  render: (v) => `${v?.toFixed(1)}%`,
                },
                {
                  title: 'Volumen',
                  dataIndex: 'volume_m3',
                  render: (v) => `${v?.toFixed(2)} m³`,
                },
                {
                  title: 'Peso',
                  dataIndex: 'weight_tons',
                  render: (v) => <Text strong>{v?.toFixed(2)} t</Text>,
                },
                {
                  title: 'ZG (m)',
                  dataIndex: 'zg_m',
                  render: (v) => `${v?.toFixed(2)} m`,
                },
                {
                  title: 'Momento Z',
                  dataIndex: 'mom_z',
                  render: (v) => `${v?.toFixed(2)} t·m`,
                },
                {
                  title: 'FSM',
                  dataIndex: 'fsm_applied',
                  render: (v, r) => (
                    <Text style={{ color: r.is_slack ? '#E67E22' : '#7F8C8D' }}>
                      {v > 0 ? `${v?.toFixed(2)} t·m` : '0.00'}
                    </Text>
                  ),
                },
              ]}
            />
          </div>
        )}
      </Modal>

      {/* ── MODAL EDITAR PARÁMETROS HIDROSTÁTICOS DE TANQUE ── */}
      <Modal
        title={`⚙️ Configuración Hidrostática: ${editingTank?.tank_code || 'Tanque'}`}
        open={editTankModalOpen}
        onCancel={() => setEditTankModalOpen(false)}
        onOk={handleSaveTank}
        confirmLoading={savingTank}
        okText="Guardar Cambios"
        cancelText="Cancelar"
        width={620}
      >
        <Form form={tankForm} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} sm={14}>
              <Form.Item name="name" label="Nombre y Descripción" rules={[{ required: true, message: 'El nombre es obligatorio' }]}>
                <Input placeholder="Ej. Doble Fdo. No.1 -comb.-" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={10}>
              <Form.Item name="fluid_type" label="Tipo de Fluido" rules={[{ required: true, message: 'Seleccione un fluido' }]}>
                <Select
                  options={FLUID_OPTIONS}
                  onChange={(val) => {
                    const cfg = FLUID_CONFIG[val];
                    if (cfg?.defaultDensity) {
                      tankForm.setFieldsValue({ design_density: cfg.defaultDensity });
                    }
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={12}>
              <Form.Item name="capacity_m3" label="Capacidad (m³)" rules={[{ required: true, message: 'Requerido' }]}>
                <InputNumber style={{ width: '100%' }} step={0.01} min={0.01} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item
                name="design_density"
                label="Densidad de Diseño (t/m³)"
                rules={[{ required: true, message: 'Requerido' }]}
                extra={<Text type="secondary" style={{ fontSize: 11 }}>Diésel: 0.85 · Dulce: 1.00 · Lastre: 1.03</Text>}
              >
                <InputNumber style={{ width: '100%' }} step={0.001} min={0.1} max={3.0} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={12}>
              <Form.Item name="zg_m" label="Centro Gravedad ZG (m)" rules={[{ required: true, message: 'Requerido' }]}>
                <InputNumber style={{ width: '100%' }} step={0.001} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="fsm_inertia_i" label="Inercia Sup. Libre i (m⁴)" rules={[{ required: true, message: 'Requerido' }]}>
                <InputNumber style={{ width: '100%' }} step={0.001} min={0} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item name="frame_location" label="Ubicación de Cuadernas">
                <Input placeholder="Ej. Cdas. 35 - 42" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

// ── RENDERIZADOR DE LISTA DE TANQUES ─────────────────────────
function renderTankList(tankGroup, tankInputs, handleTankPctChange, fluidConfig) {
  if (!tankGroup || tankGroup.length === 0) {
    return <Text type="secondary">No hay tanques registrados para esta categoría.</Text>;
  }

  return (
    <Row gutter={[12, 12]}>
      {tankGroup.map((tank) => {
        const input = tankInputs[tank.id] || { fill_percentage: 0 };
        const pct = Number(input.fill_percentage) || 0;
        const volumeM3 = (tank.capacity_m3 * pct) / 100;
        const density = tank.design_density;
        const weightTons = volumeM3 * density;
        const isSlack = pct > 0.5 && pct < 98.0;
        let fsm = 0;
        if (isSlack && tank.fsm_inertia_i > 0 && tank.max_weight_tons > 0) {
          fsm = density * tank.fsm_inertia_i * (weightTons / tank.max_weight_tons);
        }

        return (
          <Col xs={24} md={12} lg={8} key={tank.id}>
            <Card
              size="small"
              style={{
                borderRadius: 10,
                border: isSlack ? '1.5px solid #F39C12' : pct >= 98 ? '1px solid #27AE60' : '1px solid #E0E0E0',
                background: isSlack ? '#FEF9E7' : '#FFFFFF',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <Text strong style={{ fontSize: 14 }}>
                    {tank.tank_code}
                  </Text>
                  <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                    {tank.name} {tank.frame_location ? `(${tank.frame_location})` : ''}
                  </Text>
                </div>
                <Tag color={isSlack ? 'warning' : pct >= 98 ? 'success' : pct === 0 ? 'default' : 'blue'}>
                  {isSlack ? 'Slack' : pct >= 98 ? 'Lleno' : pct === 0 ? 'Vacío' : `${pct}%`}
                </Tag>
              </div>

              {/* Slider de porcentaje y campo numérico */}
              <Row gutter={8} align="middle">
                <Col span={17}>
                  <Slider
                    min={0}
                    max={100}
                    value={pct}
                    onChange={(val) => handleTankPctChange(tank.id, val)}
                    marks={{ 0: '0', 50: '50', 100: '100' }}
                  />
                </Col>
                <Col span={7}>
                  <InputNumber
                    min={0}
                    max={100}
                    style={{ width: '100%' }}
                    value={pct}
                    formatter={(v) => `${v}%`}
                    parser={(v) => v.replace('%', '')}
                    onChange={(val) => handleTankPctChange(tank.id, val || 0)}
                  />
                </Col>
              </Row>

              {/* Fila de cálculos en tiempo real */}
              <div
                style={{
                  marginTop: 10,
                  padding: '6px 8px',
                  background: 'rgba(0,0,0,0.03)',
                  borderRadius: 6,
                  fontSize: 11,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>
                  Vol: <b>{volumeM3.toFixed(2)} m³</b> / {tank.capacity_m3.toFixed(1)}
                </span>
                <span>
                  Peso: <b>{weightTons.toFixed(2)} t</b>
                </span>
                <span>
                  FSM: <b style={{ color: isSlack ? '#D35400' : '#7F8C8D' }}>{fsm.toFixed(2)}</b>
                </span>
              </div>
            </Card>
          </Col>
        );
      })}
    </Row>
  );
}
