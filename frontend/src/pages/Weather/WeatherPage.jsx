/**
 * SIAE — Página de Meteorología.
 * Mapa animado de viento y oleaje (GFS/WaveWatch III) con pronóstico puntual,
 * para apoyar la planeación de cruceros oceanográficos.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Segmented, Slider, Space, Spin, Tag, Typography, message } from 'antd';
import { CloudOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from '../../utils/leafletGlobal';
import 'leaflet/dist/leaflet.css';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import VelocityLayer from './VelocityLayer';
import WaveDashLayer from './WaveDashLayer';
import RasterOverlay from './RasterOverlay';
import PointForecastPanel from './PointForecastPanel';
import ColorLegend, { WIND_LEGEND, WAVE_LEGEND } from './ColorLegend';
import TidesSection from './TidesSection';
import SmnSection from './SmnSection';

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

// Bounding box de recorte del modelo GFS/WW3 (debe coincidir con BBOX del backend, weather_fetcher.py)
const MODEL_BOUNDS = [[14, -122], [34, -85]];

const PLAY_INTERVAL_MS = 800;

function MapClickCatcher({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
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

  // Capa activa: una a la vez, como Windy ('wind' | 'waves')
  const [activeLayer, setActiveLayer] = useState('wind');

  const [windData, setWindData] = useState(null);
  const [windImageUrl, setWindImageUrl] = useState(null);
  const [wavesImageUrl, setWavesImageUrl] = useState(null);
  const [wavesVelData, setWavesVelData] = useState(null);
  const [layersLoading, setLayersLoading] = useState(false);

  const [selectedPoint, setSelectedPoint] = useState(null);
  const [pointForecast, setPointForecast] = useState([]);
  const [pointLoading, setPointLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  // Selector de origen de estaciones: 'tides' (CICESE) | 'smn' (Estaciones Automáticas)
  const [stationSource, setStationSource] = useState('tides');

  // Estaciones mareográficas: markers del mapa + selector de la sección de mareas
  const [tideStations, setTideStations] = useState([]);
  const [tideStation, setTideStation] = useState('ENS');

  const [smnStations, setSmnStations] = useState([]);
  const [smnStationId, setSmnStationId] = useState(null);

  const windCache = useRef(new Map());
  const windImgCache = useRef(new Map());
  const wavesCache = useRef(new Map());
  const wavesVelCache = useRef(new Map());
  const playTimerRef = useRef(null);

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
  }, []);

  // Liberar los object URLs de los PNG al salir de la página
  useEffect(() => {
    const imgCaches = [windImgCache.current, wavesCache.current];
    return () => {
      imgCaches.forEach((cache) => {
        cache.forEach((url) => URL.revokeObjectURL(url));
        cache.clear();
      });
    };
  }, []);

  // Descarga un PNG con el header de auth y lo cachea como object URL
  // (un <img src> directo no puede mandar el token JWT).
  const fetchImageUrl = async (endpoint, h, cache) => {
    if (cache.current.has(h)) return cache.current.get(h);
    const r = await apiClient.get(endpoint, { params: { hour: h }, responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    cache.current.set(h, url);
    return url;
  };

  const loadHourData = useCallback(async (h, layer) => {
    try {
      setLayersLoading(true);
      if (layer === 'wind') {
        // Fondo de color + JSON U/V para las partículas animadas
        setWindImageUrl(await fetchImageUrl('/weather/wind-image', h, windImgCache));
        if (windCache.current.has(h)) {
          setWindData(windCache.current.get(h));
        } else {
          const r = await apiClient.get('/weather/wind', { params: { hour: h } });
          windCache.current.set(h, r.data);
          setWindData(r.data);
        }
      } else {
        // Fondo de color + campo U/V sintético para animar el swell
        setWavesImageUrl(await fetchImageUrl('/weather/waves-image', h, wavesCache));
        if (wavesVelCache.current.has(h)) {
          setWavesVelData(wavesVelCache.current.get(h));
        } else {
          const r = await apiClient.get('/weather/waves-velocity', { params: { hour: h } });
          wavesVelCache.current.set(h, r.data);
          setWavesVelData(r.data);
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
      loadHourData(hour, activeLayer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hour, activeLayer, status?.available]);

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

  const handlePointClick = useCallback(async (lat, lon, name = null) => {
    setSelectedPoint({ lat, lon, name });
    setPanelOpen(true);
    setPointLoading(true);
    try {
      const r = await apiClient.get('/weather/point', { params: { lat, lon } });
      setPointForecast(r.data.forecast);
    } catch {
      message.error('No hay datos de pronóstico disponibles para este punto');
      setPointForecast([]);
    } finally {
      setPointLoading(false);
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
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" tip="Cargando estado meteorológico..." />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Card style={{ borderRadius: 12, marginBottom: 12 }} styles={{ body: { padding: '10px 16px' } }}>
        <Space wrap style={{ justifyContent: 'space-between', width: '100%' }} size="middle">
          <Space size="middle" wrap>
            <Space>
              <CloudOutlined style={{ fontSize: 18, color: '#0A2647' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>{runLabel}</Text>
            </Space>
            <Segmented
              size="small"
              value={stationSource}
              onChange={setStationSource}
              options={[
                { label: '🌊 Nivel del Mar (CICESE)', value: 'tides' },
                { label: '🛰️ Estaciones SMN (EMA)', value: 'smn' },
              ]}
            />
          </Space>
          <Segmented
            size="small"
            value={activeLayer}
            onChange={setActiveLayer}
            options={[
              { label: '💨 Viento', value: 'wind' },
              { label: '🌊 Oleaje', value: 'waves' },
            ]}
          />
        </Space>
      </Card>

      {!status?.available ? (
        <Card style={{ borderRadius: 12, textAlign: 'center', padding: 40 }}>
          <Text type="secondary">
            El pipeline meteorológico todavía no ha procesado ninguna corrida. Vuelve a intentarlo en unos minutos.
          </Text>
        </Card>
      ) : (
        <>
          <Card style={{ borderRadius: 12, marginBottom: 12 }} styles={{ body: { padding: '12px 16px' } }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%' }}>
              <Button
                type="text"
                icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={() => setPlaying((p) => !p)}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Slider
                  min={availableHours[0] ?? 0}
                  max={availableHours[availableHours.length - 1] ?? 0}
                  step={6}
                  dots
                  marks={sliderMarks}
                  value={hour}
                  onChange={setHour}
                  tooltip={{ formatter: (v) => `+${v} h` }}
                />
              </div>
              <Tag color="blue" style={{ minWidth: 160, textAlign: 'center', flexShrink: 0 }}>
                {displayTime}
                {layersLoading && <Spin size="small" style={{ marginLeft: 6 }} />}
              </Tag>
            </div>
          </Card>

          <Card style={{ borderRadius: 12, overflow: 'hidden' }} styles={{ body: { padding: 0 } }}>
            <div style={{ height: '70vh', minHeight: 500, position: 'relative' }}>
              <ColorLegend legend={activeLayer === 'wind' ? WIND_LEGEND : WAVE_LEGEND} />
              <MapContainer
                bounds={MODEL_BOUNDS}
                zoomSnap={0.25}
                zoomDelta={0.5}
                style={{ height: '100%', width: '100%' }}
              >
                <InitialFit />
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <MapClickCatcher onMapClick={handlePointClick} />
                {/* Viento: fondo de color estilo Windy + partículas animadas encima */}
                <RasterOverlay imageUrl={windImageUrl} bounds={status?.wind_bbox} visible={activeLayer === 'wind'} />
                <VelocityLayer data={windData} visible={activeLayer === 'wind'} />
                {/* Oleaje: PNG enmascarado por costa real + guiones del swell
                    (WaveDashLayer usa el alfa del PNG como máscara, así los
                    guiones nunca se dibujan sobre tierra) */}
                <RasterOverlay imageUrl={wavesImageUrl} bounds={status?.wave_bbox} visible={activeLayer === 'waves'} />
                <WaveDashLayer
                  velocityData={wavesVelData}
                  maskUrl={wavesImageUrl}
                  bounds={status?.wave_bbox}
                  visible={activeLayer === 'waves'}
                />
                {/* Estaciones mareográficas CICESE: clic = seleccionar en la
                    sección de mareas + pronóstico puntual si el punto cae
                    dentro del dominio del modelo meteorológico */}
                {stationSource === 'tides' && tideStations
                  .filter((s) => s.latitude != null && s.longitude != null)
                  .map((s) => (
                    <Marker
                      key={s.code}
                      position={[s.latitude, s.longitude]}
                      icon={TIDE_ICON}
                      eventHandlers={{
                        click: () => {
                          setTideStation(s.code);
                          if (isInsideModelBounds(s.latitude, s.longitude)) {
                            handlePointClick(s.latitude, s.longitude, `${s.name} (${s.code})`);
                          }
                        },
                      }}
                    >
                      <Popup>🌊 {s.name}</Popup>
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
                      eventHandlers={{
                        click: () => {
                          setSmnStationId(s.id);
                          if (isInsideModelBounds(s.latitude, s.longitude)) {
                            handlePointClick(s.latitude, s.longitude, `Estación EMA: ${s.name}`);
                          }
                        },
                      }}
                    >
                      <Popup>🛰️ Estación SMN: {s.name}</Popup>
                    </Marker>
                  ))}
              </MapContainer>
            </div>
          </Card>

          {stationSource === 'tides' && (
            <TidesSection
              stations={tideStations}
              stationCode={tideStation}
              onStationChange={setTideStation}
            />
          )}
          {stationSource === 'smn' && (
            <SmnSection
              stations={smnStations}
              stationId={smnStationId}
              onStationChange={setSmnStationId}
            />
          )}
        </>
      )}

      <PointForecastPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        pointName={selectedPoint?.name || (selectedPoint ? `Lat ${selectedPoint.lat.toFixed(3)}, Lon ${selectedPoint.lon.toFixed(3)}` : null)}
        loading={pointLoading}
        forecast={pointForecast}
      />
    </div>
  );
}

export default WeatherPage;
