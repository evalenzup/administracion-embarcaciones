/**
 * SIAE — Página de Cruceros.
 * Planes de crucero con mapa Leaflet para visualizar waypoints.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker,
  Typography, Card, message, Popconfirm, Tooltip, Row, Col, Statistic,
  InputNumber, Divider, Badge, Drawer, Tabs, Checkbox, Steps, Alert,
  Upload, Switch, Segmented, Spin,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  EnvironmentOutlined, CompassOutlined, AimOutlined, TeamOutlined,
  FilePdfOutlined, FileWordOutlined, CheckOutlined, CloseOutlined,
  DownOutlined, RightOutlined, ExperimentOutlined, InfoCircleOutlined,
  UploadOutlined, LoadingOutlined, DollarOutlined, SyncOutlined, CheckCircleOutlined,
  EyeOutlined, ArrowUpOutlined, ArrowDownOutlined, DownloadOutlined,
  SaveOutlined, ArrowRightOutlined
} from '@ant-design/icons';
import {
  MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap, Tooltip as MapTooltip
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import dayjs from 'dayjs';
import JSZip from 'jszip';
import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer';
import apiClient from '../../api/client';
import { CanAccess } from '../../components/common/CanAccess';
import { useAuth } from '../../context/AuthContext';
import ParticipantsDrawer from './ParticipantsDrawer';
import { CampaignPlanDocument } from './CampaignPlanDocument';
import CruiseWeatherReportDocument from './CruiseWeatherReportDocument';
import { BillingFormModal, CLIENT_TYPE_LABELS, STATUS_CONFIG } from '../Billing/BillingPage';
import CruiseTelemetryCharts from '../../components/Cruises/CruiseTelemetryCharts';

const { Title, Text, Paragraph } = Typography;
const { Search, TextArea } = Input;

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
const scienceIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
});
const warningIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
});

const STATUS_MAP = {
  borrador: { label: 'Borrador', color: '#D4AC0D', badge: 'warning' },
  pendiente: { label: 'Pendiente', color: '#8E44AD', badge: 'warning' },
  planificado: { label: 'Planificado', color: '#1677FF', badge: 'processing' },
  en_curso: { label: 'En Curso', color: '#52C41A', badge: 'success' },
  completado: { label: 'Completado', color: '#7F8C8D', badge: 'default' },
  cancelado: { label: 'Cancelado', color: '#F5222D', badge: 'error' },
};

const BILLING_STATUS_MAP = {
  por_cobrar: { label: 'Por Cobrar', color: 'warning', icon: <SyncOutlined spin /> },
  cobrado: { label: 'Cobrado', color: 'processing', icon: <CheckCircleOutlined /> },
  transferido: { label: 'Transferido', color: 'success', icon: <CheckCircleOutlined /> }
};

// Componente para agregar waypoints haciendo click en el mapa
function MapClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng) });
  return null;
}

// Componente para centrar el mapa y arreglar el tamaño en modales de antd
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
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
        }
        hasFittedRef.current = true;
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [map, waypoints, modalReady, departurePort, returnPort]);

  useEffect(() => {
    if (modalReady) {
      const timer = setTimeout(() => {
        map.invalidateSize();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [map, modalReady]);

  return null;
}

// Componente para volar hacia un punto específico cuando se hace clic en la tarjeta
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

// ── Modal del mapa de waypoints ──────────────────────────────

// ── Utilidades GPX ───────────────────────────────────────────

/** Calcula estadísticas resumidas de un array de puntos GPX [{lat, lon, time}] */
function calcGpxStats(track) {
  if (!track || track.length < 2) return null;
  let totalMeters = 0;
  for (let i = 1; i < track.length; i++) {
    const p1 = L.latLng(track[i - 1].lat, track[i - 1].lon);
    const p2 = L.latLng(track[i].lat, track[i].lon);
    totalMeters += p1.distanceTo(p2);
  }
  const distanceNm = totalMeters / 1852;

  const withTime = track.filter(p => p.time);
  let durationMinutes = null, startTime = null, endTime = null;
  let avgSpeedKnots = null, maxSpeedKnots = 0;

  if (withTime.length >= 2) {
    startTime = new Date(withTime[0].time);
    endTime = new Date(withTime[withTime.length - 1].time);
    durationMinutes = Math.round((endTime - startTime) / 60000);
    if (durationMinutes > 0) avgSpeedKnots = distanceNm / (durationMinutes / 60);

    for (let i = 1; i < track.length; i++) {
      if (!track[i - 1].time || !track[i].time) continue;
      const dt = (new Date(track[i].time) - new Date(track[i - 1].time)) / 3600000;
      if (dt <= 0) continue;
      const dist = L.latLng(track[i - 1].lat, track[i - 1].lon)
        .distanceTo(L.latLng(track[i].lat, track[i].lon)) / 1852;
      const spd = dist / dt;
      if (spd > maxSpeedKnots && spd < 40) maxSpeedKnots = spd; // filtrar artefactos GPS
    }
  }

  return { distanceNm, durationMinutes, startTime, endTime, avgSpeedKnots, maxSpeedKnots };
}

/** Selecciona N puntos a intervalos de tiempo iguales a lo largo del track */
function getHourlyMilestones(track, maxMarkers = 8) {
  if (!track || track.length < 2) return [];
  const withTime = track.filter(p => p.time);
  if (withTime.length < 2) return [];
  const totalMs = new Date(withTime[withTime.length - 1].time) - new Date(withTime[0].time);
  if (totalMs <= 0) return [];
  const intervalMs = totalMs / (maxMarkers + 1);
  const result = [];
  let nextTarget = new Date(withTime[0].time).getTime() + intervalMs;
  for (const pt of withTime) {
    const t = new Date(pt.time).getTime();
    if (t >= nextTarget) {
      result.push({ ...pt, _label: result.length + 1 });
      nextTarget += intervalMs;
      if (result.length >= maxMarkers) break;
    }
  }
  return result;
}

/** Ícono circular pequeño naranja para marcadores de hito del track GPX */
const makeMilestoneIcon = (label) => L.divIcon({
  className: '',
  html: `<div style="width:22px;height:22px;background:#FF6B00;border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.4)">${label}</div>`,
  iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -14],
});

