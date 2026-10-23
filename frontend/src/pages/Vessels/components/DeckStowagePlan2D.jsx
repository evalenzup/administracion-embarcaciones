/**
 * SIAE — Componente DeckStowagePlan2D
 * Plano Cenital y Arquitectónico Interactivo 2D de Estiba de Equipos y Carga en Cubiertas (B/O Alpha Helix).
 * Basado fielmente en los planos oficiales de ingeniería de UNI Group (Abril 2024):
 *   - ANEXO 5 y ANEXO 6: Cubierta Principal (Z = 4.95 m, Marco en A, Winche 60x49", Áreas A1, A2, A3, A4)
 *   - ANEXO 8: Cubierta Superior (Z = 7.04 m, Caseta de Operaciones, Winche CTD, Grúa 3000#, Áreas A1 Grúa, Central y Banda)
 */

import { useState, useMemo } from 'react';
import {
  Card, Tag, Button, Space, Typography, Row, Col, Progress,
  Tooltip, Popconfirm, Badge, Segmented, Empty, Alert, Divider
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, InfoCircleOutlined,
  CompassOutlined, WarningOutlined, CheckCircleOutlined,
  ArrowRightOutlined, RocketOutlined, EyeOutlined, SwapOutlined
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

// ── ZONAS OFICIALES SEGÚN ANEXOS 5, 6 Y 8 (UNI GROUP 2024) ────
const OFFICIAL_DECK_ZONES = {
  CUBIERTA_PRINCIPAL: [
    {
      id: 'U_FRAME_POPA',
      code: 'U-FRAME',
      name: 'Marco en A (U-Frame) — Espejo de Popa',
      frame: 'Cda. 58-60',
      areaM2: 5.5,
      recLimitTons: 6.0,
      keywords: ['marco', 'u-frame', 'a-frame', 'portico', 'espejo'],
      desc: 'Pórtico basculante sobre espejo de popa para maniobras pesadas y tiro oceanográfico',
      svgPos: { x: 95, y: 155, width: 75, height: 150 },
      color: '#E67E22',
      defaultEquipment: { item_name: 'Pórtico / Marco en A (U-Frame)', weight_tons: 2.80, zg_above_deck_m: 2.10 }
    },
    {
      id: 'AREA_A2',
      code: 'A2 (6.70 m²)',
      name: 'Área A2 — Popa Banda Superior (6.70 m²)',
      frame: 'Cda. 51-57',
      areaM2: 6.70,
      recLimitTons: 6.5,
      keywords: ['a2', 'redes', 'bongo', 'muestreo', 'popa br'],
      desc: 'Área de carga oficial A2 (1.90m x 3.53m) para cajas de muestras, redes y equipos de arrastre',
      svgPos: { x: 195, y: 72, width: 145, height: 88 },
      color: '#2980B9',
      defaultEquipment: { item_name: 'Cajas de Muestras y Redes Bongo', weight_tons: 0.90, zg_above_deck_m: 0.60 }
    },
    {
      id: 'AREA_A3',
      code: 'A3 (6.70 m²)',
      name: 'Área A3 — Popa Banda Inferior (6.70 m²)',
      frame: 'Cda. 51-57',
      areaM2: 6.70,
      recLimitTons: 6.5,
      keywords: ['a3', 'box corer', 'corer', 'draga', 'geologia'],
      desc: 'Área de carga oficial A3 (1.90m x 3.53m) para dragas de caja, geología marina y testigos',
      svgPos: { x: 195, y: 298, width: 145, height: 88 },
      color: '#16A085',
      defaultEquipment: { item_name: 'Draga Box Corer / Reineck', weight_tons: 1.10, zg_above_deck_m: 0.70 }
    },
    {
      id: 'WINCHE_G_CRUJIA',
      code: 'WINCHE G',
      name: 'Winche Auxiliar 60x49" (G) — Crujía Popa',
      frame: 'Cda. 48-51',
      areaM2: 4.8,
      recLimitTons: 8.0,
      keywords: ['winche', 'auxiliar', '60x49', 'crujia', 'compresor'],
      desc: 'Bancada del winche auxiliar G de 60x49" y base de soporte C sobre eje de crujía',
      svgPos: { x: 350, y: 195, width: 95, height: 85 },
      color: '#8E44AD',
      defaultEquipment: { item_name: 'Winche Auxiliar Principal (60x49")', weight_tons: 4.50, zg_above_deck_m: 0.90 }
    },
    {
      id: 'AREA_A1',
      code: 'A1 (6.08 m²)',
      name: 'Área A1 — Banda Superior Proa (6.08 m²)',
      frame: 'Cda. 45-51',
      areaM2: 6.08,
      recLimitTons: 7.0,
      keywords: ['a1', 'contenedor', 'lab', 'humedo', 'proa'],
      desc: 'Área de carga oficial A1 (2.19m x 2.78m) junto a la base de grúa A y puerta de abordaje B',
      svgPos: { x: 350, y: 72, width: 135, height: 95 },
      color: '#D35400',
      defaultEquipment: { item_name: 'Contenedor Laboratorio Húmedo (20ft)', weight_tons: 5.50, zg_above_deck_m: 1.30 }
    },
    {
      id: 'AREA_A4_POPA',
      code: 'A4 (6.08 m²)',
      name: 'Área A4 — Banda Inferior Proa (6.08 m²)',
      frame: 'Cda. 48-51',
      areaM2: 6.08,
      recLimitTons: 6.0,
      keywords: ['a4', 'registro', 'h', 'compresor', 'geofisico'],
      desc: 'Área de carga oficial A4 (1.95m x 2.17m) situada sobre el registro atornillado H de 96x96"',
      svgPos: { x: 350, y: 298, width: 100, height: 88 },
      color: '#27AE60',
      defaultEquipment: { item_name: 'Compresor Sísmico / Geofísico', weight_tons: 3.20, zg_above_deck_m: 0.85 }
    },
    {
      id: 'AREA_A4_SUP',
      code: 'A4 SUP (2.58 m²)',
      name: 'Área A4 Suplementaria (2.58 m²)',
      frame: 'Cda. 44-48',
      areaM2: 2.58,
      recLimitTons: 3.0,
      keywords: ['suplementaria', 'hatch', 'escotilla', '2.58'],
      desc: 'Área de carga oficial suplementaria (1.56m x 1.65m) adyacente a la escotilla 4\'x4\' W.T.',
      svgPos: { x: 455, y: 298, width: 75, height: 88 },
      color: '#1ABC9C',
      defaultEquipment: { item_name: 'Cajas de Herramientas y Maniobra', weight_tons: 0.75, zg_above_deck_m: 0.50 }
    }
  ],

  CUBIERTA_SUPERIOR: [
    {
      id: 'CASETA_J_FRAME',
      code: 'CASETA & J-FRAME',
      name: 'Caseta de Control de Operaciones y J-Frame',
      frame: 'Cdas. 43-47',
      areaM2: 6.5,
      recLimitTons: 4.5,
      keywords: ['caseta', 'control', 'operaciones', 'j-frame', 'ctd', 'roseta', 'winche ctd'],
      desc: 'Caseta de operaciones (Cuarto de control E) con ventanales a popa, pórtico J-Frame y Winche CTD (F)',
      svgPos: { x: 260, y: 275, width: 140, height: 110 },
      color: '#C0392B',
      defaultEquipment: { item_name: 'Roseta CTD Seabird 24 botellas (con J-Frame)', weight_tons: 1.20, zg_above_deck_m: 1.10 }
    },
    {
      id: 'AREA_A1_GRUA',
      code: 'A1 (12.87 m²)',
      name: 'Área A1 — Banda Superior (12.87 m²)',
      frame: 'Cdas. 34-42',
      areaM2: 12.87,
      recLimitTons: 10.0,
      keywords: ['12.87', 'a1', 'superior', 'instrumental', 'cientifico', 'grua', 'crane'],
      desc: 'Superficie despejada de cubierta superior (4.49m x 2.87m) para estiba de instrumental científico bajo el radio de la Grúa 3000# (pluma trincada hacia proa)',
      svgPos: { x: 410, y: 72, width: 175, height: 105 },
      color: '#F39C12',
      defaultEquipment: { item_name: 'Rack de Instrumental Científico de Cubierta', weight_tons: 1.50, zg_above_deck_m: 0.80 }
    },
    {
      id: 'AREA_A1_CENTRAL',
      code: 'A1 CENTRAL (5.98 m²)',
      name: 'Área A1 — Crujía Popa Lavandería (5.98 m²)',
      frame: 'Cdas. 39-43',
      areaM2: 5.98,
      recLimitTons: 5.5,
      keywords: ['5.98', 'central', 'lavanderia', 'sensores', 'rack'],
      desc: 'Área de carga oficial (3.58m x 1.67m) transversal sobre crujía a popa del compartimento de lavandería',
      svgPos: { x: 385, y: 182, width: 85, height: 88 },
      color: '#8E44AD',
      defaultEquipment: { item_name: 'Rack de Instrumentación Meteorológica', weight_tons: 0.55, zg_above_deck_m: 0.60 }
    },
    {
      id: 'AREA_A1_BANDA',
      code: 'A1 BANDA (4.69 m²)',
      name: 'Área A1 — Pasillo Banda Inferior (4.69 m²)',
      frame: 'Cdas. 34-42',
      areaM2: 4.69,
      recLimitTons: 4.5,
      keywords: ['4.69', 'pasillo', 'banda', 'cables', 'cabos'],
      desc: 'Pasillo de estiba oficial (4.49m x 1.05m) junto a lavandería y caseta de control',
      svgPos: { x: 410, y: 280, width: 175, height: 60 },
      color: '#2980B9',
      defaultEquipment: { item_name: 'Cajas de Repuestos CTD y Cabos', weight_tons: 0.65, zg_above_deck_m: 0.50 }
    }
  ]
};

// Asignar un ítem a la zona más representativa según palabras clave
function matchItemToZone(item, deck) {
  const zones = OFFICIAL_DECK_ZONES[deck] || [];
  const text = `${item.zone_code || ''} ${item.item_name || ''}`.toLowerCase();
  for (const z of zones) {
    if (z.keywords.some((kw) => text.includes(kw))) {
      return z.id;
    }
  }
  return zones[0]?.id || 'GENERAL';
}

export default function DeckStowagePlan2D({
  cargoItems = [],
  calcResult = null,
  evalType = 'SALIDA_PUERTO',
  onOpenAddItem,
  onOpenEditItem,
  onDeleteItem,
  onAddPreset,
  presetEquipment = []
}) {
  const [activeDeck, setActiveDeck] = useState('CUBIERTA_PRINCIPAL');
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [hoveredZoneId, setHoveredZoneId] = useState(null);

  // Límites vigentes según Anexo 3 o Anexo 4
  const deckLimits = calcResult?.deck_limits || {
    main_deck_weight_tons: 0,
    main_deck_limit_tons: 30.0,
    main_deck_compliant: true,
    upper_deck_weight_tons: 0,
    upper_deck_limit_tons: 25.0,
    upper_deck_compliant: true,
  };

  const currentDeckLimit =
    activeDeck === 'CUBIERTA_PRINCIPAL'
      ? deckLimits.main_deck_limit_tons
      : deckLimits.upper_deck_limit_tons;

  const currentDeckWeight =
    activeDeck === 'CUBIERTA_PRINCIPAL'
      ? deckLimits.main_deck_weight_tons
      : deckLimits.upper_deck_weight_tons;

  const currentDeckPercent = Math.min(
    100,
    currentDeckLimit > 0 ? Math.round((currentDeckWeight / currentDeckLimit) * 100) : 0
  );

  const zonesForCurrentDeck = OFFICIAL_DECK_ZONES[activeDeck] || [];

  // Agrupar items por zona
  const itemsByZone = useMemo(() => {
    const map = {};
    zonesForCurrentDeck.forEach((z) => {
      map[z.id] = [];
    });
    const itemsInThisDeck = cargoItems.filter((i) => i.deck === activeDeck);
    itemsInThisDeck.forEach((item) => {
      const matchedZoneId = matchItemToZone(item, activeDeck);
      if (!map[matchedZoneId]) map[matchedZoneId] = [];
      map[matchedZoneId].push(item);
    });
    return map;
  }, [cargoItems, activeDeck, zonesForCurrentDeck]);

  // Zona activa seleccionada
  const activeZoneObj = useMemo(() => {
    return zonesForCurrentDeck.find((z) => z.id === selectedZoneId) || null;
  }, [zonesForCurrentDeck, selectedZoneId]);

  return (
    <div style={{ marginTop: 8 }}>
      {/* ── CARD PRINCIPAL: SELECTOR Y NAVEGACIÓN DE CUBIERTAS ── */}
      <Card
        style={{
          borderRadius: '12px 12px 0 0',
          background: 'linear-gradient(135deg, #0A2647 0%, #144272 100%)',
          color: '#ffffff',
          border: 'none',
          marginBottom: 0
        }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} lg={13}>
            <Space orientation="vertical" size={2}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CompassOutlined style={{ fontSize: 24, color: '#00D2D3' }} />
                <Title level={4} style={{ color: '#ffffff', margin: 0 }}>
                  Plano Oficial de Estiba por Cubierta (B/O Alpha Helix — UNI Group 2024)
                </Title>
              </div>
              <Text style={{ color: '#A5C9CA', fontSize: 13 }}>
                El BOAH cuenta con <b>dos cubiertas operativas independientes</b> a diferentes cotas: la <b>Cubierta Principal</b> (trabajo popa, Marco en A y Winche 60x49") y la <b>Cubierta Superior</b> (más pequeña, con Caseta de Operaciones, Winche CTD y Grúa 3000#).
              </Text>
            </Space>
          </Col>

          <Col xs={24} lg={11} style={{ textAlign: 'right' }}>
            <Space wrap size={10} style={{ justifyContent: 'flex-end', width: '100%' }}>
              <Segmented
                value={activeDeck}
                onChange={(val) => {
                  setActiveDeck(val);
                  setSelectedZoneId(null);
                }}
                options={[
                  {
                    value: 'CUBIERTA_PRINCIPAL',
                    label: (
                      <span style={{ fontWeight: 600, padding: '4px 8px' }}>
                        ⚓ Cubierta Principal (4.95 m)
                      </span>
                    )
                  },
                  {
                    value: 'CUBIERTA_SUPERIOR',
                    label: (
                      <span style={{ fontWeight: 600, padding: '4px 8px' }}>
                        🚤 Cubierta Superior (7.04 m)
                      </span>
                    )
                  }
                ]}
              />

              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() =>
                  onOpenAddItem &&
                  onOpenAddItem(activeDeck, activeZoneObj?.name || 'Área Oficial de Carga')
                }
                style={{
                  background: '#00D2D3',
                  borderColor: '#00D2D3',
                  color: '#0A2647',
                  fontWeight: 700
                }}
              >
                Agregar Equipo
              </Button>
            </Space>
          </Col>
        </Row>

        {/* ── BANNER COMPARATIVO DE DOS NIVELES Y SEMÁFORO DE PESO ── */}
        <div
          style={{
            marginTop: 14,
            padding: '12px 16px',
            background: 'rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(255, 255, 255, 0.12)'
          }}
        >
          <Row align="middle" gutter={[16, 8]}>
            <Col xs={24} sm={8}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge
                  color={activeDeck === 'CUBIERTA_PRINCIPAL' ? '#E67E22' : '#8E44AD'}
                  style={{ transform: 'scale(1.2)' }}
                />
                <div>
                  <Text style={{ color: '#EAF2F8', fontSize: 13, fontWeight: 600 }}>
                    {activeDeck === 'CUBIERTA_PRINCIPAL'
                      ? 'NIVEL INFERIOR: CUBIERTA PRINCIPAL'
                      : 'NIVEL SUPERIOR: CUBIERTA SUPERIOR'}
                  </Text>
                  <Text style={{ color: '#A5C9CA', fontSize: 11, display: 'block' }}>
                    {activeDeck === 'CUBIERTA_PRINCIPAL'
                      ? 'Cota Z = 4.95 m · Área de maniobra popa Cda. 42 a 60'
                      : 'Cota Z = 7.04 m · Toldilla compacta Cda. 30 a 44 (Popa abierta abajo)'}
                  </Text>
                </div>
              </div>
            </Col>

            <Col xs={24} sm={10}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: 12, color: '#ffffff' }}>
                  Peso actual: <b>{currentDeckWeight.toFixed(2)} t</b>
                </span>
                <span style={{ fontSize: 12, color: '#A5C9CA' }}>
                  Límite estructural: <b>{currentDeckLimit.toFixed(1)} t</b>
                </span>
              </div>
              <Progress
                percent={currentDeckPercent}
                status={currentDeckPercent > 100 ? 'exception' : 'active'}
                strokeColor={
                  currentDeckPercent > 100
                    ? '#E74C3C'
                    : currentDeckPercent > 75
                    ? '#F39C12'
                    : '#27AE60'
                }
                trailColor="rgba(255,255,255,0.2)"
                size={['100%', 10]}
              />
            </Col>

            <Col xs={24} sm={6} style={{ textAlign: 'right' }}>
              <Tag
                color={
                  currentDeckPercent > 100
                    ? 'error'
                    : currentDeckPercent > 75
                    ? 'warning'
                    : 'success'
                }
                style={{ fontWeight: 700, fontSize: 12, padding: '3px 12px' }}
              >
                {currentDeckPercent > 100
                  ? '⚠️ SOBRECARGA'
                  : currentDeckPercent > 75
                  ? '⚡ MARGEN ESTRECHO'
                  : '✅ DENTRO DE LÍMITE'}
              </Tag>
              {evalType === 'LLEGADA_PUERTO' && (
                <Text style={{ display: 'block', fontSize: 10, color: '#FAD7A0', marginTop: 2 }}>
                  (Curva exponencial Anexo 4 activa)
                </Text>
              )}
            </Col>
          </Row>
        </div>
      </Card>

      {/* ── CUERPO PRINCIPAL: CANVAS SVG ARQUITECTÓNICO QUE REPRODUCE LOS ANEXOS ── */}
      <Card
        style={{
          borderRadius: '0 0 12px 12px',
          borderTop: 'none',
          boxShadow: '0 6px 20px rgba(10, 38, 71, 0.08)'
        }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        {/* Leyenda y orientación náutica idéntica a los planos UNI Group */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
            padding: '6px 14px',
            background: '#F4F7FB',
            borderRadius: 6,
            fontSize: 12,
            color: '#34495E',
            border: '1px solid #E2E8F0'
          }}
        >
          <span>
            ⬅️ <b>POPA (Cda. 60)</b> — Espejo / U-Frame
          </span>
          <span>
            <b>EJE DE CRUJÍA</b> — Lado Superior vs. Lado Inferior (Manga 9.45 m)
          </span>
          <span>
            {activeDeck === 'CUBIERTA_PRINCIPAL'
              ? 'Mamparo transversal (Cda. 42) / Hacia Proa ➡️'
              : 'Biblioteca / Hacia Proa (Cda. 30) ➡️'}
          </span>
        </div>

        {/* CANVAS SVG NAVAL */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            overflowX: 'auto',
            background: '#071E3D',
            borderRadius: 10,
            padding: 8,
            border: '2px solid #0A2647'
          }}
        >
          <svg
            viewBox="0 0 1000 460"
            style={{ width: '100%', minWidth: 820, height: 'auto', display: 'block' }}
          >
            <defs>
              {/* Patrón de cuadrícula milimétrica náutica */}
              <pattern id="gridNaval" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0, 210, 211, 0.07)" strokeWidth="0.5" />
              </pattern>

              {/* Patrón rayado diagonal para las Áreas Oficiales de Carga (idéntico a Anexo 6 y 8) */}
              <pattern id="hatchA2" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(41, 128, 185, 0.35)" strokeWidth="2" />
              </pattern>
              <pattern id="hatchA3" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(22, 160, 133, 0.35)" strokeWidth="2" />
              </pattern>
              <pattern id="hatchA1" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(211, 84, 0, 0.35)" strokeWidth="2" />
              </pattern>
              <pattern id="hatchA4" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(39, 174, 96, 0.35)" strokeWidth="2" />
              </pattern>
              <pattern id="hatchUpperGrua" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(243, 156, 18, 0.35)" strokeWidth="2" />
              </pattern>

              {/* Patrón rayado gris para áreas técnicas cerradas */}
              <pattern id="hatchTech" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255, 255, 255, 0.12)" strokeWidth="1.5" />
              </pattern>

              {/* Gradiente para la cubierta */}
              <linearGradient id="deckBaseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0D3559" />
                <stop offset="60%" stopColor="#124373" />
                <stop offset="100%" stopColor="#0B3056" />
              </linearGradient>

              {/* Filtro de resplandor para elementos seleccionados */}
              <filter id="glowOfficial" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Fondo general con rejilla */}
            <rect x="0" y="0" width="1000" height="460" fill="url(#gridNaval)" />

            {/* Línea de Crujía náutica (Trazo azul punteado oficial) */}
            <line
              x1="60"
              y1="230"
              x2="940"
              y2="230"
              stroke="#00D2D3"
              strokeWidth="1.4"
              strokeDasharray="10 4 2 4"
            />
            <text x="945" y="234" fill="#00D2D3" fontSize="11" fontFamily="monospace" fontWeight="bold">
              ℄ CRUJÍA
            </text>

            {/* ════════════════════════════════════════════════════════════════════
                RENDERIZADO: CUBIERTA PRINCIPAL (ANEXO 5 Y ANEXO 6)
               ════════════════════════════════════════════════════════════════════ */}
            {activeDeck === 'CUBIERTA_PRINCIPAL' ? (
              <g>
                {/* 1. Silueta de la Cubierta Principal de Popa (Cda. 42 a Cda. 60) */}
                <path
                  d="
                    M 110 135
                    L 110 325
                    Q 145 395 240 400
                    L 580 400
                    L 580 60
                    L 240 60
                    Q 145 65 110 135
                    Z
                  "
                  fill="url(#deckBaseGrad)"
                  stroke="#00D2D3"
                  strokeWidth="2.5"
                />

                {/* Mamparo transversal Cda. 42 (Hacia proa / interior de la nave) */}
                <line x1="580" y1="60" x2="580" y2="400" stroke="#F39C12" strokeWidth="3" />
                <rect x="580" y="60" width="350" height="340" fill="url(#hatchTech)" opacity="0.4" />
                <text x="750" y="225" fill="#A5C9CA" fontSize="13" fontWeight="bold" textAnchor="middle">
                  SUPERESTRUCTURA Y ACOMODACIÓN
                </text>
                <text x="750" y="245" fill="#7F8C8D" fontSize="11" textAnchor="middle">
                  (Interior proa — Cda. 42 hacia Cda. 0)
                </text>

                {/* 2. Cuadernas oficiales de Cubierta Principal */}
                {[
                  { x: 110, label: 'Cda. 60' },
                  { x: 195, label: 'Cda. 57' },
                  { x: 275, label: 'Cda. 54' },
                  { x: 350, label: 'Cda. 51' },
                  { x: 425, label: 'Cda. 48' },
                  { x: 500, label: 'Cda. 45' },
                  { x: 525, label: 'Cda. 44' },
                  { x: 550, label: 'Cda. 43' },
                  { x: 580, label: 'Cda. 42' }
                ].map((f, idx) => (
                  <g key={idx} opacity={0.65}>
                    <line
                      x1={f.x}
                      y1="55"
                      x2={f.x}
                      y2="405"
                      stroke="rgba(165, 201, 202, 0.3)"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <text x={f.x} y="50" fill="#A5C9CA" fontSize="9" textAnchor="middle">
                      {f.label}
                    </text>
                  </g>
                ))}

                {/* 3. Equipamiento Naval Fijo de Anexo 5 */}
                {/* U-FRAME (Marco en A): Pórtico sobresaliendo en el espejo de popa */}
                <g>
                  {/* Brazos hidráulicos del Marco A */}
                  <line x1="110" y1="165" x2="65" y2="175" stroke="#E67E22" strokeWidth="6" strokeLinecap="round" />
                  <line x1="110" y1="295" x2="65" y2="285" stroke="#E67E22" strokeWidth="6" strokeLinecap="round" />
                  {/* Travesaño superior con motones */}
                  <line x1="65" y1="175" x2="65" y2="285" stroke="#E67E22" strokeWidth="8" strokeLinecap="round" />
                  <circle cx="65" cy="230" r="4" fill="#ffffff" />
                  <text x="50" y="234" fill="#E67E22" fontSize="10" fontWeight="bold" textAnchor="end">
                    U-FRAME
                  </text>
                </g>

                {/* D: Cabrestante (Winche) en banda superior Cda. 55-57 */}
                <g>
                  <circle cx="230" cy="95" r="9" fill="#1B4F72" stroke="#00D2D3" strokeWidth="1.5" />
                  <circle cx="230" cy="95" r="4" fill="#00D2D3" />
                  <text x="215" y="99" fill="#00D2D3" fontSize="9" fontWeight="bold">D</text>
                </g>

                {/* E: Tapa de acceso a mecha de timón (Cda. 54 en crujía) con el logo verde */}
                <g>
                  <rect x="255" y="210" width="36" height="40" rx="4" fill="#144272" stroke="#27AE60" strokeWidth="1.5" />
                  {/* Cuadrante verde con 4 flechas de sampling */}
                  <rect x="261" y="216" width="24" height="28" fill="#27AE60" opacity="0.85" rx="3" />
                  <path d="M 265 222 L 273 230 M 281 222 L 273 230 M 265 238 L 273 230 M 281 238 L 273 230" stroke="#ffffff" strokeWidth="1.5" />
                  <text x="273" y="246" fill="#ffffff" fontSize="7" fontWeight="bold" textAnchor="middle">E</text>
                  <text x="273" y="260" fill="#2ECC71" fontSize="8" textAnchor="middle">MECHA TIMÓN</text>
                </g>

                {/* F: Registro atornillado 18 x 26" en Cda. 59-60 */}
                <rect x="135" y="215" width="18" height="26" fill="#0A2647" stroke="#A5C9CA" strokeWidth="1" />
                <text x="144" y="231" fill="#A5C9CA" fontSize="8" textAnchor="middle">F</text>

                {/* C: Base estructura soporte en Cda. 49-51 sobre crujía */}
                <rect x="365" y="172" width="45" height="18" fill="#1B4F72" stroke="#F39C12" strokeWidth="1.5" />
                <text x="387" y="184" fill="#F39C12" fontSize="8" textAnchor="middle" fontWeight="bold">C (SOPORTE)</text>

                {/* G: Winche auxiliar de 60 x 49" (Crujía Cda. 48-51) con tambor estriado */}
                <g>
                  <rect x="355" y="196" width="60" height="49" rx="3" fill="#0A2647" stroke="#8E44AD" strokeWidth="2" />
                  {/* Estrías del tambor de cable */}
                  <line x1="365" y1="200" x2="365" y2="241" stroke="#A5C9CA" strokeWidth="2" />
                  <line x1="372" y1="200" x2="372" y2="241" stroke="#A5C9CA" strokeWidth="2" />
                  <line x1="379" y1="200" x2="379" y2="241" stroke="#A5C9CA" strokeWidth="2" />
                  <line x1="386" y1="200" x2="386" y2="241" stroke="#A5C9CA" strokeWidth="2" />
                  <line x1="393" y1="200" x2="393" y2="241" stroke="#A5C9CA" strokeWidth="2" />
                  <line x1="400" y1="200" x2="400" y2="241" stroke="#A5C9CA" strokeWidth="2" />
                  <text x="420" y="224" fill="#8E44AD" fontSize="9" fontWeight="bold">G (WINCHE 60x49")</text>
                </g>

                {/* H: Registro atornillado 96 x 96" bajo el área A4 */}
                <rect x="355" y="260" width="80" height="75" fill="none" stroke="rgba(255, 255, 255, 0.3)" strokeDasharray="4 2" />
                <text x="365" y="275" fill="rgba(255,255,255,0.4)" fontSize="9">H (REG. 96x96")</text>

                {/* Escotilla 4'x4' W.T. Hatch Spring w/24" en Cda. 45-47 */}
                <g>
                  <rect x="440" y="180" width="40" height="35" rx="3" fill="#144272" stroke="#00D2D3" strokeWidth="1" />
                  <text x="460" y="200" fill="#00D2D3" fontSize="8" textAnchor="middle">4'x4' HATCH</text>
                </g>

                {/* A: Base de Grúa de Cubierta (Crane Base 1/2" Dbl Pl.) en Cda. 43-45 */}
                <g>
                  <rect x="500" y="80" width="60" height="60" fill="#1B4F72" stroke="#E74C3C" strokeWidth="2" />
                  <circle cx="530" cy="110" r="20" fill="none" stroke="#E74C3C" strokeWidth="2" />
                  <text x="530" y="108" fill="#E74C3C" fontSize="9" fontWeight="bold" textAnchor="middle">CRANE</text>
                  <text x="530" y="120" fill="#E74C3C" fontSize="8" textAnchor="middle">BASE A</text>
                </g>

                {/* Escalera UP hacia Cubierta Superior */}
                <rect x="525" y="145" width="25" height="15" fill="#F39C12" opacity="0.8" />
                <text x="537" y="156" fill="#0A2647" fontSize="8" fontWeight="bold" textAnchor="middle">UP ▲</text>

                {/* B: Porta de abordaje y Hero's Platform */}
                <path d="M 470 60 Q 495 35 520 60" fill="none" stroke="#00D2D3" strokeWidth="2" />
                <text x="495" y="48" fill="#00D2D3" fontSize="9" textAnchor="middle">B (PORTA ABORDAJE)</text>
                <rect x="525" y="395" width="45" height="15" fill="#1B4F72" stroke="#A5C9CA" />
                <text x="547" y="406" fill="#A5C9CA" fontSize="7" textAnchor="middle">HERO'S PLATFORM</text>
              </g>
            ) : (
              // ════════════════════════════════════════════════════════════════════
              // RENDERIZADO: CUBIERTA SUPERIOR (ANEXO 8) — ¡MUCHO MÁS PEQUEÑA!
              // ════════════════════════════════════════════════════════════════════
              <g>
                {/* 1. Indicador del hueco de popa: Cubierta Principal abierta abajo (Cdas. 45 a 60) */}
                <path
                  d="
                    M 110 135
                    L 110 325
                    Q 145 395 240 400
                    L 390 400
                    L 390 60
                    L 240 60
                    Q 145 65 110 135
                    Z
                  "
                  fill="url(#hatchTech)"
                  stroke="rgba(0, 210, 211, 0.25)"
                  strokeWidth="1.5"
                  opacity="0.35"
                />
                <rect x="130" y="180" width="220" height="100" rx="8" fill="rgba(10, 38, 71, 0.85)" stroke="#00D2D3" strokeDasharray="4 3" />
                <text x="240" y="215" fill="#00D2D3" fontSize="12" fontWeight="bold" textAnchor="middle">
                  ⬇️ HUECO SOBRE CUBIERTA PRINCIPAL
                </text>
                <text x="240" y="235" fill="#A5C9CA" fontSize="10" textAnchor="middle">
                  La Cubierta Superior NO cubre la popa (Cda. 44 a 60).
                </text>
                <text x="240" y="252" fill="#E67E22" fontSize="10" textAnchor="middle">
                  El Marco en A y maniobras de popa quedan abajo visibles.
                </text>

                {/* 2. Silueta de la Cubierta Superior (Cda. 30 a Cda. 44, con caseta y plataformas voladizas) */}
                <path
                  d="
                    M 390 65
                    L 680 65
                    L 680 395
                    L 390 395
                    Z
                  "
                  fill="url(#deckBaseGrad)"
                  stroke="#8E44AD"
                  strokeWidth="2.5"
                />

                {/* Cuadernas de Cubierta Superior (30, 33, 36, 39, 42, 43, 44) */}
                {[
                  { x: 390, label: 'Cda. 44' },
                  { x: 415, label: 'Cda. 43' },
                  { x: 440, label: 'Cda. 42' },
                  { x: 490, label: 'Cda. 39' },
                  { x: 540, label: 'Cda. 36' },
                  { x: 590, label: 'Cda. 33' },
                  { x: 640, label: 'Cda. 30' }
                ].map((f, idx) => (
                  <g key={idx} opacity={0.65}>
                    <line
                      x1={f.x}
                      y1="55"
                      x2={f.x}
                      y2="405"
                      stroke="rgba(165, 201, 202, 0.3)"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <text x={f.x} y="50" fill="#A5C9CA" fontSize="9" textAnchor="middle">
                      {f.label}
                    </text>
                  </g>
                ))}

                {/* 3. Equipamiento Naval Fijo de Cubierta Superior (Anexo 8) */}

                {/* E: CASETA DE OPERACIONES (Cuarto de Control de Grúa / Malacate de Profundidad) en Cda. 43-47 */}
                <g>
                  {/* Estructura angular de la caseta con ventanales hacia popa y banda */}
                  <path
                    d="
                      M 390 315
                      L 340 315
                      L 315 350
                      L 315 390
                      L 390 390
                      Z
                    "
                    fill="#154360"
                    stroke="#00D2D3"
                    strokeWidth="2"
                  />
                  {/* Ventanales de observación panorámica */}
                  <line x1="335" y1="322" x2="318" y2="348" stroke="#00D2D3" strokeWidth="2" />
                  <line x1="318" y1="352" x2="318" y2="385" stroke="#00D2D3" strokeWidth="2" />
                  <circle cx="355" cy="355" r="8" fill="#E74C3C" />
                  <text x="355" y="358" fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle">E</text>
                  <text x="355" y="375" fill="#00D2D3" fontSize="8" fontWeight="bold" textAnchor="middle">CASETA DE</text>
                  <text x="355" y="385" fill="#00D2D3" fontSize="8" fontWeight="bold" textAnchor="middle">OPERACIONES</text>
                </g>

                {/* J-FRAME en voladizo junto a la Caseta de Operaciones */}
                <g>
                  <line x1="315" y1="365" x2="270" y2="365" stroke="#C0392B" strokeWidth="5" strokeLinecap="round" />
                  <line x1="270" y1="365" x2="250" y2="385" stroke="#C0392B" strokeWidth="5" strokeLinecap="round" />
                  <text x="250" y="360" fill="#FF7675" fontSize="9" fontWeight="bold">J-FRAME</text>
                </g>

                {/* F: WINCHE AUXILIAR CTD con tambor de cable oceanográfico */}
                <g>
                  <rect x="330" y="275" width="45" height="35" rx="3" fill="#0A2647" stroke="#8E44AD" strokeWidth="1.8" />
                  <line x1="338" y1="278" x2="338" y2="307" stroke="#A5C9CA" strokeWidth="1.5" />
                  <line x1="344" y1="278" x2="344" y2="307" stroke="#A5C9CA" strokeWidth="1.5" />
                  <line x1="350" y1="278" x2="350" y2="307" stroke="#A5C9CA" strokeWidth="1.5" />
                  <line x1="356" y1="278" x2="356" y2="307" stroke="#A5C9CA" strokeWidth="1.5" />
                  <text x="352" y="320" fill="#8E44AD" fontSize="8" fontWeight="bold" textAnchor="middle">F (WINCHE CTD)</text>
                </g>

                {/* B: GRUA-PESCANTE (CRANE 3000#) en Cda. 43 — Pluma orientada hacia PROA */}
                <g>
                  {/* Pedestal circular */}
                  <circle cx="410" cy="115" r="18" fill="#1B4F72" stroke="#F39C12" strokeWidth="2.5" />
                  <circle cx="410" cy="115" r="7" fill="#F39C12" />
                  {/* Pluma larga telescópica Crane 3000# trincada hacia PROA (hacia la derecha) */}
                  <line x1="410" y1="115" x2="600" y2="115" stroke="#F39C12" strokeWidth="5" strokeLinecap="round" />
                  <line x1="600" y1="115" x2="620" y2="115" stroke="#ffffff" strokeWidth="2" strokeDasharray="3 2" />
                  <circle cx="620" cy="115" r="3.5" fill="#E74C3C" />
                  <text x="515" y="105" fill="#F39C12" fontSize="9" fontWeight="bold" textAnchor="middle">
                    CRANE 3000# (B) ➔ PLUMA A PROA
                  </text>
                  {/* A: Control de grúa en Cda. 43 */}
                  <circle cx="400" cy="72" r="5" fill="#E74C3C" />
                  <text x="390" y="65" fill="#E74C3C" fontSize="8" fontWeight="bold">A (CONTROL)</text>
                </g>

                {/* D: COMPARTIMENTO DE LAVANDERIA (DVR, HSHR, LKR) */}
                <g>
                  <rect x="490" y="195" width="70" height="70" fill="#144272" stroke="#00D2D3" strokeWidth="1.5" />
                  <text x="525" y="225" fill="#00D2D3" fontSize="9" fontWeight="bold" textAnchor="middle">LAVANDERÍA</text>
                  <text x="525" y="240" fill="#A5C9CA" fontSize="8" textAnchor="middle">D (DVR/HSHR)</text>
                </g>

                {/* C: Escotilla de 36 x 48 */}
                <rect x="475" y="150" width="30" height="38" fill="#0A2647" stroke="#A5C9CA" strokeWidth="1" />
                <text x="490" y="172" fill="#A5C9CA" fontSize="8" textAnchor="middle">C</text>

                {/* Biblioteca (Library) hacia proa (Cda. 30 a 33) */}
                <g>
                  <rect x="585" y="70" width="95" height="110" fill="#0A2647" stroke="#2ECC71" strokeWidth="1.5" />
                  <text x="632" y="125" fill="#2ECC71" fontSize="10" fontWeight="bold" textAnchor="middle">
                    BIBLIOTECA
                  </text>
                  <text x="632" y="140" fill="#A5C9CA" fontSize="8" textAnchor="middle">
                    (LIBRARY / SALA)
                  </text>
                </g>

                {/* Escalera de bajada a Cubierta Principal (DN) */}
                <rect x="440" y="145" width="22" height="14" fill="#F39C12" opacity="0.8" />
                <text x="451" y="155" fill="#0A2647" fontSize="7" fontWeight="bold" textAnchor="middle">DN ▼</text>
              </g>
            )}

            {/* ════════════════════════════════════════════════════════════════════
                4. ZONAS OFICIALES INTERACTIVAS DE ESTIBA (CLIC / HOVER / EQUIPOS)
               ════════════════════════════════════════════════════════════════════ */}
            {zonesForCurrentDeck.map((zone) => {
              const { x, y, width, height } = zone.svgPos;
              const isSelected = selectedZoneId === zone.id;
              const isHovered = hoveredZoneId === zone.id;
              const items = itemsByZone[zone.id] || [];
              const zoneWeight = items.reduce((acc, i) => acc + Number(i.weight_tons || 0), 0);
              const isOverloaded = zoneWeight > zone.recLimitTons;

              return (
                <g
                  key={zone.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedZoneId(zone.id)}
                  onMouseEnter={() => setHoveredZoneId(zone.id)}
                  onMouseLeave={() => setHoveredZoneId(null)}
                >
                  {/* Recuadro de la zona oficial con rayado y borde */}
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    rx="6"
                    fill={
                      isSelected
                        ? 'rgba(0, 210, 211, 0.28)'
                        : isHovered
                        ? 'rgba(255, 255, 255, 0.20)'
                        : isOverloaded
                        ? 'rgba(231, 76, 60, 0.25)'
                        : items.length > 0
                        ? 'rgba(39, 174, 96, 0.20)'
                        : zone.id === 'AREA_A2'
                        ? 'url(#hatchA2)'
                        : zone.id === 'AREA_A3'
                        ? 'url(#hatchA3)'
                        : zone.id === 'AREA_A1'
                        ? 'url(#hatchA1)'
                        : zone.id === 'AREA_A4_POPA'
                        ? 'url(#hatchA4)'
                        : zone.id === 'AREA_A1_GRUA'
                        ? 'url(#hatchUpperGrua)'
                        : 'rgba(255, 255, 255, 0.06)'
                    }
                    stroke={
                      isOverloaded
                        ? '#E74C3C'
                        : isSelected
                        ? '#00D2D3'
                        : isHovered
                        ? '#ffffff'
                        : items.length > 0
                        ? '#2ECC71'
                        : zone.color
                    }
                    strokeWidth={isSelected ? '2.5' : isHovered ? '2' : '1.5'}
                    strokeDasharray={items.length > 0 ? 'none' : '4 3'}
                    filter={isSelected || isHovered ? 'url(#glowOfficial)' : undefined}
                  />

                  {/* Header / Rótulo oficial de la zona */}
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height="20"
                    rx="4"
                    fill={isOverloaded ? '#E74C3C' : zone.color}
                    opacity={0.92}
                  />
                  <text
                    x={x + width / 2}
                    y={y + 14}
                    fill="#ffffff"
                    fontSize="9.5"
                    fontWeight="bold"
                    textAnchor="middle"
                    fontFamily="sans-serif"
                  >
                    {zone.code}
                  </text>

                  {/* Detalle o estado de equipo dentro de la zona */}
                  {items.length === 0 ? (
                    <g opacity={0.75}>
                      <text
                        x={x + width / 2}
                        y={y + height / 2 + 6}
                        fill="#A5C9CA"
                        fontSize="10"
                        textAnchor="middle"
                        fontWeight="bold"
                      >
                        + DISPONIBLE
                      </text>
                      <text
                        x={x + width / 2}
                        y={y + height / 2 + 19}
                        fill="#ffffff"
                        fontSize="8.5"
                        textAnchor="middle"
                      >
                        (Máx: {zone.recLimitTons} t)
                      </text>
                    </g>
                  ) : (
                    <g>
                      {/* Bloque del equipo estibado */}
                      <rect
                        x={x + 5}
                        y={y + 26}
                        width={width - 10}
                        height={height - 32}
                        rx="4"
                        fill="rgba(10, 38, 71, 0.90)"
                        stroke={isOverloaded ? '#E74C3C' : '#27AE60'}
                        strokeWidth="1.2"
                      />

                      {/* Nombre recortado */}
                      <text
                        x={x + 9}
                        y={y + 42}
                        fill="#ffffff"
                        fontSize="9.5"
                        fontWeight="bold"
                      >
                        ⚙️ {items[0].item_name.slice(0, 15)}
                        {items[0].item_name.length > 15 ? '...' : ''}
                      </text>

                      {/* Peso y semáforo */}
                      <text
                        x={x + 9}
                        y={y + 57}
                        fill={isOverloaded ? '#FF6B6B' : '#2ECC71'}
                        fontSize="10.5"
                        fontWeight="bold"
                      >
                        {zoneWeight.toFixed(2)} t {isOverloaded ? '⚠️' : '✓'}
                      </text>

                      {/* Cantidad si hay más de uno */}
                      {items.length > 1 && (
                        <text
                          x={x + width - 10}
                          y={y + 57}
                          fill="#00D2D3"
                          fontSize="9"
                          textAnchor="end"
                          fontWeight="bold"
                        >
                          +{items.length - 1} más
                        </text>
                      )}

                      {/* ZG */}
                      <text
                        x={x + 9}
                        y={y + 71}
                        fill="#A5C9CA"
                        fontSize="8.5"
                      >
                        ZG: {( (activeDeck === 'CUBIERTA_PRINCIPAL' ? 4.95 : 7.04) + Number(items[0].zg_above_deck_m || 1.0) ).toFixed(2)} m
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* ── PANEL INFERIOR: ACCIONES Y DETALLE OFICIAL DE ZONA ── */}
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          {/* Columna Izquierda: Detalle de Zona Seleccionada */}
          <Col xs={24} md={14}>
            {activeZoneObj ? (
              <Card
                size="small"
                style={{
                  borderRadius: 10,
                  border: `2px solid ${activeZoneObj.color}`,
                  background: '#F9FBFD'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Space align="center">
                    <Badge color={activeZoneObj.color} />
                    <Text strong style={{ fontSize: 14, color: '#0A2647' }}>
                      {activeZoneObj.name}
                    </Text>
                    <Tag color="cyan">{activeZoneObj.frame}</Tag>
                  </Space>
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() =>
                      onOpenAddItem && onOpenAddItem(activeDeck, activeZoneObj.name)
                    }
                  >
                    Estibar aquí
                  </Button>
                </div>

                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
                  {activeZoneObj.desc} · Límite estructural de estudio: <b>{activeZoneObj.recLimitTons} t</b>
                </Text>

                {/* Lista de equipos en esta zona */}
                {(itemsByZone[activeZoneObj.id] || []).length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Esta zona se encuentra vacía. Puede colocar el equipo típico recomendado o estibar uno personalizado."
                    style={{ margin: '8px 0' }}
                  >
                    <Button
                      size="small"
                      type="dashed"
                      icon={<RocketOutlined />}
                      onClick={() =>
                        onAddPreset && onAddPreset({
                          ...activeZoneObj.defaultEquipment,
                          default_deck: activeDeck,
                          zone_code: activeZoneObj.name
                        })
                      }
                    >
                      Colocar equipo oficial sugerido: {activeZoneObj.defaultEquipment.item_name}
                    </Button>
                  </Empty>
                ) : (
                  <Space direction="vertical" style={{ width: '100%' }} size={6}>
                    {(itemsByZone[activeZoneObj.id] || []).map((item) => {
                      const zgBase = activeDeck === 'CUBIERTA_PRINCIPAL' ? 4.95 : 7.04;
                      const zgTot = zgBase + Number(item.zg_above_deck_m);
                      const momZ = Number(item.weight_tons) * zgTot;

                      return (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 12px',
                            background: '#ffffff',
                            borderRadius: 8,
                            border: '1px solid #E2E8F0',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                          }}
                        >
                          <div>
                            <Text strong style={{ color: '#0A2647' }}>{item.item_name}</Text>
                            <div style={{ fontSize: 11, color: '#7F8C8D', marginTop: 2 }}>
                              Peso: <b style={{ color: '#0A2647' }}>{Number(item.weight_tons).toFixed(2)} t</b> · ZG: <b>{zgTot.toFixed(2)} m</b> · Momento Z: <b>{momZ.toFixed(2)} t·m</b>
                              {item.notes && <span> · ({item.notes})</span>}
                            </div>
                          </div>

                          <Space size={4}>
                            <Tooltip title="Editar especificaciones">
                              <Button
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => onOpenEditItem && onOpenEditItem(item)}
                              />
                            </Tooltip>
                            <Popconfirm
                              title="¿Desestibar y retirar este equipo?"
                              onConfirm={() => onDeleteItem && onDeleteItem(item.id)}
                            >
                              <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Space>
                        </div>
                      );
                    })}
                  </Space>
                )}
              </Card>
            ) : (
              <Card size="small" style={{ borderRadius: 10, background: '#F8FAFC', textAlign: 'center', padding: '16px 0' }}>
                <CompassOutlined style={{ fontSize: 32, color: '#00D2D3', marginBottom: 8 }} />
                <Title level={5} style={{ margin: 0, color: '#0A2647' }}>
                  Seleccione un área de carga en el plano
                </Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Haga clic en cualquiera de las zonas acotadas para consultar detalles, verificar límites o estibar instrumental oceanográfico.
                </Text>
              </Card>
            )}
          </Col>

          {/* Columna Derecha: Equipos Típicos / Shelf de Carga */}
          <Col xs={24} md={10}>
            <Card
              size="small"
              title={
                <Space>
                  <RocketOutlined style={{ color: '#00D2D3' }} />
                  <span>
                    Equipos Oceanográficos para {activeDeck === 'CUBIERTA_PRINCIPAL' ? 'Cubierta Principal' : 'Cubierta Superior'}
                  </span>
                </Space>
              }
              style={{ borderRadius: 10, height: '100%' }}
            >
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                Haga clic para colocar el equipo instantáneamente en su área de trabajo:
              </Text>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {presetEquipment
                  .filter((p) => p.default_deck === activeDeck)
                  .map((preset, idx) => (
                    <Button
                      key={idx}
                      size="small"
                      style={{
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        height: 34,
                        borderRadius: 6
                      }}
                      onClick={() => onAddPreset && onAddPreset(preset)}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 195 }}>
                        ➕ {preset.item_name}
                      </span>
                      <Tag color="blue" style={{ margin: 0, fontWeight: 600 }}>
                        {preset.weight_tons} t
                      </Tag>
                    </Button>
                  ))}
              </div>
            </Card>
          </Col>
        </Row>
      </Card>
    </div>
  );
}
