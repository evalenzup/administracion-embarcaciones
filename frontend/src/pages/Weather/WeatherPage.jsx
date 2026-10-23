/**
 * SIAE — Página de Meteorología.
 * Mapa animado de viento y oleaje (GFS/WaveWatch III) con pronóstico puntual,
 * para apoyar la planeación de cruceros oceanográficos.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Segmented, Select, Slider, Space, Spin, Tag, Typography, message } from 'antd';
import { CloudOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents, Polyline } from 'react-leaflet';
import { useLocation } from 'react-router-dom';
import L from '../../utils/leafletGlobal';
import 'leaflet/dist/leaflet.css';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import VelocityLayer from './VelocityLayer';
import WaveDashLayer from './WaveDashLayer';
import RasterOverlay from './RasterOverlay';
import PointFloatingCard from './PointFloatingCard';
import UnifiedWeatherDetailSection from './UnifiedWeatherDetailSection';
import ColorLegend, { WIND_LEGEND, WAVE_LEGEND, TEMP_LEGEND, AIR_TEMP_LEGEND, PRECIP_LEGEND } from './ColorLegend';
import HurricaneLayer from './HurricaneLayer';
import HurricaneTrackerPanel from './HurricaneTrackerPanel';
import WeatherLayerDock from './WeatherLayerDock';
import QuickRegionSelector from './QuickRegionSelector';
import SmartTimeBar from './SmartTimeBar';
import EnsoTrackerModal from './EnsoTrackerModal';
import WeatherCursorReadout from './WeatherCursorReadout';
import EnsoInfoWidget from './EnsoInfoWidget';

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

/** Calcula la estación más cercana por fórmula de Haversine (km) */
function findNearestStation(lat, lon, stations, maxDistanceKm = 250) {
  if (!stations || stations.length === 0 || lat == null || lon == null) return null;
  let nearest = null;
  let minDistKm = Infinity;

  for (const st of stations) {
    if (st.latitude == null || st.longitude == null) continue;
    const R = 6371; // km
    const dLat = ((st.latitude - lat) * Math.PI) / 180;
    const dLon = ((st.longitude - lon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat * Math.PI) / 180) *
        Math.cos((st.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distKm = R * c;

    if (distKm < minDistKm) {
      minDistKm = distKm;
      nearest = { station: st, distanceKm: Math.round(distKm) };
    }
  }

  if (!nearest) return null;
  return {
    ...nearest,
    isTooFar: maxDistanceKm != null ? nearest.distanceKm > maxDistanceKm : false,
  };
}

const { Text } = Typography;

// Fix de íconos default de Leaflet (mismo patrón que en CruisesPage.jsx)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Iconos DivIcon personalizados y estilizados para estaciones meteorológicas y mareográficas
const TIDE_ICON = L.divIcon({
  className: 'custom-tide-icon',
  html: `<div style="background-color: #1677FF; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const SMN_ICON = L.divIcon({
  className: 'custom-smn-icon',
  html: `<div style="background-color: #FA8C16; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

// Icono animado de pulso para el punto seleccionado en el mapa
const CLICKED_POINT_ICON = L.divIcon({
  className: 'custom-clicked-point-icon',
  html: `
    <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 32px; height: 32px; border-radius: 50%; background: rgba(220, 38, 38, 0.4); animation: map-pulse 1.8s infinite ease-in-out;"></div>
      <div style="position: relative; width: 14px; height: 14px; border-radius: 50%; background: #dc2626; border: 2.5px solid #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.5);"></div>
      <div style="position: absolute; top: -14px; left: 8px; font-size: 16px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6)); pointer-events: none;">📍</div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

// Iconos DivIcon para telemetría de embarcaciones menores y mayores
const VESSEL_ICONS = {
  barco: L.divIcon({
    className: 'custom-vessel-icon',
    html: `<div style="background-color: #0A2647; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.4); font-size: 11px;">🚢</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  }),
  yate: L.divIcon({
    className: 'custom-vessel-icon',
    html: `<div style="background-color: #8E44AD; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.4); font-size: 11px;">🛥️</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  }),
  panga: L.divIcon({
    className: 'custom-vessel-icon',
    html: `<div style="background-color: #27AE60; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.4); font-size: 11px;">🚤</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  }),
  lancha: L.divIcon({
    className: 'custom-vessel-icon',
    html: `<div style="background-color: #E67E22; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.4); font-size: 11px;">⛵</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  }),
  default: L.divIcon({
    className: 'custom-vessel-icon',
    html: `<div style="background-color: #7F8C8D; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.4); font-size: 11px;">🔹</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  })
};

// Bounding box de recorte del modelo GFS/WW3 (debe coincidir con BBOX del backend, weather_fetcher.py)
const MODEL_BOUNDS = [[8, -130], [34, -80]];

const PLAY_INTERVAL_MS = 800;

function MapClickCatcher({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function MapCenterer({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      if (Array.isArray(center)) {
        const [lat, lon, targetZoom] = center;
        if (targetZoom != null) {
          map.setView([lat, lon], targetZoom, { animate: true });
        } else {
          // Si no se especifica zoom fijo, paneo suave manteniendo el zoom actual del mapa
          map.panTo([lat, lon], { animate: true });
        }
      } else if (typeof center === 'object' && center.lat != null) {
        if (center.zoom != null) {
          map.setView([center.lat, center.lng || center.lon], center.zoom, { animate: true });
        } else {
          map.panTo([center.lat, center.lng || center.lon], { animate: true });
        }
      }
    }
  }, [map, center]);
  return null;
}

// Encuadre inicial adaptado al tamaño real del contenedor: punto medio entre
// "contain" (todo el dominio visible, deja franjas vacías en pantallas anchas)
// y "cover" (llena la pantalla, recorta bordes del dominio). Con zoomSnap
// fraccional en el MapContainer, el zoom queda ajustado a la resolución
// disponible en vez de saltar al entero inferior.
function InitialFit() {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds(MODEL_BOUNDS);
    const containZoom = map.getBoundsZoom(bounds, false);
    const coverZoom = map.getBoundsZoom(bounds, true);
    map.setView(bounds.getCenter(), (containZoom + coverZoom) / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

function WeatherPage() {
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Capa activa: una a la vez, como Windy ('wind' | 'waves' | 'temperature' | 'hurricanes')
  const [activeLayer, setActiveLayer] = useState('wind');

  const [windData, setWindData] = useState(null);
  const [windImageUrl, setWindImageUrl] = useState(null);
  const [wavesImageUrl, setWavesImageUrl] = useState(null);
  const [wavesVelData, setWavesVelData] = useState(null);
  const [wavesData, setWavesData] = useState(null);
  const [tempImageUrl, setTempImageUrl] = useState(null);
  const [airTempImageUrl, setAirTempImageUrl] = useState(null);
  const [precipImageUrl, setPrecipImageUrl] = useState(null);
  const [tempData, setTempData] = useState(null);
  const [precipData, setPrecipData] = useState(null);
  const [layersLoading, setLayersLoading] = useState(false);

  // Estados para Monitoreo de El Niño / Oscilación del Sur (ENSO)
  const [ensoModalOpen, setEnsoModalOpen] = useState(false);
  const [ensoSummary, setEnsoSummary] = useState(null);

  const [selectedPoint, setSelectedPoint] = useState(null);
  const [pointForecast, setPointForecast] = useState([]);
  const [weatherModel, setWeatherModel] = useState('gfs'); // 'gfs' | 'ecmwf'
  const [pointModelName, setPointModelName] = useState('GFS (NOAA 0.25°)');
  const [pointLoading, setPointLoading] = useState(false);
  const [pointCardOpen, setPointCardOpen] = useState(false);
  const [bottomActiveTab, setBottomActiveTab] = useState('point');
  const detailSectionRef = useRef(null);

  // Selector de origen de estaciones: 'tides' (CICESE) | 'smn' (Estaciones Automáticas)
  const [stationSource, setStationSource] = useState('tides');

  // Estaciones mareográficas: markers del mapa + selector de la sección de mareas
  const [tideStations, setTideStations] = useState([]);
  const [tideStation, setTideStation] = useState('ENS');
  const [nearestTideInfo, setNearestTideInfo] = useState(null);

  const [smnStations, setSmnStations] = useState([]);
  const [smnStationId, setSmnStationId] = useState(null);
  const [nearestSmnInfo, setNearestSmnInfo] = useState(null);

  // Estados para Telemetría de Embarcaciones
  const [vesselsTelemetry, setVesselsTelemetry] = useState([]);
  const [selectedVessel, setSelectedVessel] = useState(null);
  const [vesselTrack, setVesselTrack] = useState([]);
  const [trackClickedInfo, setTrackClickedInfo] = useState(null);
  const [telemetryDates, setTelemetryDates] = useState([dayjs().subtract(1, 'day'), dayjs()]);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [mapCenterOverride, setMapCenterOverride] = useState(null);

  // Estados para Seguimiento de Huracanes (NOAA Oficial + GFS Numérico)
  const [hurricaneTrackerOpen, setHurricaneTrackerOpen] = useState(false);
  const [activeStorms, setActiveStorms] = useState([]);
  const [selectedStormId, setSelectedStormId] = useState(null);
  const [stormTrackDetails, setStormTrackDetails] = useState(null);
  const [showCone, setShowCone] = useState(true);
  const [hurricaneLoading, setHurricaneLoading] = useState(false);
  const [activeWaypointSelection, setActiveWaypointSelection] = useState(null);
  const [selectedHurricaneModel, setSelectedHurricaneModel] = useState('NOAA');

  const location = useLocation();

  const windCache = useRef(new Map());
  const windImgCache = useRef(new Map());
  const wavesCache = useRef(new Map());
  const wavesVelCache = useRef(new Map());
  const rawWavesCache = useRef(new Map());
  const tempImgCache = useRef(new Map());
  const airTempImgCache = useRef(new Map());
  const precipImgCache = useRef(new Map());
  const rawTempCache = useRef(new Map());
  const rawPrecipCache = useRef(new Map());
  const playTimerRef = useRef(null);
  const tideMarkerRefs = useRef({});
  const smnMarkerRefs = useRef({});

  const availableHours = status?.wind_hours || [];

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const r = await apiClient.get('/weather/status');
      setStatus(r.data);
      if (r.data.available && r.data.wind_hours?.length > 0) {
        setHour(r.data.wind_hours[0]);
      }
    } catch {
      message.error('Error al cargar el estado del pronóstico meteorológico');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    apiClient.get('/weather/tides/stations')
      .then((r) => setTideStations(r.data))
      .catch(() => { /* sin estaciones aún; la sección de mareas muestra su propio vacío */ });

    apiClient.get('/weather/smn/stations')
      .then((r) => {
        setSmnStations(r.data);
        if (r.data.length > 0) {
          const defaultSt = r.data.find(s => s.name.toUpperCase().includes("ENSENADA")) || r.data[0];
          setSmnStationId(defaultSt.id);
        }
      })
      .catch(() => { /* sin estaciones SMN aún */ });

    // Cargar resumen de estado de El Niño (NOAA CPC)
    apiClient.get('/weather/enso/status')
      .then((r) => setEnsoSummary(r.data))
      .catch(() => { /* sin datos ENSO aún */ });
  }, []);

  // Cargar lista de huracanes activos e históricos
  const fetchActiveStorms = useCallback(async () => {
    try {
      const r = await apiClient.get('/weather/hurricanes/active');
      const list = r.data.storms || [];
      setActiveStorms(list);
      if (list.length > 0 && !selectedStormId) {
        const defaultStorm = list.find((s) => s.is_live) || list[0];
        setSelectedStormId(defaultStorm.id);
      }
    } catch {
      // ignore
    }
  }, [selectedStormId]);

  const fetchStormTrack = useCallback(async (stormId) => {
    if (!stormId) return;
    setHurricaneLoading(true);
    try {
      const r = await apiClient.get(`/weather/hurricanes/${stormId}/track`);
      setStormTrackDetails(r.data);
      if (r.data?.current_position) {
        setMapCenterOverride([r.data.current_position.lat, r.data.current_position.lon]);
      }
    } catch {
      message.error('Error al cargar la trayectoria del ciclón');
    } finally {
      setHurricaneLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveStorms();
  }, [fetchActiveStorms]);

  useEffect(() => {
    if (selectedStormId && (hurricaneTrackerOpen || activeLayer === 'hurricanes')) {
      fetchStormTrack(selectedStormId);
    }
  }, [selectedStormId, hurricaneTrackerOpen, activeLayer, fetchStormTrack]);

  // Cargar posiciones más recientes de todas las embarcaciones
  const fetchVesselsTelemetry = useCallback(async () => {
    try {
      const r = await apiClient.get('/vessels/telemetry/latest');
      setVesselsTelemetry(r.data);
    } catch {
      message.error('Error al cargar posiciones recientes de embarcaciones');
    }
  }, []);

  const fetchVesselTrack = useCallback(async () => {
    if (!selectedVessel || !telemetryDates || telemetryDates.length < 2) return;
    setTelemetryLoading(true);
    try {
      const [start, end] = telemetryDates;
      const r = await apiClient.get(`/vessels/${selectedVessel.id}/telemetry`, {
        params: { 
          start: start.toISOString(),
          end: end.toISOString()
        }
      });
      setVesselTrack(r.data);
    } catch {
      message.error('Error al cargar la ruta de la embarcación');
      setVesselTrack([]);
    } finally {
      setTelemetryLoading(false);
    }
  }, [selectedVessel, telemetryDates]);

  useEffect(() => {
    if (stationSource === 'telemetry') {
      fetchVesselsTelemetry();
    }
  }, [stationSource, fetchVesselsTelemetry]);

  useEffect(() => {
    fetchVesselTrack();
    setTrackClickedInfo(null);
  }, [fetchVesselTrack]);

  // Actualizar el nombre del barco seleccionado cuando se carga la lista completa
  useEffect(() => {
    if (vesselsTelemetry.length > 0 && selectedVessel) {
      const match = vesselsTelemetry.find((vt) => vt.vessel_id === selectedVessel.id);
      if (match && selectedVessel.name !== match.vessel_name) {
        setSelectedVessel({ id: selectedVessel.id, name: match.vessel_name });
      }
    }
  }, [vesselsTelemetry, selectedVessel]);

  // Parser del query param vesselId al montar la página
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const qVesselId = params.get('vesselId');
    if (qVesselId) {
      const vId = parseInt(qVesselId, 10);
      setStationSource('telemetry');
      setSelectedVessel({ id: vId, name: 'Cargando...' });
      
      apiClient.get(`/vessels/${vId}/telemetry/latest`)
        .then((r) => {
          if (r.data && r.data.latitude != null && r.data.longitude != null) {
            setMapCenterOverride([r.data.latitude, r.data.longitude]);
          }
        })
        .catch(() => {});
    }
  }, [location.search]);

  // Liberar los object URLs de los PNG al salir de la página
  useEffect(() => {
    const imgCaches = [windImgCache.current, wavesCache.current, tempImgCache.current, airTempImgCache.current];
    return () => {
      imgCaches.forEach((cache) => {
        cache.forEach((url) => URL.revokeObjectURL(url));
        cache.clear();
      });
    };
  }, []);

  // Limpiar cachés si cambia la corrida activa o su fecha de procesamiento para evitar desfaces visuales
  useEffect(() => {
    if (status?.run_date || status?.run_hour || status?.processed_at) {
      [windImgCache.current, wavesCache.current, tempImgCache.current, airTempImgCache.current, precipImgCache.current].forEach((cache) => {
        cache.forEach((url) => URL.revokeObjectURL(url));
        cache.clear();
      });
      windCache.current.clear();
      wavesVelCache.current.clear();
      rawWavesCache.current.clear();
      rawTempCache.current.clear();
      rawPrecipCache.current.clear();
    }
  }, [status?.run_date, status?.run_hour, status?.processed_at]);

  // Descarga un PNG con el header de auth y lo cachea como object URL
  // (un <img src> directo no puede mandar el token JWT).
  const fetchImageUrl = async (endpoint, h, cache, model = 'gfs') => {
    const key = `${model}_${h}`;
    if (cache.current.has(key)) return cache.current.get(key);
    const params = { hour: h };
    if (model) params.model = model;
    const r = await apiClient.get(endpoint, { params, responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    cache.current.set(key, url);
    return url;
  };

  const loadHourData = useCallback(async (h, layer, model = 'gfs') => {
    if (layer === 'none') {
      setLayersLoading(false);
      return;
    }
    try {
      setLayersLoading(true);
      if (layer === 'wind' || layer === 'hurricanes') {
        // Fondo de color + JSON U/V para las partículas animadas (soporta GFS y ECMWF)
        setWindImageUrl(await fetchImageUrl('/weather/wind-image', h, windImgCache, model));
        const cacheKey = `${model}_${h}`;
        if (windCache.current.has(cacheKey)) {
          setWindData(windCache.current.get(cacheKey));
        } else {
          const r = await apiClient.get('/weather/wind', { params: { hour: h, model } });
          windCache.current.set(cacheKey, r.data);
          setWindData(r.data);
        }
      } else if (layer === 'waves') {
        // Fondo de color + campo U/V sintético para animar el swell
        setWavesImageUrl(await fetchImageUrl('/weather/waves-image', h, wavesCache));
        if (wavesVelCache.current.has(h)) {
          setWavesVelData(wavesVelCache.current.get(h));
        } else {
          const r = await apiClient.get('/weather/waves-velocity', { params: { hour: h } });
          wavesVelCache.current.set(h, r.data);
          setWavesVelData(r.data);
        }
        if (rawWavesCache.current.has(h)) {
          setWavesData(rawWavesCache.current.get(h));
        } else {
          apiClient.get('/weather/waves', { params: { hour: h } })
            .then(r => {
              rawWavesCache.current.set(h, r.data);
              setWavesData(r.data);
            })
            .catch(() => {});
        }
      } else if (layer === 'sea_temp' || layer === 'temperature') {
        // Fondo térmico de TSM marina enmascarada a costa (soporta GFS y ECMWF)
        setTempImageUrl(await fetchImageUrl('/weather/temp-image', h, tempImgCache, model));
        const cacheKey = `${model}_${h}`;
        if (rawTempCache.current.has(cacheKey)) {
          setTempData(rawTempCache.current.get(cacheKey));
        } else {
          apiClient.get('/weather/temp', { params: { hour: h, model } })
            .then(r => {
              rawTempCache.current.set(cacheKey, r.data);
              setTempData(r.data);
            })
            .catch(() => {});
        }
      } else if (layer === 'air_temp') {
        // Fondo térmico de temperatura del aire a 2m continuo (soporta GFS y ECMWF)
        setAirTempImageUrl(await fetchImageUrl('/weather/air-temp-image', h, airTempImgCache, model));
        const cacheKey = `${model}_${h}`;
        if (rawTempCache.current.has(cacheKey)) {
          setTempData(rawTempCache.current.get(cacheKey));
        } else {
          apiClient.get('/weather/temp', { params: { hour: h, model } })
            .then(r => {
              rawTempCache.current.set(cacheKey, r.data);
              setTempData(r.data);
            })
            .catch(() => {});
        }
      } else if (layer === 'precip') {
        // Fondo radar de precipitación / lluvia en mm/h continuo (soporta GFS y ECMWF)
        setPrecipImageUrl(await fetchImageUrl('/weather/precip-image', h, precipImgCache, model));
        const cacheKey = `${model}_${h}`;
        if (rawPrecipCache.current.has(cacheKey)) {
          setPrecipData(rawPrecipCache.current.get(cacheKey));
        } else {
          apiClient.get('/weather/precip', { params: { hour: h, model } })
            .then(r => {
              rawPrecipCache.current.set(cacheKey, r.data);
              setPrecipData(r.data);
            })
            .catch(() => {});
        }
      }
    } catch {
      message.error(`Error al cargar el pronóstico de la hora +${h}h`);
    } finally {
      setLayersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status?.available) {
      loadHourData(hour, activeLayer, weatherModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hour, activeLayer, weatherModel, status?.available]);

  // Reproducción automática del slider de tiempo
  useEffect(() => {
    if (!playing || availableHours.length === 0) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }
    playTimerRef.current = setInterval(() => {
      setHour((prev) => {
        const idx = availableHours.indexOf(prev);
        const nextIdx = idx === -1 || idx === availableHours.length - 1 ? 0 : idx + 1;
        return availableHours[nextIdx];
      });
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(playTimerRef.current);
  }, [playing, availableHours]);

  const isInsideModelBounds = (lat, lon) =>
    lat >= MODEL_BOUNDS[0][0] && lat <= MODEL_BOUNDS[1][0] &&
    lon >= MODEL_BOUNDS[0][1] && lon <= MODEL_BOUNDS[1][1];

  const fetchPointForecast = useCallback(async (lat, lon, model) => {
    setPointLoading(true);
    const m = model || weatherModel;
    try {
      const r = await apiClient.get('/weather/point', { params: { lat, lon, model: m } });
      setPointForecast(r.data.forecast || []);
      setPointModelName(r.data.model_name || (m === 'ecmwf' ? 'ECMWF (IFS Europeo 0.25°)' : 'GFS (NOAA 0.25°)'));
    } catch {
      message.error('No hay datos de pronóstico disponibles para este punto');
      setPointForecast([]);
    } finally {
      setPointLoading(false);
    }
  }, [weatherModel]);

  const handlePointClick = useCallback(async (lat, lon, name = null) => {
    if (activeLayer === 'none') return;
    setSelectedPoint({ lat, lon, name });
    setPointCardOpen(true);
    setPointLoading(true);

    let foundNearTide = null;
    let foundNearSmn = null;

    // Autoselección inteligente de estación mareográfica más cercana
    if (tideStations && tideStations.length > 0) {
      const nearTide = findNearestStation(lat, lon, tideStations, 250);
      if (nearTide && !nearTide.isTooFar) {
        foundNearTide = nearTide;
        setTideStation(nearTide.station.code);
        setNearestTideInfo({
          name: nearTide.station.name,
          code: nearTide.station.code,
          distanceKm: nearTide.distanceKm,
          station: nearTide.station,
          isTooFar: false,
        });
      } else if (nearTide) {
        foundNearTide = nearTide;
        setNearestTideInfo({
          name: nearTide.station.name,
          code: nearTide.station.code,
          distanceKm: nearTide.distanceKm,
          station: nearTide.station,
          isTooFar: true,
        });
      } else {
        setNearestTideInfo(null);
      }
    }

    // Autoselección inteligente de estación SMN más cercana
    if (smnStations && smnStations.length > 0) {
      const nearSmn = findNearestStation(lat, lon, smnStations, 150);
      if (nearSmn && !nearSmn.isTooFar) {
        foundNearSmn = nearSmn;
        setSmnStationId(nearSmn.station.id);
        setNearestSmnInfo({
          name: nearSmn.station.name,
          id: nearSmn.station.id,
          distanceKm: nearSmn.distanceKm,
          station: nearSmn.station,
          isTooFar: false,
        });
      } else if (nearSmn) {
        foundNearSmn = nearSmn;
        setNearestSmnInfo({
          name: nearSmn.station.name,
          id: nearSmn.station.id,
          distanceKm: nearSmn.distanceKm,
          station: nearSmn.station,
          isTooFar: true,
        });
      } else {
        setNearestSmnInfo(null);
      }
    }

    // Abrir automáticamente el popup de la estación más cercana en el mapa
    setTimeout(() => {
      if (stationSource === 'smn' && foundNearSmn?.station?.id) {
        const marker = smnMarkerRefs.current[foundNearSmn.station.id];
        if (marker && typeof marker.openPopup === 'function') {
          marker.openPopup();
        }
      } else if (foundNearTide?.station?.code) {
        const marker = tideMarkerRefs.current[foundNearTide.station.code];
        if (marker && typeof marker.openPopup === 'function') {
          marker.openPopup();
        }
      }
    }, 150);

    fetchPointForecast(lat, lon, weatherModel);
  }, [activeLayer, stationSource, tideStations, smnStations, weatherModel, fetchPointForecast]);

  const handleModelChange = useCallback((newModel) => {
    setWeatherModel(newModel);
    if (selectedPoint) {
      fetchPointForecast(selectedPoint.lat, selectedPoint.lon, newModel);
    }
  }, [selectedPoint, fetchPointForecast]);

  const handleClearPoint = useCallback(() => {
    setSelectedPoint(null);
    setPointForecast([]);
    setPointCardOpen(false);
  }, []);

  const handleTrackClick = useCallback((e) => {
    if (e.originalEvent) {
      L.DomEvent.stopPropagation(e.originalEvent);
    }
    if (!vesselTrack || vesselTrack.length === 0) return;
    
    let minDist = Infinity;
    let nearest = null;
    const validPts = vesselTrack.filter((t) => t.latitude != null && t.longitude != null && (t.latitude !== 0 || t.longitude !== 0));
    for (const pt of validPts) {
      const d = L.latLng(pt.latitude, pt.longitude).distanceTo(e.latlng);
      if (d < minDist) {
        minDist = d;
        nearest = pt;
      }
    }
    if (nearest) {
      setTrackClickedInfo({ point: nearest, latlng: e.latlng });
    }
  }, [vesselTrack]);

  const handleRecordClick = useCallback((record) => {
    if (record.latitude != null && record.longitude != null && (record.latitude !== 0 || record.longitude !== 0)) {
      setTrackClickedInfo({
        point: record,
        latlng: { lat: record.latitude, lng: record.longitude }
      });
      setMapCenterOverride([record.latitude, record.longitude]);
      
      // Scroll suave hacia la cabecera (el mapa) para visualizarlo inmediatamente
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const sliderMarks = availableHours
    .filter((h) => h % 24 === 0)
    .reduce((acc, h) => ({ ...acc, [h]: `+${h}h` }), {});

  const runLabel = status?.available
    ? `Modelo GFS/WW3 — corrida ${status.run_date?.slice(6, 8)}/${status.run_date?.slice(4, 6)}/${status.run_date?.slice(0, 4)} ${status.run_hour}Z` +
      (status.hours_since_update != null ? ` · actualizado hace ${status.hours_since_update} h` : '')
    : 'Sin datos meteorológicos disponibles todavía';

  const displayTime = status?.available
    ? dayjs(`${status.run_date.slice(0, 4)}-${status.run_date.slice(4, 6)}-${status.run_date.slice(6, 8)}T${status.run_hour}:00:00Z`)
        .add(hour, 'hour')
        .format('DD/MM/YYYY HH:mm')
    : '';

  if (statusLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Spin size="large" />
        <span style={{ color: '#888' }}>Cargando estado meteorológico...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Barra Superior Informativa */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: '8px 16px' } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Space wrap align="center">
            <CloudOutlined style={{ fontSize: 18, color: '#0A2647' }} />
            <Text strong style={{ color: '#0A2647', fontSize: 13 }}>
              Módulo de Meteorología y Navegación
            </Text>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <Text type="secondary" style={{ fontSize: 12 }}>{runLabel}</Text>
          </Space>

          <Space wrap align="center" size={10}>
            {/* Conmutador de Modelo Numérico Global vs Europeo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', padding: '3px 8px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Modelo:</Text>
              <Segmented
                size="small"
                value={weatherModel}
                onChange={handleModelChange}
                options={[
                  {
                    label: (
                      <span title="Modelo NOAA GFS/WW3 (0.25°) — Estándar oceánico global (B/O Alpha Helix)">
                        🌐 GFS (NOAA)
                      </span>
                    ),
                    value: 'gfs',
                  },
                  {
                    label: (
                      <span title="Modelo ECMWF IFS Europeo (0.25°) — Mayor resolución orográfica y costera (La Rigel / Windy)">
                        🇪🇺 ECMWF (Europeo)
                      </span>
                    ),
                    value: 'ecmwf',
                  },
                ]}
              />
              {weatherModel === 'ecmwf' ? (
                <Tag color="purple" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '18px' }}>🇪🇺 Costero / Rigel</Tag>
              ) : (
                <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '18px' }}>🌐 Global / Alpha Helix</Tag>
              )}
              {activeLayer === 'waves' && (
                <Tag color="cyan" style={{ margin: 0, fontSize: 10, padding: '0 6px', lineHeight: '18px', fontWeight: 600 }}>
                  🌊 Malla Oleaje: NOAA WaveWatch III (WW3)
                </Tag>
              )}
            </div>

            {stationSource === 'telemetry' && vesselsTelemetry.length > 0 && (
              <Select
                placeholder="Enfocar embarcación..."
                size="small"
                allowClear
                value={selectedVessel?.id}
                onChange={(value) => {
                  if (!value) {
                    setSelectedVessel(null);
                    setVesselTrack([]);
                  } else {
                    const vt = vesselsTelemetry.find(v => v.vessel_id === value);
                    if (vt) {
                      setSelectedVessel({ id: vt.vessel_id, name: vt.vessel_name });
                      if (vt.latest_telemetry?.latitude && vt.latest_telemetry?.longitude) {
                        setMapCenterOverride([vt.latest_telemetry.latitude, vt.latest_telemetry.longitude, 9]);
                      }
                    }
                  }
                }}
                style={{ width: 190 }}
                options={vesselsTelemetry.map((vt) => ({
                  value: vt.vessel_id,
                  label: `🚢 ${vt.vessel_name}`,
                }))}
              />
            )}
          </Space>
        </div>
      </Card>

      {!status?.available ? (
        <Card style={{ borderRadius: 12, textAlign: 'center', padding: 40 }}>
          <Text type="secondary">
            El pipeline meteorológico todavía no ha procesado ninguna corrida. Vuelve a intentarlo en unos minutos.
          </Text>
        </Card>
      ) : (
        <>
          {/* Contenedor del Mapa con Controles Flotantes Modernos */}
          <Card style={{ borderRadius: 12, overflow: 'hidden' }} styles={{ body: { padding: 0 } }}>
            <div style={{ height: '70vh', minHeight: 520, position: 'relative' }}>
              {/* 1. Dock Flotante Central de Capas */}
              <WeatherLayerDock
                activeLayer={activeLayer}
                onSelectLayer={(val) => {
                  setActiveLayer(val);
                  if (val === 'hurricanes') {
                    setHurricaneTrackerOpen(true);
                    if (selectedStormId) {
                      fetchStormTrack(selectedStormId);
                    }
                  }
                }}
                stationSource={stationSource}
                onSelectStationSource={(source) => {
                  setStationSource(source);
                  setBottomActiveTab(source);
                }}
                weatherModel={weatherModel}
                onSelectModel={handleModelChange}
                activeStorms={activeStorms}
                onFocusHurricane={(storm) => {
                  setSelectedStormId(storm.id);
                  setHurricaneTrackerOpen(true);
                  fetchStormTrack(storm.id);
                  if (storm.lat && storm.lon) {
                    setMapCenterOverride([storm.lat, storm.lon, 6.5]);
                  }
                }}
                onOpenEnsoModal={() => setEnsoModalOpen(true)}
                ensoSummary={ensoSummary}
              />

              {/* 2. Selector Rápido de Regiones y Puertos */}
              <QuickRegionSelector
                onSelectRegion={(center) => setMapCenterOverride(center)}
              />

              {/* 3. Seguimiento Informativo de El Niño (ENSO) */}
              <EnsoInfoWidget
                ensoSummary={ensoSummary}
                onOpenEnsoModal={() => setEnsoModalOpen(true)}
              />

              {/* Leyenda de Color */}
              {(activeLayer === 'wind' || activeLayer === 'hurricanes') && <ColorLegend legend={WIND_LEGEND} />}
              {activeLayer === 'waves' && <ColorLegend legend={WAVE_LEGEND} />}
              {(activeLayer === 'sea_temp' || activeLayer === 'temperature') && <ColorLegend legend={TEMP_LEGEND} />}
              {activeLayer === 'air_temp' && <ColorLegend legend={AIR_TEMP_LEGEND} />}
              {activeLayer === 'precip' && <ColorLegend legend={PRECIP_LEGEND} />}

              {/* Panel Flotante de Seguimiento de Huracanes (Pronóstico Oficial NOAA + GFS Numérico) */}
              {(hurricaneTrackerOpen || activeLayer === 'hurricanes') && (
                <HurricaneTrackerPanel
                  activeStorms={activeStorms}
                  selectedStormId={selectedStormId}
                  onSelectStorm={(id) => {
                    setSelectedStormId(id);
                    setActiveWaypointSelection(null);
                    fetchStormTrack(id);
                  }}
                  stormDetails={stormTrackDetails}
                  loading={hurricaneLoading}
                  showCone={showCone}
                  onToggleShowCone={setShowCone}
                  selectedModel={selectedHurricaneModel}
                  onSelectModel={setSelectedHurricaneModel}
                  selectedWaypointIndex={activeWaypointSelection?.index}
                  onSelectWaypoint={(pt, idx) => {
                    setMapCenterOverride([pt.lat, pt.lon]);
                    setActiveWaypointSelection({ index: idx, ts: Date.now() });
                  }}
                  onClose={() => {
                    setHurricaneTrackerOpen(false);
                    setActiveWaypointSelection(null);
                    if (activeLayer === 'hurricanes') {
                      setActiveLayer('wind');
                    }
                  }}
                />
              )}

              {/* Tarjeta Flotante Compacta de Pronóstico Puntual en el Mapa */}
              {pointCardOpen && selectedPoint && (
                <PointFloatingCard
                  point={selectedPoint}
                  forecast={pointForecast}
                  selectedHour={hour}
                  loading={pointLoading}
                  weatherModel={weatherModel}
                  onSelectModel={handleModelChange}
                  pointModelName={pointModelName}
                  onClose={handleClearPoint}
                  onViewDetails={() => {
                    setBottomActiveTab('point');
                    detailSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }}
                />
              )}

              <MapContainer
                bounds={MODEL_BOUNDS}
                zoomSnap={0.25}
                zoomDelta={0.5}
                style={{ height: '100%', width: '100%' }}
              >
                <InitialFit />
                {mapCenterOverride && <MapCenterer center={mapCenterOverride} />}
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <MapClickCatcher onMapClick={handlePointClick} />
                {/* Viento: fondo de color estilo Windy + partículas animadas encima */}
                <RasterOverlay imageUrl={windImageUrl} bounds={status?.wind_bbox} visible={activeLayer === 'wind' || activeLayer === 'hurricanes'} />
                <VelocityLayer
                  data={windData}
                  visible={activeLayer === 'wind' || activeLayer === 'hurricanes'}
                />
                {/* Oleaje: PNG enmascarado por costa real + guiones del swell */}
                <RasterOverlay imageUrl={wavesImageUrl} bounds={status?.wave_bbox} visible={activeLayer === 'waves'} />
                <WaveDashLayer
                  velocityData={wavesVelData}
                  maskUrl={wavesImageUrl}
                  bounds={status?.wave_bbox}
                  visible={activeLayer === 'waves'}
                />
                {/* Temperatura Marina (TSM): PNG enmascarado con costa real */}
                <RasterOverlay imageUrl={tempImageUrl} bounds={status?.temp_bbox || status?.wind_bbox} visible={activeLayer === 'sea_temp' || activeLayer === 'temperature'} />
                {/* Temperatura del Aire (2m): PNG continuo sobre mar y tierra */}
                <RasterOverlay imageUrl={airTempImageUrl} bounds={status?.temp_bbox || status?.wind_bbox} visible={activeLayer === 'air_temp'} />
                {/* Precipitación / Radar de Lluvia: PNG continuo sobre mar y tierra */}
                <RasterOverlay imageUrl={precipImageUrl} bounds={status?.precip_bbox || status?.wind_bbox} visible={activeLayer === 'precip'} />

                {/* Pastilla unificada de datos bajo el cursor para todas las capas */}
                <WeatherCursorReadout
                  activeLayer={activeLayer}
                  windData={windData}
                  wavesData={wavesData}
                  tempData={tempData}
                  precipData={precipData}
                  weatherModel={weatherModel}
                />

                {/* Capa Interactiva de Huracanes y Ciclones Tropicales (NOAA + GFS Numérico) */}
                <HurricaneLayer
                  stormDetails={stormTrackDetails}
                  showCone={showCone}
                  visible={hurricaneTrackerOpen || activeLayer === 'hurricanes'}
                  selectedModel={selectedHurricaneModel}
                  activeWaypointSelection={activeWaypointSelection}
                />
                {/* Indicador visual con pulso del punto seleccionado sobre el mapa */}
                {selectedPoint && (
                  <Marker
                    position={[selectedPoint.lat, selectedPoint.lon]}
                    icon={CLICKED_POINT_ICON}
                    zIndexOffset={1500}
                  >
                    <Popup autoPan={false}>
                      <div style={{ minWidth: 190, padding: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 15 }}>📍</span>
                          <strong style={{ color: '#0A2647', fontSize: 13 }}>
                            {selectedPoint.name || 'Punto Seleccionado'}
                          </strong>
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                          Lat: <strong>{selectedPoint.lat.toFixed(3)}°N</strong>, Lon: <strong>{Math.abs(selectedPoint.lon).toFixed(3)}°W</strong>
                        </div>
                        {stationSource === 'tides' && nearestTideInfo && (
                          <div style={{ fontSize: 10, color: '#0284c7', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, padding: '4px 6px', marginTop: 4 }}>
                            🌊 <strong>Nivel del Mar más cercano:</strong><br />
                            <strong>{nearestTideInfo.name} ({nearestTideInfo.code})</strong> a {nearestTideInfo.distanceKm} km
                          </div>
                        )}
                        {stationSource === 'smn' && nearestSmnInfo && (
                          <div style={{ fontSize: 10, color: '#ea580c', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '4px 6px', marginTop: 4 }}>
                            🛰️ <strong>Estación SMN más cercana:</strong><br />
                            <strong>{nearestSmnInfo.name}</strong> a {nearestSmnInfo.distanceKm} km
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClearPoint();
                          }}
                          style={{
                            marginTop: 8,
                            width: '100%',
                            padding: '5px 8px',
                            background: '#fee2e2',
                            color: '#b91c1c',
                            border: '1px solid #fca5a5',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#fecaca')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#fee2e2')}
                        >
                          <span>🗑️</span> Quitar punto del mapa
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Línea conectora hacia la estación mareográfica más cercana */}
                {selectedPoint && stationSource === 'tides' && nearestTideInfo?.station?.latitude != null && (
                  <Polyline
                    positions={[
                      [selectedPoint.lat, selectedPoint.lon],
                      [nearestTideInfo.station.latitude, nearestTideInfo.station.longitude],
                    ]}
                    pathOptions={{
                      color: '#0284c7',
                      weight: 2,
                      dashArray: '4, 6',
                      opacity: 0.75,
                    }}
                  />
                )}

                {/* Línea conectora hacia la estación SMN más cercana */}
                {selectedPoint && stationSource === 'smn' && nearestSmnInfo?.station?.latitude != null && (
                  <Polyline
                    positions={[
                      [selectedPoint.lat, selectedPoint.lon],
                      [nearestSmnInfo.station.latitude, nearestSmnInfo.station.longitude],
                    ]}
                    pathOptions={{
                      color: '#ea580c',
                      weight: 2,
                      dashArray: '4, 6',
                      opacity: 0.75,
                    }}
                  />
                )}

                {/* Estaciones mareográficas CICESE: clic = seleccionar en mareas + pronóstico numérico puntual */}
                {stationSource === 'tides' && tideStations
                  .filter((s) => s.latitude != null && s.longitude != null)
                  .map((s) => (
                    <Marker
                      key={s.code}
                      position={[s.latitude, s.longitude]}
                      icon={TIDE_ICON}
                      ref={(el) => { if (el) tideMarkerRefs.current[s.code] = el; }}
                      eventHandlers={{
                        click: () => {
                          setTideStation(s.code);
                          setBottomActiveTab('tides');
                          if (isInsideModelBounds(s.latitude, s.longitude)) {
                            handlePointClick(s.latitude, s.longitude, `${s.name} (${s.code})`);
                          }
                        },
                      }}
                    >
                      <Popup>
                        <div style={{ minWidth: 160, padding: 2 }}>
                          <strong style={{ color: '#0A2647', fontSize: 13, display: 'block', marginBottom: 2 }}>
                            🌊 {s.name}
                          </strong>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            Estación Mareográfica · Código: <strong>{s.code}</strong>
                          </div>
                          {nearestTideInfo?.code === s.code && selectedPoint && (
                            <div style={{ marginTop: 6, padding: '3px 6px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, color: '#166534', fontSize: 10, fontWeight: 700 }}>
                              📍 Estación más cercana ({nearestTideInfo.distanceKm} km del clic)
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  ))}

                {/* Estaciones meteorológicas automáticas del SMN */}
                {stationSource === 'smn' && smnStations
                  .filter((s) => s.latitude != null && s.longitude != null)
                  .map((s) => (
                    <Marker
                      key={s.id}
                      position={[s.latitude, s.longitude]}
                      icon={SMN_ICON}
                      ref={(el) => { if (el) smnMarkerRefs.current[s.id] = el; }}
                      eventHandlers={{
                        click: () => {
                          setSmnStationId(s.id);
                          setBottomActiveTab('smn');
                          if (isInsideModelBounds(s.latitude, s.longitude)) {
                            handlePointClick(s.latitude, s.longitude, `Estación EMA: ${s.name}`);
                          }
                        },
                      }}
                    >
                      <Popup>
                        <div style={{ minWidth: 160, padding: 2 }}>
                          <strong style={{ color: '#0A2647', fontSize: 13, display: 'block', marginBottom: 2 }}>
                            🛰️ {s.name}
                          </strong>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            Estación Meteorológica Automática (EMA)
                          </div>
                          {nearestSmnInfo?.id === s.id && selectedPoint && (
                            <div style={{ marginTop: 6, padding: '3px 6px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 6, color: '#92400e', fontSize: 10, fontWeight: 700 }}>
                              📍 Estación más cercana ({nearestSmnInfo.distanceKm} km del clic)
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  ))}

                {/* Telemetría de Embarcaciones */}
                {stationSource === 'telemetry' && vesselsTelemetry.map((vt) => {
                  const t = vt.latest_telemetry;
                  if (!t || t.latitude == null || t.longitude == null || (t.latitude === 0 && t.longitude === 0)) return null;
                  const icon = VESSEL_ICONS[vt.vessel_type] || VESSEL_ICONS.default;
                  const isSelected = selectedVessel?.id === vt.vessel_id;
                  
                  const styledIcon = isSelected 
                    ? L.divIcon({
                        className: 'custom-vessel-icon selected',
                        html: `<div style="background-color: #F1C40F; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid #0A2647; box-shadow: 0 0 10px #F1C40F; font-size: 13px; transform: scale(1.1); transition: all 0.2s;">🚢</div>`,
                        iconSize: [28, 28],
                        iconAnchor: [14, 14]
                      })
                    : icon;

                  return (
                    <Marker
                      key={vt.vessel_id}
                      position={[t.latitude, t.longitude]}
                      icon={styledIcon}
                      eventHandlers={{
                        click: (e) => {
                          setSelectedVessel({ id: vt.vessel_id, name: vt.vessel_name });
                          setBottomActiveTab('telemetry');
                          if (isInsideModelBounds(t.latitude, t.longitude)) {
                            handlePointClick(t.latitude, t.longitude, vt.vessel_name);
                          }
                          setTimeout(() => {
                            if (e.target && typeof e.target.openPopup === 'function') {
                              e.target.openPopup();
                            }
                          }, 50);
                        },
                      }}
                    >
                      <Popup>
                        <div style={{ minWidth: 120 }}>
                          <strong style={{ display: 'block', marginBottom: 4 }}>{vt.vessel_name}</strong>
                          <span style={{ fontSize: 11, display: 'block' }}>Tipo: {vt.vessel_type}</span>
                          <span style={{ fontSize: 11, display: 'block' }}>
                            Temp: {t.temp != null ? `${t.temp.toFixed(1)}°C` : '—'}
                          </span>
                          <span style={{ fontSize: 11, display: 'block' }}>
                            Viento: {t.wind_speed_corr != null ? `${(t.wind_speed_corr * 1.94384).toFixed(1)} kt` : '—'}
                          </span>
                          <span style={{ fontSize: 11, display: 'block' }}>
                            Batería: {t.supply_v != null ? `${t.supply_v.toFixed(1)} V` : '—'}
                          </span>
                          <span style={{ fontSize: 10, color: '#777', display: 'block', marginTop: 4 }}>
                            {dayjs(t.timestamp).format('DD/MM HH:mm')}
                          </span>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}

                {/* Ruta de la embarcación seleccionada */}
                {stationSource === 'telemetry' && selectedVessel && vesselTrack.length > 0 && (
                  <>
                    <Polyline
                      positions={vesselTrack
                        .filter((t) => t.latitude != null && t.longitude != null)
                        .map((t) => [t.latitude, t.longitude])}
                      color="#FA8C16"
                      weight={4}
                      opacity={0.8}
                      dashArray="5, 10"
                      eventHandlers={{ click: handleTrackClick }}
                      pathOptions={{ cursor: 'pointer' }}
                    />
                    {trackClickedInfo && (
                      <Popup
                        position={[trackClickedInfo.latlng.lat, trackClickedInfo.latlng.lng]}
                        onClose={() => setTrackClickedInfo(null)}
                      >
                        <div style={{ minWidth: 150, fontSize: 11 }}>
                          <strong style={{ display: 'block', marginBottom: 4, color: '#0A2647' }}>
                            Historial de Telemetría
                          </strong>
                          <div style={{ borderBottom: '1px solid #eee', paddingBottom: 4, marginBottom: 4, color: '#666' }}>
                            📅 {dayjs(trackClickedInfo.point.timestamp).format('DD/MM/YYYY HH:mm')}
                          </div>
                          <div>
                            <span style={{ color: '#888' }}>Coordenadas: </span>
                            <strong>{trackClickedInfo.point.latitude.toFixed(4)}, {trackClickedInfo.point.longitude.toFixed(4)}</strong>
                          </div>
                          {trackClickedInfo.point.temp != null && (
                            <div>
                              <span style={{ color: '#888' }}>Temp: </span>
                              <strong>{trackClickedInfo.point.temp.toFixed(1)}°C</strong>
                            </div>
                          )}
                          {(() => {
                            const wind = trackClickedInfo.point.wind_speed_corr != null ? trackClickedInfo.point.wind_speed_corr : trackClickedInfo.point.wind_speed;
                            const windDir = trackClickedInfo.point.wind_dir_corr != null ? trackClickedInfo.point.wind_dir_corr : trackClickedInfo.point.wind_dir;
                            if (wind == null) return null;
                            const windKts = wind * 1.94384;
                            return (
                              <div>
                                <span style={{ color: '#888' }}>Viento: </span>
                                <strong>
                                  {windKts.toFixed(1)} kt
                                  {windDir != null ? ` (${Math.round(windDir)}° ${getWindDirectionText(windDir)})` : ''}
                                </strong>
                              </div>
                            );
                          })()}
                          {trackClickedInfo.point.pressure != null && (
                            <div>
                              <span style={{ color: '#888' }}>Presión: </span>
                              <strong>{trackClickedInfo.point.pressure.toFixed(1)} hPa</strong>
                            </div>
                          )}
                          {trackClickedInfo.point.humidity != null && (
                            <div>
                              <span style={{ color: '#888' }}>Humedad: </span>
                              <strong>{trackClickedInfo.point.humidity.toFixed(0)}%</strong>
                            </div>
                          )}
                          {trackClickedInfo.point.supply_v != null && (
                            <div>
                              <span style={{ color: '#888' }}>Batería: </span>
                              <strong>{trackClickedInfo.point.supply_v.toFixed(1)} V</strong>
                            </div>
                          )}
                        </div>
                      </Popup>
                    )}
                  </>
                )}
              </MapContainer>
            </div>
          </Card>

          {/* Barra de Tiempo Inteligente (Hora Local Tijuana) */}
          <SmartTimeBar
            hour={hour}
            availableHours={availableHours}
            onHourChange={setHour}
            playing={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
            runDate={status?.run_date}
            runHour={status?.run_hour}
          />

          {/* Contenedor Unificado de Detalle Meteorológico y Observacional (Pestañas) */}
          <UnifiedWeatherDetailSection
            ref={detailSectionRef}
            activeTab={bottomActiveTab}
            selectedHour={hour}
            onTabChange={(tab) => {
              setBottomActiveTab(tab);
              if (tab === 'tides' || tab === 'smn' || tab === 'telemetry') {
                setStationSource(tab);
              }
            }}
            stationSource={stationSource}
            selectedPoint={selectedPoint}
            pointForecast={pointForecast}
            pointLoading={pointLoading}
            weatherModel={weatherModel}
            onSelectModel={handleModelChange}
            pointModelName={pointModelName}
            nearestTideInfo={nearestTideInfo}
            nearestSmnInfo={nearestSmnInfo}
            tideStations={tideStations}
            tideStation={tideStation}
            onTideStationChange={setTideStation}
            smnStations={smnStations}
            smnStationId={smnStationId}
            onSmnStationChange={setSmnStationId}
            vesselsTelemetry={vesselsTelemetry}
            selectedVessel={selectedVessel}
            onSelectVessel={setSelectedVessel}
            telemetryDates={telemetryDates}
            onTelemetryDatesChange={setTelemetryDates}
            onRecordClick={handleRecordClick}
            onClearPoint={handleClearPoint}
          />
          {/* Modal de Monitoreo de El Niño / Oscilación del Sur (ENSO) */}
          <EnsoTrackerModal
            visible={ensoModalOpen}
            onClose={() => setEnsoModalOpen(false)}
          />
        </>
      )}
    </div>
  );
}

export default WeatherPage;
