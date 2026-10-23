/**
 * SIAE — Animación de oleaje continuo estilo Windy: guiones cortos que marchan en la
 * dirección de propagación del swell a 60 FPS ininterrumpidos.
 *
 * Utiliza el canal alfa del PNG de oleaje como máscara por píxel para respetar
 * la línea de costa real (sin pintar sobre tierra).
 */
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

const GRID_SPACING_PX = 32; // Separación de la retícula de guiones en pantalla
const CYCLE_PX = 24; // Recorrido de cada guion antes de reiniciar

/** Interpolador bilineal U/V sobre el JSON de /weather/waves-velocity. */
function buildInterpolator(velocityData) {
  if (!velocityData || !Array.isArray(velocityData) || velocityData.length < 2) return null;
  const header = velocityData[0]?.header;
  if (!header) return null;
  const { nx, ny, la1, lo1, dx, dy } = header;
  const u = velocityData[0].data;
  const v = velocityData[1].data;

  if (!u || !v) return null;

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
    const top_u = u[r0 * nx + c0] * (1 - fc) + u[r0 * nx + c1] * fc;
    const bot_u = u[r1 * nx + c0] * (1 - fc) + u[r1 * nx + c1] * fc;
    const top_v = v[r0 * nx + c0] * (1 - fc) + v[r0 * nx + c1] * fc;
    const bot_v = v[r1 * nx + c0] * (1 - fc) + v[r1 * nx + c1] * fc;
    return [top_u * (1 - fr) + bot_u * fr, top_v * (1 - fr) + bot_v * fr];
  };
}

/** Muestreador del canal alfa del PNG de oleaje (máscara de costa). */
function buildMaskSampler(img, bounds) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    if (!canvas.width || !canvas.height) return () => 255;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
      if (x < 0 || x >= w || y < 0 || y >= h) return 0;
      return data[(y * w + x) * 4 + 3];
    };
  } catch (err) {
    console.warn('Fallback al dibujar mascara de oleaje:', err);
    return () => 255;
  }
}

/** Pseudo-aleatorio determinista por punto de retícula. */
function seed(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export default function WaveDashLayer({ velocityData, maskUrl, bounds, visible }) {
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
    img.crossOrigin = 'anonymous';
    const onLoaded = () => {
      if (!cancelled) {
        stateRef.current.maskAlpha = buildMaskSampler(img, bounds);
      }
    };
    img.onload = onLoaded;
    img.onerror = () => {
      if (!cancelled) stateRef.current.maskAlpha = () => 255;
    };
    img.src = maskUrl;
    if (img.complete && (img.naturalWidth > 0 || img.width > 0)) {
      onLoaded();
    }
    return () => {
      cancelled = true;
    };
  }, [maskUrl, bounds]);

  useEffect(() => {
    if (!visible) return;

    let wavePane = map.getPane('wavePane');
    if (!wavePane) {
      wavePane = map.createPane('wavePane');
      wavePane.style.zIndex = '450';
      wavePane.style.pointerEvents = 'none';
    }

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    wavePane.appendChild(canvas);

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

    const renderLoop = () => {
      animFrameId = requestAnimationFrame(renderLoop);

      if (!ctx || width <= 0 || height <= 0) return;

      ctx.clearRect(0, 0, width, height);

      const { interpolate, maskAlpha } = stateRef.current;
      if (interpolate) {
        const checkMask = maskAlpha || (() => 255);
        const t = performance.now() / 1000;

        ctx.lineCap = 'round';
        ctx.strokeStyle = '#ffffff';

        for (let x = 0; x < width + GRID_SPACING_PX; x += GRID_SPACING_PX) {
          for (let y = 0; y < height + GRID_SPACING_PX; y += GRID_SPACING_PX) {
            const latlng = map.containerPointToLatLng([x, y]);
            const vec = interpolate(latlng.lat, latlng.lng);
            if (!vec) continue;
            const [u, v] = vec;
            const mag = Math.hypot(u, v);
            if (mag < 0.05) continue;
            if (checkMask(latlng.lat, latlng.lng) === 0) continue;

            const dirX = u / mag;
            const dirY = -v / mag;

            const speed = 4 + mag * 4;
            const phase = ((t * speed + seed(x, y) * CYCLE_PX * 4) % CYCLE_PX) - CYCLE_PX / 2;
            const cx = x + dirX * phase;
            const cy = y + dirY * phase;

            const fade = 1 - Math.abs(phase) / (CYCLE_PX / 2);
            const len = 5 + mag * 2.2;

            ctx.globalAlpha = 0.2 + 0.7 * fade;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(cx - (dirX * len) / 2, cy - (dirY * len) / 2);
            ctx.lineTo(cx + (dirX * len) / 2, cy + (dirY * len) / 2);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }
    };

    animFrameId = requestAnimationFrame(renderLoop);

    const handleClearAndResize = () => {
      resizeAndReposition();
      if (ctx && width > 0 && height > 0) {
        ctx.clearRect(0, 0, width, height);
      }
    };

    map.on('move', resizeAndReposition);
    map.on('resize', handleClearAndResize);
    map.on('zoom', resizeAndReposition);
    map.on('zoomstart', handleClearAndResize);

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      map.off('move', resizeAndReposition);
      map.off('resize', handleClearAndResize);
      map.off('zoom', resizeAndReposition);
      map.off('zoomstart', handleClearAndResize);
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    };
  }, [visible, map]);

  return null;
}
