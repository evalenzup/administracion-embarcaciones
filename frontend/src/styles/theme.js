/**
 * SIAE — Tema personalizado para Ant Design 5.
 * Define la paleta de colores, tipografía y tokens del diseño.
 */

const theme = {
  token: {
    // ── Colores primarios (azul marino/náutico) ──
    colorPrimary: '#1B4F72',
    colorPrimaryHover: '#2471A3',
    colorPrimaryActive: '#154360',

    // ── Colores de info/success/warning/error ──
    colorSuccess: '#27AE60',
    colorWarning: '#F39C12',
    colorError: '#E74C3C',
    colorInfo: '#2980B9',

    // ── Tipografía ──
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,

    // ── Bordes ──
    borderRadius: 8,
    borderRadiusLG: 12,

    // ── Layout ──
    colorBgContainer: '#ffffff',
    colorBgLayout: '#F0F4F8',
    colorBgElevated: '#ffffff',

    // ── Sombras ──
    boxShadow: '0 2px 8px rgba(27, 79, 114, 0.08)',
    boxShadowSecondary: '0 4px 16px rgba(27, 79, 114, 0.12)',
  },
  components: {
    Layout: {
      siderBg: '#0A2647',
      headerBg: '#ffffff',
      bodyBg: '#F0F4F8',
    },
    Menu: {
      darkItemBg: '#0A2647',
      darkItemSelectedBg: '#1B4F72',
      darkItemHoverBg: '#144272',
      darkSubMenuItemBg: '#071E3D',
      itemHeight: 44,
      iconSize: 18,
    },
    Button: {
      primaryShadow: '0 2px 4px rgba(27, 79, 114, 0.3)',
    },
    Card: {
      borderRadiusLG: 12,
    },
    Table: {
      headerBg: '#F0F4F8',
      borderRadius: 8,
    },
  },
};

export default theme;
