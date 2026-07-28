/**
 * SIAE — Expone Leaflet como global `window.L`.
 *
 * `leaflet-velocity` (dist/leaflet-velocity.js) no es un módulo ES/UMD: asume
 * que `L` ya existe como variable global del navegador (patrón clásico de
 * plugins de Leaflet pre-ES-modules). Este archivo debe importarse (y por lo
 * tanto evaluarse) ANTES de `import 'leaflet-velocity'` en cualquier archivo
 * que lo use, para que `window.L` esté disponible cuando ese script corra.
 */
import L from 'leaflet';

if (typeof window !== 'undefined' && !window.L) {
  window.L = L;
}

export default L;
