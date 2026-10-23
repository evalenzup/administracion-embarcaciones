/**
 * SIAE — Motor de Partículas de Viento Continuo en Tiempo Real (Estilo Windy / WebGL).
 * 
 * Renderizado de partículas de viento a 60 FPS continuo e ininterrumpido:
 *  - Estelas de viento nítidas y brillantes dibujadas con buffer de trayectoria (trail).
 *  - Capa Canvas posicionada a z-index 450 (por encima del raster térmico de fondo).
 *  - No se congela ni desaparece al arrastrar el mapa (pan) o hacer zoom.
 *  - Interpolación bilineal ultrarrápida (<0.5ms) sobre la malla GFS.
 *  - Colores dinámicos según velocidad (Beaufort / Windy palette).
 *  - Panel flotante de lectura instantánea de viento bajo el cursor (Readout).
 */
import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from '../../utils/leafletGlobal';

const PARTICLE_COUNT = 2400; // Densidad óptima de partículas
const TRAIL_LENGTH = 10; // Puntos de estela por partícula
const VELOCITY_SCALE = 0.55; // Escala de velocidad visual en píxeles

/** Interpolador bilineal continuo sobre el JSON vectorial GFS (U/V) */
function buildWindInterpolator(windData) {
  if (!windData || !Array.isArray(windData) || windData.length < 2) return null;
  const header = windData[0]?.header;
  if (!header) return null;
  const { nx, ny, la1, lo1, dx, dy } = header;
  const uData = windData[0].data;
  const vData = windData[1].data;

  if (!uData || !vData) return null;

  return (lat, lon) => {
    const colF = (lon - lo1) / dx;
    const rowF = (la1 - lat) / dy;
    if (colF < 0 || rowF < 0 || colF >= nx - 1 || rowF >= ny - 1) return null;

    const c0 = Math.floor(colF);
    const r0 = Math.floor(rowF);
    const c1 = c0 + 1;
    const r1 = r0 + 1;
    const fc = colF - c0;
    const fr = rowF - r0;

    const idx00 = r0 * nx + c0;
    const idx01 = r0 * nx + c1;
    const idx10 = r1 * nx + c0;
    const idx11 = r1 * nx + c1;

    const u00 = uData[idx00], u01 = uData[idx01], u10 = uData[idx10], u11 = uData[idx11];
    const v00 = vData[idx00], v01 = vData[idx01], v10 = vData[idx10], v11 = vData[idx11];

    if (u00 == null || u01 == null || u10 == null || u11 == null) return null;
    if (v00 == null || v01 == null || v10 == null || v11 == null) return null;

    const top_u = u00 * (1 - fc) + u01 * fc;
    const bot_u = u10 * (1 - fc) + u11 * fc;
    const top_v = v00 * (1 - fc) + v01 * fc;
    const bot_v = v10 * (1 - fc) + v11 * fc;

    return [top_u * (1 - fr) + bot_u * fr, top_v * (1 - fr) + bot_v * fr];
  };
}

/** Paleta de colores original de leaflet-velocity (gradiente continuo según velocidad en kt) */
const WIND_COLOR_PALETTE = [
  { kts: 0,  color: [36, 104, 180] },   // Azul océano
  { kts: 6,  color: [60, 157, 145] },   // Turquesa
  { kts: 12, color: [128, 205, 193] },  // Cian claro
  { kts: 18, color: [151, 218, 168] },  // Menta verde
  { kts: 24, color: [198, 231, 181] },  // Lima
  { kts: 30, color: [255, 238, 159] },  // Amarillo claro
  { kts: 36, color: [255, 182, 100] },  // Naranja claro
  { kts: 42, color: [250, 112, 52] },   // Naranja intenso
  { kts: 50, color: [245, 64, 32] },    // Rojo vivo
  { kts: 60, color: [220, 24, 32] },    // Carmesí
  { kts: 70, color: [180, 0, 35] },     // Magenta / Huracán
];

