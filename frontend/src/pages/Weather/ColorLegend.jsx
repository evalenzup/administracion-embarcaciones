/**
 * SIAE — Barra de leyenda de colores para las capas del mapa meteorológico.
 *
 * Los stops deben coincidir con las paletas del backend
 * (WIND_COLOR_STOPS / WAVE_COLOR_STOPS en weather_processor.py) — si se
 * cambia la paleta allá, actualizar aquí también.
 */

// Paleta de viento (backend: 0-30 m/s). Se muestra en nudos (0-58 kt).
export const WIND_LEGEND = {
  title: 'Viento (nudos)',
  stops: [
    [0.0, 'rgb(98,113,183)'],
    [0.1, 'rgb(61,110,163)'],
    [0.2, 'rgb(74,148,169)'],
    [0.3, 'rgb(74,146,148)'],
    [0.4, 'rgb(77,142,124)'],
    [0.5, 'rgb(76,164,76)'],
    [0.6, 'rgb(103,164,54)'],
    [0.7, 'rgb(162,135,64)'],
    [0.8, 'rgb(199,62,29)'],
    [0.9, 'rgb(183,7,133)'],
    [1.0, 'rgb(241,1,255)'],
  ],
  // 30 m/s = 58.3 kt
  ticks: [0, 10, 20, 30, 40, 50].map((kt) => ({ label: `${kt}`, pos: kt / 58.3 })),
};

// Paleta de oleaje (backend: 0-4 m).
export const WAVE_LEGEND = {
  title: 'Oleaje (m)',
  stops: [
    [0.0, 'rgb(33,102,172)'],
    [0.25, 'rgb(103,169,207)'],
    [0.5, 'rgb(255,237,160)'],
    [0.75, 'rgb(253,141,60)'],
    [1.0, 'rgb(178,24,43)'],
  ],
  ticks: [0, 1, 2, 3, 4].map((m) => ({ label: `${m}`, pos: m / 4 })),
};

function ColorLegend({ legend }) {
  const gradient = `linear-gradient(to right, ${legend.stops
    .map(([pos, color]) => `${color} ${pos * 100}%`)
    .join(', ')})`;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        right: 10,
        zIndex: 1000,
        background: 'rgba(255,255,255,0.88)',
        borderRadius: 6,
        padding: '6px 10px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        width: 230,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 600, color: '#333', marginBottom: 3 }}>
        {legend.title}
      </div>
      <div style={{ height: 8, borderRadius: 4, background: gradient }} />
      <div style={{ position: 'relative', height: 12, marginTop: 1 }}>
        {legend.ticks.map((t) => (
          <span
            key={t.label}
            style={{
              position: 'absolute',
              left: `${t.pos * 100}%`,
              transform: 'translateX(-50%)',
              fontSize: 9,
              color: '#555',
            }}
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default ColorLegend;
