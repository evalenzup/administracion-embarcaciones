import React from 'react';
import { Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

/**
 * EnsoInfoWidget - Widget informativo y discreto del fenómeno El Niño / Oscilación del Sur (ENSO).
 * Se ubica en la esquina superior izquierda del mapa, justo debajo de 'Enfocar Región'.
 */
export default function EnsoInfoWidget({ ensoSummary, onOpenEnsoModal, style }) {
  const anom = ensoSummary?.latest?.nino34_anomaly;
  const status = ensoSummary?.status;

  const categoryLabel = ensoSummary?.category || (status === 'neutral' ? 'Fase Neutral' : 'Monitoreo ENSO');
  const anomString = anom != null 
    ? (anom > 0 ? `+${anom.toFixed(1)}°C` : `${anom.toFixed(1)}°C`)
    : '';

  let badgeBg = '#f1f5f9';
  let badgeColor = '#475569';
  let badgeBorder = '#cbd5e1';
  let indicatorIcon = '🌋';

  if (status === 'el_nino') {
    badgeBg = '#fff7ed';
    badgeColor = '#c2410c';
    badgeBorder = '#fed7aa';
    indicatorIcon = '🔥';
  } else if (status === 'la_nina') {
    badgeBg = '#eff6ff';
    badgeColor = '#1d4ed8';
    badgeBorder = '#bfdbfe';
    indicatorIcon = '❄️';
  } else if (status === 'neutral') {
    badgeBg = '#f0fdf4';
    badgeColor = '#15803d';
    badgeBorder = '#bbf7d0';
    indicatorIcon = '🌱';
  }

  return (
    <Tooltip
      title={
        <div style={{ fontSize: 11, lineHeight: 1.4 }}>
          <strong>Monitoreo Oficial NOAA CPC (Índice Niño 3.4)</strong>
          <div>{ensoSummary?.description || 'Haz clic para consultar el boletín diagnóstico completo, anomalías de TSM y gráficos históricos.'}</div>
          <div style={{ marginTop: 4, color: '#38bdf8' }}>Haz clic para ver boletín completo →</div>
        </div>
      }
      placement="bottomLeft"
    >
      <div
        onClick={onOpenEnsoModal}
        style={{
          position: 'absolute',
          top: 48,
          left: 56,
          zIndex: 1000,
          pointerEvents: 'auto',
          cursor: 'pointer',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid #cbd5e1',
          borderRadius: 18,
          padding: '4px 10px',
          boxShadow: '0 4px 12px rgba(10, 38, 71, 0.10)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          fontWeight: 600,
          color: '#0A2647',
          transition: 'all 0.15s ease',
          ...style,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(10, 38, 71, 0.16)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(10, 38, 71, 0.10)';
        }}
      >
        <span style={{ fontSize: 12 }}>{indicatorIcon}</span>
        <span style={{ color: '#334155', fontWeight: 600 }}>Seguimiento El Niño:</span>
        <span
          style={{
            background: badgeBg,
            color: badgeColor,
            border: `1px solid ${badgeBorder}`,
            padding: '1px 6px',
            borderRadius: 10,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {categoryLabel} {anomString ? `(${anomString})` : ''}
        </span>
        <InfoCircleOutlined style={{ fontSize: 11, color: '#0284c7', marginLeft: 2 }} />
      </div>
    </Tooltip>
  );
}
