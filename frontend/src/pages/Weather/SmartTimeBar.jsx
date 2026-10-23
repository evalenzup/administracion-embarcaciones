import React from 'react';
import { Slider, Button, Space, Typography, Tag, Tooltip } from 'antd';
import { 
  PlayCircleFilled, 
  PauseCircleFilled, 
  FastForwardOutlined,
  ClockCircleOutlined,
  CalendarOutlined 
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

/**
 * Convierte corrida + hora de pronóstico a hora local de Tijuana
 */
function getTijuanaDateTime(runDate, runHour, forecastHour) {
  if (!runDate || !runHour) {
    return {
      formatted: `+${forecastHour}h Pronóstico`,
      isNow: forecastHour === 0,
    };
  }

  try {
    const year = parseInt(runDate.slice(0, 4), 10);
    const month = parseInt(runDate.slice(4, 6), 10) - 1;
    const day = parseInt(runDate.slice(6, 8), 10);
    const hour = parseInt(runHour, 10);

    const utcDate = new Date(Date.UTC(year, month, day, hour + forecastHour, 0, 0));
    
    const options = {
      timeZone: 'America/Tijuana',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };
    const formatted = new Intl.DateTimeFormat('es-MX', options).format(utcDate);
    const clean = formatted.replace(/\./g, '');
    const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);

    return {
      formatted: `${capitalized} hrs`,
      isNow: forecastHour === 0,
    };
  } catch {
    return {
      formatted: `+${forecastHour}h Pronóstico`,
      isNow: forecastHour === 0,
    };
  }
}

export default function SmartTimeBar({
  hour = 0,
  availableHours = [],
  onHourChange,
  playing = false,
  onTogglePlay,
  runDate = null,
  runHour = null,
}) {
  const minHour = availableHours.length > 0 ? availableHours[0] : 0;
  const maxHour = availableHours.length > 0 ? availableHours[availableHours.length - 1] : 120;
  const timeInfo = getTijuanaDateTime(runDate, runHour, hour);

  const marks = {
    [minHour]: {
      style: { fontSize: 10, color: '#64748b' },
      label: 'Ahora (0h)',
    },
    24: {
      style: { fontSize: 10, color: '#64748b' },
      label: '+24h',
    },
    48: {
      style: { fontSize: 10, color: '#64748b' },
      label: '+48h',
    },
    72: {
      style: { fontSize: 10, color: '#64748b' },
      label: '+72h',
    },
    [maxHour]: {
      style: { fontSize: 10, color: '#64748b' },
      label: `+${maxHour}h`,
    },
  };

  const handleSliderChange = (val) => {
    if (!availableHours || availableHours.length === 0) {
      onHourChange(val);
      return;
    }
    const closest = availableHours.reduce((prev, curr) => 
      Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev
    , availableHours[0]);
    onHourChange(closest);
  };

  const handleQuickJump = (target) => {
    handleSliderChange(target);
  };

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid #cbd5e1',
        borderRadius: 12,
        padding: '8px 14px',
        boxShadow: '0 4px 12px rgba(10, 38, 71, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {/* Cabecera del Control Temporal */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button
            type="primary"
            shape="circle"
            size="middle"
            icon={playing ? <PauseCircleFilled style={{ fontSize: 18 }} /> : <PlayCircleFilled style={{ fontSize: 18 }} />}
            onClick={onTogglePlay}
            style={{
              background: playing ? '#f59e0b' : '#0A2647',
              borderColor: playing ? '#f59e0b' : '#0A2647',
              boxShadow: playing ? '0 0 10px rgba(245, 158, 11, 0.5)' : 'none',
            }}
          />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ClockCircleOutlined style={{ color: '#0284c7', fontSize: 13 }} />
              <Text style={{ color: '#0A2647', fontWeight: 800, fontSize: 14 }}>
                {timeInfo.formatted}
              </Text>
              {timeInfo.isNow && (
                <Tag color="#16a34a" style={{ fontSize: 10, fontWeight: 700, margin: 0, padding: '0 5px' }}>
                  EN VIVO
                </Tag>
              )}
            </div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Hora local Tijuana (Paso +{hour}h de pronóstico numérico)
            </Text>
          </div>
        </div>

        {/* Botones de Salto Rápido */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Button
            size="small"
            type={hour === 0 ? 'primary' : 'default'}
            onClick={() => handleQuickJump(0)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 14,
              background: hour === 0 ? '#0A2647' : '#f8fafc',
              borderColor: hour === 0 ? '#0A2647' : '#e2e8f0',
            }}
          >
            Ahora
          </Button>
          <Button
            size="small"
            type={hour === 24 ? 'primary' : 'default'}
            onClick={() => handleQuickJump(24)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 14,
              background: hour === 24 ? '#0A2647' : '#f8fafc',
              borderColor: hour === 24 ? '#0A2647' : '#e2e8f0',
            }}
          >
            +24h (Mañana)
          </Button>
          <Button
            size="small"
            type={hour === 48 ? 'primary' : 'default'}
            onClick={() => handleQuickJump(48)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 14,
              background: hour === 48 ? '#0A2647' : '#f8fafc',
              borderColor: hour === 48 ? '#0A2647' : '#e2e8f0',
            }}
          >
            +48h
          </Button>
          <Button
            size="small"
            type={hour === 72 ? 'primary' : 'default'}
            onClick={() => handleQuickJump(72)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 14,
              background: hour === 72 ? '#0A2647' : '#f8fafc',
              borderColor: hour === 72 ? '#0A2647' : '#e2e8f0',
            }}
          >
            +72h (Fin de Sem)
          </Button>
        </div>
      </div>

      {/* Slider con marcas */}
      <div style={{ padding: '0 8px 4px 8px' }}>
        <Slider
          min={minHour}
          max={maxHour}
          step={1}
          value={hour}
          onChange={handleSliderChange}
          marks={marks}
          tooltip={{
            formatter: (val) => {
              const info = getTijuanaDateTime(runDate, runHour, val);
              return `${info.formatted} (+${val}h)`;
            },
          }}
        />
      </div>
    </div>
  );
}
