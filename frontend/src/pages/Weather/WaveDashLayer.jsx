/**
 * SIAE — Animación de oleaje estilo Windy: guiones cortos que marchan en la
 * dirección de propagación del swell.
 *
 * A diferencia de leaflet-velocity (estelas largas tipo viento, sin forma de
 * enmascarar tierra), aquí se dibuja una retícula de guiones cortos y se usa
 * el CANAL ALFA DEL PNG DE OLEAJE como máscara por píxel: el PNG ya viene
 * recortado a la línea de costa real por el backend, así que los guiones
 * heredan exactamente ese recorte y nunca se dibujan sobre tierra.
 *
 * Reutiliza L.canvasLayer (registrado globalmente por leaflet-velocity).
 */
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from '../../utils/leafletGlobal';
import 'leaflet-velocity';

const GRID_SPACING_PX = 34; // separación de la retícula de guiones en pantalla
const CYCLE_PX = 26; // recorrido de cada guion antes de reiniciar
const FPS_INTERVAL_MS = 50; // ~20 fps, suficiente para un vaivén suave

/** Interpolador bilineal U/V sobre el JSON de /weather/waves-velocity. */
function buildInterpolator(velocityData) {
  const header = velocityData[0].header;
  const { nx, ny, la1, lo1, dx, dy } = header;
  const u = velocityData[0].data;
  const v = velocityData[1].data;

  return (lat, lon) => {
    const colF = (lon - lo1) / dx;
    const rowF = (la1 - lat) / dy;
    if (colF < 0 || rowF < 0 || colF > nx - 1 || rowF > ny - 1) return null;
    const c0 = Math.floor(colF);
    const r0 = Math.floor(rowF);
    const c1 = Math.min(c0 + 1, nx - 1);
    const r1 = Math.min(r0 + 1, ny - 1);
    const fc = colF - c0;
    const fr = rowF - r0;
    const top_u = u[r0 * nx + c0] * (1 - fc) + u[r0 * nx + c1] * fc;
    const bot_u = u[r1 * nx + c0] * (1 - fc) + u[r1 * nx + c1] * fc;
    const top_v = v[r0 * nx + c0] * (1 - fc) + v[r0 * nx + c1] * fc;
    const bot_v = v[r1 * nx + c0] * (1 - fc) + v[r1 * nx + c1] * fc;
    return [top_u * (1 - fr) + bot_u * fr, top_v * (1 - fr) + bot_v * fr];
  };
}

/**
 * Muestreador del canal alfa del PNG de oleaje. Las filas del PNG están en
 * espaciado Mercator (así las genera el backend), por lo que el muestreo en
 * Y usa la misma transformación.
 */
function buildMaskSampler(img, bounds) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  const [[latS, lonW], [latN, lonE]] = bounds;
  const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const mercN = merc(latN);
  const mercS = merc(latS);
  const w = canvas.width;
  const h = canvas.height;

  return (lat, lon) => {
    if (lat <= latS || lat >= latN || lon <= lonW || lon >= lonE) return 0;
    const x = Math.floor(((lon - lonW) / (lonE - lonW)) * (w - 1));
    const y = Math.floor(((mercN - merc(lat)) / (mercN - mercS)) * (h - 1));
    return data[(y * w + x) * 4 + 3];
  };
}

/** Pseudo-aleatorio determinista por punto de retícula (desfasa los guiones). */
function seed(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function drawFrame(info, state) {
  const { canvas, size, layer } = info;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const { interpolate, maskAlpha } = state;
  if (!interpolate || !maskAlpha) return;

  const map = layer._map;
  const t = performance.now() / 1000;

  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,1)';

  for (let x = 0; x < size.x + GRID_SPACING_PX; x += GRID_SPACING_PX) {
    for (let y = 0; y < size.y + GRID_SPACING_PX; y += GRID_SPACING_PX) {
      const latlng = map.containerPointToLatLng([x, y]);
      const vec = interpolate(latlng.lat, latlng.lng);
      if (!vec) continue;
      const [u, v] = vec;
      const mag = Math.hypot(u, v);
      if (mag < 0.05) continue;
      if (maskAlpha(latlng.lat, latlng.lng) === 0) continue;

      // Dirección de propagación en pantalla (v positivo = norte = -y)
      const dirX = u / mag;
      const dirY = -v / mag;

      // El guion marcha a lo largo de su dirección y se reinicia cada CYCLE_PX
      const speed = 4 + mag * 4; // px/s, más rápido con mar más grande
      const phase = ((t * speed + seed(x, y) * CYCLE_PX * 4) % CYCLE_PX) - CYCLE_PX / 2;
      const cx = x + dirX * phase;
      const cy = y + dirY * phase;

      // Desvanecer en los extremos del recorrido para que el reinicio no "parpadee"
      const fade = 1 - Math.abs(phase) / (CYCLE_PX / 2);
      const len = 5 + mag * 2; // guion más largo con mar más grande

      ctx.globalAlpha = 0.25 + 0.65 * fade;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - (dirX * len) / 2, cy - (dirY * len) / 2);
      ctx.lineTo(cx + (dirX * len) / 2, cy + (dirY * len) / 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * @param {object} props
 * @param {Array|null} props.velocityData - JSON de /weather/waves-velocity.
 * @param {string|null} props.maskUrl - Object URL del PNG de oleaje (máscara alfa).
 * @param {Array|null} props.bounds - wave_bbox de /weather/status.
 * @param {boolean} props.visible
 */
function WaveDashLayer({ velocityData, maskUrl, bounds, visible }) {
  const map = useMap();
  const stateRef = useRef({ interpolate: null, maskAlpha: null });

  useEffect(() => {
    stateRef.current.interpolate = velocityData ? buildInterpolator(velocityData) : null;
  }, [velocityData]);

  useEffect(() => {
    stateRef.current.maskAlpha = null;
    if (!maskUrl || !bounds) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) stateRef.current.maskAlpha = buildMaskSampler(img, bounds);
    };
    img.src = maskUrl;
    return () => { cancelled = true; };
  }, [maskUrl, bounds]);

  useEffect(() => {
    if (!visible) return;
    // L.canvasLayer espera el ELEMENTO DOM del pane en options.pane (así lo
    // instancia el propio plugin internamente); sin él, Leaflet deja el
    // string 'overlayPane' y appendChild/removeChild revientan.
    const layer = L.canvasLayer({ pane: map.getPane('overlayPane') }).delegate({
      onDrawLayer: (info) => drawFrame(info, stateRef.current),
    });
    layer.addTo(map);
    const timer = setInterval(() => layer.needRedraw(), FPS_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      map.removeLayer(layer);
    };
  }, [visible, map]);

  return null;
}

export default WaveDashLayer;
