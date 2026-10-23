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
  modelBadge: 'NOAA WaveWatch III (WW3)',
  stops: [
    [0.0, 'rgb(33,102,172)'],
    [0.25, 'rgb(103,169,207)'],
    [0.5, 'rgb(255,237,160)'],
    [0.75, 'rgb(253,141,60)'],
    [1.0, 'rgb(178,24,43)'],
  ],
  ticks: [0, 1, 2, 3, 4].map((m) => ({ label: `${m}`, pos: m / 4 })),
};

// Paleta de temperatura marina / TSM (backend: 10-34 °C)
export const TEMP_LEGEND = {
  title: 'Temp. del Mar - TSM (°C)',
  stops: [
    [0.00, 'rgb(10,25,47)'],
    [0.15, 'rgb(30,64,175)'],
    [0.35, 'rgb(6,182,212)'],
    [0.55, 'rgb(16,185,129)'],
    [0.70, 'rgb(234,179,8)'],
    [0.82, 'rgb(249,115,22)'],
    [0.92, 'rgb(239,68,68)'],
    [1.00, 'rgb(190,24,93)'],
  ],
  ticks: [10, 14, 18, 22, 26, 30, 34].map((c) => ({ label: `${c}°`, pos: (c - 10) / (34 - 10) })),
};

// Paleta de temperatura del aire a 2m (backend: 10-34 °C)
export const AIR_TEMP_LEGEND = {
  title: 'Temp. del Aire a 2m (°C)',
  stops: [
    [0.00, 'rgb(10,25,47)'],
    [0.15, 'rgb(30,64,175)'],
    [0.35, 'rgb(6,182,212)'],
    [0.55, 'rgb(16,185,129)'],
    [0.70, 'rgb(234,179,8)'],
    [0.82, 'rgb(249,115,22)'],
    [0.92, 'rgb(239,68,68)'],
    [1.00, 'rgb(190,24,93)'],
  ],
  ticks: [10, 14, 18, 22, 26, 30, 34].map((c) => ({ label: `${c}°`, pos: (c - 10) / (34 - 10) })),
};

// Paleta de precipitación / radar de lluvia (backend: 0-50 mm/h)
export const PRECIP_LEGEND = {
  title: 'Precipitación / Lluvia (mm/h)',
  stops: [
    [0.00, 'rgb(96,165,250)'],   // 0.1 mm/h
    [0.02, 'rgb(59,130,246)'],   // 1.0 mm/h
    [0.05, 'rgb(34,197,94)'],    // 2.5 mm/h
    [0.10, 'rgb(234,179,8)'],    // 5.0 mm/h
    [0.20, 'rgb(249,115,22)'],   // 10.0 mm/h
    [0.50, 'rgb(239,68,68)'],    // 25.0 mm/h
    [0.80, 'rgb(168,85,247)'],   // 40.0 mm/h
    [1.00, 'rgb(236,72,153)'],   // 50.0+ mm/h
  ],
  ticks: [
    { label: '0.1', pos: 0.00 },
    { label: '2.5', pos: 0.05 },
    { label: '10', pos: 0.20 },
    { label: '25', pos: 0.50 },
    { label: '50+', pos: 1.00 },
  ],
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
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderRadius: 8,
        padding: '6px 10px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        border: '1px solid #cbd5e1',
        width: 250,
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#0A2647' }}>
          {legend.title}
        </span>
        {legend.modelBadge && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              background: '#e0f2fe',
              color: '#0369a1',
              padding: '1px 5px',
              borderRadius: 4,
              border: '1px solid #bae6fd',
            }}
          >
            {legend.modelBadge}
          </span>
        )}
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