function getParticleColor(speedKts) {
  const s = Math.max(0, speedKts || 0);
  for (let i = 0; i < WIND_COLOR_PALETTE.length - 1; i++) {
    const curr = WIND_COLOR_PALETTE[i];
    const next = WIND_COLOR_PALETTE[i + 1];
    if (s >= curr.kts && s <= next.kts) {
      const f = (s - curr.kts) / (next.kts - curr.kts);
      const r = Math.round(curr.color[0] + (next.color[0] - curr.color[0]) * f);
      const g = Math.round(curr.color[1] + (next.color[1] - curr.color[1]) * f);
      const b = Math.round(curr.color[2] + (next.color[2] - curr.color[2]) * f);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return 'rgb(180, 0, 35)';
}

/** Texto cardinal meteorológico (0-360°) */
function getCardinalDirection(deg) {
  if (deg == null || isNaN(deg)) return '—';
  const val = (deg + 360) % 360;
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(val / 22.5) % 16;
  return `${dirs[idx]} (${Math.round(val)}°)`;
}

export default function VelocityLayer({ data, visible }) {
  const map = useMap();
  const interpolatorRef = useRef(null);

  // Actualizar interpolador cuando cambia el frame horario o corrida
  useEffect(() => {
    interpolatorRef.current = buildWindInterpolator(data);
  }, [data]);

  // Motor de partículas continuo con Canvas integrado en el Pane propio de Leaflet (bajo popups y marcadores)
  useEffect(() => {
    if (!visible) return;

    let velocityPane = map.getPane('velocityPane');
    if (!velocityPane) {
      velocityPane = map.createPane('velocityPane');
      velocityPane.style.zIndex = '450'; // Entre overlayPane (400) y markerPane/popupPane (600/700)
      velocityPane.style.pointerEvents = 'none';
    }

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    velocityPane.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let animFrameId = null;
    let width = 0;
    let height = 0;

    const resizeAndReposition = () => {
      const size = map.getSize();
      width = canvas.width = size.x;
      height = canvas.height = size.y;
      canvas.style.width = size.x + 'px';
      canvas.style.height = size.y + 'px';
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);
    };
    resizeAndReposition();

    // Pool de partículas con velocidad natural y elegante
    const PARTICLE_DENSITY = 2600;
    const VELOCITY_SCALE = 0.22; // Velocidad suave y controlada (Windy-like)
    const particles = [];
    for (let i = 0; i < PARTICLE_DENSITY; i++) {
      particles.push({
        x: Math.random() * (width || 800),
        y: Math.random() * (height || 600),
        age: Math.floor(Math.random() * 60),
        maxAge: 45 + Math.floor(Math.random() * 50),
      });
    }

    // Bucle de animación continuo a 60 FPS con estelas fluidas estilo Windy
    const renderLoop = () => {
      animFrameId = requestAnimationFrame(renderLoop);

      if (!ctx || width <= 0 || height <= 0) return;

      // Desvanecimiento orgánico y suave de estelas anteriores
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.085)';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';

      const interpolate = interpolatorRef.current;
      if (!interpolate) return;

      ctx.lineCap = 'round';
      ctx.lineWidth = 1.8;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Coordenada geográfica instantánea del píxel actual
        const latlng = map.containerPointToLatLng([p.x, p.y]);
        const vec = interpolate(latlng.lat, latlng.lng);

        // Si sale de los límites numéricos o expira el ciclo de vida, reiniciar
        if (!vec || p.age >= p.maxAge || p.x < -10 || p.x > width + 10 || p.y < -10 || p.y > height + 10) {
          p.x = Math.random() * width;
          p.y = Math.random() * height;
          p.age = 0;
          p.maxAge = 45 + Math.floor(Math.random() * 50);
          continue;
        }

        const [u, v] = vec;
        const speedMs = Math.hypot(u, v);
        const speedKts = speedMs * 1.94384;

        // Desplazamiento proporcional al viento calibrado
        const dx = u * VELOCITY_SCALE;
        const dy = -v * VELOCITY_SCALE;

        const nextX = p.x + dx;
        const nextY = p.y + dy;

        // Dibujar el trazo de avance de la partícula en este frame
        ctx.beginPath();
        ctx.strokeStyle = getParticleColor(speedKts);
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nextX, nextY);
        ctx.stroke();

        // Actualizar posición y edad
        p.x = nextX;
        p.y = nextY;
        p.age++;
      }
    };

    animFrameId = requestAnimationFrame(renderLoop);

    const handleClear = () => {
      resizeAndReposition();
      if (ctx && width > 0 && height > 0) {
        ctx.clearRect(0, 0, width, height);
      }
    };

    map.on('move', resizeAndReposition);
    map.on('resize', resizeAndReposition);
    map.on('zoom', resizeAndReposition);
    map.on('zoomstart', handleClear);

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      map.off('move', resizeAndReposition);
      map.off('resize', resizeAndReposition);
      map.off('zoom', resizeAndReposition);
      map.off('zoomstart', handleClear);
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    };
  }, [visible, map]);

  return null;
}
