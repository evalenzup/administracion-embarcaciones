import React from 'react';
import { Dropdown, Button, Space } from 'antd';
import { EnvironmentOutlined, DownOutlined } from '@ant-design/icons';

const REGIONS = [
  { key: 'ensenada', label: '📍 Bahía de Ensenada (Base CICESE)', center: [31.85, -116.63, 10.5] },
  { key: 'guadalupe', label: '📍 Isla Guadalupe (Pacífico Oceánico)', center: [29.05, -118.28, 8.5] },
  { key: 'lapaz', label: '📍 Golfo de California / La Paz', center: [24.15, -110.32, 7.5] },
  { key: 'mazatlan', label: '📍 Mazatlán / Puerto Vallarta', center: [22.5, -106.2, 7.0] },
  { key: 'tehuantepec', label: '📍 Golfo de Tehuantepec (Pacífico Sur)', center: [15.5, -95.5, 7.0] },
  { key: 'general', label: '🇲🇽 Vista General Mares Mexicanos', center: [21.0, -105.0, 5.2] },
];

export default function QuickRegionSelector({ onSelectRegion }) {
  const items = REGIONS.map((r) => ({
    key: r.key,
    label: <span style={{ fontSize: 12, fontWeight: 500 }}>{r.label}</span>,
    onClick: () => onSelectRegion(r.center),
  }));

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 56,
        zIndex: 1000,
        pointerEvents: 'auto',
      }}
    >
      <Dropdown menu={{ items }} trigger={['click']} placement="bottomLeft">
        <Button
          size="small"
          style={{
            borderRadius: 20,
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #cbd5e1',
            boxShadow: '0 4px 12px rgba(10, 38, 71, 0.12)',
            fontSize: 12,
            fontWeight: 600,
            color: '#0A2647',
            height: 32,
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <EnvironmentOutlined style={{ color: '#0284c7', fontSize: 13 }} />
          <span>Enfocar Región</span>
          <DownOutlined style={{ fontSize: 9, color: '#64748b' }} />
        </Button>
      </Dropdown>
    </div>
  );
}