/** Polyline naranja con click + marcadores de hito */
function GpxTrackLayer({ track, show, onCreateLogbook }) {
  const [clickedInfo, setClickedInfo] = useState(null);
  const milestones = getHourlyMilestones(track, 8);

  const handlePolylineClick = (e) => {
    if (e.originalEvent) {
      L.DomEvent.stopPropagation(e.originalEvent);
    }
    // Encontrar el punto más cercano al click
    let minDist = Infinity;
    let nearest = null;
    for (const pt of track) {
      const d = L.latLng(pt.lat, pt.lon).distanceTo(e.latlng);
      if (d < minDist) { minDist = d; nearest = pt; }
    }
    if (nearest) setClickedInfo({ point: nearest, latlng: e.latlng });
  };

  if (!show || !track || track.length < 2) return null;

  return (
    <>
      <Polyline
        positions={track.map(p => [p.lat, p.lon])}
        color="#FF6B00" weight={3} opacity={0.9}
        eventHandlers={{ click: handlePolylineClick }}
        pathOptions={{ cursor: 'crosshair' }}
      />
      {/* Marcadores de hito */}
      {milestones.map((m, i) => (
        <Marker key={`ms-${i}`} position={[m.lat, m.lon]} icon={makeMilestoneIcon(m._label)}>
          <Popup>
            <div style={{ fontSize: 12, minWidth: 140 }}>
              <div style={{ fontWeight: 700, color: '#FF6B00', marginBottom: 4 }}>⏱ Hito {m._label}</div>
              {m.time && <div>🕐 {new Date(m.time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div>}
              <div style={{ fontSize: 10, color: '#888', marginTop: 3 }}>
                {m.lat.toFixed(5)}, {m.lon.toFixed(5)}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
      {/* Marcadores de inicio/fin */}
      <Marker position={[track[0].lat, track[0].lon]} icon={L.divIcon({
        className: '', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -10],
        html: '<div style="width:16px;height:16px;background:#52C41A;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>',
      })}>
        <Popup><div style={{ fontSize: 12 }}><strong style={{ color: '#52C41A' }}>▶ Inicio</strong>{track[0].time && <div>🕐 {new Date(track[0].time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div>}</div></Popup>
      </Marker>
      <Marker position={[track[track.length - 1].lat, track[track.length - 1].lon]} icon={L.divIcon({
        className: '', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -10],
        html: '<div style="width:16px;height:16px;background:#F5222D;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>',
      })}>
        <Popup><div style={{ fontSize: 12 }}><strong style={{ color: '#F5222D' }}>⏹ Fin</strong>{track[track.length - 1].time && <div>🕐 {new Date(track[track.length - 1].time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div>}</div></Popup>
      </Marker>
      {/* Popup al hacer click en la línea */}
      {clickedInfo && (
        <Popup position={[clickedInfo.latlng.lat, clickedInfo.latlng.lng]} onClose={() => setClickedInfo(null)}>
          <div style={{ fontSize: 12, minWidth: 160 }}>
            <div style={{ fontWeight: 700, color: '#FF6B00', marginBottom: 4 }}>📍 Punto del Track</div>
            {clickedInfo.point.time && (
              <div>🕐 {new Date(clickedInfo.point.time).toLocaleString('es-MX', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })}</div>
            )}
            <div style={{ fontSize: 10, color: '#888', marginTop: 3 }}>
              Lat: {clickedInfo.point.lat.toFixed(5)}<br />
              Lon: {clickedInfo.point.lon.toFixed(5)}
            </div>
            {onCreateLogbook && (
              <Button
                type="primary"
                size="small"
                style={{ width: '100%', marginTop: 8, fontSize: 10, height: 24, background: '#2C3E50', borderColor: '#2C3E50', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => {
                  onCreateLogbook(clickedInfo.point);
                  setClickedInfo(null);
                }}
              >
                📝 Registrar en Bitácora
              </Button>
            )}
          </div>
        </Popup>
      )}
    </>
  );
}

/** Convierte dirección en grados a texto descriptivo y punto cardinal */
function getWindDirectionText(deg) {
  if (deg == null) return '—';
  const normalized = (deg % 360 + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  const directions = [
    { name: 'Norte', abbr: 'N' },
    { name: 'Norte-Noreste', abbr: 'NNE' },
    { name: 'Noreste', abbr: 'NE' },
    { name: 'Este-Noreste', abbr: 'ENE' },
    { name: 'Este', abbr: 'E' },
    { name: 'Este-Sureste', abbr: 'ESE' },
    { name: 'Sureste', abbr: 'SE' },
    { name: 'Sur-Sureste', abbr: 'SSE' },
    { name: 'Sur', abbr: 'S' },
    { name: 'Sur-Suroeste', abbr: 'SSW' },
    { name: 'Suroeste', abbr: 'SW' },
    { name: 'Oeste-Suroeste', abbr: 'WSW' },
    { name: 'Oeste', abbr: 'W' },
    { name: 'Oeste-Noroeste', abbr: 'WNW' },
    { name: 'Noroeste', abbr: 'NW' },
    { name: 'Norte-Noroeste', abbr: 'NNW' }
  ];
  return `${directions[index].name} (${directions[index].abbr})`;
}

/** Calcula estadísticas resumidas de un array de registros de telemetría */
function calcTelemetryStats(track) {
  if (!track || track.length < 2) return null;
  
  // Filtrar registros válidos con latitud/longitud
  const validPts = track.filter(p => p.latitude != null && p.longitude != null && (p.latitude !== 0 || p.longitude !== 0));
  if (validPts.length < 2) return null;

  let totalMeters = 0;
  for (let i = 1; i < validPts.length; i++) {
    const p1 = L.latLng(validPts[i - 1].latitude, validPts[i - 1].longitude);
    const p2 = L.latLng(validPts[i].latitude, validPts[i].longitude);
    totalMeters += p1.distanceTo(p2);
  }
  const distanceNm = totalMeters / 1852;

  const startTime = new Date(validPts[0].timestamp);
  const endTime = new Date(validPts[validPts.length - 1].timestamp);
  const durationMinutes = Math.round((endTime - startTime) / 60000);
  let avgSpeedKnots = null, maxSpeedKnots = 0;

  if (durationMinutes > 0) {
    avgSpeedKnots = distanceNm / (durationMinutes / 60);
  }

  // Calcular velocidad máxima entre puntos GPS consecutivos
  for (let i = 1; i < validPts.length; i++) {
    const dt = (new Date(validPts[i].timestamp) - new Date(validPts[i - 1].timestamp)) / 3600000;
    if (dt <= 0) continue;
    const dist = L.latLng(validPts[i - 1].latitude, validPts[i - 1].longitude)
      .distanceTo(L.latLng(validPts[i].latitude, validPts[i].longitude)) / 1852;
    const spd = dist / dt;
    if (spd > maxSpeedKnots && spd < 40) maxSpeedKnots = spd; // Filtrar anomalías del GPS
  }

  // Calcular estadísticas del clima/meteorología
  let totalTemp = 0, minTemp = Infinity, maxTemp = -Infinity, countTemp = 0;
  let totalWind = 0, maxWind = 0, countWind = 0, maxWindDir = null;
  let totalPressure = 0, minPressure = Infinity, maxPressure = -Infinity, countPressure = 0;
  let sumCos = 0, sumSin = 0, countWindDir = 0;

  for (const pt of track) {
    if (pt.temp != null) {
      totalTemp += pt.temp;
      if (pt.temp < minTemp) minTemp = pt.temp;
      if (pt.temp > maxTemp) maxTemp = pt.temp;
      countTemp++;
    }
    const wind = pt.wind_speed_corr != null ? pt.wind_speed_corr : pt.wind_speed;
    const windDir = pt.wind_dir_corr != null ? pt.wind_dir_corr : pt.wind_dir;
    if (wind != null) {
      const windKts = wind * 1.94384;
      totalWind += windKts;
      if (windKts > maxWind) {
        maxWind = windKts;
        maxWindDir = windDir;
      }
      countWind++;
    }
    if (windDir != null) {
      const rad = windDir * Math.PI / 180;
      sumCos += Math.cos(rad);
      sumSin += Math.sin(rad);
      countWindDir++;
    }
    if (pt.pressure != null) {
      totalPressure += pt.pressure;
      if (pt.pressure < minPressure) minPressure = pt.pressure;
      if (pt.pressure > maxPressure) maxPressure = pt.pressure;
      countPressure++;
    }
  }

  let avgWindDir = null;
  if (countWindDir > 0) {
    const avgRad = Math.atan2(sumSin / countWindDir, sumCos / countWindDir);
    avgWindDir = avgRad * 180 / Math.PI;
    if (avgWindDir < 0) avgWindDir += 360;
  }

  return {
    distanceNm,
    durationMinutes,
    startTime,
    endTime,
    avgSpeedKnots,
    maxSpeedKnots,
    avgTemp: countTemp > 0 ? totalTemp / countTemp : null,
    minTemp: countTemp > 0 ? minTemp : null,
    maxTemp: countTemp > 0 ? maxTemp : null,
    avgWind: countWind > 0 ? totalWind / countWind : null,
    maxWind: countWind > 0 ? maxWind : null,
    maxWindDir,
    avgWindDir,
    avgPressure: countPressure > 0 ? totalPressure / countPressure : null,
    minPressure: countPressure > 0 ? minPressure : null,
    maxPressure: countPressure > 0 ? maxPressure : null,
  };
}

/** Ícono circular celeste/verde azulado para marcadores de hito de telemetría */
const makeTelemetryMilestoneIcon = (label) => L.divIcon({
  className: '',
  html: `<div style="width:22px;height:22px;background:#13C2C2;border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.4)">${label}</div>`,
  iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -14],
});

/** Polyline celeste/verde azulado con hitos interactivos de telemetría */
function TelemetryTrackLayer({ track, show }) {
  const [clickedInfo, setClickedInfo] = useState(null);

  if (!show || !track || track.length < 2) return null;

  // Filtrar registros válidos
  const validTrack = track.filter(p => p.latitude != null && p.longitude != null && (p.latitude !== 0 || p.longitude !== 0));
  if (validTrack.length < 2) return null;

  // Obtener hitos espaciados uniformemente en tiempo
  const getTelemetryMilestones = (tList, maxMarkers = 8) => {
    const totalMs = new Date(tList[tList.length - 1].timestamp) - new Date(tList[0].timestamp);
    if (totalMs <= 0) return [];
    const intervalMs = totalMs / (maxMarkers + 1);
    const result = [];
    let nextTarget = new Date(tList[0].timestamp).getTime() + intervalMs;
    for (let i = 0; i < tList.length; i++) {
      const pt = tList[i];
      const t = new Date(pt.timestamp).getTime();
      if (t >= nextTarget) {
        let speedKnots = null;
        if (i > 0) {
          const prev = tList[i - 1];
          const dtHours = (t - new Date(prev.timestamp).getTime()) / 3600000;
          if (dtHours > 0) {
            const distNm = L.latLng(prev.latitude, prev.longitude).distanceTo(L.latLng(pt.latitude, pt.longitude)) / 1852;
            speedKnots = distNm / dtHours;
          }
        }
        result.push({ ...pt, _label: result.length + 1, _speedKnots: speedKnots });
        nextTarget += intervalMs;
        if (result.length >= maxMarkers) break;
      }
    }
    return result;
  };

  const milestones = getTelemetryMilestones(validTrack, 8);

  const handlePolylineClick = (e) => {
    if (e.originalEvent) {
      L.DomEvent.stopPropagation(e.originalEvent);
    }
    // Encontrar el punto más cercano al click
    let minDist = Infinity;
    let nearest = null;
    for (const pt of validTrack) {
      const d = L.latLng(pt.latitude, pt.longitude).distanceTo(e.latlng);
      if (d < minDist) { minDist = d; nearest = pt; }
    }
    if (nearest) {
      let speedKnots = null;
      const idx = validTrack.indexOf(nearest);
      if (idx > 0) {
        const prev = validTrack[idx - 1];
        const dtHours = (new Date(nearest.timestamp) - new Date(prev.timestamp)) / 3600000;
        if (dtHours > 0) {
          const distNm = L.latLng(prev.latitude, prev.longitude).distanceTo(L.latLng(nearest.latitude, nearest.longitude)) / 1852;
          speedKnots = distNm / dtHours;
        }
      }
      setClickedInfo({ point: nearest, latlng: e.latlng, speedKnots });
    }
  };

  return (
    <>
      <Polyline
        positions={validTrack.map(p => [p.latitude, p.longitude])}
        color="#13C2C2" weight={3} opacity={0.9}
        eventHandlers={{ click: handlePolylineClick }}
        pathOptions={{ cursor: 'crosshair' }}
      />
      {/* Marcadores de hito */}
      {milestones.map((m, i) => {
        const wind = m.wind_speed_corr != null ? m.wind_speed_corr : m.wind_speed;
        const windKts = wind != null ? wind * 1.94384 : null;
        const windDir = m.wind_dir_corr != null ? m.wind_dir_corr : m.wind_dir;
        return (
          <Marker key={`tel-ms-${i}`} position={[m.latitude, m.longitude]} icon={makeTelemetryMilestoneIcon(m._label)}>
            <Popup>
              <div style={{ fontSize: 12, minWidth: 175 }}>
                <div style={{ fontWeight: 700, color: '#13C2C2', marginBottom: 4 }}>📡 Hito de Telemetría {m._label}</div>
                <div>🕐 {new Date(m.timestamp).toLocaleString('es-MX', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })}</div>
                <div style={{ margin: '4px 0', borderTop: '1px solid #eee', paddingTop: 4 }}>
                  🚢 <b>Vel. Barco:</b> {m._speedKnots != null ? `${m._speedKnots.toFixed(1)} kt` : '—'}<br />
                  💨 <b>Viento:</b> {windKts != null ? `${windKts.toFixed(1)} kt` : '—'}{windDir != null ? ` (${Math.round(windDir)}° ${getWindDirectionText(windDir)})` : ''}<br />
                  🌡️ <b>Temp:</b> {m.temp != null ? `${m.temp.toFixed(1)}°C` : '—'}<br />
                  💧 <b>Humedad:</b> {m.humidity != null ? `${Math.round(m.humidity)}%` : '—'}<br />
                  📐 <b>Presión:</b> {m.pressure != null ? `${m.pressure.toFixed(1)} hPa` : '—'}
                </div>
                <div style={{ fontSize: 10, color: '#888', borderTop: '1px solid #eee', paddingTop: 4 }}>
                  Lat: {m.latitude.toFixed(5)}, Lon: {m.longitude.toFixed(5)}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
      {/* Marcadores de inicio/fin */}
      <Marker position={[validTrack[0].latitude, validTrack[0].longitude]} icon={L.divIcon({
        className: '', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -10],
        html: '<div style="width:16px;height:16px;background:#52C41A;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>',
      })}>
        <Popup>
          <div style={{ fontSize: 12 }}>
            <strong style={{ color: '#52C41A' }}>▶ Inicio Telemetría</strong>
            <div>🕐 {new Date(validTrack[0].timestamp).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </Popup>
      </Marker>
      <Marker position={[validTrack[validTrack.length - 1].latitude, validTrack[validTrack.length - 1].longitude]} icon={L.divIcon({
        className: '', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -10],
        html: '<div style="width:16px;height:16px;background:#F5222D;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>',
      })}>
        <Popup>
          <div style={{ fontSize: 12 }}>
            <strong style={{ color: '#F5222D' }}>⏹ Fin Telemetría</strong>
            <div>🕐 {new Date(validTrack[validTrack.length - 1].timestamp).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </Popup>
      </Marker>
      {/* Popup al hacer click en la línea */}
      {clickedInfo && (() => {
        const pt = clickedInfo.point;
        const wind = pt.wind_speed_corr != null ? pt.wind_speed_corr : pt.wind_speed;
        const windKts = wind != null ? wind * 1.94384 : null;
        const windDir = pt.wind_dir_corr != null ? pt.wind_dir_corr : pt.wind_dir;
        return (
          <Popup position={[clickedInfo.latlng.lat, clickedInfo.latlng.lng]} onClose={() => setClickedInfo(null)}>
            <div style={{ fontSize: 12, minWidth: 175 }}>
              <div style={{ fontWeight: 700, color: '#13C2C2', marginBottom: 4 }}>📡 Punto de Telemetría</div>
              <div>🕐 {new Date(pt.timestamp).toLocaleString('es-MX', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })}</div>
              <div style={{ margin: '4px 0', borderTop: '1px solid #eee', paddingTop: 4 }}>
                🚢 <b>Vel. Barco:</b> {clickedInfo.speedKnots != null ? `${clickedInfo.speedKnots.toFixed(1)} kt` : '—'}<br />
                💨 <b>Viento:</b> {windKts != null ? `${windKts.toFixed(1)} kt` : '—'}{windDir != null ? ` (${Math.round(windDir)}° ${getWindDirectionText(windDir)})` : ''}<br />
                🌡️ <b>Temp:</b> {pt.temp != null ? `${pt.temp.toFixed(1)}°C` : '—'}<br />
                💧 <b>Humedad:</b> {pt.humidity != null ? `${Math.round(pt.humidity)}%` : '—'}<br />
                📐 <b>Presión:</b> {pt.pressure != null ? `${pt.pressure.toFixed(1)} hPa` : '—'}
              </div>
              <div style={{ fontSize: 10, color: '#888', borderTop: '1px solid #eee', paddingTop: 4 }}>
                Lat: {pt.latitude.toFixed(5)}<br />
                Lon: {pt.longitude.toFixed(5)}
              </div>
            </div>
          </Popup>
        );
      })()}
    </>
  );
}

function UnsavedCruiseNotice({ tabTitle, description, onSave, saving }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '48px 24px',
      background: 'linear-gradient(135deg, #f8fafd 0%, #f0f5ff 100%)',
      borderRadius: 12,
      border: '1px dashed #adc6ff',
      margin: '20px 0',
      boxShadow: '0 2px 8px rgba(0, 32, 96, 0.04)'
    }}>
      <div style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: '#e6f4ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 16px',
        border: '1px solid #91caff'
      }}>
        <CompassOutlined style={{ fontSize: 28, color: '#1677ff' }} />
      </div>
      <Title level={4} style={{ color: '#0A2647', marginBottom: 8 }}>
        {tabTitle}
      </Title>
      <Paragraph type="secondary" style={{ maxWidth: 540, margin: '0 auto 20px', fontSize: 13, lineHeight: '1.6' }}>
        {description}
      </Paragraph>
      <Button
        type="primary"
        size="large"
        loading={saving}
        icon={<SaveOutlined />}
        onClick={onSave}
        style={{
          background: '#0A2647',
          borderColor: '#0A2647',
          fontWeight: 600,
          borderRadius: 8,
          height: 40,
          padding: '0 24px'
        }}
      >
        Guardar Datos y Habilitar Pestaña
      </Button>
    </div>
  );
}

function WaypointMapModal({ cruise, open, onClose, onSave, onConfigureSamples, inline = false, defaultDepartureDate = null }) {
  const [waypoints, setWaypoints] = useState([]);
  const [saving, setSaving] = useState(false);
  const [activeWaypoint, setActiveWaypoint] = useState(null);
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [showAddSampleForm, setShowAddSampleForm] = useState(false);
  const [modalReady, setModalReady] = useState(false);
  const [newSample, setNewSample] = useState({
    variable_name: '',
    sampling_order: 1,
    responsible_name: '',
    volume_needed: '',
    depth_surface: false,
    depth_mid_water: false,
    depth_bottom: false,
    depth_custom: '',
    notes: '',
  });

  const markerRefs = useRef({});
  const maxSpeed = cruise?.vessel?.max_speed_knots || null;

  // ── Estados de Pronóstico Meteorológico y Ruteo Espacio-Temporal ──
  // Determinar la fecha y hora almacenada en Datos Generales (departure_date)
  const getSavedDeparture = useCallback(() => {
    if (defaultDepartureDate && dayjs(defaultDepartureDate).isValid()) {
      return dayjs(defaultDepartureDate);
    }
    if (cruise?.departure_date && dayjs(cruise.departure_date).isValid()) {
      return dayjs(cruise.departure_date);
    }
    if (cruise?.start_date && dayjs(cruise.start_date).isValid()) {
      return dayjs(cruise.start_date);
    }
    return null;
  }, [cruise?.departure_date, cruise?.start_date, defaultDepartureDate]);

  const [departureDatetime, setDepartureDatetime] = useState(() => {
    const saved = getSavedDeparture();
    return saved || dayjs().hour(8).minute(0).second(0);
  });
  const [defaultSpeedKnots, setDefaultSpeedKnots] = useState(() => {
    return cruise?.vessel?.max_speed_knots ? Math.min(cruise.vessel.max_speed_knots, 10.0) : 10.0;
  });
  const [defaultDurationHours, setDefaultDurationHours] = useState(1.5);
  const [weatherModel, setWeatherModel] = useState(() => {
    const vesselName = (cruise?.vessel?.name || '').toLowerCase();
    return vesselName.includes('rigel') ? 'ecmwf' : 'gfs';
  });
  const [routeForecast, setRouteForecast] = useState(null);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState('points'); // 'points' | 'itinerary'
  const [weatherReportModalOpen, setWeatherReportModalOpen] = useState(false);

  // Si la embarcación es La Rigel, predeterminar automáticamente modelo ECMWF
  useEffect(() => {
    if (cruise?.vessel?.name) {
      const vName = cruise.vessel.name.toLowerCase();
      if (vName.includes('rigel')) {
        setWeatherModel('ecmwf');
      }
    }
  }, [cruise?.vessel?.name]);

  // Consulta al backend para calcular cronología y cruzar con mallas meteorológicas (GFS/WW3 o ECMWF IFS)
  const fetchRouteForecast = useCallback(async (wpList, depDt, defSpeed, defDur, model) => {
    const list = (wpList || waypoints).filter(
      w => w.latitude != null && w.longitude != null && isFinite(w.latitude) && isFinite(w.longitude)
    );
    if (list.length === 0) {
      setRouteForecast(null);
      return;
    }

    setLoadingForecast(true);
    try {
      const payload = {
        departure_datetime: (depDt || departureDatetime).toISOString(),
        default_speed_knots: Number(defSpeed || defaultSpeedKnots) || 10.0,
        default_duration_hours: Number(defDur || defaultDurationHours) || 1.0,
        model: model || weatherModel,
        waypoints: list.map((w, idx) => ({
          order_index: idx,
          name: w.name || `Estación ${idx + 1}`,
          latitude: Number(w.latitude),
          longitude: Number(w.longitude),
          speed_knots: w.speed_knots ? Number(w.speed_knots) : (Number(defSpeed || defaultSpeedKnots) || 10.0),
          duration_hours: w.duration_hours !== undefined && w.duration_hours !== null && w.duration_hours !== ''
            ? Number(w.duration_hours)
            : (Number(defDur || defaultDurationHours) || 1.0),
          activity: w.activity,
        })),
      };

      const res = await apiClient.post('/weather/route-forecast', payload);
      setRouteForecast(res.data);
    } catch {
      // Ignorar error si no hay datos
    } finally {
      setLoadingForecast(false);
    }
  }, [waypoints, departureDatetime, defaultSpeedKnots, defaultDurationHours, weatherModel]);

  // Actualizar automáticamente el pronóstico al cambiar waypoints o parámetros
  useEffect(() => {
    const validCount = waypoints.filter(w => w.latitude != null && w.longitude != null && isFinite(w.latitude) && isFinite(w.longitude)).length;
    if (validCount > 0) {
      const timer = setTimeout(() => {
        fetchRouteForecast(waypoints, departureDatetime, defaultSpeedKnots, defaultDurationHours, weatherModel);
      }, 400);
      return () => clearTimeout(timer);
    } else {
      setRouteForecast(null);
    }
  }, [waypoints, departureDatetime, defaultSpeedKnots, defaultDurationHours, weatherModel, fetchRouteForecast]);

  const resetNewSample = () => {
    setNewSample({
      variable_name: '',
      sampling_order: 1,
      responsible_name: '',
      volume_needed: '',
      depth_surface: false,
      depth_mid_water: false,
      depth_bottom: false,
      depth_custom: '',
      notes: '',
    });
  };

  useEffect(() => {
    if ((open || inline) && cruise) {
      setWaypoints(
        (cruise.waypoints || []).filter(
          w => w.latitude != null && w.longitude != null &&
               isFinite(w.latitude) && isFinite(w.longitude)
        )
      );

      // Cargar por defecto la fecha y hora guardada en Datos Generales
      const saved = getSavedDeparture();
      if (saved) {
        setDepartureDatetime(saved);
      }
    }
  }, [open, inline, cruise?.id, cruise?.departure_date, cruise?.start_date, defaultDepartureDate, getSavedDeparture]);

  useEffect(() => {
    if (inline) {
      setModalReady(true);
    } else if (!open) {
      setModalReady(false);
    }
  }, [open, inline]);

  useEffect(() => {
    setShowAddSampleForm(false);
    resetNewSample();
  }, [expandedIndex]);

  useEffect(() => {
    if (expandedIndex !== null && expandedIndex !== undefined && expandedIndex !== -1 && modalReady) {
      focusOnMap(expandedIndex);
    }
  }, [expandedIndex, modalReady]);

  const handleMapClick = ({ lat, lng }) => {
    const idx = waypoints.length;
    setWaypoints(prev => [...prev, {
      order_index: idx,
      latitude: parseFloat(lat.toFixed(5)),
      longitude: parseFloat(lng.toFixed(5)),
      name: `Waypoint ${idx + 1}`,
      waypoint_type: idx === 0 ? 'salida' : 'estacion',
      speed_knots: null,
      activity: '',
      duration_hours: null,
    }]);
  };

  const handleKmlUpload = async (file) => {
    const cleanHtmlText = (html) => {
      if (!html) return '';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      let text = doc.body.textContent || '';
      text = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
      return text;
    };

    try {
      let kmlText = '';
      const fileName = file.name || 'archivo';
      const isKmz = fileName.toLowerCase().endsWith('.kmz');

      if (isKmz) {
        // Descomprimir archivo KMZ (ZIP)
        const buffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buffer);

        // Buscar archivos .kml dentro del KMZ (preferir doc.kml)
        const kmlFileNames = Object.keys(zip.files).filter(name => name.toLowerCase().endsWith('.kml'));
        if (kmlFileNames.length === 0) {
          message.error('El archivo KMZ no contiene ningún archivo KML válido en su interior.');
          return;
        }

        const targetKmlName = kmlFileNames.find(n => n.toLowerCase() === 'doc.kml') || kmlFileNames[0];
        kmlText = await zip.files[targetKmlName].async('text');
      } else {
        // Archivo KML directo en texto plano
        kmlText = await file.text();
      }

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(kmlText, 'text/xml');

      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        message.error('El archivo KML/KMZ no es válido o tiene errores de estructura XML.');
        return;
      }

      const placemarks = xmlDoc.getElementsByTagName('Placemark');
      if (placemarks.length === 0) {
        message.warning('No se encontraron puntos de ruta (Placemarks) en el archivo KML/KMZ.');
        return;
      }

      const parsedWaypoints = [];
      let orderIdx = 0;

      for (let i = 0; i < placemarks.length; i++) {
        const pm = placemarks[i];
        const nameEl = pm.getElementsByTagName('name')[0];
        const name = nameEl ? nameEl.textContent.trim() : `Estación ${i + 1}`;

        // Parsear descripción y limpiar etiquetas HTML
        let descText = '';
        const descEl = pm.getElementsByTagName('description')[0];
        if (descEl) {
          descText = cleanHtmlText(descEl.textContent);
        }

        // Parsear ExtendedData si existe
        const extendedEl = pm.getElementsByTagName('ExtendedData')[0];
        if (extendedEl) {
          const extParts = [];
          const dataNodes = extendedEl.getElementsByTagName('Data');
          for (let d = 0; d < dataNodes.length; d++) {
            const node = dataNodes[d];
            const dataName = node.getAttribute('name');
            const valEl = node.getElementsByTagName('value')[0];
            if (dataName && valEl) {
              extParts.push(`${dataName}: ${valEl.textContent.trim()}`);
            }
          }
          const simpleDataNodes = extendedEl.getElementsByTagName('SimpleData');
          for (let s = 0; s < simpleDataNodes.length; s++) {
            const node = simpleDataNodes[s];
            const dataName = node.getAttribute('name');
            if (dataName) {
              extParts.push(`${dataName}: ${node.textContent.trim()}`);
            }
          }
          if (extParts.length > 0) {
            const extStr = extParts.join(' | ');
            descText = descText ? `${descText} (${extStr})` : extStr;
          }
        }

        // Truncar para cumplir con límite de la base de datos (max 300 caracteres)
        if (descText.length > 300) {
          descText = descText.substring(0, 297) + '...';
        }

        // 1. Extraer Point si existe
        const pointEl = pm.getElementsByTagName('Point')[0];
        if (pointEl) {
          const coordEl = pointEl.getElementsByTagName('coordinates')[0];
          if (coordEl) {
            const coordsStr = coordEl.textContent.trim();
            const parts = coordsStr.split(',');
            if (parts.length >= 2) {
              const lng = parseFloat(parts[0]);
              const lat = parseFloat(parts[1]);
              if (!isNaN(lat) && !isNaN(lng)) {
                parsedWaypoints.push({
                  order_index: orderIdx++,
                  latitude: parseFloat(lat.toFixed(5)),
                  longitude: parseFloat(lng.toFixed(5)),
                  name: name,
                  description: descText || null,
                  waypoint_type: orderIdx === 1 ? 'salida' : 'estacion',
                  speed_knots: null,
                  activity: '',
                  duration_hours: null,
                });
              }
            }
          }
        }

        // 2. Extraer LineString si existe
        const lineEl = pm.getElementsByTagName('LineString')[0];
        if (lineEl) {
          const coordEl = lineEl.getElementsByTagName('coordinates')[0];
          if (coordEl) {
            const coordsStr = coordEl.textContent.trim();
            const coordPairs = coordsStr.split(/[\s\n\r]+/);
            coordPairs.forEach((pair) => {
              if (!pair.trim()) return;
              const parts = pair.split(',');
              if (parts.length >= 2) {
                const lng = parseFloat(parts[0]);
                const lat = parseFloat(parts[1]);
                if (!isNaN(lat) && !isNaN(lng)) {
                  parsedWaypoints.push({
                    order_index: orderIdx++,
                    latitude: parseFloat(lat.toFixed(5)),
                    longitude: parseFloat(lng.toFixed(5)),
                    name: `${name} - Pt ${orderIdx}`,
                    description: descText || null,
                    waypoint_type: orderIdx === 1 ? 'salida' : 'estacion',
                    speed_knots: null,
                    activity: '',
                    duration_hours: null,
                  });
                }
              }
            });
          }
        }
      }

      if (parsedWaypoints.length === 0) {
        message.warning('No se encontraron coordenadas válidas (Point o LineString) en el archivo KML/KMZ.');
        return;
      }

      Modal.confirm({
        title: isKmz ? 'Cargar Puntos desde KMZ' : 'Cargar Puntos desde KML',
        content: `Se encontraron ${parsedWaypoints.length} puntos de ruta en el archivo "${fileName}". ¿Deseas reemplazar todos los puntos de la ruta actual con estos puntos?`,
        okText: 'Reemplazar',
        cancelText: 'Cancelar',
        onOk: () => {
          const cleaned = parsedWaypoints.map((wp, idx) => ({
            ...wp,
            order_index: idx,
            waypoint_type: idx === 0 ? 'salida' : 'estacion',
          }));
          setWaypoints(cleaned);
          message.success(`Se cargó la ruta con ${cleaned.length} puntos desde "${fileName}".`);
        },
      });
    } catch (err) {
      console.error(err);
      message.error('Error al procesar el archivo KML/KMZ.');
    }
  };

  const removeWaypoint = (i) => {
    setWaypoints(prev => prev.filter((_, idx) => idx !== i));
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
        order_index: idx,
        waypoint_type: idx === 0 ? 'salida' : (wp.waypoint_type === 'salida' ? 'estacion' : wp.waypoint_type)
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
      // Efecto visual de resaltado
      el.style.transition = 'box-shadow 0.3s';
      el.style.boxShadow = '0 0 8px 2px #1677FF';
      setTimeout(() => {
        if (el) el.style.boxShadow = 'none';
      }, 2000);
    }
  };

  const focusOnMap = (idx) => {
    setActiveWaypoint(idx);
    // Reiniciamos para permitir clics repetidos en la misma tarjeta
    setTimeout(() => setActiveWaypoint(null), 1000);
  };

  const handleSaveSampleInline = async (waypointId) => {
    if (!newSample.variable_name.trim()) {
      message.error('El nombre de la variable es requerido');
      return;
    }
    try {
      await apiClient.post(`/cruises/waypoints/${waypointId}/samples`, newSample);
      message.success('Muestra registrada correctamente');

      const samplesRes = await apiClient.get(`/cruises/waypoints/${waypointId}/samples`);
      setWaypoints(prev => prev.map(wp => wp.id === waypointId ? { ...wp, samples: samplesRes.data } : wp));

      setShowAddSampleForm(false);
      resetNewSample();
    } catch (err) {
      if (err.response?.data?.detail) {
        message.error(err.response.data.detail);
      } else {
        message.error('Error al guardar la muestra');
      }
    }
  };

  const handleDeleteSampleInline = async (waypointId, sampleId) => {
    try {
      await apiClient.delete(`/cruises/waypoints/${waypointId}/samples/${sampleId}`);
      message.success('Muestra eliminada');
      setWaypoints(prev => prev.map(wp => {
        if (wp.id === waypointId) {
          return {
            ...wp,
            samples: (wp.samples || []).filter(s => s.id !== sampleId)
          };
        }
        return wp;
      }));
    } catch {
      message.error('Error al eliminar muestra');
    }
  };

  const departurePort = cruise?.departure_port_ref;
  const returnPort = cruise?.return_port_ref;

  const tripPoints = [];
  if (departurePort && departurePort.latitude != null && departurePort.longitude != null) {
    tripPoints.push({
      latitude: departurePort.latitude,
      longitude: departurePort.longitude,
      name: departurePort.name,
      isPort: true
    });
  }
  const validWaypoints = waypoints.filter(
    w => w.latitude != null && w.longitude != null && isFinite(w.latitude) && isFinite(w.longitude)
  );
  validWaypoints.forEach(w => {
    tripPoints.push(w);
  });
  if (returnPort && returnPort.latitude != null && returnPort.longitude != null) {
    tripPoints.push({
      latitude: returnPort.latitude,
      longitude: returnPort.longitude,
      name: returnPort.name,
      isPort: true
    });
  }

  const renderDirectionArrows = () => {
    const arrows = [];
    for (let i = 1; i < tripPoints.length; i++) {
      const from = tripPoints[i - 1];
      const to = tripPoints[i];
      if (!from || !to || from.latitude == null || from.longitude == null || to.latitude == null || to.longitude == null) continue;

      const dy = to.latitude - from.latitude;
      const dx = Math.cos(Math.PI / 180 * from.latitude) * (to.longitude - from.longitude);
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0.001) { // Evita flechas si están demasiado cerca
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const heading = (90 - angle + 360) % 360;
        const midpoint = [
          (from.latitude + to.latitude) / 2,
          (from.longitude + to.longitude) / 2
        ];

        const arrowIcon = L.divIcon({
          html: `<div style="transform: rotate(${heading}deg); font-size: 14px; color: #0A2647; text-shadow: 0 0 2px white; font-weight: bold; line-height: 1;">▲</div>`,
          className: 'direction-arrow',
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        });

        arrows.push(
          <Marker
            key={`arrow-${i}`}
            position={midpoint}
            icon={arrowIcon}
            interactive={false}
          />
        );
      }
    }
    return arrows;
  };

  const handleSave = async () => {
    // Validar velocidad
    if (maxSpeed) {
      const overSpeed = waypoints.find(wp => wp.speed_knots > maxSpeed);
      if (overSpeed) {
        message.error(`La velocidad de ${overSpeed.name} excede la máxima permitida de la embarcación (${maxSpeed} nudos).`);
        return;
      }
    }
    setSaving(true);
    try {
      // 1. Guardar waypoints
      await apiClient.put(`/cruises/${cruise.id}/waypoints`, waypoints);

      // 2. Calcular distancia total y horas totales
      let totalMeters = 0;
      let totalHours = 0;

      for (let i = 1; i < tripPoints.length; i++) {
        const prev = tripPoints[i - 1];
        const curr = tripPoints[i];

        const p1 = L.latLng(prev.latitude, prev.longitude);
        const p2 = L.latLng(curr.latitude, curr.longitude);
        const distMeters = p1.distanceTo(p2);
        totalMeters += distMeters;

        // Calcular horas de navegación (Asumir 10 nudos si no hay)
        const distNm = distMeters / 1852;
        const speed = curr.speed_knots || maxSpeed || 10;
        totalHours += (distNm / speed);
      }

      // Sumar horas de actividad de los waypoints reales
      waypoints.forEach(wp => {
        if (wp.duration_hours) totalHours += wp.duration_hours;
      });

      const planned_nm = parseFloat((totalMeters / 1852).toFixed(2));
      const totalDays = Math.ceil(totalHours / 24);

      // 3. Actualizar crucero con las nuevas millas y nueva fecha de regreso
      let return_date = cruise.return_date;
      if (cruise.departure_date && totalHours > 0) {
        return_date = dayjs(cruise.departure_date).add(totalHours, 'hour').format('YYYY-MM-DDTHH:mm:ss');
      }

      await apiClient.put(`/cruises/${cruise.id}`, {
        planned_nm,
        return_date,
      });

      message.success('Ruta guardada y millas planificadas actualizadas');
      onSave?.();
      onClose?.();
    } catch (err) { message.error(err?.response?.data?.detail || 'Error al guardar ruta'); }
    finally { setSaving(false); }
  };

  const center = tripPoints.length > 0
    ? [tripPoints[0].latitude, tripPoints[0].longitude]
    : [23.6345, -110.0];

  const positions = tripPoints.map(w => [w.latitude, w.longitude]);

  const content = (
    <>
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

      <Row style={{ minHeight: inline ? 500 : 'auto' }}>
        <Col span={16}>
          <div style={{ height: inline ? 'calc(100vh - 280px)' : '85vh', minHeight: inline ? 480 : 600 }}>
            <MapContainer center={[23.6345, -110.0]} zoom={6} style={{ height: '100%', width: '100%' }}>
              <MapFitter waypoints={waypoints} modalReady={modalReady} departurePort={departurePort} returnPort={returnPort} />
              <MapFlyer activeWaypoint={activeWaypoint} markerRefs={markerRefs} waypoints={waypoints} />
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              <MapClickHandler onMapClick={handleMapClick} />
              {positions.length > 1 && (
                <Polyline positions={positions} color="#0A2647" weight={2} dashArray="8 4" />
              )}
              {renderDirectionArrows()}

              {/* Puerto de Salida (Marcador Fijo Verde) */}
              {departurePort && departurePort.latitude != null && departurePort.longitude != null && (
                <Marker
                  position={[departurePort.latitude, departurePort.longitude]}
                  icon={startIcon}
                >
                  <Popup>
                    <div style={{ minWidth: 150 }}>
                      <strong>⚓ Puerto de Salida</strong><br />
                      <span>{departurePort.name}</span><br />
                      <span style={{ fontSize: 11, color: '#666' }}>
                        Lat: {departurePort.latitude.toFixed(4)} | Lng: {departurePort.longitude.toFixed(4)}
                      </span>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Puerto de Regreso (Marcador Fijo Rojo) */}
              {returnPort && returnPort.latitude != null && returnPort.longitude != null && (
                <Marker
                  position={[returnPort.latitude, returnPort.longitude]}
                  icon={endIcon}
                >
                  <Popup>
                    <div style={{ minWidth: 150 }}>
                      <strong>⚓ Puerto de Regreso</strong><br />
                      <span>{returnPort.name}</span><br />
                      <span style={{ fontSize: 11, color: '#666' }}>
                        Lat: {returnPort.latitude.toFixed(4)} | Lng: {returnPort.longitude.toFixed(4)}
                      </span>
                    </div>
                  </Popup>
                </Marker>
              )}

              {validWaypoints.map((wp, i) => {
                const isStart = i === 0 && !departurePort;
                const isEnd = i === validWaypoints.length - 1 && !returnPort && validWaypoints.length > 1;
                const isScience = wp.samples && wp.samples.length > 0;
                
                // Pronóstico meteorológico calculado para este waypoint
                const wf = routeForecast?.waypoints?.[i];
                const hasWarn = wf?.is_warning;

                const markerProps = { position: [wp.latitude, wp.longitude] };
                if (hasWarn) markerProps.icon = warningIcon;
                else if (isStart) markerProps.icon = startIcon;
                else if (isEnd) markerProps.icon = endIcon;
                else if (isScience) markerProps.icon = scienceIcon;

                return (
                  <Marker
                    key={i}
                    {...markerProps}
                    draggable={true}
                    ref={(r) => { markerRefs.current[i] = r; }}
                    eventHandlers={{
                      click: () => scrollToWaypoint(i),
                      dragend: (e) => {
                        const marker = e.target;
                        const position = marker.getLatLng();
                        updateWaypoint(i, 'latitude', parseFloat(position.lat.toFixed(5)));
                        updateWaypoint(i, 'longitude', parseFloat(position.lng.toFixed(5)));
                      }
                    }}
                  >
                    <MapTooltip
                      permanent
                      direction="top"
                      offset={[0, -10]}
                      className="waypoint-number-tooltip"
                    >
                      {i + 1}
                    </MapTooltip>
                    <Popup>
                      <div style={{ minWidth: 230, maxWidth: 280 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <strong style={{ fontSize: 14, color: '#0A2647' }}>{i + 1}. {wp.name}</strong>
                          {hasWarn && <Tag color="error" style={{ margin: 0, fontSize: 10 }}>⚠️ Alerta Mar</Tag>}
                        </div>
                        <span style={{ fontSize: 11, color: '#666' }}>
                          Lat: {wp.latitude.toFixed(4)}° | Lng: {wp.longitude.toFixed(4)}°
                        </span>

                        {/* Bloque de ETA y Distancia Náutica */}
                        {wf && (
                          <div style={{ marginTop: 6, padding: '5px 8px', background: '#F0F7FF', borderRadius: 6, fontSize: 11, border: '1px solid #BAE0FF' }}>
                            <div>🕒 <b>ETA Arribo:</b> {dayjs(wf.eta).format('DD/MMM HH:mm')}</div>
                            <div>🏁 <b>ETD Salida:</b> {dayjs(wf.etd).format('DD/MMM HH:mm')} ({wf.station_duration_hours}h lance)</div>
                            <div>📏 <b>Distancia:</b> {wf.distance_from_prev_nm} nm (Acum: {wf.cumulative_distance_nm} nm)</div>
                          </div>
                        )}

                        {/* Pronóstico Meteorológico en ETA */}
                        {wf?.has_weather ? (
                          <div style={{ marginTop: 6, padding: '6px 8px', background: wf.is_warning ? '#FFFBE6' : '#F6FFED', borderRadius: 6, fontSize: 11, border: wf.is_warning ? '1px solid #FFE58F' : '1px solid #B7EB8F' }}>
                            <div style={{ fontWeight: 600, color: wf.is_warning ? '#D46B08' : '#389E0D', marginBottom: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>🌊 Pronóstico al arribo ({dayjs(wf.weather_time || wf.eta).format('DD/MMM HH:mm')}):</span>
                              <span style={{ fontSize: 9, fontWeight: 500, color: '#444', background: '#FFF', padding: '1px 5px', borderRadius: 3, border: '1px solid #D9D9D9' }}>
                                {routeForecast?.model_name?.includes('ECMWF') ? '🇪🇺 ECMWF' : '🌐 GFS'}
                              </span>
                            </div>
                            <div>💨 <b>Viento:</b> {wf.wind_speed_kt} kt {wf.wind_gust_kt ? `(Ráf: ${wf.wind_gust_kt} kt)` : ''} · {wf.wind_dir_deg}° {wf.beaufort_description ? `(${wf.beaufort_description})` : ''}</div>
                            {wf.wave_height_m !== null && <div>🌊 <b>Oleaje:</b> {wf.wave_height_m} m {wf.wave_period_s ? `· ${wf.wave_period_s}s` : ''} {wf.wave_dir_deg !== null ? `· ${wf.wave_dir_deg}°` : ''}</div>}
                            {wf.sea_temp_c !== null && <div>🌡️ <b>Temp:</b> Mar {wf.sea_temp_c}°C {wf.air_temp_c !== null ? `· Aire ${wf.air_temp_c}°C` : ''}</div>}
                            {wf.precip_rate_mmh > 0 && <div>🌧️ <b>Lluvia:</b> {wf.precip_rate_mmh} mm/h</div>}
                            {wf.is_warning && (
                              <div style={{ marginTop: 4, color: '#CF1322', fontWeight: 600, fontSize: 10 }}>
                                ⚠️ {wf.warning_reasons.join(' · ')}
                              </div>
                            )}
                          </div>
                        ) : wf ? (
                          <div style={{ marginTop: 4, fontSize: 10, color: '#888', fontStyle: 'italic', padding: '4px 6px', background: '#F5F5F5', borderRadius: 4 }}>
                            ℹ️ Arribo fuera de ventana del modelo ({routeForecast?.model_name?.includes('ECMWF') ? 'ECMWF 7-10 días' : 'GFS/WW3 5-7 días'}).
                          </div>
                        ) : null}

                        {wp.description && (
                          <div style={{ marginTop: 6, fontSize: 11, background: '#eaf4ff', padding: 4, borderRadius: 4 }}>
                            <strong>Notas / Info:</strong> {wp.description}
                          </div>
                        )}
                        {wp.activity && (
                          <div style={{ marginTop: 6, fontSize: 11, background: '#f0f0f0', padding: 4, borderRadius: 4 }}>
                            <strong>Actividad:</strong> {wp.activity}
                          </div>
                        )}
                        {(wp.speed_knots || wp.duration_hours) && (
                          <div style={{ marginTop: 6, fontSize: 11, display: 'flex', gap: 8 }}>
                            {wp.speed_knots && <span>⛵ {wp.speed_knots} nd</span>}
                            {wp.duration_hours && <span>⏱️ {wp.duration_hours} h</span>}
                          </div>
                        )}
                        {isScience && (
                          <div style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 6, fontSize: 11 }}>
                            <strong>Muestras ({wp.samples.length}):</strong>
                            <div style={{ maxHeight: 80, overflowY: 'auto', marginTop: 4 }}>
                              {wp.samples.map(s => (
                                <div key={s.id} style={{ color: '#555', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                  🧪 {s.variable_name} ({s.responsible_name || '—'})
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <Button
                          type="primary"
                          size="small"
                          style={{ marginTop: 8, width: '100%', fontSize: 11, background: '#8E44AD', borderColor: '#8E44AD' }}
                          onClick={() => {
                            scrollToWaypoint(i);
                          }}
                        >
                          Configurar Muestras
                        </Button>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        </Col>

        <Col span={8} style={{ height: inline ? 'calc(100vh - 280px)' : '85vh', minHeight: inline ? 480 : 600, display: 'flex', flexDirection: 'column', background: '#f5f5f5', borderLeft: '1px solid #eee', overflow: 'hidden' }}>
          {/* Header Superior con KML y Guardar */}
          <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #e8e8e8', background: '#ffffff', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text strong style={{ fontSize: 14 }}>🗺️ Derrota ({waypoints.length} puntos)</Text>
              <Space size={6}>
                <Upload
                  accept=".kml,.kmz"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    handleKmlUpload(file);
                    return false;
                  }}
                >
                  <Button size="small" icon={<UploadOutlined />}>KML / KMZ</Button>
                </Upload>
                <Tooltip title={!routeForecast?.waypoints?.length ? 'Genera o actualiza el itinerario con pronóstico para activar el reporte' : 'Generar reporte meteorológico oficial en PDF'}>
                  <Button
                    size="small"
                    icon={<FilePdfOutlined />}
                    disabled={!routeForecast?.waypoints?.length}
                    onClick={() => setWeatherReportModalOpen(true)}
                    style={{
                      background: routeForecast?.waypoints?.length ? '#E74C3C' : undefined,
                      borderColor: routeForecast?.waypoints?.length ? '#E74C3C' : undefined,
                      color: routeForecast?.waypoints?.length ? '#ffffff' : undefined,
                      fontWeight: 600,
                    }}
                  >
                    Reporte Clima PDF
                  </Button>
                </Tooltip>
                {inline && (
                  <Button
                    type="primary"
                    size="small"
                    loading={saving}
                    onClick={handleSave}
                    icon={<CompassOutlined />}
                    style={{ background: '#0A2647', borderColor: '#0A2647', fontWeight: 600, flexShrink: 0 }}
                  >
                    Guardar
                  </Button>
                )}
              </Space>
            </div>
            {maxSpeed && <div style={{ fontSize: 10, color: '#d48806', marginTop: 2 }}>⚠️ Velocidad máxima buque: {maxSpeed} nudos</div>}
          </div>

          {/* ── PARÁMETROS DE NAVEGACIÓN Y ESTIMACIÓN ETA ── */}
          <div style={{ padding: '8px 14px', background: '#FFFFFF', borderBottom: '1px solid #E8E8E8', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text strong style={{ fontSize: 11, color: '#0A2647' }}>⚓ Plan de Navegación (Zarpe y Tránsito)</Text>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined spin={loadingForecast} />}
                onClick={() => fetchRouteForecast(waypoints, departureDatetime, defaultSpeedKnots, defaultDurationHours)}
                title="Recalcular pronóstico"
                style={{ fontSize: 11, padding: 0, height: 20 }}
              >
                Actualizar
              </Button>
            </div>
            <Row gutter={[6, 6]}>
              <Col span={12}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 10 }}>Fecha y Hora Zarpe:</Text>
                  {(() => {
                    const saved = getSavedDeparture();
                    if (saved && !departureDatetime.isSame(saved, 'minute')) {
                      return (
                        <a
                          onClick={() => setDepartureDatetime(saved)}
                          style={{ fontSize: 10, color: '#1890FF' }}
                          title="Restablecer a la fecha guardada en Datos Generales"
                        >
                          ↺ Restablecer guardada
                        </a>
                      );
                    }
                    return null;
                  })()}
                </div>
                <DatePicker
                  showTime
                  size="small"
                  style={{ width: '100%', fontSize: 11 }}
                  format="DD/MM/YYYY HH:mm"
                  value={departureDatetime}
                  onChange={(val) => val && setDepartureDatetime(val)}
                />
              </Col>
              <Col span={6}>
                <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>Velocidad:</Text>
                <InputNumber
                  size="small"
                  style={{ width: '100%' }}
                  min={1}
                  max={25}
                  step={0.5}
                  value={defaultSpeedKnots}
                  addonAfter="nd"
                  onChange={(val) => setDefaultSpeedKnots(val || 10)}
                />
              </Col>
              <Col span={6}>
                <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>Permanencia:</Text>
                <InputNumber
                  size="small"
                  style={{ width: '100%' }}
                  min={0}
                  max={48}
                  step={0.5}
                  value={defaultDurationHours}
                  addonAfter="h"
                  onChange={(val) => setDefaultDurationHours(val ?? 1.5)}
                />
              </Col>
            </Row>

            {/* Selector de Modelo Meteorológico */}
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <Text type="secondary" style={{ fontSize: 10 }}>Modelo Meteorológico:</Text>
              <Segmented
                size="small"
                value={weatherModel}
                onChange={setWeatherModel}
                options={[
                  {
                    label: (
                      <span title="Modelo GFS/WaveWatch III (NOAA 0.25°) — Estándar global para mar abierto (B/O Alpha Helix)">
                        🌐 GFS (NOAA)
                      </span>
                    ),
                    value: 'gfs',
                  },
                  {
                    label: (
                      <span title="Modelo ECMWF IFS Europeo (0.25°) — Alta fidelidad costera y bahías (La Rigel / Windy)">
                        🇪🇺 ECMWF (Europeo / Rigel)
                      </span>
                    ),
                    value: 'ecmwf',
                  },
                ]}
              />
            </div>

            {/* Resumen de Derrota si hay pronóstico */}
            {routeForecast && (
              <div style={{ marginTop: 6, padding: '5px 8px', background: '#F0F7FF', borderRadius: 6, border: '1px solid #D6E4FF', fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>📏 <b>{routeForecast.total_distance_nm} nm</b> ({(routeForecast.total_duration_hours / 24).toFixed(1)} días)</span>
                  <span>🏁 <b>Retorno:</b> {dayjs(routeForecast.arrival_datetime).format('DD/MMM HH:mm')}</span>
                </div>
                <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#555' }}>
                  <span>Modelo: <b>{routeForecast.model_name || (weatherModel === 'ecmwf' ? 'ECMWF (IFS Europeo)' : 'GFS (NOAA)')}</b></span>
                  {weatherModel === 'ecmwf' ? (
                    <Tag color="purple" style={{ margin: 0, fontSize: 9, lineHeight: '16px', padding: '0 4px' }}>🇪🇺 Costero / Rigel</Tag>
                  ) : (
                    <Tag color="blue" style={{ margin: 0, fontSize: 9, lineHeight: '16px', padding: '0 4px' }}>🌐 Global / Alpha Helix</Tag>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Selector de Pestaña Lateral */}
          <div style={{ padding: '6px 14px', background: '#FAFAFA', borderBottom: '1px solid #E8E8E8', flexShrink: 0 }}>
            <Segmented
              block
              size="small"
              value={activeSideTab}
              onChange={setActiveSideTab}
              options={[
                { label: `📍 Puntos & Muestras (${waypoints.length})`, value: 'points' },
                {
                  label: (
                    <span>
                      🌊 Itinerario & Clima
                      {routeForecast?.waypoints?.some(w => w.is_warning) && (
                        <Badge status="error" style={{ marginLeft: 6 }} />
                      )}
                    </span>
                  ),
                  value: 'itinerary'
                },
              ]}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 14px' }}>
            {activeSideTab === 'points' ? (
              // ── VISTA 1: LISTA DE ESTACIONES Y CONFIGURACIÓN DE MUESTRAS ──
              <>
                {waypoints.map((wp, i) => {
                  const wf = routeForecast?.waypoints?.[i];
                  return (
                    <Card
                      id={`waypoint-card-${i}`}
                      size="small"
                      key={i}
                      style={{
                        marginBottom: 10,
                        borderRadius: 8,
                        border: i === 0 ? '1px solid #52C41A' : wf?.is_warning ? '1px solid #FAAD14' : undefined,
                        boxShadow: expandedIndex === i ? '0 2px 8px rgba(0,0,0,0.1)' : undefined
                      }}
                      title={
                        <div
                          onClick={() => toggleExpand(i)}
                          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '4px 0', gap: 6 }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                            {expandedIndex === i ? <DownOutlined style={{ fontSize: 12, color: '#666', flexShrink: 0 }} /> : <RightOutlined style={{ fontSize: 12, color: '#666', flexShrink: 0 }} />}
                            <Badge status={i === 0 ? 'success' : wf?.is_warning ? 'warning' : 'processing'} />
                            <Input
                              value={wp.name}
                              onChange={e => { e.stopPropagation(); updateWaypoint(i, 'name', e.target.value); }}
                              onClick={e => e.stopPropagation()}
                              variant="borderless"
                              style={{ padding: 0, fontWeight: 'bold', width: 110, minWidth: 0 }}
                            />
                            {wf && (
                              <Text type="secondary" style={{ fontSize: 10, marginLeft: 2 }}>
                                {dayjs(wf.eta).format('DD/MM HH:mm')}
                              </Text>
                            )}
                            {wp.samples && wp.samples.length > 0 && (
                              <Tag color="purple" style={{ margin: 0, fontSize: 10, flexShrink: 0 }}>🧪 {wp.samples.length}</Tag>
                            )}
                          </div>
                        </div>
                      }
                      extra={
                        <Space size={2}>
                          <Tooltip title="Subir orden">
                            <Button 
                              type="text" 
                              size="small" 
                              disabled={i === 0} 
                              style={{ padding: '0 4px' }}
                              icon={<ArrowUpOutlined style={{ fontSize: 13 }} />} 
                              onClick={e => { e.stopPropagation(); moveWaypoint(i, 'up'); }} 
                            />
                          </Tooltip>
                          <Tooltip title="Bajar orden">
                            <Button 
                              type="text" 
                              size="small" 
                              disabled={i === waypoints.length - 1} 
                              style={{ padding: '0 4px' }}
                              icon={<ArrowDownOutlined style={{ fontSize: 13 }} />} 
                              onClick={e => { e.stopPropagation(); moveWaypoint(i, 'down'); }} 
                            />
                          </Tooltip>
                          <Tooltip title="Ver en el mapa">
                            <Button type="text" size="small" style={{ color: '#1677FF', padding: '0 4px' }} icon={<AimOutlined />} onClick={e => { e.stopPropagation(); focusOnMap(i); }} />
                          </Tooltip>
                          <Button type="text" size="small" danger style={{ padding: '0 4px' }} icon={<DeleteOutlined />} onClick={e => { e.stopPropagation(); removeWaypoint(i); }} />
                        </Space>
                      }>

                      {/* Mini resumen de meteorología si está disponible */}
                      {wf?.has_weather && (
                        <div style={{ fontSize: 10, color: '#555', background: '#FAFAFA', padding: '3px 6px', borderRadius: 4, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                          <span>💨 {wf.wind_speed_kt} kt {wf.wind_gust_kt ? `(ráf ${wf.wind_gust_kt})` : ''}</span>
                          <span>🌊 Ola: {wf.wave_height_m !== null ? `${wf.wave_height_m}m` : '—'}</span>
                          {wf.is_warning && <Tag color="warning" style={{ fontSize: 9, padding: '0 4px', margin: 0 }}>⚠️ Alerta</Tag>}
                        </div>
                      )}

                      {expandedIndex === i && (
                        <div style={{ marginTop: 8 }}>
                          <Row gutter={[8, 12]}>
                            <Col span={12}>
                              <Text type="secondary" style={{ fontSize: 11 }}>Latitud</Text>
                              <InputNumber
                                size="small"
                                style={{ width: '100%' }}
                                value={wp.latitude}
                                onChange={(val) => updateWaypoint(i, 'latitude', val)}
                                step={0.0001}
                                precision={5}
                                placeholder="Lat"
                              />
                            </Col>
                            <Col span={12}>
                              <Text type="secondary" style={{ fontSize: 11 }}>Longitud</Text>
                              <InputNumber
                                size="small"
                                style={{ width: '100%' }}
                                value={wp.longitude}
                                onChange={(val) => updateWaypoint(i, 'longitude', val)}
                                step={0.0001}
                                precision={5}
                                placeholder="Lng"
                              />
                            </Col>
                            {i > 0 && (
                              <Col span={24}>
                                <Text type="secondary" style={{ fontSize: 11 }}>Velocidad hacia aquí (nudos)</Text>
                                <InputNumber size="small" style={{ width: '100%' }} value={wp.speed_knots} onChange={v => updateWaypoint(i, 'speed_knots', v)} max={maxSpeed || undefined} min={0} step={0.5} placeholder={maxSpeed ? `Máx ${maxSpeed}` : ''} />
                              </Col>
                            )}
                            <Col span={24}>
                              <Text type="secondary" style={{ fontSize: 11 }}>Descripción / Notas de Ruta</Text>
                              <TextArea size="small" rows={2} value={wp.description || ''} onChange={e => updateWaypoint(i, 'description', e.target.value)} placeholder="Ej: Puntos de control, info del KML/KMZ..." maxLength={300} />
                            </Col>
                            <Col span={24}>
                              <Text type="secondary" style={{ fontSize: 11 }}>Actividad / Tareas</Text>
                              <TextArea size="small" rows={2} value={wp.activity} onChange={e => updateWaypoint(i, 'activity', e.target.value)} placeholder="Ej: Lance de CTD, arrastre..." />
                            </Col>
                            <Col span={24}>
                              <Text type="secondary" style={{ fontSize: 11 }}>Duración estimada (horas)</Text>
                              <InputNumber size="small" style={{ width: '100%' }} value={wp.duration_hours} onChange={v => updateWaypoint(i, 'duration_hours', v)} min={0} step={0.5} placeholder="Ej: 2.5" />
                            </Col>
                          </Row>

                          <Divider style={{ margin: '12px 0' }} />

                          {/* SECCIÓN DE MUESTRAS CIENTÍFICAS */}
                          <div style={{ background: '#fafafa', padding: 8, borderRadius: 6, border: '1px dashed #d9d9d9' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <Text strong style={{ fontSize: 12 }}><ExperimentOutlined /> Muestras / Lances</Text>
                              {wp.id && !showAddSampleForm && (
                                <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setShowAddSampleForm(true)}>
                                  + Agregar
                                </Button>
                              )}
                            </div>

                            {!wp.id ? (
                              <div style={{ fontSize: 11, color: '#faad14', padding: '4px 0' }}>
                                ⚠️ Guarda la ruta para habilitar el registro de muestras en este punto.
                              </div>
                            ) : (
                              <>
                                {(!wp.samples || wp.samples.length === 0) ? (
                                  <div style={{ fontSize: 11, color: '#999', textAlign: 'center', padding: '4px 0' }}>
                                    Sin muestras en esta estación.
                                  </div>
                                ) : (
                                  <div style={{ maxHeight: 150, overflowY: 'auto', marginBottom: 8 }}>
                                    {wp.samples.map((s) => (
                                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: '#fff', padding: 6, borderRadius: 4, marginBottom: 4, border: '1px solid #f0f0f0', fontSize: 11 }}>
                                        <div style={{ flex: 1, paddingRight: 4 }}>
                                          <div style={{ fontWeight: 'bold' }}>{s.variable_name} <span style={{ color: '#888', fontWeight: 'normal' }}>(#{s.sampling_order})</span></div>
                                          <div style={{ fontSize: 10, color: '#555' }}>
                                            {s.responsible_name && `Resp: ${s.responsible_name}`}
                                            {s.volume_needed && ` | Vol: ${s.volume_needed}`}
                                          </div>
                                          <div style={{ marginTop: 2 }}>
                                            {s.depth_surface && <Tag size="small" style={{ fontSize: 9, padding: '0 4px', margin: 0, marginRight: 2 }}>Sup</Tag>}
                                            {s.depth_mid_water && <Tag size="small" style={{ fontSize: 9, padding: '0 4px', margin: 0, marginRight: 2 }}>Med</Tag>}
                                            {s.depth_bottom && <Tag size="small" style={{ fontSize: 9, padding: '0 4px', margin: 0, marginRight: 2 }}>Fon</Tag>}
                                            {s.depth_custom && <Tag color="blue" size="small" style={{ fontSize: 9, padding: '0 4px', margin: 0 }}>{s.depth_custom} m</Tag>}
                                          </div>
                                          {s.notes && <div style={{ fontSize: 10, color: '#888', fontStyle: 'italic', marginTop: 2 }}>Nota: {s.notes}</div>}
                                        </div>
                                        <Button
                                          type="text"
                                          danger
                                          size="small"
                                          icon={<DeleteOutlined style={{ fontSize: 10 }} />}
                                          style={{ padding: 0, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                          onClick={() => handleDeleteSampleInline(wp.id, s.id)}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {showAddSampleForm && (
                                  <div style={{ background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #e8e8e8', marginTop: 8 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: 11, marginBottom: 6 }}>Nueva Muestra</div>
                                    <Row gutter={[4, 6]}>
                                      <Col span={16}>
                                        <Input
                                          size="small"
                                          placeholder="Variable (ej: CID)"
                                          value={newSample.variable_name}
                                          onChange={e => setNewSample(prev => ({ ...prev, variable_name: e.target.value }))}
                                        />
                                      </Col>
                                      <Col span={8}>
                                        <InputNumber
                                          size="small"
                                          placeholder="Orden"
                                          style={{ width: '100%' }}
                                          min={1}
                                          value={newSample.sampling_order}
                                          onChange={v => setNewSample(prev => ({ ...prev, sampling_order: v }))}
                                        />
                                      </Col>
                                      <Col span={12}>
                                        <Input
                                          size="small"
                                          placeholder="Responsable"
                                          value={newSample.responsible_name}
                                          onChange={e => setNewSample(prev => ({ ...prev, responsible_name: e.target.value }))}
                                        />
                                      </Col>
                                      <Col span={12}>
                                        <Input
                                          size="small"
                                          placeholder="Volumen"
                                          value={newSample.volume_needed}
                                          onChange={e => setNewSample(prev => ({ ...prev, volume_needed: e.target.value }))}
                                        />
                                      </Col>
                                      <Col span={24}>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 10, margin: '2px 0' }}>
                                          <Checkbox checked={newSample.depth_surface} onChange={e => setNewSample(prev => ({ ...prev, depth_surface: e.target.checked }))}>Sup</Checkbox>
                                          <Checkbox checked={newSample.depth_mid_water} onChange={e => setNewSample(prev => ({ ...prev, depth_mid_water: e.target.checked }))}>Med</Checkbox>
                                          <Checkbox checked={newSample.depth_bottom} onChange={e => setNewSample(prev => ({ ...prev, depth_bottom: e.target.checked }))}>Fon</Checkbox>
                                        </div>
                                      </Col>
                                      <Col span={24}>
                                        <Input
                                          size="small"
                                          placeholder="Profundidad esp. (m/notas)"
                                          value={newSample.depth_custom}
                                          onChange={e => setNewSample(prev => ({ ...prev, depth_custom: e.target.value }))}
                                        />
                                      </Col>
                                      <Col span={24}>
                                        <Input
                                          size="small"
                                          placeholder="Notas/Especificaciones"
                                          value={newSample.notes}
                                          onChange={e => setNewSample(prev => ({ ...prev, notes: e.target.value }))}
                                        />
                                      </Col>
                                      <Col span={24} style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
                                        <Button size="small" onClick={() => { setShowAddSampleForm(false); resetNewSample(); }}>
                                          Cancelar
                                        </Button>
                                        <Button type="primary" size="small" style={{ background: '#8E44AD', borderColor: '#8E44AD' }} onClick={() => handleSaveSampleInline(wp.id)}>
                                          Guardar
                                        </Button>
                                      </Col>
                                    </Row>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                          {/* Navegación entre Waypoints */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
                            <Button
                              size="small"
                              disabled={i === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                scrollToWaypoint(i - 1);
                              }}
                            >
                              ← Anterior
                            </Button>
                            <Button
                              size="small"
                              disabled={i === waypoints.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                scrollToWaypoint(i + 1);
                              }}
                            >
                              Siguiente →
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
                {waypoints.length === 0 && <div style={{ textAlign: 'center', marginTop: 40 }}><Text type="secondary">Sin puntos de ruta. Haz clic en el mapa o sube un KML.</Text></div>}
              </>
            ) : (
              // ── VISTA 2: ITINERARIO CRONOLÓGICO Y PRONÓSTICO METEOROLÓGICO ──
              <div>
                {loadingForecast && (
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <Spin tip={`Calculando cronología y consultando modelo ${weatherModel === 'ecmwf' ? 'ECMWF IFS' : 'GFS/WW3'}...`} />
                  </div>
                )}
                {routeForecast && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '5px 10px', background: '#F8F9FA', borderRadius: 6, fontSize: 11, border: '1px solid #E9ECEF' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>Modelo meteorológico: <b>{routeForecast.model_name || (weatherModel === 'ecmwf' ? 'ECMWF (IFS Europeo)' : 'GFS (NOAA)')}</b></span>
                      {weatherModel === 'ecmwf' ? (
                        <Tag color="purple" style={{ margin: 0, fontSize: 10 }}>🇪🇺 ECMWF IFS</Tag>
                      ) : (
                        <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>🌐 GFS / WW3</Tag>
                      )}
                    </div>
                    <Button
                      size="small"
                      type="primary"
                      icon={<FilePdfOutlined />}
                      onClick={() => setWeatherReportModalOpen(true)}
                      style={{
                        background: '#E74C3C',
                        borderColor: '#E74C3C',
                        fontSize: 11,
                        height: 24,
                        padding: '0 8px',
                        fontWeight: 600,
                      }}
                    >
                      Reporte PDF
                    </Button>
                  </div>
                )}
                {routeForecast && routeForecast.waypoints.map((wf, i) => (
                  <Card
                    key={i}
                    size="small"
                    style={{
                      marginBottom: 10,
                      borderRadius: 8,
                      border: wf.is_warning ? '1.5px solid #FAAD14' : '1px solid #E8E8E8',
                      background: wf.is_warning ? '#FEFDF8' : '#FFFFFF',
                    }}
                    title={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Space size={6}>
                          <Badge count={i + 1} style={{ backgroundColor: i === 0 ? '#52C41A' : '#0A2647' }} />
                          <Text strong style={{ fontSize: 13 }}>{wf.name}</Text>
                        </Space>
                        <Button
                          type="text"
                          size="small"
                          icon={<AimOutlined style={{ color: '#1677FF' }} />}
                          onClick={() => focusOnMap(i)}
                          title="Ubicar en mapa"
                        />
                      </div>
                    }
                  >
                    <div style={{ fontSize: 11, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                      <span>🕒 <b>ETA Arribo:</b> {dayjs(wf.eta).format('DD/MMM HH:mm')}</span>
                      <span>🏁 <b>ETD:</b> {dayjs(wf.etd).format('HH:mm')}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
                      <span>📏 Tramo: <b>{wf.distance_from_prev_nm} nm</b> (Acum: {wf.cumulative_distance_nm} nm) · {wf.speed_knots} nd</span>
                    </div>

                    {wf.has_weather ? (
                      <div style={{ padding: '6px 8px', background: wf.is_warning ? '#FFF7E6' : '#F6FFED', borderRadius: 6, border: wf.is_warning ? '1px solid #FFE58F' : '1px solid #D9F7BE', fontSize: 11 }}>
                        <Row gutter={[4, 4]}>
                          <Col span={12}>
                            <div>💨 <b>Viento:</b> {wf.wind_speed_kt} kt {wf.wind_gust_kt ? `(${wf.wind_gust_kt} ráf)` : ''}</div>
                            <div style={{ fontSize: 10, color: '#888' }}>{wf.wind_dir_deg}° · {wf.beaufort_description}</div>
                          </Col>
                          <Col span={12}>
                            <div>🌊 <b>Oleaje:</b> {wf.wave_height_m !== null ? `${wf.wave_height_m} m` : 'N/A'}</div>
                            <div style={{ fontSize: 10, color: '#888' }}>{wf.wave_period_s ? `${wf.wave_period_s}s` : ''} {wf.wave_dir_deg !== null ? `· ${wf.wave_dir_deg}°` : ''}</div>
                          </Col>
                          <Col span={12}>
                            <div>🌡️ <b>Temp Mar:</b> {wf.sea_temp_c !== null ? `${wf.sea_temp_c}°C` : 'N/A'}</div>
                          </Col>
                          <Col span={12}>
                            <div>🌡️ <b>Temp Aire:</b> {wf.air_temp_c !== null ? `${wf.air_temp_c}°C` : 'N/A'}</div>
                          </Col>
                        </Row>
                        {wf.is_warning && (
                          <div style={{ marginTop: 4, color: '#D4380D', fontWeight: 600, fontSize: 10 }}>
                            ⚠️ {wf.warning_reasons.join(' · ')}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: '#999', fontStyle: 'italic', padding: '4px 6px', background: '#FAFAFA', borderRadius: 4 }}>
                        ℹ️ Arribo fuera de ventana del modelo ({routeForecast?.model_name?.includes('ECMWF') ? 'ECMWF 7-10 días' : 'GFS/WW3 5-7 días'}).
                      </div>
                    )}
                  </Card>
                ))}
                {(!routeForecast || routeForecast.waypoints.length === 0) && (
                  <div style={{ textAlign: 'center', marginTop: 40 }}>
                    <Text type="secondary">Agrega puntos a la ruta para generar el itinerario y pronóstico meteorológico.</Text>
                  </div>
                )}
              </div>
            )}
          </div>
        </Col>
      </Row>

      {/* Modal Visor y Descarga de Reporte Meteorológico Oficial en PDF */}
      <Modal
        title={
          <Space>
            <FilePdfOutlined style={{ color: '#E74C3C' }} />
            <span>Reporte Meteorológico de Navegación — {cruise?.folio || cruise?.name || 'Crucero'}</span>
          </Space>
        }
        open={weatherReportModalOpen}
        onCancel={() => setWeatherReportModalOpen(false)}
        width="88%"
        style={{ top: 20 }}
        footer={[
          <Button key="close" onClick={() => setWeatherReportModalOpen(false)}>
            Cerrar
          </Button>,
          routeForecast && (
            <PDFDownloadLink
              key="download"
              document={
                <CruiseWeatherReportDocument
                  cruise={cruise}
                  routeForecast={routeForecast}
                  departureDatetime={departureDatetime}
                  defaultSpeedKnots={defaultSpeedKnots}
                  defaultDurationHours={defaultDurationHours}
                  weatherModel={weatherModel}
                />
              }
              fileName={`Reporte_Meteorologico_${(cruise?.folio || cruise?.name || 'Crucero').replace(/[^a-zA-Z0-9_-]/g, '_')}_${dayjs().format('YYYYMMDD')}.pdf`}
              style={{ textDecoration: 'none', marginLeft: 8 }}
            >
              {({ loading }) => (
                <Button type="primary" icon={<DownloadOutlined />} loading={loading} style={{ background: '#E74C3C', borderColor: '#E74C3C' }}>
                  Descargar PDF
                </Button>
              )}
            </PDFDownloadLink>
          ),
        ]}
      >
        {weatherReportModalOpen && routeForecast && (
          <PDFViewer style={{ width: '100%', height: '75vh', border: 'none', borderRadius: 8 }}>
            <CruiseWeatherReportDocument
              cruise={cruise}
              routeForecast={routeForecast}
              departureDatetime={departureDatetime}
              defaultSpeedKnots={defaultSpeedKnots}
              defaultDurationHours={defaultDurationHours}
              weatherModel={weatherModel}
            />
          </PDFViewer>
        )}
      </Modal>
    </>
  );

  if (inline) {
    return (
      <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
        {content}
      </div>
    );
  }

  return (
    <Modal title={<Space><CompassOutlined /> Ruta — {cruise?.name}</Space>}
      open={open} onCancel={onClose} onOk={handleSave} confirmLoading={saving}
      afterOpenChange={(visible) => {
        setModalReady(visible);
      }}
      okText="Guardar ruta" width="95%" style={{ top: 20 }} styles={{ body: { padding: 0 } }}>
      {content}
    </Modal>
  );
}

// ── Tab de Estabilidad y Tanques ─────────────────────────────
function CruiseStabilityTab({ cruise, onNavigate }) {
  const [conditions, setConditions] = useState([]);
  const [latestSounding, setLatestSounding] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cruise?.id || !cruise?.vessel_id) return;
    setLoading(true);
    Promise.all([
      apiClient.get(`/cruises/${cruise.id}/stability`).catch(() => ({ data: [] })),
      apiClient.get(`/vessels/${cruise.vessel_id}/soundings/latest`).catch(() => ({ data: null })),
    ])
      .then(([stabRes, soundRes]) => {
        setConditions(stabRes.data || []);
        setLatestSounding(soundRes.data || null);
      })
      .finally(() => setLoading(false));
  }, [cruise?.id, cruise?.vessel_id]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '30px 0' }}><Spin /></div>;
  }

  const latestCond = conditions[0];

  return (
    <div style={{ padding: '8px 0' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card
            title={<span>⛽ Estado Oficial de Tanques</span>}
            size="small"
            style={{ borderRadius: 10, height: '100%' }}
            extra={
              <Button size="small" onClick={() => onNavigate(`/soundings`)}>
                Ver Inventario
              </Button>
            }
          >
            {latestSounding ? (
              <div>
                <Space style={{ marginBottom: 12 }} wrap>
                  <Tag color={latestSounding.is_official ? 'success' : 'blue'}>
                    {latestSounding.is_official ? '🟢 Sondeo Oficial Vigente' : '📝 Último Sondeo'}
                  </Tag>
                  <Text type="secondary">{dayjs(latestSounding.sounding_datetime).format('DD/MM/YYYY HH:mm')}</Text>
                </Space>
                <Descriptions size="small" column={2} bordered>
                  <Descriptions.Item label="Combustible">{latestSounding.total_fuel_tons?.toFixed(1)} t</Descriptions.Item>
                  <Descriptions.Item label="Agua Dulce">{latestSounding.total_fresh_water_tons?.toFixed(1)} t</Descriptions.Item>
                  <Descriptions.Item label="Lastre">{latestSounding.total_ballast_tons?.toFixed(1)} t</Descriptions.Item>
                  <Descriptions.Item label="Trim">{latestSounding.trim_m !== null ? `${latestSounding.trim_m?.toFixed(2)} m` : '—'}</Descriptions.Item>
                </Descriptions>
              </div>
            ) : (
              <Empty description="Sin sondeos oficiales registrados para esta embarcación" />
            )}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card
            title={<span>⚖️ Evaluación de Estabilidad del Crucero</span>}
            size="small"
            style={{ borderRadius: 10, height: '100%' }}
            extra={
              <Button
                type="primary"
                size="small"
                onClick={() => onNavigate(`/stability`)}
                style={{ background: '#0A2647', borderColor: '#0A2647' }}
              >
                Abrir Calculador de Estabilidad
              </Button>
            }
          >
            {latestCond ? (
              <div>
                <Space style={{ marginBottom: 12 }} wrap>
                  <Tag
                    color={
                      latestCond.status_level === 'APROBADO' ? 'success' : latestCond.status_level === 'ADVERTENCIA' ? 'warning' : 'error'
                    }
                    style={{ fontWeight: 600 }}
                  >
                    {latestCond.status_level}
                  </Tag>
                  <Text strong>{latestCond.condition_name}</Text>
                </Space>
                <Descriptions size="small" column={2} bordered>
                  <Descriptions.Item label="Desplazamiento">{latestCond.displacement_tons?.toFixed(1)} t</Descriptions.Item>
                  <Descriptions.Item label="KG Corregido">{latestCond.kg_corrected_m?.toFixed(3)} m</Descriptions.Item>
                  <Descriptions.Item label="KG Máximo">{latestCond.kg_max_m?.toFixed(3)} m</Descriptions.Item>
                  <Descriptions.Item label="Margen">{(latestCond.stability_margin_m * 100)?.toFixed(1)} cm</Descriptions.Item>
                </Descriptions>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                  Aún no se ha guardado una condición de estabilidad específica para este crucero.
                </Text>
                <Button
                  type="primary"
                  style={{ background: '#27AE60', borderColor: '#27AE60' }}
                  onClick={() => onNavigate(`/stability`)}
                >
                  ⚡ Evaluar Estabilidad Pre-Zarpe
                </Button>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────
function CruisesPage() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.is_superadmin || user?.roles?.some(r => r.name === 'Administrador');

  const [cruises, setCruises] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [captains, setCaptains] = useState([]);
  const [ports, setPorts] = useState([]);
  const [projectsList, setProjectsList] = useState([]);
  const [showCustomProjectInput, setShowCustomProjectInput] = useState(false);
  const [summary, setSummary] = useState({ total: 0, borrador: 0, pendiente: 0, planificado: 0, en_curso: 0, completado: 0, total_nm: 0 });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });
  const [search, setSearch] = useState('');
  const [filterVessel, setFilterVessel] = useState(null);
  const [filterStatus, setFilterStatus] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCruise, setEditingCruise] = useState(null);
  const [mapCruise, setMapCruise] = useState(null);
  const [participantsCruise, setParticipantsCruise] = useState(null);
  const [previewCruise, setPreviewCruise] = useState(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const selectedVesselId = Form.useWatch('vessel_id', form);
  const selectedVesselObj = vessels.find(v => v.id === selectedVesselId);

  const watchedDepartureDate = Form.useWatch('departure_date', form);
  const watchedDeparturePortId = Form.useWatch('departure_port_id', form);
  const watchedReturnPortId = Form.useWatch('return_port_id', form);

  const suggestedReturnDate = useMemo(() => {
    if (!watchedDepartureDate) return null;

    const waypoints = editingCruise?.waypoints || [];
    const departurePort = ports.find(p => p.id === watchedDeparturePortId);
    const returnPort = ports.find(p => p.id === watchedReturnPortId);
    const maxSpeed = editingCruise?.vessel?.max_speed_knots || selectedVesselObj?.max_speed_knots || null;

    const tripPoints = [];
    if (departurePort && departurePort.latitude != null && departurePort.longitude != null) {
      tripPoints.push({
        latitude: departurePort.latitude,
        longitude: departurePort.longitude,
        name: departurePort.name,
        isPort: true
      });
    }
    const validWaypoints = waypoints.filter(
      w => w.latitude != null && w.longitude != null && isFinite(w.latitude) && isFinite(w.longitude)
    );
    validWaypoints.forEach(w => {
      tripPoints.push(w);
    });
    if (returnPort && returnPort.latitude != null && returnPort.longitude != null) {
      tripPoints.push({
        latitude: returnPort.latitude,
        longitude: returnPort.longitude,
        name: returnPort.name,
        isPort: true
      });
    }

    if (tripPoints.length < 2) {
      let totalHours = 0;
      validWaypoints.forEach(wp => {
        if (wp.duration_hours) totalHours += wp.duration_hours;
      });
      if (totalHours > 0) {
        return dayjs(watchedDepartureDate).add(totalHours, 'hour');
      }
      return null;
    }

    let totalMeters = 0;
    let totalHours = 0;

    for (let i = 1; i < tripPoints.length; i++) {
      const prev = tripPoints[i - 1];
      const curr = tripPoints[i];

      const p1 = L.latLng(prev.latitude, prev.longitude);
      const p2 = L.latLng(curr.latitude, curr.longitude);
      const distMeters = p1.distanceTo(p2);
      totalMeters += distMeters;

      const distNm = distMeters / 1852;
      const speed = curr.speed_knots || maxSpeed || 10;
      totalHours += (distNm / speed);
    }

    waypoints.forEach(wp => {
      if (wp.duration_hours) totalHours += wp.duration_hours;
    });

    if (totalHours > 0) {
      return dayjs(watchedDepartureDate).add(totalHours, 'hour');
    }
    return null;
  }, [watchedDepartureDate, watchedDeparturePortId, watchedReturnPortId, editingCruise?.waypoints, editingCruise?.vessel, selectedVesselObj, ports]);

  // Nuevos estados para Muestreo Científico y Logística
  const [checklist, setChecklist] = useState([]);
  const [discharges, setDischarges] = useState([]);
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);
  const [waypointSamples, setWaypointSamples] = useState([]);
  const [activeTab, setActiveTab] = useState('1');
  const [eventTypes, setEventTypes] = useState([]);
  const [cruiseLogEntries, setCruiseLogEntries] = useState([]);
  const [loadingLogEntries, setLoadingLogEntries] = useState(false);
  const [gpxUploading, setGpxUploading] = useState(false);
  const [showActualTrack, setShowActualTrack] = useState(true);
  const gpxStats = useMemo(() => {
    if (editingCruise?.actual_track) {
      return calcGpxStats(editingCruise.actual_track);
    }
    return null;
  }, [editingCruise?.actual_track]);

  // Estados y Hooks para Telemetría Real
  const [trackSource, setTrackSource] = useState('telemetry'); // 'telemetry' | 'gpx'
  const [telemetryTrack, setTelemetryTrack] = useState([]);
  const [telemetryLoading, setTelemetryLoading] = useState(false);

  const telemetryStats = useMemo(() => {
    return calcTelemetryStats(telemetryTrack);
  }, [telemetryTrack]);

  const fetchTelemetryTrack = useCallback(async (currentCruise) => {
    const c = currentCruise || editingCruise;
    if (!c?.vessel_id || !c?.departure_date || !c?.return_date) {
      setTelemetryTrack([]);
      return;
    }
    setTelemetryLoading(true);
    try {
      const start = dayjs(c.departure_date).toISOString();
      const end = dayjs(c.return_date).toISOString();
      const res = await apiClient.get(`/vessels/${c.vessel_id}/telemetry`, {
        params: { start, end }
      });
      const data = res.data || [];
      setTelemetryTrack(data);
      // Priorizar telemetría de la estación meteorológica por defecto
      if (data.length > 0) {
        setTrackSource('telemetry');
      } else if (c.actual_track && c.actual_track.length > 0) {
        setTrackSource('gpx');
      }
    } catch (err) {
      console.error("Error al cargar telemetría del crucero:", err);
      setTelemetryTrack([]);
      if (c?.actual_track && c.actual_track.length > 0) {
        setTrackSource('gpx');
      }
    } finally {
      setTelemetryLoading(false);
    }
  }, [editingCruise?.vessel_id, editingCruise?.departure_date, editingCruise?.return_date, editingCruise?.actual_track]);

  const handleDownloadTelemetryCsv = useCallback(() => {
    if (!telemetryTrack || telemetryTrack.length === 0) {
      message.warning('No hay datos de telemetría disponibles para exportar.');
      return;
    }

    const headers = [
      'Fecha y Hora (Local)',
      'Fecha y Hora (UTC)',
      'Latitud',
      'Longitud',
      'Temperatura (C)',
      'Humedad (%)',
      'Presion (hPa)',
      'Punto Rocio (C)',
      'Viento Relativo (m/s)',
      'Viento Relativo (nudos)',
      'Dir Viento Relativo (grados)',
      'Viento Corregido (m/s)',
      'Viento Corregido (nudos)',
      'Dir Viento Corregido (grados)',
      'Dir Cardinal',
      'Precipitacion Total (mm)',
      'Intensidad Precipitacion (mm/h)',
      'Voltaje Suministro (V)',
    ];

    const rows = telemetryTrack.map((pt) => {
      const localTime = pt.timestamp ? dayjs(pt.timestamp).format('YYYY-MM-DD HH:mm:ss') : '';
      const utcTime = pt.timestamp ? new Date(pt.timestamp).toISOString().replace('T', ' ').substring(0, 19) : '';
      const windKts = pt.wind_speed != null ? (pt.wind_speed * 1.94384).toFixed(2) : '';
      const windCorrKts = pt.wind_speed_corr != null ? (pt.wind_speed_corr * 1.94384).toFixed(2) : '';
      const dirCard = pt.wind_dir_corr != null ? getWindDirectionText(pt.wind_dir_corr) : (pt.wind_dir != null ? getWindDirectionText(pt.wind_dir) : '');

      return [
        localTime,
        utcTime,
        pt.latitude ?? '',
        pt.longitude ?? '',
        pt.temp ?? '',
        pt.humidity ?? '',
        pt.pressure ?? '',
        pt.dewpoint ?? '',
        pt.wind_speed ?? '',
        windKts,
        pt.wind_dir ?? '',
        pt.wind_speed_corr ?? '',
        windCorrKts,
        pt.wind_dir_corr ?? '',
        `"${dirCard}"`,
        pt.precip_total ?? '',
        pt.precip_int ?? '',
        pt.supply_v ?? '',
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (editingCruise?.name || `crucero_${editingCruise?.id || 'telemetria'}`)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_\-]/g, '_');
    link.setAttribute('href', url);
    link.setAttribute('download', `telemetria_${safeName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success('Archivo CSV de telemetría descargado exitosamente');
  }, [telemetryTrack, editingCruise]);

  useEffect(() => {
    if (modalOpen && editingCruise?.vessel_id && editingCruise?.departure_date && editingCruise?.return_date) {
      fetchTelemetryTrack();
    }
  }, [modalOpen, editingCruise?.vessel_id, editingCruise?.departure_date, editingCruise?.return_date, fetchTelemetryTrack]);

  useEffect(() => {
    if (!modalOpen) {
      setTrackSource('telemetry');
      setTelemetryTrack([]);
    }
  }, [modalOpen]);

  // Auto-llenar tripulantes autorizados con la tripulación base/mínima de la embarcación seleccionada al crear
  useEffect(() => {
    if (!editingCruise && selectedVesselObj && selectedVesselObj.max_crew !== null && selectedVesselObj.max_crew !== undefined) {
      const currentVal = form.getFieldValue('crew_count');
      if (currentVal === 0 || currentVal === null || currentVal === undefined) {
        form.setFieldsValue({ crew_count: selectedVesselObj.max_crew });
      }
    }
  }, [selectedVesselObj, editingCruise, form]);

  // Estados de facturación
  const [cruiseBilling, setCruiseBilling] = useState(null);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [editBilling, setEditBilling] = useState(null);

  const fetchCruiseBilling = useCallback(async (cruiseId) => {
    if (!cruiseId) return;
    setLoadingBilling(true);
    try {
      const res = await apiClient.get(`/cruise-billings/cruise/${cruiseId}`);
      setCruiseBilling(res.data);
    } catch (err) {
      setCruiseBilling(null);
    } finally {
      setLoadingBilling(false);
    }
  }, []);

  // Estado para modales auxiliares de agregación
  const [subModalType, setSubModalType] = useState(null); // 'checklist' | 'discharge' | 'sample' | 'logbook'
  const [subForm] = Form.useForm();

  const fetchCruises = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (pagination.current - 1) * pagination.pageSize;
      const params = { skip, limit: pagination.pageSize };
      if (search) params.search = search;
      if (filterVessel) params.vessel_id = filterVessel;
      if (filterStatus) params.status = filterStatus;
      const r = await apiClient.get('/cruises', { params });
      setCruises(r.data.items);
      setTotal(r.data.total);
    } catch { message.error('Error al cargar cruceros'); }
    finally { setLoading(false); }
  }, [pagination, search, filterVessel, filterStatus]);

  const fetchMeta = useCallback(async () => {
    try {
      const [vr, sr, pr, projRes] = await Promise.all([
        apiClient.get('/vessels/options'),
        apiClient.get('/cruises/summary', { params: filterVessel ? { vessel_id: filterVessel } : {} }),
        apiClient.get('/ports/options'),
        apiClient.get('/projects', { params: { active_only: true } }),
      ]);
      setVessels(vr.data);
      setSummary(sr.data);
      setPorts(pr.data || []);
      setProjectsList(projRes.data || []);
    } catch { /* */ }
    // Fetch users separately so a limit error doesn’t block vessels
    try {
      const ur = await apiClient.get('/users/options');
      setCaptains(ur.data || []);
    } catch { /* */ }
    // Fetch event types for logbook subform
    try {
      const etr = await apiClient.get('/logbooks/event-types');
      setEventTypes(etr.data || []);
    } catch { /* */ }
  }, [filterVessel]);

  const fetchChecklist = async (cruiseId) => {
    try {
      const r = await apiClient.get(`/cruises/${cruiseId}/checklist`);
      setChecklist(r.data);
    } catch { message.error('Error al actualizar lista de embarque'); }
  };

  const fetchDischarges = async (cruiseId) => {
    try {
      const r = await apiClient.get(`/cruises/${cruiseId}/discharges`);
      setDischarges(r.data);
    } catch { message.error('Error al actualizar descargas'); }
  };

  const fetchWaypointSamples = async (waypointId) => {
    try {
      const r = await apiClient.get(`/cruises/waypoints/${waypointId}/samples`);
      setWaypointSamples(r.data);
    } catch { message.error('Error al actualizar matriz de muestras'); }
  };

  const fetchCruiseLogEntries = useCallback(async (cruiseId) => {
    setLoadingLogEntries(true);
    try {
      const r = await apiClient.get('/logbooks', { params: { cruise_id: cruiseId, limit: 100 } });
      setCruiseLogEntries(r.data.items);
    } catch {
      message.error('Error al cargar bitácoras del crucero');
    } finally {
      setLoadingLogEntries(false);
    }
  }, []);

  // ── GPX parsing y upload ──────────────────────────────────────
  const parseGpxFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parser = new DOMParser();
          const xml = parser.parseFromString(e.target.result, 'application/xml');
          const parseError = xml.querySelector('parsererror');
          if (parseError) throw new Error('El archivo GPX no es válido');

          const trkpts = xml.querySelectorAll('trkpt');
          if (!trkpts || trkpts.length === 0) {
            // Intentar con waypoints si no hay track
            const wpts = xml.querySelectorAll('wpt');
            if (!wpts || wpts.length === 0) throw new Error('No se encontraron puntos en el archivo GPX');
          }

          const allPoints = [];
          trkpts.forEach((pt) => {
            const lat = parseFloat(pt.getAttribute('lat'));
            const lon = parseFloat(pt.getAttribute('lon'));
            const timeEl = pt.querySelector('time');
            if (isFinite(lat) && isFinite(lon)) {
              allPoints.push({ lat, lon, time: timeEl?.textContent || null });
            }
          });

          // Decimación uniforme si hay más de 600 puntos
          const MAX_POINTS = 600;
          let points = allPoints;
          if (allPoints.length > MAX_POINTS) {
            const step = Math.ceil(allPoints.length / MAX_POINTS);
            points = allPoints.filter((_, i) => i % step === 0);
            // Siempre incluir el último punto
            const last = allPoints[allPoints.length - 1];
            if (points[points.length - 1] !== last) points.push(last);
          }

          resolve(points);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsText(file);
    });
  };

  const handleGpxUpload = async (file) => {
    setGpxUploading(true);
    try {
      const points = await parseGpxFile(file);
      if (points.length < 2) {
        message.error('El archivo GPX debe contener al menos 2 puntos');
        return;
      }
      const res = await apiClient.post(`/cruises/${editingCruise.id}/gpx`, {
        points,
        filename: file.name,
      });
      setEditingCruise(res.data);
      setTrackSource('gpx');
      setShowActualTrack(true);
      message.success(`Track GPX cargado: ${points.length} puntos de "${file.name}"`);
    } catch (err) {
      message.error(err?.response?.data?.detail || err?.message || 'Error al procesar el archivo GPX');
    } finally {
      setGpxUploading(false);
    }
    return false; // evitar que antd Upload haga su propio upload
  };

  const handleGpxDelete = async () => {
    try {
      await apiClient.delete(`/cruises/${editingCruise.id}/gpx`);
      setEditingCruise(prev => ({ ...prev, actual_track: null, actual_track_filename: null, actual_track_uploaded_at: null }));
      setTrackSource('telemetry');
      message.success('Track GPX eliminado');
    } catch (err) {
      message.error(err?.response?.data?.detail || 'Error al eliminar el track GPX');
    }
  };

  const handleCreateLogbookAtGpxPoint = (point) => {
    setSubModalType('logbook');
    subForm.resetFields();
    const pointTime = point.time ? dayjs(point.time) : dayjs();
    subForm.setFieldsValue({
      entry_date: pointTime,
      entry_time: point.time ? pointTime.format('HH:mm') : '',
      latitude: point.lat,
      longitude: point.lon,
      location_name: `Track GPS (${point.lat.toFixed(4)}, ${point.lon.toFixed(4)})`,
    });
  };

  const handleAddSubItem = async () => {
    try {
      const values = await subForm.validateFields();
      if (subModalType === 'checklist') {
        await apiClient.post(`/cruises/${editingCruise.id}/checklist`, values);
        message.success('Material agregado');
        fetchChecklist(editingCruise.id);
      } else if (subModalType === 'discharge') {
        const payload = {
          ...values,
          discharge_date: values.discharge_date?.format('YYYY-MM-DDTHH:mm:ss') || null,
        };
        await apiClient.post(`/cruises/${editingCruise.id}/discharges`, payload);
        message.success('Descarga lograda programada');
        fetchDischarges(editingCruise.id);
      } else if (subModalType === 'sample') {
        await apiClient.post(`/cruises/waypoints/${selectedWaypoint.id}/samples`, values);
        message.success('Variable de muestreo registrada');
        fetchWaypointSamples(selectedWaypoint.id);
      } else if (subModalType === 'logbook') {
        const payload = {
          ...values,
          vessel_id: editingCruise.vessel_id,
          cruise_id: editingCruise.id,
          entry_date: values.entry_date?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
        };
        await apiClient.post('/logbooks', payload);
        message.success('Entrada de bitácora registrada');
        fetchCruiseLogEntries(editingCruise.id);
      }
      setSubModalType(null);
      subForm.resetFields();
    } catch (err) {
      if (err.response?.data?.detail) message.error(err.response.data.detail);
    }
  };

  const handleToggleBoarded = async (item) => {
    try {
      await apiClient.put(`/cruises/${editingCruise.id}/checklist/${item.id}`, {
        is_boarded: !item.is_boarded
      });
      fetchChecklist(editingCruise.id);
    } catch {
      message.error('Error al actualizar estado del checklist');
    }
  };

  const handleDeleteChecklistItem = async (itemId) => {
    try {
      await apiClient.delete(`/cruises/${editingCruise.id}/checklist/${itemId}`);
      message.success('Material eliminado');
      fetchChecklist(editingCruise.id);
    } catch {
      message.error('Error al eliminar ítem');
    }
  };

  const handleDeleteDischarge = async (dischargeId) => {
    try {
      await apiClient.delete(`/cruises/${editingCruise.id}/discharges/${dischargeId}`);
      message.success('Descarga eliminada');
      fetchDischarges(editingCruise.id);
    } catch {
      message.error('Error al eliminar descarga');
    }
  };

  const handleDeleteWaypointSample = async (sampleId) => {
    try {
      await apiClient.delete(`/cruises/waypoints/${selectedWaypoint.id}/samples/${sampleId}`);
      message.success('Muestra eliminada');
      fetchWaypointSamples(selectedWaypoint.id);
    } catch {
      message.error('Error al eliminar muestra');
    }
  };

  useEffect(() => { fetchCruises(); }, [fetchCruises]);
  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  const openCreate = () => {
    setEditingCruise(null);
    setChecklist([]);
    setDischarges([]);
    setSelectedWaypoint(null);
    setWaypointSamples([]);
    setCruiseLogEntries([]);
    setCruiseBilling(null);
    setTelemetryTrack([]);
    setActiveTab('1');
    form.resetFields();
    setShowCustomProjectInput(false);
    form.setFieldsValue({
      status: 'borrador',
      crew_count: undefined,
      scientists_count: undefined,
    });
    setModalOpen(true);
  };

  const openEdit = async (c, initialTab = '1', initialWaypoint = null) => {
    try {
      const res = await apiClient.get(`/cruises/${c.id}`);
      const fullCruise = res.data;
      setEditingCruise(fullCruise);
      // Priorizar telemetría de la estación meteorológica por defecto
      setTrackSource('telemetry');
      setChecklist(fullCruise.checklist || []);
      setDischarges(fullCruise.discharges || []);
      setSelectedWaypoint(initialWaypoint);
      if (initialWaypoint) {
        const r = await apiClient.get(`/cruises/waypoints/${initialWaypoint.id}/samples`);
        setWaypointSamples(r.data);
      } else {
        setWaypointSamples([]);
      }
      fetchCruiseLogEntries(c.id);
      fetchCruiseBilling(c.id);
      fetchTelemetryTrack(fullCruise);
      setActiveTab(initialTab);
      const isCustomProject = !fullCruise.project_id && fullCruise.project_name;
      setShowCustomProjectInput(isCustomProject);
      form.setFieldsValue({
        ...fullCruise,
        project_id: fullCruise.project_id || (fullCruise.project_name ? 'otro' : undefined),
        departure_date: fullCruise.departure_date ? dayjs(fullCruise.departure_date) : null,
        return_date: fullCruise.return_date ? dayjs(fullCruise.return_date) : null,
      });
      setModalOpen(true);
    } catch {
      message.error('Error al cargar detalles del crucero');
    }
  };

  const handleSave = async (andStayOpen = false, targetTab = null) => {
    try {
      const values = await form.validateFields();
      
      const selectedVesselId = values.vessel_id || editingCruise?.vessel_id;
      const selectedVessel = vessels.find(v => v.id === selectedVesselId);
      if (selectedVessel) {
        if (values.scientists_count && selectedVessel.max_passengers !== null && values.scientists_count > selectedVessel.max_passengers) {
          message.error(`El número de investigadores autorizados (${values.scientists_count}) excede la capacidad máxima de la embarcación (${selectedVessel.max_passengers} personas).`);
          return false;
        }
      }

      // Determinar project_id y project_name
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
        ...values,
        project_id: pId,
        project_name: pName,
        departure_date: values.departure_date?.format('YYYY-MM-DDTHH:mm:ss') || null,
        return_date: values.return_date?.format('YYYY-MM-DDTHH:mm:ss') || null,
      };
      setSaving(true);
      if (editingCruise) {
        await apiClient.put(`/cruises/${editingCruise.id}`, payload);
        message.success('Crucero actualizado');
        const refreshRes = await apiClient.get(`/cruises/${editingCruise.id}`);
        setEditingCruise(refreshRes.data);
        if (!andStayOpen) {
          setModalOpen(false);
        }
      } else {
        const res = await apiClient.post('/cruises', { ...payload, waypoints: [] });
        message.success('Plan de crucero creado');
        const fullRes = await apiClient.get(`/cruises/${res.data.id}`);
        setEditingCruise(fullRes.data);
        if (andStayOpen && targetTab) {
          setActiveTab(targetTab);
        } else if (!andStayOpen) {
          setModalOpen(false);
        }
      }
      fetchCruises(); fetchMeta();
      return true;
    } catch (err) {
      if (err.response?.data?.detail) message.error(err.response.data.detail);
      return false;
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    await apiClient.delete(`/cruises/${id}`);
    message.success('Plan eliminado');
    fetchCruises(); fetchMeta();
  };

  const handlePreviewPdf = async (r) => {
    const hide = message.loading('Cargando personal a bordo...', 0);
    try {
      const [resParts, resCrew] = await Promise.all([
        apiClient.get(`/cruises/${r.id}/participants`),
        apiClient.get(`/cruises/${r.id}/crew`),
      ]);
      setPreviewCruise({ ...r, participants: resParts.data, crew: resCrew.data });
    } catch {
      message.error('Error al cargar personal a bordo del crucero');
      setPreviewCruise(r);
    } finally {
      hide();
    }
  };

  const handleDownloadDocx = async (r) => {
    try {
      const response = await apiClient.get(`/cruises/${r.id}/export/docx`, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Plan_de_Campana_${r.cruise_number || r.id}.docx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('Error al descargar el archivo de Word');
    }
  };

  const columns = [
    {
      title: 'Folio / Número',
      dataIndex: 'cruise_number',
      key: 'cruise_number',
      width: 145,
      render: (val) => val ? <Text code style={{ fontWeight: 600 }}>{val}</Text> : <Text type="secondary">—</Text>,
      sorter: (a, b) => (a.cruise_number || '').localeCompare(b.cruise_number || ''),
    },
    {
      title: 'Plan de Crucero',
      key: 'name',
      width: 300,
      render: (_, r) => (
        <div>
          <Text strong>{r.name}</Text>
          {r.project_name && <><br /><Text type="secondary" style={{ fontSize: 11 }}>📁 Proyecto: {r.project_name}</Text></>}
          {r.objective && <><br /><Text type="secondary" style={{ fontSize: 11 }}>{r.objective?.substring(0, 70)}...</Text></>}
        </div>
      ),
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
    },
    { 
      title: 'Embarcación', 
      key: 'vessel', 
      width: 140, 
      render: (_, r) => <Text>{r.vessel?.name}</Text>,
      sorter: (a, b) => (a.vessel?.name || '').localeCompare(b.vessel?.name || ''),
    },
    {
      title: 'Estado', dataIndex: 'status', width: 120,
      render: (s) => <Tag color={STATUS_MAP[s]?.color}>{STATUS_MAP[s]?.label}</Tag>,
      sorter: (a, b) => (a.status || '').localeCompare(b.status || ''),
    },
    {
      title: 'Facturación',
      key: 'billing',
      width: 155,
      render: (_, r) => {
        if (r.status !== 'completado') {
          return <Text type="secondary" style={{ fontStyle: 'italic', fontSize: 12 }}>N/A (No completado)</Text>;
        }
        if (!r.billing) {
          return <Tag color="default">Sin registrar</Tag>;
        }
        
        const b = r.billing;
        const statusConfig = BILLING_STATUS_MAP[b.status] || { label: b.status, color: 'default' };
        
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div>
              <Tag color={statusConfig.color} icon={statusConfig.icon} style={{ marginRight: 0, fontSize: 11 }}>
                {statusConfig.label}
              </Tag>
            </div>
            {b.total != null && (
              <div style={{ fontSize: 12, fontWeight: 600, color: '#2C3E50', marginTop: 2 }}>
                {b.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {b.currency}
              </div>
            )}
            {(b.receipt_filename || b.vessel_order_filename || b.signed_vessel_order_filename) && (
              <Space size={6} style={{ marginTop: 2 }}>
                {b.receipt_filename && (
                  <Tooltip title="Ver Recibo">
                    <Button 
                      type="text" 
                      size="small" 
                      style={{ padding: 0, height: 'auto', display: 'inline-flex', alignItems: 'center' }} 
                      icon={<FilePdfOutlined style={{ color: '#C0392B', fontSize: 15 }} />} 
                      href={`${apiClient.defaults.baseURL.replace('/api/v1', '')}${b.receipt_filename}`} 
                      target="_blank" 
                    />
                  </Tooltip>
                )}
                {b.vessel_order_filename && (
                  <Tooltip title="Ver Orden Embarcación">
                    <Button 
                      type="text" 
                      size="small" 
                      style={{ padding: 0, height: 'auto', display: 'inline-flex', alignItems: 'center' }} 
                      icon={<FilePdfOutlined style={{ color: '#2980B9', fontSize: 15 }} />} 
                      href={`${apiClient.defaults.baseURL.replace('/api/v1', '')}${b.vessel_order_filename}`} 
                      target="_blank" 
                    />
                  </Tooltip>
                )}
                {b.signed_vessel_order_filename && (
                  <Tooltip title="Ver Orden Firmada">
                    <Button 
                      type="text" 
                      size="small" 
                      style={{ padding: 0, height: 'auto', display: 'inline-flex', alignItems: 'center' }} 
                      icon={<FilePdfOutlined style={{ color: '#27AE60', fontSize: 15 }} />} 
                      href={`${apiClient.defaults.baseURL.replace('/api/v1', '')}${b.signed_vessel_order_filename}`} 
                      target="_blank" 
                    />
                  </Tooltip>
                )}
              </Space>
            )}
          </div>
        );
      }
    },
    {
      title: 'Fechas', key: 'dates', width: 160,
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          {r.departure_date && <div>🚢 {dayjs(r.departure_date).format('DD/MM/YYYY HH:mm')}</div>}
          {r.return_date && <div>⚓ {dayjs(r.return_date).format('DD/MM/YYYY HH:mm')}</div>}
          {r.duration_days != null && <Text type="secondary">{r.duration_days} días</Text>}
        </div>
      ),
      sorter: (a, b) => dayjs(a.departure_date || 0).unix() - dayjs(b.departure_date || 0).unix(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Métricas', key: 'metrics', width: 140,
      render: (_, r) => (
        <div style={{ fontSize: 11 }}>
          {(r.actual_nm || r.planned_nm) && <div>⚓ {r.actual_nm || r.planned_nm} mn</div>}
          {r.crew_count && <div>👥 {r.crew_count} tripulación DEO</div>}
          {r.scientists_count && <div>🔬 {r.scientists_count} investigadores</div>}
        </div>
      ),
    },
    {
      title: 'Ruta', key: 'waypoints', width: 100,
      render: (_, r) => (
        <Button type="text" icon={<EnvironmentOutlined style={{ color: r.waypoints?.length ? '#0A2647' : '#ccc' }} />}
          onClick={async () => {
            try {
              const res = await apiClient.get(`/cruises/${r.id}`);
              setMapCruise(res.data);
            } catch {
              message.error('Error al cargar ruta del crucero');
            }
          }}>
          {r.waypoints?.length || 0} pts
        </Button>
      ),
    },
    {
      title: 'Participantes', key: 'participants', width: 110,
      render: (_, r) => (
        <Button
          type="text"
          icon={<TeamOutlined style={{ color: r.participants_count > 0 ? '#0A2647' : '#ccc' }} />}
          onClick={() => setParticipantsCruise(r)}
        >
          {r.participants_count || 0} pers.
        </Button>
      ),
    },
    {
      title: 'Acciones', key: 'actions', width: 160,
      render: (_, r) => (
        <Space size={2}>
          <Tooltip title="Previsualizar Plan de Campaña (PDF)">
            <Button type="text" icon={<FilePdfOutlined style={{ color: '#E74C3C' }} />} onClick={() => handlePreviewPdf(r)} />
          </Tooltip>
          <Tooltip title="Descargar Plan en Word (DOCX)">
            <Button type="text" icon={<FileWordOutlined style={{ color: '#2B579A' }} />} onClick={() => handleDownloadDocx(r)} />
          </Tooltip>
          <CanAccess module="cruises" action="edit">
            <Tooltip title="Editar"><Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          </CanAccess>
          <CanAccess module="cruises" action="delete">
            <Popconfirm title="¿Eliminar plan?" onConfirm={() => handleDelete(r.id)}>
              <Tooltip title="Eliminar"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>
          </CanAccess>
        </Space>
      ),
    },
  ];

  const tabItems = [
    {
      key: '1',
      label: 'Datos Generales',
      children: (
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            {!editingCruise ? (
              <Col span={12}>
                <Form.Item name="vessel_id" label="Embarcación" rules={[{ required: true, message: 'Seleccione una embarcación' }]}>
                  <Select
                    placeholder="Seleccionar embarcación"
                    options={vessels.map(v => ({ value: v.id, label: v.name }))}
                    onChange={(vId) => {
                      const vObj = vessels.find(v => v.id === vId);
                      if (vObj && vObj.max_crew !== null && vObj.max_crew !== undefined) {
                        form.setFieldsValue({ crew_count: vObj.max_crew });
                      }
                    }}
                  />
                </Form.Item>
              </Col>
            ) : (
              <Col span={12}>
                <Form.Item label="Embarcación">
                  <Input value={editingCruise.vessel?.name} disabled />
                </Form.Item>
              </Col>
            )}
            <Col span={12}>
              <Form.Item name="cruise_number" label="Número de crucero / Folio" extra="Se autogenera si se deja vacío">
                <Input placeholder="ej: ALBA-2026-01" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="name" label="Nombre del plan" rules={[{ required: true }]}>
            <Input placeholder="ej: Crucero Corriente Costera BC-2026-01" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="project_id" label="Proyecto asociado" rules={[{ required: true, message: 'Selecciona un proyecto' }]}>
                <Select
                  showSearch
                  placeholder="Seleccionar proyecto"
                  optionFilterProp="children"
                  onChange={(val) => {
                    setShowCustomProjectInput(val === 'otro');
                    if (val !== 'otro') {
                      const matchedProj = projectsList.find(p => p.id === val);
                      if (matchedProj) {
                        form.setFieldsValue({ 
                          project_name: matchedProj.name,
                          cruise_responsible: matchedProj.responsible_name
                        });
                      }
                    } else {
                      form.setFieldsValue({ project_name: '', cruise_responsible: '' });
                    }
                  }}
                >
                  <Select.OptGroup label="Catálogo de Proyectos">
                    {projectsList.map(p => (
                      <Select.Option key={p.id} value={p.id}>
                        {p.account_number} — {p.name}
                      </Select.Option>
                    ))}
                  </Select.OptGroup>
                  <Select.OptGroup label="Alternativa">
                    <Select.Option value="otro">✍️ Otro (Capturar manualmente)</Select.Option>
                  </Select.OptGroup>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="funding_source" label="Fuente de financiamiento">
                <Input placeholder="ej: CONACYT CB-2024-XXXX" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="cruise_responsible" label="Responsable del Crucero (No necesariamente se embarca)">
                <Input placeholder="Nombre de la persona responsable del crucero (opcional)" />
              </Form.Item>
            </Col>
          </Row>

          {showCustomProjectInput && (
            <Row gutter={16}>
              <Col span={24}>
                <Form.Item name="project_name" label="Nombre del Proyecto (Manual)" rules={[{ required: true, message: 'El nombre es requerido' }]}>
                  <Input placeholder="ej: Proyecto Bacab Lum — SEP-CONACYT" />
                </Form.Item>
              </Col>
            </Row>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="study_area" label="Área de estudio">
                <TextArea rows={2} placeholder="ej: Zona económica exclusiva, frente a Ensenada" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="disciplines" label="Disciplinas científicas">
                <TextArea rows={2} placeholder="ej: Oceanografía física, química, biológica" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="objective" label="Objetivo científico / operativo">
            <TextArea rows={2} placeholder="Objetivo científico u operativo del crucero" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={isAdmin ? 8 : 24}>
              <Form.Item name="status" label="Estado">
                <Select options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
              </Form.Item>
            </Col>
            {isAdmin && (
              <Col span={16}>
                <Form.Item
                  label={
                    <span>
                      Capitán de la Embarcación (DEO) &nbsp;
                      <Tooltip title="Asignado automáticamente de la tripulación base de la embarcación o personal con rol Capitán en la pestaña Participantes.">
                        <InfoCircleOutlined />
                      </Tooltip>
                    </span>
                  }
                >
                  {(() => {
                    const captainCrew = editingCruise?.crew?.find(c => c.role === 'capitan');
                    const captainName = captainCrew?.personnel?.full_name
                      || selectedVesselObj?.default_captain_name
                      || selectedVesselObj?.default_captain?.full_name
                      || editingCruise?.vessel?.default_captain_name
                      || editingCruise?.captain?.full_name;

                    return captainName ? (
                      <Input
                        disabled
                        value={captainName}
                        style={{ background: '#f6ffed', borderColor: '#b7eb8f', color: '#237804', fontWeight: 500 }}
                        prefix={<span style={{ marginRight: 4 }}>⚓</span>}
                      />
                    ) : (
                      <Input
                        disabled
                        placeholder={
                          (selectedVesselId || editingCruise?.vessel_id)
                            ? "Sin capitán base en esta embarcación — puede asignarse en la pestaña Participantes"
                            : "Seleccione una embarcación para ver el capitán"
                        }
                        style={{ background: '#fffbe6', borderColor: '#ffe58f' }}
                      />
                    );
                  })()}
                </Form.Item>
              </Col>
            )}
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="departure_port_id" label="Puerto de salida">
                <Select
                  placeholder="Seleccionar puerto"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={ports.map(p => ({ value: p.id, label: p.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="return_port_id" label="Puerto de regreso">
                <Select
                  placeholder="Seleccionar puerto"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={ports.map(p => ({ value: p.id, label: p.name }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="departure_date" label="Fecha y hora salida"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY HH:mm" showTime={{ format: 'HH:mm' }} /></Form.Item></Col>
            <Col span={12}>
              <Form.Item
                name="return_date"
                label="Fecha y hora regreso"
                extra={
                  suggestedReturnDate ? (
                    <span style={{ fontSize: '12px', color: '#595959' }}>
                      Sugerido por ruta: <strong>{suggestedReturnDate.format('DD/MM/YYYY HH:mm')}</strong>{' '}
                      <a onClick={() => form.setFieldsValue({ return_date: suggestedReturnDate })} style={{ marginLeft: 6 }}>
                        (Aplicar sugerido)
                      </a>
                    </span>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#8c8c8c' }}>
                      No hay ruta configurada para calcular una fecha sugerida
                    </span>
                  )
                }
              >
                <DatePicker placeholder="Seleccionar fecha y hora" style={{ width: '100%' }} format="DD/MM/YYYY HH:mm" showTime={{ format: 'HH:mm' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="planned_nm" label="Millas planificadas"><InputNumber disabled placeholder="Autocalculado" style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col span={8}><Form.Item name="actual_nm" label="Millas reales"><InputNumber style={{ width: '100%' }} min={0} step={10} /></Form.Item></Col>
            <Col span={8}><Form.Item name="fuel_consumed" label="Combustible (L)"><InputNumber style={{ width: '100%' }} min={0} step={100} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            {isAdmin && (
              <Col span={12}>
                <Form.Item
                  name="crew_count"
                  label="Tripulantes autorizados (DEO)"
                  extra={selectedVesselObj && selectedVesselObj.max_crew !== null ? `Tripulación mínima requerida: ${selectedVesselObj.max_crew}` : undefined}
                >
                  <InputNumber style={{ width: '100%' }} min={0} />
                </Form.Item>
              </Col>
            )}
            <Col span={isAdmin ? 12 : 24}>
              <Form.Item
                name="scientists_count"
                label="Investigadores autorizados (Planificado)"
                extra={selectedVesselObj && selectedVesselObj.max_passengers !== null ? `Capacidad máxima: ${selectedVesselObj.max_passengers}` : undefined}
              >
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>

          {/* Banner de redirección para gestionar la tripulación real */}
          <div style={{
            background: '#F0F5FF',
            border: '1px solid #ADC6FF',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div style={{ flex: '1 1 auto' }}>
              <Text strong style={{ color: '#0A2647', display: 'block', fontSize: 13, marginBottom: 2 }}>
                ⚓ Asignación de Tripulantes y Científicos a Bordo
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Para asignar los nombres específicos de la tripulación y del personal científico, utiliza el panel de participantes.
              </Text>
            </div>
            <Button
              type="primary"
              ghost
              icon={<TeamOutlined />}
              onClick={() => {
                if (editingCruise) {
                  setActiveTab('participants');
                } else {
                  handleSave(true, 'participants');
                }
              }}
              style={{ flex: '0 0 auto' }}
            >
              Gestionar Participantes
            </Button>
          </div>

          <Form.Item name="notes" label="Notas"><TextArea rows={2} /></Form.Item>
        </Form>
      )
    },
    {
      key: 'route',
      label: '🗺️ Waypoints y Ruta',
      children: (
        <div style={{ marginTop: 10 }}>
          {editingCruise ? (
            <WaypointMapModal
              cruise={editingCruise}
              defaultDepartureDate={form.getFieldValue('departure_date')}
              inline={true}
              onSave={() => {
                fetchCruises();
                apiClient.get(`/cruises/${editingCruise.id}`).then(res => {
                  const fullCruise = res.data;
                  setEditingCruise(fullCruise);
                  form.setFieldsValue({
                    planned_nm: fullCruise.planned_nm,
                    return_date: fullCruise.return_date ? dayjs(fullCruise.return_date) : null,
                  });
                });
              }}
            />
          ) : (
            <UnsavedCruiseNotice
              tabTitle="🗺️ Waypoints y Ruta"
              description="Para trazar la ruta de navegación en el mapa interactivo o importar archivos KML/KMZ con tus estaciones, primero guarda los datos generales del crucero."
              onSave={() => handleSave(true, 'route')}
              saving={saving}
            />
          )}
        </div>
      )
    },
    {
      key: 'participants',
      label: '⚓ Participantes',
      children: (
        <div style={{ marginTop: 10 }}>
          {editingCruise ? (
            <ParticipantsDrawer
              cruise={editingCruise}
              inline={true}
              onClose={() => {
                apiClient.get(`/cruises/${editingCruise.id}`).then(res => {
                  setEditingCruise(res.data);
                });
              }}
            />
          ) : (
            <UnsavedCruiseNotice
              tabTitle="⚓ Personal Científico y Tripulación"
              description="Para registrar al Jefe Científico, investigadores a bordo y tripulación DEO, primero guarda los datos generales del crucero."
              onSave={() => handleSave(true, 'participants')}
              saving={saving}
            />
          )}
        </div>
      )
    },
    {
      key: '2',
      label: 'Muestreo Científico (Matriz)',
      children: (
        <div style={{ marginTop: 16 }}>
          {editingCruise ? (
            <>
              <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                Selecciona una estación de la lista para ver, agregar o editar su matriz de muestras y lances científicos.
              </Text>
              <Row gutter={16}>
                <Col span={10}>
                  <Table
                    dataSource={editingCruise?.waypoints || []}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    columns={[
                      { title: 'Est.', dataIndex: 'order_index', width: 60, render: (v) => `#${v + 1}` },
                      { title: 'Nombre', dataIndex: 'name', render: (n) => <Text strong>{n || 'Sin nombre'}</Text> },
                      {
                        title: 'Acción',
                        key: 'action',
                        width: 110,
                        render: (_, r) => (
                          <Button
                            type={selectedWaypoint?.id === r.id ? 'primary' : 'default'}
                            size="small"
                            onClick={() => {
                              setSelectedWaypoint(r);
                              fetchWaypointSamples(r.id);
                            }}
                          >
                            {selectedWaypoint?.id === r.id ? 'Seleccionado' : 'Ver lances'}
                          </Button>
                        )
                      }
                    ]}
                  />
                </Col>
                <Col span={14}>
                  {selectedWaypoint ? (
                    <Card
                      title={`Muestras en Estación: ${selectedWaypoint.name || `#${selectedWaypoint.order_index + 1}`}`}
                      size="small"
                      extra={
                        <Button
                          type="primary"
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={() => {
                            setSubModalType('sample');
                            subForm.resetFields();
                          }}
                        >
                          Nueva Muestra
                        </Button>
                      }
                    >
                      <Table
                        dataSource={waypointSamples}
                        rowKey="id"
                        pagination={false}
                        size="small"
                        columns={[
                          { title: 'Ord.', dataIndex: 'sampling_order', width: 50 },
                          { title: 'Variable', dataIndex: 'variable_name', render: (v) => <Text strong>{v}</Text> },
                          { title: 'Científico', dataIndex: 'responsible_name', render: (r) => r || '—' },
                          { title: 'Volumen', dataIndex: 'volume_needed', render: (vol) => vol || '—' },
                          {
                            title: 'Nivel',
                            key: 'depths',
                            render: (_, r) => (
                              <Space size={2} wrap>
                                {r.depth_surface && <Tag color="blue" style={{ fontSize: 9 }}>Sup</Tag>}
                                {r.depth_mid_water && <Tag color="cyan" style={{ fontSize: 9 }}>Med</Tag>}
                                {r.depth_bottom && <Tag color="geekblue" style={{ fontSize: 9 }}>Fon</Tag>}
                                {r.depth_custom && <Tag color="orange" style={{ fontSize: 9 }}>{r.depth_custom}</Tag>}
                                {!r.depth_surface && !r.depth_mid_water && !r.depth_bottom && !r.depth_custom && <Tag style={{ fontSize: 9 }}>—</Tag>}
                              </Space>
                            )
                          },
                          {
                            title: '',
                            key: 'delete',
                            width: 40,
                            render: (_, r) => (
                              <Popconfirm title="¿Eliminar esta muestra?" onConfirm={() => handleDeleteWaypointSample(r.id)}>
                                <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                              </Popconfirm>
                            )
                          }
                        ]}
                      />
                    </Card>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 0', border: '1px dashed #ccc', borderRadius: 8, background: '#fafafa' }}>
                      <CompassOutlined style={{ fontSize: 32, color: '#ccc', marginBottom: 8 }} />
                      <p style={{ margin: 0, color: '#999' }}>Ninguna estación seleccionada</p>
                    </div>
                  )}
                </Col>
              </Row>
            </>
          ) : (
            <UnsavedCruiseNotice
              tabTitle="🔬 Matriz de Muestreo Científico"
              description="Para configurar variables, lances de CTD, redes o botellas por estación, primero guarda los datos generales y define las estaciones de la ruta."
              onSave={() => handleSave(true, '2')}
              saving={saving}
            />
          )}
        </div>
      )
    },
    {
      key: '3',
      label: 'Lista de Embarque (Checklist)',
      children: (
        <div style={{ marginTop: 16 }}>
          {editingCruise ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text type="secondary">
                  Control de equipos científicos, hieleras y materiales que deben cargarse a bordo del barco.
                </Text>
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setSubModalType('checklist');
                    subForm.resetFields();
                  }}
                >
                  Agregar Ítem
                </Button>
              </div>
              <Table
                dataSource={checklist}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: 'Responsable', dataIndex: 'investigator_name', render: (n) => <Text strong>{n}</Text>, width: 180 },
                  { title: 'Material / Equipo / Reactivo', dataIndex: 'item_name' },
                  { title: 'Cantidad', dataIndex: 'quantity', width: 80, render: (q) => <Tag color="purple">{q}</Tag> },
                  {
                    title: 'A Bordo',
                    key: 'is_boarded',
                    width: 110,
                    render: (_, r) => (
                      <Button
                        type={r.is_boarded ? 'primary' : 'default'}
                        size="small"
                        style={r.is_boarded ? { backgroundColor: '#52C41A', borderColor: '#52C41A' } : {}}
                        onClick={() => handleToggleBoarded(r)}
                      >
                        {r.is_boarded ? 'Cargado' : 'Pendiente'}
                      </Button>
                    )
                  },
                  { title: 'Notas', dataIndex: 'notes', render: (n) => n || '—' },
                  {
                    title: '',
                    key: 'delete',
                    width: 40,
                    render: (_, r) => (
                      <Popconfirm title="¿Eliminar este material?" onConfirm={() => handleDeleteChecklistItem(r.id)}>
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                      </Popconfirm>
                    )
                  }
                ]}
              />
            </>
          ) : (
            <UnsavedCruiseNotice
              tabTitle="📦 Lista de Embarque (Checklist)"
              description="Para registrar equipos científicos, hieleras y reactivos que subirán a bordo, primero guarda los datos generales del crucero."
              onSave={() => handleSave(true, '3')}
              saving={saving}
            />
          )}
        </div>
      )
    },
    {
      key: '4',
      label: 'Logística y Entregas',
      children: (
        <div style={{ marginTop: 16 }}>
          {editingCruise ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text type="secondary">
                  Planificación de puntos intermedios de descarga de muestras y entregas logísticas en ruta.
                </Text>
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setSubModalType('discharge');
                    subForm.resetFields();
                  }}
                >
                  Nueva Entrega
                </Button>
              </div>
              <Table
                dataSource={discharges}
                rowKey="id"
                size="small"
                pagination={false}
                columns={[
                  { title: 'Punto / Puerto', dataIndex: 'port_name', render: (p) => <Text strong>{p}</Text> },
                  {
                    title: 'Fecha/Hora Descarga',
                    dataIndex: 'discharge_date',
                    render: (d) => d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '—'
                  },
                  { title: 'Recoge en Tierra', dataIndex: 'responsible_land_person', render: (r) => r || '—' },
                  { title: 'Lab. Destino', dataIndex: 'destination_lab', render: (l) => <Tag color="blue">{l || '—'}</Tag> },
                  { title: 'Notas', dataIndex: 'notes', render: (n) => n || '—' },
                  {
                    title: '',
                    key: 'delete',
                    width: 40,
                    render: (_, r) => (
                      <Popconfirm title="¿Eliminar esta entrega?" onConfirm={() => handleDeleteDischarge(r.id)}>
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                      </Popconfirm>
                    )
                  }
                ]}
              />
            </>
          ) : (
            <UnsavedCruiseNotice
              tabTitle="🚚 Logística y Entregas en Ruta"
              description="Para programar puntos intermedios de descarga o entrega de muestras en puerto, primero guarda los datos generales del crucero."
              onSave={() => handleSave(true, '4')}
              saving={saving}
            />
          )}
        </div>
      )
    },
    {
      key: '5',
      label: (
        <span>
          📋 Reporte de Salida
          {editingCruise?.actual_track ? (
            <span style={{ marginLeft: 6, background: '#FF6B00', color: '#fff', fontSize: 9, borderRadius: 4, padding: '1px 5px', fontWeight: 700, verticalAlign: 'middle' }}>
              GPX ✓
            </span>
          ) : telemetryTrack?.length > 0 ? (
            <span style={{ marginLeft: 6, background: '#13C2C2', color: '#fff', fontSize: 9, borderRadius: 4, padding: '1px 5px', fontWeight: 700, verticalAlign: 'middle' }}>
              📡 Telemetría ({telemetryTrack.length})
            </span>
          ) : null}
        </span>
      ),
      children: (
        editingCruise ? (
          <Row style={{ height: 'calc(100vh - 280px)', minHeight: 480 }}>
            {/* ── Columna izquierda: Mapa ── */}
            <Col span={16} style={{ height: '100%', position: 'relative' }}>
              {/* Barra de controles GPX / Telemetría */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, background: 'rgba(10,38,71,0.92)', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backdropFilter: 'blur(4px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>🛸 Track Real</span>
                  <Segmented
                    size="small"
                    value={trackSource}
                    onChange={setTrackSource}
                    options={[
                      { 
                        label: (
                          <span>
                            📡 Telemetría / Estación
                            {telemetryTrack.length > 0 && (
                              <span style={{ marginLeft: 4, color: '#13C2C2', fontWeight: 600 }}>({telemetryTrack.length})</span>
                            )}
                          </span>
                        ), 
                        value: 'telemetry' 
                      },
                      { 
                        label: (
                          <span>
                            📁 Archivo GPX
                            {editingCruise?.actual_track && <span style={{ marginLeft: 4, color: '#FF6B00' }}>✓</span>}
                          </span>
                        ), 
                        value: 'gpx' 
                      },
                      ...(editingCruise?.actual_track?.length > 0 && telemetryTrack?.length > 0 ? [{
                        label: <span>🔀 Ambos</span>,
                        value: 'both'
                      }] : [])
                    ]}
                    style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
                  />
                  {trackSource === 'gpx' && (
                    editingCruise?.actual_track ? (
                      <>
                        <Tag color="orange" style={{ margin: 0, fontSize: 10 }}>{editingCruise.actual_track.length} pts</Tag>
                        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10 }}>{editingCruise.actual_track_filename}</Text>
                      </>
                    ) : (
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontStyle: 'italic' }}>
                        Sin archivo GPX cargado
                      </Text>
                    )
                  )}
                  {trackSource === 'telemetry' && (
                    <>
                      {telemetryLoading ? (
                        <Spin size="small" style={{ marginLeft: 8 }} />
                      ) : (
                        <>
                          <Tag color="cyan" style={{ margin: 0, fontSize: 10 }}>{telemetryTrack.length} pts</Tag>
                          {telemetryTrack.length > 0 && (
                            <Button
                              size="small"
                              icon={<DownloadOutlined />}
                              onClick={handleDownloadTelemetryCsv}
                              style={{
                                background: 'rgba(19, 194, 194, 0.2)',
                                borderColor: '#13C2C2',
                                color: '#13C2C2',
                                fontSize: 11,
                                fontWeight: 600,
                                height: 24,
                                padding: '0 8px',
                              }}
                            >
                              Descargar CSV
                            </Button>
                          )}
                        </>
                      )}
                    </>
                  )}
                  {trackSource === 'both' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Tag color="cyan" style={{ margin: 0, fontSize: 10 }}>📡 {telemetryTrack.length} pts</Tag>
                      <Tag color="orange" style={{ margin: 0, fontSize: 10 }}>📁 {editingCruise?.actual_track?.length || 0} pts</Tag>
                    </div>
                  )}
                </div>
                <Space size={6}>
                  {((trackSource === 'gpx' && editingCruise?.actual_track) || (trackSource === 'telemetry' && telemetryTrack.length > 0) || (trackSource === 'both' && (editingCruise?.actual_track || telemetryTrack.length > 0))) && (
                    <Switch
                      size="small"
                      checked={showActualTrack}
                      onChange={setShowActualTrack}
                      checkedChildren={trackSource === 'gpx' ? '🟠' : trackSource === 'both' ? '🟠🟢' : '🟢'}
                      unCheckedChildren="—"
                    />
                  )}
                  {isAdmin && (
                    <>
                      <Upload accept=".gpx" showUploadList={false} beforeUpload={handleGpxUpload}>
                        <Button
                          size="small"
                          icon={gpxUploading ? <LoadingOutlined /> : <UploadOutlined />}
                          loading={gpxUploading}
                          style={{ background: '#FF6B00', borderColor: '#FF6B00', color: '#fff', fontSize: 11, fontWeight: 600 }}
                        >
                          {editingCruise?.actual_track ? 'Reemplazar GPX' : '⬆ Subir GPX'}
                        </Button>
                      </Upload>
                      {editingCruise?.actual_track && (
                        <Popconfirm title="¿Eliminar el track GPX?" onConfirm={handleGpxDelete} okText="Sí" cancelText="No">
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      )}
                    </>
                  )}
                </Space>
              </div>

              {/* Mapa */}
              <div style={{ height: '100%', position: 'relative' }}>
                {editingCruise?.waypoints?.length > 0 || editingCruise?.actual_track?.length > 0 || telemetryTrack.length > 0 || telemetryLoading ? (
                  <MapContainer
                    center={(() => {
                      if (trackSource === 'telemetry' && telemetryTrack?.length > 0) {
                        const vt = telemetryTrack.find(p => p.latitude !== 0 && p.longitude !== 0);
                        if (vt) return [vt.latitude, vt.longitude];
                      }
                      const tr = editingCruise?.actual_track;
                      if (trackSource === 'gpx' && tr?.length > 0) return [tr[0].lat, tr[0].lon];
                      const wps = editingCruise?.waypoints?.filter(w => w.latitude != null);
                      if (wps?.length > 0) return [wps[0].latitude, wps[0].longitude];
                      if (telemetryTrack?.length > 0) {
                        const vt = telemetryTrack.find(p => p.latitude !== 0 && p.longitude !== 0);
                        if (vt) return [vt.latitude, vt.longitude];
                      }
                      if (tr?.length > 0) return [tr[0].lat, tr[0].lon];
                      return [23.6345, -110.0];
                    })()}
                    zoom={8}
                    style={{ height: '100%', width: '100%' }}
                    key={`report-map-${editingCruise?.id}-${editingCruise?.actual_track?.length}-${telemetryTrack?.length}-${trackSource}`}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />
                    {/* Ruta planificada — azul punteada */}
                    {editingCruise?.waypoints?.length > 1 && (() => {
                      const pts = editingCruise.waypoints
                        .filter(w => w.latitude != null && w.longitude != null)
                        .map(w => [w.latitude, w.longitude]);
                      return pts.length > 1 ? (
                        <>
                          <Polyline positions={pts} color="#0A2647" weight={2} dashArray="8 5" opacity={0.8} />
                          {editingCruise.waypoints.filter(w => w.latitude != null).map((wp, i) => (
                            <Marker key={`rpt-wp-${i}`} position={[wp.latitude, wp.longitude]}>
                              <Popup><strong>{wp.name || `Waypoint ${i + 1}`}</strong></Popup>
                            </Marker>
                          ))}
                        </>
                      ) : null;
                    })()}
                    {/* Ruta real GPX — naranja sólida con hitos interactivos */}
                    <GpxTrackLayer
                      track={editingCruise?.actual_track}
                      show={showActualTrack && (trackSource === 'gpx' || trackSource === 'both')}
                      onCreateLogbook={handleCreateLogbookAtGpxPoint}
                    />
                    {/* Ruta real Telemetría — celeste sólida con hitos interactivos */}
                    <TelemetryTrackLayer
                      track={telemetryTrack}
                      show={showActualTrack && (trackSource === 'telemetry' || trackSource === 'both')}
                    />
                    <MapFitter
                      waypoints={[
                        ...(editingCruise?.waypoints?.filter(w => w.latitude != null) || []),
                        ...(showActualTrack && (trackSource === 'gpx' || trackSource === 'both') && editingCruise?.actual_track
                          ? editingCruise.actual_track.map(p => ({ latitude: p.lat, longitude: p.lon }))
                          : []),
                        ...(showActualTrack && (trackSource === 'telemetry' || trackSource === 'both') && telemetryTrack
                          ? telemetryTrack.filter(p => p.latitude !== 0 && p.longitude !== 0).map(p => ({ latitude: p.latitude, longitude: p.longitude }))
                          : [])
                      ]}
                      modalReady={true}
                    />
                  </MapContainer>
                ) : (
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#999', background: '#f9f9f9' }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🗺️</div>
                    <div style={{ fontSize: 14 }}>
                      {trackSource === 'gpx' ? 'Sin waypoints ni track GPX' : 'Sin waypoints ni track de telemetría'}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 6, color: '#888' }}>
                      {trackSource === 'gpx' 
                        ? 'Sube un archivo .gpx con el botón superior'
                        : 'No se detectó telemetría reportada en las fechas de salida y regreso del crucero'}
                    </div>
                  </div>
                )}

                {/* Panel de estadísticas GPX flotante */}
                {trackSource === 'gpx' && gpxStats && showActualTrack && (
                  <div style={{
                    position: 'absolute',
                    top: 52,
                    right: 12,
                    zIndex: 1000,
                    background: 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(6px)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    border: '1px solid rgba(0,0,0,0.08)',
                    width: 250,
                  }}>
                    <div style={{ fontWeight: 'bold', color: '#0A2647', fontSize: 12, marginBottom: 6, borderBottom: '1px solid #eee', paddingBottom: 4 }}>
                      📊 Resumen de Ruta Real (GPX)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', fontSize: 10 }}>
                      <div>
                        <span style={{ color: '#888', display: 'block' }}>Distancia</span>
                        <strong style={{ fontSize: 12, color: '#FF6B00' }}>{gpxStats.distanceNm.toFixed(1)} mn</strong>
                      </div>
                      <div>
                        <span style={{ color: '#888', display: 'block' }}>Duración</span>
                        <strong style={{ fontSize: 12, color: '#333' }}>
                          {gpxStats.durationMinutes ? `${Math.floor(gpxStats.durationMinutes / 60)}h ${gpxStats.durationMinutes % 60}m` : '—'}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#888', display: 'block' }}>Vel. Promedio</span>
                        <strong style={{ fontSize: 11, color: '#333' }}>
                          {gpxStats.avgSpeedKnots ? `${gpxStats.avgSpeedKnots.toFixed(1)} kt` : '—'}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#888', display: 'block' }}>Vel. Máxima</span>
                        <strong style={{ fontSize: 11, color: '#333' }}>
                          {gpxStats.maxSpeedKnots ? `${gpxStats.maxSpeedKnots.toFixed(1)} kt` : '—'}
                        </strong>
                      </div>
                    </div>

                    {/* Resumen meteorológico de telemetría también disponible en vista GPX si existe */}
                    {telemetryStats && (telemetryStats.avgTemp != null || telemetryStats.avgWind != null || telemetryStats.avgPressure != null) && (
                      <div style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 6 }}>
                        <div style={{ fontWeight: 'bold', color: '#0A2647', fontSize: 10, marginBottom: 4 }}>
                          🌡️ Meteorología de Ruta (Estación)
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', fontSize: 9 }}>
                          <div>
                            <span style={{ color: '#888' }}>Temp: </span>
                            <strong style={{ color: '#333' }}>
                              {telemetryStats.avgTemp != null ? `${telemetryStats.avgTemp.toFixed(1)}°C` : '—'}
                            </strong>
                          </div>
                          <div>
                            <span style={{ color: '#888' }}>Presión: </span>
                            <strong style={{ color: '#333' }}>
                              {telemetryStats.avgPressure != null ? `${telemetryStats.avgPressure.toFixed(1)} hPa` : '—'}
                            </strong>
                          </div>
                          <div style={{ gridColumn: 'span 2' }}>
                            <span style={{ color: '#888' }}>Viento Promedio: </span>
                            <strong style={{ color: '#333' }}>
                              {telemetryStats.avgWind != null ? `${telemetryStats.avgWind.toFixed(1)} kt` : '—'}
                              {telemetryStats.avgWindDir != null ? ` (${Math.round(telemetryStats.avgWindDir)}° ${getWindDirectionText(telemetryStats.avgWindDir)})` : ''}
                            </strong>
                          </div>
                          <div style={{ gridColumn: 'span 2' }}>
                            <span style={{ color: '#888' }}>Viento Máximo: </span>
                            <strong style={{ color: '#333' }}>
                              {telemetryStats.maxWind != null ? `${telemetryStats.maxWind.toFixed(1)} kt` : '—'}
                              {telemetryStats.maxWindDir != null ? ` (${Math.round(telemetryStats.maxWindDir)}° ${getWindDirectionText(telemetryStats.maxWindDir)})` : ''}
                            </strong>
                          </div>
                        </div>
                      </div>
                    )}

                    {gpxStats.startTime && (
                      <div style={{ marginTop: 8, fontSize: 9, color: '#666', borderTop: '1px solid #eee', paddingTop: 6 }}>
                        <div>📅 Salida: {dayjs(gpxStats.startTime).format('DD/MM HH:mm')}</div>
                        <div>📅 Regreso: {dayjs(gpxStats.endTime).format('DD/MM HH:mm')}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Panel de estadísticas de Telemetría flotante */}
                {(trackSource === 'telemetry' || trackSource === 'both') && telemetryStats && showActualTrack && (
                  <div style={{
                    position: 'absolute',
                    top: 52,
                    right: 12,
                    zIndex: 1000,
                    background: 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(6px)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    border: '1px solid rgba(0,0,0,0.08)',
                    width: 260,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, borderBottom: '1px solid #eee', paddingBottom: 4 }}>
                      <span style={{ fontWeight: 'bold', color: '#0A2647', fontSize: 12 }}>
                        📊 Resumen de Ruta Real (Telemetría)
                      </span>
                      {trackSource === 'both' && <Tag color="cyan" style={{ margin: 0, fontSize: 9 }}>+ GPX</Tag>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', fontSize: 10 }}>
                      <div>
                        <span style={{ color: '#888', display: 'block' }}>Distancia</span>
                        <strong style={{ fontSize: 12, color: '#13C2C2' }}>{telemetryStats.distanceNm.toFixed(1)} mn</strong>
                      </div>
                      <div>
                        <span style={{ color: '#888', display: 'block' }}>Duración</span>
                        <strong style={{ fontSize: 12, color: '#333' }}>
                          {telemetryStats.durationMinutes ? `${Math.floor(telemetryStats.durationMinutes / 60)}h ${telemetryStats.durationMinutes % 60}m` : '—'}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#888', display: 'block' }}>Vel. Barco Prom</span>
                        <strong style={{ fontSize: 11, color: '#333' }}>
                          {telemetryStats.avgSpeedKnots ? `${telemetryStats.avgSpeedKnots.toFixed(1)} kt` : '—'}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#888', display: 'block' }}>Vel. Barco Máx</span>
                        <strong style={{ fontSize: 11, color: '#333' }}>
                          {telemetryStats.maxSpeedKnots ? `${telemetryStats.maxSpeedKnots.toFixed(1)} kt` : '—'}
                        </strong>
                      </div>
                    </div>
                    
                    {/* Resumen meteorológico de telemetría */}
                    <div style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 6 }}>
                      <div style={{ fontWeight: 'bold', color: '#0A2647', fontSize: 10, marginBottom: 4 }}>
                        🌡️ Meteorología de Ruta
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', fontSize: 9 }}>
                        <div>
                          <span style={{ color: '#888' }}>Temp: </span>
                          <strong style={{ color: '#333' }}>
                            {telemetryStats.avgTemp != null ? `${telemetryStats.avgTemp.toFixed(1)}°C` : '—'}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: '#888' }}>Presión: </span>
                          <strong style={{ color: '#333' }}>
                            {telemetryStats.avgPressure != null ? `${telemetryStats.avgPressure.toFixed(1)} hPa` : '—'}
                          </strong>
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                          <span style={{ color: '#888' }}>Viento Promedio: </span>
                          <strong style={{ color: '#333' }}>
                            {telemetryStats.avgWind != null ? `${telemetryStats.avgWind.toFixed(1)} kt` : '—'}
                            {telemetryStats.avgWindDir != null ? ` (${Math.round(telemetryStats.avgWindDir)}° ${getWindDirectionText(telemetryStats.avgWindDir)})` : ''}
                          </strong>
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                          <span style={{ color: '#888' }}>Viento Máximo: </span>
                          <strong style={{ color: '#333' }}>
                            {telemetryStats.maxWind != null ? `${telemetryStats.maxWind.toFixed(1)} kt` : '—'}
                            {telemetryStats.maxWindDir != null ? ` (${Math.round(telemetryStats.maxWindDir)}° ${getWindDirectionText(telemetryStats.maxWindDir)})` : ''}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {telemetryStats.startTime && (
                      <div style={{ marginTop: 8, fontSize: 9, color: '#666', borderTop: '1px solid #eee', paddingTop: 6 }}>
                        <div>📅 Salida: {dayjs(telemetryStats.startTime).format('DD/MM HH:mm')}</div>
                        <div>📅 Regreso: {dayjs(telemetryStats.endTime).format('DD/MM HH:mm')}</div>
                      </div>
                    )}

                    <Button
                      size="small"
                      type="primary"
                      ghost
                      block
                      icon={<DownloadOutlined />}
                      onClick={handleDownloadTelemetryCsv}
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        borderColor: '#13C2C2',
                        color: '#08979c',
                        borderRadius: 6,
                      }}
                    >
                      Descargar Telemetría (CSV)
                    </Button>
                  </div>
                )}
              </div>

              {/* Leyenda inferior */}
              {(editingCruise?.waypoints?.length > 0 || ((trackSource === 'gpx' || trackSource === 'both') && editingCruise?.actual_track) || ((trackSource === 'telemetry' || trackSource === 'both') && telemetryTrack.length > 0)) && (
                <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1000, background: 'rgba(255,255,255,0.95)', padding: '6px 10px', borderRadius: 6, boxShadow: '0 2px 6px rgba(0,0,0,0.12)', fontSize: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {editingCruise?.waypoints?.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 20, height: 0, borderTop: '2px dashed #0A2647' }} />
                      <span>Ruta planificada</span>
                    </div>
                  )}
                  {(trackSource === 'gpx' || trackSource === 'both') && editingCruise?.actual_track && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 20, height: 3, background: '#FF6B00', borderRadius: 2 }} />
                      <span style={{ color: '#FF6B00', fontWeight: 600 }}>Track real (GPX)</span>
                    </div>
                  )}
                  {(trackSource === 'telemetry' || trackSource === 'both') && telemetryTrack.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 20, height: 3, background: '#13C2C2', borderRadius: 2 }} />
                      <span style={{ color: '#13C2C2', fontWeight: 600 }}>Track real (Telemetría)</span>
                    </div>
                  )}
                </div>
              )}
            </Col>

            {/* ── Columna derecha: Observaciones + Bitácoras ── */}
            <Col span={8} style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f5f5', borderLeft: '1px solid #eee', overflow: 'hidden' }}>
              {/* Observaciones */}
              <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid #e8e8e8', flexShrink: 0, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text strong style={{ fontSize: 13 }}>📝 Observaciones de la Salida</Text>
                  <Button
                    size="small"
                    type="primary"
                    style={{ background: '#0A2647', borderColor: '#0A2647', fontSize: 11 }}
                    onClick={async () => {
                      try {
                        const res = await apiClient.put(`/cruises/${editingCruise.id}`, {
                          trip_report: editingCruise.trip_report,
                        });
                        setEditingCruise(res.data);
                        message.success('Observaciones guardadas');
                      } catch { message.error('Error al guardar observaciones'); }
                    }}
                  >
                    Guardar
                  </Button>
                </div>
                <TextArea
                  rows={4}
                  placeholder="Describe cómo fue la salida, incidentes, condiciones del mar, logros, observaciones generales..."
                  value={editingCruise?.trip_report || ''}
                  onChange={e => setEditingCruise(prev => ({ ...prev, trip_report: e.target.value }))}
                  style={{ fontSize: 12, resize: 'none' }}
                />
              </div>

              {/* Bitácoras */}
              <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid #e8e8e8', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text strong style={{ fontSize: 13 }}>📓 Bitácoras ({cruiseLogEntries.length})</Text>
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setSubModalType('logbook');
                    subForm.resetFields();
                    subForm.setFieldsValue({ entry_date: dayjs() });
                  }}
                  style={{ background: '#2C3E50', borderColor: '#2C3E50', fontSize: 11 }}
                >
                  Nueva Entrada
                </Button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                {loadingLogEntries ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#999' }}>Cargando...</div>
                ) : cruiseLogEntries.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#bbb' }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>📓</div>
                    <div style={{ fontSize: 12 }}>Sin bitácoras registradas</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>Haz clic en "Nueva Entrada" para agregar</div>
                  </div>
                ) : (
                  cruiseLogEntries.map(r => (
                    <div key={r.id} style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', marginBottom: 8, border: '1px solid #ececec', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <Space size={4}>
                          <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>{r.logbook_type.toUpperCase()}</Tag>
                          {r.event_type && <Tag color={r.event_type.color || 'cyan'} style={{ margin: 0, fontSize: 10 }}>{r.event_type.name}</Tag>}
                        </Space>
                        <Text type="secondary" style={{ fontSize: 10 }}>
                          {dayjs(r.entry_date).format('DD/MM/YYYY')}{r.entry_time ? ` ${r.entry_time}` : ''}
                        </Text>
                      </div>
                      {r.title && <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>{r.title}</Text>}
                      <Text style={{ fontSize: 11, color: '#444', display: 'block' }}>{r.content}</Text>
                      
                      {/* Detalles adicionales de ubicación y navegación */}
                      {(r.location_name || r.latitude != null || r.longitude != null) && (
                        <div style={{ fontSize: 10, color: '#666', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          <span>📍</span>
                          <span style={{ fontWeight: 500 }}>
                            {r.location_name || 'Ubicación'}
                          </span>
                          {r.latitude != null && r.longitude != null && (
                            <Text type="secondary" style={{ fontSize: 9 }}>
                              ({r.latitude.toFixed(4)}, {r.longitude.toFixed(4)})
                            </Text>
                          )}
                        </div>
                      )}

                      {/* Clima y estado del mar */}
                      {(r.weather_conditions || r.sea_state) && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          {r.weather_conditions && (
                            <Tag style={{ fontSize: 9, margin: 0, padding: '0 4px', background: '#f0f5ff', color: '#1d39c4', border: '1px solid #d6e4ff' }}>
                              🌤️ {r.weather_conditions}
                            </Tag>
                          )}
                          {r.sea_state && (
                            <Tag style={{ fontSize: 9, margin: 0, padding: '0 4px', background: '#e6f7ff', color: '#096dd9', border: '1px solid #bae7ff' }}>
                              🌊 {r.sea_state}
                            </Tag>
                          )}
                        </div>
                      )}
                      
                      {r.is_signed && <div style={{ fontSize: 10, color: '#52C41A', marginTop: 4 }}>✓ {r.signed_by || 'Firmado'}</div>}
                    </div>
                  ))
                )}
              </div>
            </Col>
          </Row>
        ) : (
          <UnsavedCruiseNotice
            tabTitle="📋 Reporte de Salida y Bitácoras"
            description="El reporte de salida, tracks GPX y bitácoras de navegación estarán disponibles una vez registrado el crucero."
            onSave={() => handleSave(true, '5')}
            saving={saving}
          />
        )
      )
    },
    ...(telemetryTrack && telemetryTrack.length > 0 ? [{
      key: 'telemetry_charts',
      label: (
        <span>
          📈 Gráficas de Telemetría
          <Tag color="cyan" style={{ marginLeft: 6, fontSize: 10, borderRadius: 10, padding: '0 6px' }}>
            {telemetryTrack.length} pts
          </Tag>
        </span>
      ),
      children: (
        <CruiseTelemetryCharts
          telemetryTrack={telemetryTrack}
          cruise={editingCruise}
          onDownloadCsv={handleDownloadTelemetryCsv}
        />
      )
    }] : []),
    {
      key: 'billing',
      label: '💰 Facturación',
      children: (
        <div style={{ marginTop: 16 }}>
          {!editingCruise ? (
            <UnsavedCruiseNotice
              tabTitle="💰 Facturación y Cobros"
              description="El módulo de facturación se activa una vez guardado y completado el crucero."
              onSave={() => handleSave(true, 'billing')}
              saving={saving}
            />
          ) : editingCruise.status !== 'completado' ? (
            <Alert
              message="Módulo de Facturación Bloqueado"
              description="El registro y control de cobros/facturación de la campaña se habilita únicamente cuando el crucero está completado (Estado: Completado)."
              type="warning"
              showIcon
            />
          ) : (
            <div>
              {loadingBilling ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>Cargando...</div>
              ) : cruiseBilling ? (
                <Card 
                  title={<span style={{ color: '#0A2647', fontWeight: 700 }}>🧾 Cobro Registrado</span>}
                  extra={
                    hasPermission('billing', 'edit') && (
                      <Button 
                        type="primary" 
                        icon={<EditOutlined />} 
                        onClick={() => {
                          setEditBilling(cruiseBilling);
                          setBillingModalOpen(true);
                        }}
                      >
                        Editar Cobro
                      </Button>
                    )
                  }
                >
                  <Row gutter={[16, 16]}>
                    <Col span={8}>
                      <Statistic 
                        title="Total Cobrado" 
                        value={cruiseBilling.total} 
                        precision={2} 
                        suffix={cruiseBilling.currency} 
                        valueStyle={{ color: '#27AE60', fontWeight: 700 }}
                      />
                    </Col>
                    <Col span={8}>
                      <Text type="secondary" style={{ display: 'block' }}>Proyecto / Entidad:</Text>
                      <Text strong style={{ fontSize: 15 }}>{cruiseBilling.billing_entity || '—'}</Text>
                      <div style={{ fontSize: 11, color: '#888' }}>
                        {CLIENT_TYPE_LABELS[cruiseBilling.client_type] || cruiseBilling.client_type}
                      </div>
                    </Col>
                    <Col span={8}>
                      <Text type="secondary" style={{ display: 'block' }}>Estado de Pago:</Text>
                      <div>
                        <Tag 
                          color={STATUS_CONFIG[cruiseBilling.status]?.color} 
                          icon={STATUS_CONFIG[cruiseBilling.status]?.icon}
                          style={{ fontSize: 13, padding: '4px 8px', fontWeight: 600 }}
                        >
                          {STATUS_CONFIG[cruiseBilling.status]?.text}
                        </Tag>
                      </div>
                    </Col>
                  </Row>
                  
                  <Divider style={{ margin: '16px 0' }} />
                  
                  <Row gutter={[16, 16]}>
                    <Col span={8}>
                      <Text type="secondary" style={{ display: 'block' }}>Referencia de Pago:</Text>
                      <Text strong>{cruiseBilling.payment_reference || '—'}</Text>
                    </Col>
                    {cruiseBilling.payment_date && (
                      <Col span={8}>
                        <Text type="secondary" style={{ display: 'block' }}>Fecha de Pago:</Text>
                        <Text strong>{dayjs(cruiseBilling.payment_date).format('DD/MM/YYYY')}</Text>
                      </Col>
                    )}
                    {cruiseBilling.transfer_date && (
                      <Col span={8}>
                        <Text type="secondary" style={{ display: 'block' }}>Fecha de Transferencia (DEO):</Text>
                        <Text strong>{dayjs(cruiseBilling.transfer_date).format('DD/MM/YYYY')}</Text>
                      </Col>
                    )}
                  </Row>
                  
                  <Divider style={{ margin: '16px 0' }} />
                  
                  <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>Documentos Adjuntos:</Text>
                  <Row gutter={16}>
                    <Col span={8}>
                      <div style={{ 
                        backgroundColor: '#FBFCFC', 
                        border: '1px solid #E5E7E9', 
                        padding: '12px 8px', 
                        borderRadius: 8, 
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: 110
                      }}>
                        <div>
                          <FilePdfOutlined style={{ fontSize: 24, color: '#C0392B', marginBottom: 6 }} />
                          <div style={{ fontSize: 13, fontWeight: 600 }}>Recibo</div>
                        </div>
                        <div style={{ marginTop: 8 }}>
                          {cruiseBilling.receipt_filename ? (
                            <Button
                              type="primary"
                              ghost
                              size="small"
                              icon={<EyeOutlined />}
                              href={`${apiClient.defaults.baseURL.replace('/api/v1', '')}${cruiseBilling.receipt_filename}`}
                              target="_blank"
                              style={{ width: '100%', fontSize: 12 }}
                            >
                              Abrir
                            </Button>
                          ) : (
                            <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>Sin subir</Text>
                          )}
                        </div>
                      </div>
                    </Col>

                    <Col span={8}>
                      <div style={{ 
                        backgroundColor: '#FBFCFC', 
                        border: '1px solid #E5E7E9', 
                        padding: '12px 8px', 
                        borderRadius: 8, 
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: 110
                      }}>
                        <div>
                          <FilePdfOutlined style={{ fontSize: 24, color: '#2980B9', marginBottom: 6 }} />
                          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: '1.2' }}>Orden de Embarcación</div>
                        </div>
                        <div style={{ marginTop: 8 }}>
                          {cruiseBilling.vessel_order_filename ? (
                            <Button
                              type="primary"
                              ghost
                              size="small"
                              icon={<EyeOutlined />}
                              href={`${apiClient.defaults.baseURL.replace('/api/v1', '')}${cruiseBilling.vessel_order_filename}`}
                              target="_blank"
                              style={{ width: '100%', fontSize: 12 }}
                            >
                              Abrir
                            </Button>
                          ) : (
                            <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>Sin subir</Text>
                          )}
                        </div>
                      </div>
                    </Col>

                    <Col span={8}>
                      <div style={{ 
                        backgroundColor: '#FBFCFC', 
                        border: '1px solid #E5E7E9', 
                        padding: '12px 8px', 
                        borderRadius: 8, 
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: 110
                      }}>
                        <div>
                          <FilePdfOutlined style={{ fontSize: 24, color: '#27AE60', marginBottom: 6 }} />
                          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: '1.2' }}>Orden Firmada</div>
                        </div>
                        <div style={{ marginTop: 8 }}>
                          {cruiseBilling.signed_vessel_order_filename ? (
                            <Button
                              type="primary"
                              ghost
                              size="small"
                              icon={<EyeOutlined />}
                              href={`${apiClient.defaults.baseURL.replace('/api/v1', '')}${cruiseBilling.signed_vessel_order_filename}`}
                              target="_blank"
                              style={{ width: '100%', fontSize: 12 }}
                            >
                              Abrir
                            </Button>
                          ) : (
                            <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>Sin subir</Text>
                          )}
                        </div>
                      </div>
                    </Col>
                  </Row>
                </Card>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0', background: '#fff', borderRadius: 8, border: '1px dashed #d9d9d9' }}>
                  <DollarOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
                  <Title level={4} style={{ color: '#555', margin: 0 }}>Sin Cobro Registrado</Title>
                  <Text type="secondary" style={{ display: 'block', margin: '8px 0 20px' }}>
                    Este crucero ya está completado pero aún no se ha registrado su cobro o facturación correspondiente.
                  </Text>
                  {hasPermission('billing', 'create') && (
                    <Button 
                      type="primary" 
                      size="large"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setEditBilling(null);
                        setBillingModalOpen(true);
                      }}
                    >
                      Registrar Cobro
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'stability',
      label: '⚓ Estabilidad y Tanques',
      children: (
        <div style={{ marginTop: 16 }}>
          {!editingCruise ? (
            <UnsavedCruiseNotice
              tabTitle="⚓ Estabilidad y Tanques"
              description="Guarda el crucero primero para vincular el cálculo de estabilidad naval y sondeo de tanques."
              onSave={() => handleSave(true, 'stability')}
              saving={saving}
            />
          ) : (
            <CruiseStabilityTab
              cruise={editingCruise}
              onNavigate={(path) => {
                setModalOpen(false);
                navigate(path);
              }}
            />
          )}
        </div>
      )
    }
  ];


  return (
    <div className="animate-fade-in">
      {/* Summary */}
      <Row gutter={12} style={{ marginBottom: 20 }}>
        {[
          { key: 'borrador', label: 'Borrador', color: '#D4AC0D', bg: '#fffdf6' },
          { key: 'pendiente', label: 'Pendientes', color: '#8E44AD', bg: '#faf6ff' },
          { key: 'planificado', label: 'Planificados', color: '#1677FF', bg: '#f0f5ff' },
          { key: 'en_curso', label: 'En Curso', color: '#52C41A', bg: '#f6ffed' },
          { key: 'completado', label: 'Completados', color: '#7F8C8D', bg: '#fafafa' },
          { key: 'total_nm', label: 'Millas Náuticas', color: '#0A2647', bg: '#f0f5ff', suffix: ' mn' },
        ].map(({ key, label, color, bg, suffix }) => (
          <Col xs={12} md={4} key={key}>
            <Card size="small" style={{ borderRadius: 10, borderLeft: `3px solid ${color}`, background: bg }}>
              <Statistic title={label} value={summary[key] ?? 0} valueStyle={{ color, fontSize: 18 }} suffix={suffix} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Toolbar */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Title level={3} style={{ color: '#0A2647', margin: 0 }}>🧭 Cruceros</Title>
          <Text type="secondary">{total} planes de crucero</Text>
        </Col>
        <Col>
          <Space wrap>
            <Search placeholder="Buscar..." allowClear onSearch={(v) => { setSearch(v); setPagination({ ...pagination, current: 1 }); }} style={{ width: 180 }} />
            <Select placeholder="Embarcación" allowClear style={{ width: 160 }}
              onChange={(v) => { setFilterVessel(v); setPagination({ ...pagination, current: 1 }); }}
              options={vessels.map(v => ({ value: v.id, label: v.name }))} />
            <Select placeholder="Estado" allowClear style={{ width: 140 }}
              onChange={(v) => { setFilterStatus(v); setPagination({ ...pagination, current: 1 }); }}
              options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
            <Button icon={<ReloadOutlined />} onClick={() => { fetchCruises(); fetchMeta(); }} />
            {isAdmin && (
              <CanAccess module="cruises" action="create">
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo Plan</Button>
              </CanAccess>
            )}
          </Space>
        </Col>
      </Row>

      {!isAdmin && (
        <Alert
          message="Planificación de Cruceros"
          description={
            <span>
              Para iniciar un nuevo crucero, debes registrar primero una Solicitud de Embarcación en la sección de{' '}
              <a href="/requests" style={{ fontWeight: 600 }}>Gestión de Solicitudes</a>.
              Una vez aprobada por el DEO, tu plan de crucero se generará y aparecerá aquí automáticamente para su configuración.
            </span>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}

      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Table columns={columns} dataSource={cruises} rowKey="id" loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: pagination.current, pageSize: pagination.pageSize, total, showSizeChanger: true,
            showTotal: (t) => `${t} planes`, onChange: (p, s) => setPagination({ current: p, pageSize: s })
          }} />
      </Card>

      {/* Modal crear/editar unificado */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🧭</span>
            <span style={{ fontWeight: 700, color: '#0A2647' }}>
              {editingCruise ? (
                <>
                  Editar: {editingCruise.name}
                  {editingCruise.cruise_number && (
                    <Tag color="blue" style={{ marginLeft: 8, fontWeight: 500 }}>{editingCruise.cruise_number}</Tag>
                  )}
                </>
              ) : (
                'Nuevo Plan de Crucero'
              )}
            </span>
          </div>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => handleSave(false)}
        confirmLoading={saving}
        okText={editingCruise ? 'Guardar Cambios' : 'Crear Plan'}
        destroyOnClose
        width="92%"
        style={{ top: 20 }}
        styles={{ body: { padding: '12px 16px', maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' } }}
      >
        {!isAdmin && (
          <Card style={{ borderRadius: 8, marginBottom: 16, background: '#f8fafd', border: '1px solid #e6f0fa' }} styles={{ body: { padding: '12px 16px' } }}>
            <Steps
              current={
                !editingCruise ? 0 :
                editingCruise.status === 'pendiente' || editingCruise.status === 'planificado' || editingCruise.status === 'en_curso' || editingCruise.status === 'completado'
                  ? 4
                  : editingCruise.waypoints?.length > 0 && editingCruise.participants_count > 0
                    ? 3
                    : editingCruise.waypoints?.length > 0
                      ? 2
                      : 1
              }
              size="small"
              items={[
                { title: 'Solicitud Aprobada', description: editingCruise ? 'Completado' : 'Pendiente' },
                { title: 'Waypoints y Ruta', description: editingCruise?.waypoints?.length > 0 ? 'Definido' : 'Pendiente' },
                { title: 'Personal Científico', description: editingCruise?.participants_count > 0 ? `Asignado (${editingCruise.participants_count})` : 'Pendiente' },
                { title: 'Muestreo / Estaciones', description: 'Configurar' },
                { title: 'Enviar a Revisión', description: editingCruise?.status === 'borrador' || !editingCruise ? 'Pendiente' : 'Enviado' },
              ]}
            />
          </Card>
        )}
        <Tabs activeKey={activeTab} onChange={(k) => setActiveTab(k)} items={tabItems} style={{ marginTop: 10 }} />
      </Modal>

      {/* Modal del mapa */}
      {mapCruise && (
        <WaypointMapModal
          cruise={mapCruise}
          open={!!mapCruise}
          defaultDepartureDate={mapCruise?.departure_date}
          onClose={() => setMapCruise(null)}
          onSave={() => { fetchCruises(); setMapCruise(null); }}
          onConfigureSamples={(wp) => {
            setMapCruise(null);
            openEdit(mapCruise, '2', wp);
          }}
        />
      )}

      {/* Modal auxiliar para añadir ítems de checklist, descargas y muestras */}
      <Modal
        title={
          subModalType === 'checklist' ? 'Agregar Material/Equipo' :
            subModalType === 'discharge' ? 'Programar Entrega en Ruta' :
              subModalType === 'sample' ? 'Nueva Muestra de Estación' :
                subModalType === 'logbook' ? 'Nueva Entrada de Bitácora' : ''
        }
        open={!!subModalType}
        onCancel={() => { setSubModalType(null); subForm.resetFields(); }}
        onOk={handleAddSubItem}
        destroyOnClose
        width={subModalType === 'logbook' ? 500 : 400}
      >
        <Form form={subForm} layout="vertical" style={{ marginTop: 16 }}>
          {subModalType === 'checklist' && (
            <>
              <Form.Item name="investigator_name" label="Responsable (Investigador)" rules={[{ required: true, message: 'Ingrese el nombre del responsable' }]}>
                <Input placeholder="ej: Juan Carlos Herguera" />
              </Form.Item>
              <Form.Item name="item_name" label="Material / Equipo / Reactivo" rules={[{ required: true, message: 'Ingrese el nombre del ítem' }]}>
                <Input placeholder="ej: Hielera con 14 frascos de 125 ml" />
              </Form.Item>
              <Form.Item name="quantity" label="Cantidad" rules={[{ required: true }]} initialValue={1}>
                <InputNumber min={0.1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="notes" label="Notas adicionales">
                <Input placeholder="ej: Reactivo congelado" />
              </Form.Item>
            </>
          )}

          {subModalType === 'discharge' && (
            <>
              <Form.Item name="port_name" label="Puerto / Punto de descarga" rules={[{ required: true, message: 'Ingrese el punto de descarga' }]}>
                <Input placeholder="ej: Marina Coral" />
              </Form.Item>
              <Form.Item name="discharge_date" label="Fecha y Hora Estimada">
                <DatePicker showTime style={{ width: '100%' }} format="DD/MM/YYYY HH:mm" />
              </Form.Item>
              <Form.Item name="responsible_land_person" label="Recoge en tierra (Contacto)">
                <Input placeholder="ej: Arturo Torres Ocampo" />
              </Form.Item>
              <Form.Item name="destination_lab" label="Laboratorio de destino">
                <Input placeholder="ej: Lab. Biología Algal" />
              </Form.Item>
              <Form.Item name="notes" label="Observaciones logísticas">
                <Input placeholder="ej: Llevar hielera con hielo seco" />
              </Form.Item>
            </>
          )}

          {subModalType === 'sample' && (
            <>
              <Form.Item name="variable_name" label="Variable a analizar" rules={[{ required: true, message: 'Ingrese el nombre de la variable' }]}>
                <Input placeholder="ej: Alcalinidad/CID, Metales" />
              </Form.Item>
              <Form.Item name="sampling_order" label="Orden de toma en cubierta" initialValue={1} rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="responsible_name" label="Científico a cargo">
                <Input placeholder="ej: Felipe, Ivonne" />
              </Form.Item>
              <Form.Item name="volume_needed" label="Volumen de agua requerido">
                <Input placeholder="ej: 1 L, 40 mL" />
              </Form.Item>
              <Form.Item label="Niveles de profundidad para la muestra">
                <Row>
                  <Col span={8}>
                    <Form.Item name="depth_surface" valuePropName="checked" noStyle>
                      <Checkbox>Superficie</Checkbox>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="depth_mid_water" valuePropName="checked" noStyle>
                      <Checkbox>Media agua</Checkbox>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="depth_bottom" valuePropName="checked" noStyle>
                      <Checkbox>Fondo</Checkbox>
                    </Form.Item>
                  </Col>
                </Row>
              </Form.Item>
              <Form.Item name="depth_custom" label="Profundidad específica (m / notas)">
                <Input placeholder="ej: 50, 100, 200 o Clorofila máx" />
              </Form.Item>
              <Form.Item name="notes" label="Notas/Especificaciones">
                <Input placeholder="ej: Medir inmediatamente" />
              </Form.Item>
            </>
          )}

          {subModalType === 'logbook' && (
            <>
              <Form.Item name="logbook_type" label="Tipo de Bitácora" rules={[{ required: true, message: 'Seleccione el tipo de bitácora' }]}>
                <Select placeholder="Seleccionar..." options={[
                  { value: 'capitan', label: '⚓ Capitán' },
                  { value: 'cubierta', label: '🧭 Cubierta' },
                  { value: 'maquinas', label: '⚙️ Máquinas' }
                ]} />
              </Form.Item>
              <Form.Item name="event_type_id" label="Tipo de Evento" rules={[{ required: true, message: 'Seleccione el tipo de evento' }]}>
                <Select placeholder="Seleccionar..." showSearch optionFilterProp="label" options={eventTypes.map(e => ({ value: e.id, label: e.name }))} />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="entry_date" label="Fecha" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="entry_time" label="Hora (opcional)">
                    <Input placeholder="HH:MM" maxLength={5} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="latitude" label="Latitud (opcional)">
                    <InputNumber style={{ width: '100%' }} placeholder="ej: 31.86" min={-90} max={90} step={0.0001} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="longitude" label="Longitud (opcional)">
                    <InputNumber style={{ width: '100%' }} placeholder="ej: -116.63" min={-180} max={180} step={0.0001} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="location_name" label="Nombre de Ubicación / Estación (opcional)">
                <Input placeholder="ej: Canal de Ballenas, Estación 4" />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="weather_conditions" label="Condiciones Clima (opcional)">
                    <Input placeholder="ej: Despejado, Viento NW 10kt" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="sea_state" label="Estado Mar (opcional)">
                    <Input placeholder="ej: Calma, Marejada ligera" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="title" label="Título (opcional)">
                <Input placeholder="Resumen breve" />
              </Form.Item>
              <Form.Item name="content" label="Contenido / Observaciones" rules={[{ required: true, message: 'Ingrese el contenido de la entrada' }]}>
                <TextArea rows={4} placeholder="Escriba los detalles de la entrada..." />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      {/* Drawer de participantes */}
      <ParticipantsDrawer
        cruise={participantsCruise}
        open={!!participantsCruise}
        onClose={() => { setParticipantsCruise(null); fetchCruises(); }}
      />

      {/* Modal de Previsualización de PDF */}
      <Modal
        title={`Plan de Campaña: ${previewCruise?.name || ''}`}
        open={!!previewCruise}
        onCancel={() => setPreviewCruise(null)}
        width={1000}
        style={{ top: 20 }}
        destroyOnClose
        footer={[
          <Button key="close" onClick={() => setPreviewCruise(null)}>
            Cerrar
          </Button>,
          previewCruise && (
            <PDFDownloadLink
              key="download"
              document={<CampaignPlanDocument cruise={previewCruise} staticMapUrl={`${window.location.origin}/api/v1/cruises/${previewCruise.id}/static-map`} />}
              fileName={`Plan_de_Campana_${previewCruise.cruise_number || previewCruise.id}.pdf`}
              style={{ textDecoration: 'none', marginLeft: 8 }}
            >
              {({ loading }) => (
                <Button type="primary" icon={<FilePdfOutlined />} loading={loading} style={{ background: '#E74C3C', border: 'none' }}>
                  Descargar PDF
                </Button>
              )}
            </PDFDownloadLink>
          )
        ]}
      >
        {previewCruise && (
          <PDFViewer style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 8 }}>
            <CampaignPlanDocument cruise={previewCruise} staticMapUrl={`${window.location.origin}/api/v1/cruises/${previewCruise.id}/static-map`} />
          </PDFViewer>
        )}
      </Modal>

      {/* Modal Formulario de Cobro */}
      <BillingFormModal
        open={billingModalOpen}
        billing={editBilling}
        cruises={editingCruise ? [editingCruise] : []}
        vessels={vessels}
        onClose={() => setBillingModalOpen(false)}
        onSaved={() => {
          fetchCruiseBilling(editingCruise?.id);
          fetchCruises();
        }}
      />
    </div>
  );
}

export default CruisesPage;
