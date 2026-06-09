/**
 * SIAE — Página de Ayuda y Manuales de Usuario.
 * Contiene guías interactivas de todos los módulos del sistema.
 */
import { useState } from 'react';
import { Card, Typography, Tabs, Collapse, Space, Row, Col, Input, List, Timeline, Button, Badge, Divider, Alert, Avatar } from 'antd';
import {
  QuestionCircleOutlined, BookOutlined, CompassOutlined, ToolOutlined,
  FileTextOutlined, TeamOutlined, UserOutlined, SettingOutlined,
  InboxOutlined, InfoCircleOutlined, SendOutlined, SearchOutlined,
  IdcardOutlined, CalendarOutlined, ArrowRightOutlined, CheckCircleOutlined,
  FileDoneOutlined
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';

const { Title, Text, Paragraph } = Typography;
const { Search } = Input;
const { Panel } = Collapse;

const ACTION_COLORS = {
  create: 'success',
  update: 'processing',
  delete: 'error',
  login: 'default',
};

// ── MANUAL ESPECIAL PARA INVESTIGADORES/SOLICITANTES ───────────
function ResearcherHelp() {
  const [activeTab, setActiveTab] = useState('requests');

  const requestSteps = [
    {
      step: '1',
      title: 'Verificar disponibilidad en la agenda',
      desc: 'Antes de realizar tu solicitud, ve a la "Agenda de las Embarcaciones" (disponible en el menú o en la pantalla de inicio) para asegurarte de que la embarcación esté libre en las fechas tentativas en las que deseas viajar.',
      tip: 'Verificar la disponibilidad evita empalmar cruceros o que tu solicitud sea rechazada de inmediato por conflictos de fechas.'
    },
    {
      step: '2',
      title: 'Ir al módulo de "Solicitudes"',
      desc: 'En el menú lateral de color azul en la parte izquierda de tu pantalla, haz clic en la opción que dice "Solicitudes". Aquí verás la lista de tus solicitudes anteriores si has hecho alguna.',
      tip: 'Si usas una tableta o celular y no ves el menú izquierdo, presiona el botón de tres líneas en la esquina superior para abrirlo.'
    },
    {
      step: '3',
      title: 'Presionar el botón "Nueva Solicitud"',
      desc: 'Haz clic en el botón azul grande que dice "+ Nueva Solicitud", ubicado en la esquina superior derecha de la pantalla. Se abrirá una ventana flotante con el formulario.',
      tip: 'Este botón tiene el icono de un signo de más para identificarlo de forma rápida.'
    },
    {
      step: '4',
      title: 'Completar los datos del formulario con cuidado',
      desc: 'Llena la información requerida: selecciona la Embarcación, elige las fechas de salida y regreso en el calendario, escribe el Nombre del Proyecto científico y detalla los objetivos de la campaña.',
      tip: 'Es importante ingresar información clara y concisa para que los coordinadores de embarcaciones entiendan rápidamente el propósito del viaje.'
    },
    {
      step: '5',
      title: 'Enviar la solicitud y esperar la aprobación',
      desc: 'Revisa que todos tus datos estén correctos y haz clic en "Enviar". Tu solicitud quedará en estado "Pendiente". El personal del DEO la revisará y, cuando sea aprobada, recibirás una notificación y el sistema creará tu plan de crucero en borrador de manera automática.',
      tip: 'Puedes ver el estado de tu solicitud directamente en esta pantalla (en color amarillo "Pendiente", verde "Aprobada", o rojo "Rechazada").'
    }
  ];

  const cruiseSteps = [
    {
      step: '1',
      title: 'Acceder a tus Cruceros en borrador',
      desc: 'Una vez aprobada tu solicitud de embarcación, el sistema crea en automático un plan de crucero en estado "Borrador". Ve al menú izquierdo y selecciona la opción "Cruceros".',
      tip: 'Los cruceros en Borrador solo son visibles para ti y los administradores.'
    },
    {
      step: '2',
      title: 'Hacer clic en "Editar"',
      desc: 'Busca tu crucero en la lista y presiona el botón de Editar (el icono de lápiz a la derecha del registro). Esto abrirá el editor interactivo de tu plan de crucero.',
      tip: 'Asegúrate de que es el crucero correcto revisando el código y las fechas.'
    },
    {
      step: '3',
      title: 'Seleccionar Puertos y dibujar la ruta',
      desc: 'El sistema conectará de forma automática tu trayecto desde el Puerto de Salida hasta el Puerto de Regreso (seleccionados en Datos Generales). Haz clic en la pestaña "Ruta (Waypoints)" para trazar tus waypoints intermedios en el mapa interactivo.',
      tip: 'La derrota del crucero unirá automáticamente [Puerto Salida] ➔ [Waypoints] ➔ [Puerto Regreso], calculando con precisión la distancia de viaje.'
    },
    {
      step: '4',
      title: 'Ingresar velocidad y tiempos de actividad',
      desc: 'En la barra lateral derecha del mapa, indica la velocidad promedio a la que viajará la embarcación (en nudos) y cuántas horas de trabajo científico se realizarán en cada punto. El sistema calculará el itinerario completo y la fecha de regreso de forma automática.',
      tip: 'El cálculo automático de fechas te ayuda a prever el regreso sin necesidad de hacer cuentas complejas.'
    },
    {
      step: '5',
      title: 'Asignar participantes y Jefe de Crucero',
      desc: 'Ve a la pestaña "Participantes" para agregar a la tripulación científica. Puedes buscarlos en el catálogo del sistema. Activa el interruptor "¿Es Jefe de Crucero?" en el investigador correspondiente para designarlo como el líder oficial del crucero.',
      tip: 'El Jefe de Crucero se destacará visualmente con una corona dorada (👑) y un marco especial en su tarjeta, y se sincronizará automáticamente en las exportaciones.'
    },
    {
      step: '6',
      title: 'Cambiar el estado a "Pendiente" y guardar',
      desc: 'Cuando hayas completado los waypoints, la logística y los participantes, cambia el estado del crucero a "Pendiente" en la parte superior y presiona el botón "Guardar". Tu plan pasará a revisión del DEO para su aprobación final.',
      tip: 'Una vez aprobado por el DEO, el plan se marcará como "Planificado" y quedará listo para exportar en Word o PDF.'
    }
  ];

  const participantSteps = [
    {
      step: '1',
      title: 'Ir al módulo de "Participantes"',
      desc: 'En el menú lateral de color azul en la parte izquierda, haz clic en la opción "Participantes". Aquí verás el catálogo de personas que han viajado en las embarcaciones.',
      tip: 'Cualquier solicitante puede buscar personas en el catálogo general para agregarlas a sus cruceros.'
    },
    {
      step: '2',
      title: 'Buscar a la persona en el catálogo',
      desc: 'Escribe el nombre de la persona en el buscador superior derecho para filtrarla. Si no está en el catálogo, puedes hacer clic en "Nuevo participante" para registrarla.',
      tip: 'Si es personal activo del CICESE, puedes seleccionarlo del listado de Personal interno para autocompletar su información.'
    },
    {
      step: '3',
      title: 'Abrir los detalles del participante',
      desc: 'Haz clic sobre el nombre azul (enlace) del participante en la tabla. Se abrirá una ventana flotante con toda su información general y de identidad.',
      tip: 'Aquí se muestra si cuenta con identificación y cuándo expira.'
    },
    {
      step: '4',
      title: 'Cargar o renovar el documento (INE / Pasaporte)',
      desc: 'Si la persona no cuenta con identificación oficial cargada o si ya está vencida, haz clic en el botón "Subir ID" (con icono de credencial) y selecciona el archivo de tu computadora (PDF o imagen JPG/PNG de máximo 5MB).',
      tip: 'El botón cambiará a "Reemplazar ID" si el documento ya estaba vencido.'
    },
    {
      step: '5',
      title: 'Protección de datos activa',
      desc: 'Una vez subido el documento, el sistema lo encriptará. Como solicitante, ya no podrás descargar ni ver el archivo de otros participantes por temas de privacidad, pero quedará almacenado de forma segura para que las autoridades de la terminal marítima puedan autorizar su embarque.',
      tip: 'El número de identificación se mostrará como "PROTEGIDO" en la pantalla para garantizar la privacidad.'
    }
  ];

  const renderStepsList = (stepsList) => (
    <Row gutter={[16, 16]}>
      {stepsList.map((s) => (
        <Col span={24} key={s.step}>
          <Card
            style={{
              borderRadius: 12,
              borderLeft: '5px solid #0A2647',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            }}
            styles={{ body: { padding: '16px 20px' } }}
          >
            <Row gutter={16} align="middle">
              <Col xs={24} sm={3} md={2} style={{ textAlign: 'center' }}>
                <Avatar
                  size={46}
                  style={{
                    backgroundColor: '#0A2647',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 20,
                  }}
                >
                  {s.step}
                </Avatar>
              </Col>
              <Col xs={24} sm={21} md={22}>
                <Title level={4} style={{ margin: '0 0 4px 0', color: '#0A2647', fontSize: 16 }}>
                  {s.title}
                </Title>
                <Paragraph style={{ margin: '0 0 8px 0', fontSize: 13, color: '#333', lineHeight: '1.5' }}>
                  {s.desc}
                </Paragraph>
                <Alert
                  message={<span style={{ fontSize: 12, fontWeight: 500 }}>💡 Consejo útil:</span>}
                  description={<span style={{ fontSize: 12, color: '#555' }}>{s.tip}</span>}
                  type="info"
                  showIcon
                  style={{ borderRadius: 6, padding: '6px 12px' }}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      ))}
    </Row>
  );

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1000, margin: '0 auto', padding: '10px 20px' }}>
      <Card
        style={{
          borderRadius: 16,
          background: 'linear-gradient(135deg, #0A2647 0%, #1b4f72 100%)',
          color: '#fff',
          marginBottom: 24,
          boxShadow: '0 4px 20px rgba(10, 38, 71, 0.15)',
          border: 'none',
        }}
        styles={{ body: { padding: '24px 32px' } }}
      >
        <Row align="middle" gutter={24}>
          <Col xs={24} md={18}>
            <Title level={2} style={{ color: '#fff', margin: 0 }}>
              📖 Guía y Manual para Solicitantes
            </Title>
            <Paragraph style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: 14, marginTop: 8, marginBottom: 0 }}>
              Manual paso a paso diseñado de forma sencilla y explicativa para investigadores, técnicos y personal científico. Sigue los pasos numerados para realizar solicitudes de embarcación y configurar planes de crucero.
            </Paragraph>
          </Col>
          <Col xs={24} md={6} style={{ textAlign: 'right' }}>
            <Badge status="processing" text={<span style={{ color: '#fff', fontWeight: 600 }}>Modo Investigador</span>} />
          </Col>
        </Row>
      </Card>

      <Row gutter={[24, 24]}>
        <Col xs={24} md={8}>
          <Card
            title={<Text strong style={{ color: '#0A2647' }}>Secciones del Manual</Text>}
            style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
            styles={{ body: { padding: '8px 0' } }}
          >
            <MenuSelection active={activeTab} onChange={setActiveTab} />
          </Card>

          <Card
            style={{
              borderRadius: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
              background: '#e6f7ff',
              border: '1px solid #91d5ff',
              marginTop: 20
            }}
            styles={{ body: { padding: '16px' } }}
          >
            <Space direction="vertical" size={8}>
              <Text strong style={{ color: '#0050b3' }}>⚓ ¿Necesitas ayuda extra?</Text>
              <Paragraph style={{ fontSize: 12, color: '#555', margin: 0 }}>
                Si tienes dudas sobre el itinerario, las fechas autorizadas o necesitas asistencia especial con el mapa, comunícate con el Departamento de Embarcaciones Oceanográficas (DEO).
              </Paragraph>
              <div style={{ marginTop: 8, fontSize: 12, lineHeight: '1.6' }}>
                📧 <a href="mailto:evalenzu@cicese.mx" style={{ color: '#0050b3', fontWeight: 600 }}>evalenzu@cicese.mx</a>
                <br />
                📧 <a href="mailto:lenero@cicese.mx" style={{ color: '#0050b3', fontWeight: 600 }}>lenero@cicese.mx</a>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={16}>
          {activeTab === 'requests' && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div style={{ marginBottom: 8 }}>
                <Title level={3} style={{ color: '#0A2647', margin: 0 }}>
                  📋 Cómo solicitar una embarcación
                </Title>
                <Text type="secondary">Sigue esta guía paso a paso para enviar tu solicitud de reserva de la embarcación.</Text>
              </div>
              {renderStepsList(requestSteps)}
            </Space>
          )}

          {activeTab === 'cruises' && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div style={{ marginBottom: 8 }}>
                <Title level={3} style={{ color: '#0A2647', margin: 0 }}>
                  🧭 Cómo configurar el Plan de Crucero
                </Title>
                <Text type="secondary">Aprende a trazar waypoints en el mapa, agregar logística y participantes.</Text>
              </div>
              {renderStepsList(cruiseSteps)}
            </Space>
          )}

          {activeTab === 'participants' && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div style={{ marginBottom: 8 }}>
                <Title level={3} style={{ color: '#0A2647', margin: 0 }}>
                  👥 Cómo cargar identificaciones (INE/Pasaporte)
                </Title>
                <Text type="secondary">Procedimiento para renovar o registrar identificaciones vigentes de tu tripulación.</Text>
              </div>
              {renderStepsList(participantSteps)}
            </Space>
          )}

          {activeTab === 'faq' && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div style={{ marginBottom: 8 }}>
                <Title level={3} style={{ color: '#0A2647', margin: 0 }}>
                  ❓ Preguntas Frecuentes
                </Title>
                <Text type="secondary">Respuestas rápidas a las dudas comunes de los solicitantes.</Text>
              </div>
              <Collapse defaultActiveKey={['faq1']} expandIconPosition="end">
                <Panel header={<Text strong style={{ fontSize: 13, color: '#0A2647' }}>¿Quién puede ver los documentos de identidad que subo?</Text>} key="faq1">
                  <Paragraph style={{ fontSize: 13, color: '#555', margin: 0 }}>
                    Por motivos de seguridad y de acuerdo a las leyes de protección de datos, únicamente tú (el usuario que dio de alta al participante) y los administradores autorizados del DEO pueden descargar o visualizar los archivos de identificación. Para todos los demás investigadores del sistema, los datos sensibles se mostrarán bloqueados y enmascarados como <strong>"PROTEGIDO"</strong>.
                  </Paragraph>
                </Panel>
                <Panel header={<Text strong style={{ fontSize: 13, color: '#0A2647' }}>¿Qué formatos y pesos se permiten al subir archivos?</Text>} key="faq2">
                  <Paragraph style={{ fontSize: 13, color: '#555', margin: 0 }}>
                    Las identificaciones oficiales (INE / Pasaporte) se permiten en formatos <strong>PDF, JPG, JPEG o PNG</strong> con un tamaño máximo de <strong>5 MB</strong>. La fotografía de rostro debe ser en formatos <strong>JPG, JPEG, PNG o WEBP</strong> con un tamaño máximo de <strong>2 MB</strong>.
                  </Paragraph>
                </Panel>
                <Panel header={<Text strong style={{ fontSize: 13, color: '#0A2647' }}>¿Cómo sé si mi solicitud de embarcación fue aprobada?</Text>} key="faq3">
                  <Paragraph style={{ fontSize: 13, color: '#555', margin: 0 }}>
                    Puedes consultarlo ingresando a la sección "Solicitudes" en el menú. La tarjeta de tu solicitud mostrará su estado actual: <strong>Pendiente</strong> (color amarillo), <strong>Aprobada</strong> (color verde) o <strong>Rechazada</strong> (color rojo). Al ser aprobada, también se activará de forma automática el plan de crucero correspondiente en el módulo "Cruceros" para que comiences a comfigurar tu ruta.
                  </Paragraph>
                </Panel>
                <Panel header={<Text strong style={{ fontSize: 13, color: '#0A2647' }}>¿Qué hago si mi plan de crucero regresa un día después de lo planeado?</Text>} key="faq4">
                  <Paragraph style={{ fontSize: 13, color: '#555', margin: 0 }}>
                    El sistema calcula la fecha de regreso sumando los tiempos de navegación (tránsito) y de actividad científica configurados en cada punto. Si requieres más tiempo, puedes aumentar las horas de actividad del último punto de muestreo o agregar un waypoint adicional en el mapa interactivo.
                  </Paragraph>
                </Panel>
              </Collapse>
            </Space>
          )}
        </Col>
      </Row>
    </div>
  );
}

function MenuSelection({ active, onChange }) {
  const items = [
    { key: 'requests', label: '📋 Solicitudes de Embarcación' },
    { key: 'cruises', label: '🧭 Configurar Cruceros' },
    { key: 'participants', label: '👥 Identificaciones Oficiales' },
    { key: 'faq', label: '❓ Preguntas Frecuentes' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((i) => {
        const isActive = active === i.key;
        return (
          <button
            key={i.key}
            onClick={() => onChange(i.key)}
            style={{
              textAlign: 'left',
              padding: '12px 16px',
              border: 'none',
              background: isActive ? '#f0f5ff' : 'transparent',
              color: isActive ? '#0A2647' : '#555',
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              borderLeft: isActive ? '3px solid #0A2647' : '3px solid transparent',
              transition: 'all 0.2s',
              fontSize: 13,
            }}
          >
            {i.label}
          </button>
        );
      })}
    </div>
  );
}

// ── MANUAL GENERAL PARA ADMINISTRADORES/CAPITANES ──────────────
export default function HelpPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');

  const is_admin = user?.is_superadmin || user?.roles?.some(r => r.name === 'Administrador' || r.name === 'Capitán' || r.name === 'Jefe de Máquinas' || r.name === 'Operador');

  if (!is_admin) {
    return <ResearcherHelp />;
  }

  const modules = [
    {
      id: 'cruises',
      icon: <CompassOutlined style={{ color: '#1890ff' }} />,
      title: 'Cruceros y Campañas',
      description: 'Planificación de campañas oceanográficas, rutas en mapa interactivo y exportación de planes.',
      features: [
        { name: 'Creación de Planes', desc: 'Registra el nombre, objetivo, embarcación, fechas y disciplinas científicas del crucero.' },
        { name: 'Mapa de Waypoints', desc: 'Dibuja la ruta interactiva haciendo clics en el mapa Leaflet. Los marcadores son arrastrables para ajustar coordenadas.' },
        { name: 'Cálculo Automático de Itinerario', desc: 'Estima las distancias (millas náuticas), tránsitos y horas de llegada/salida a cada punto según la velocidad de la embarcación.' },
        { name: 'Asignación de Personal', desc: 'Asigna al Investigador Principal (IP), científicos, técnicos y tripulación desde la sección de participantes.' },
        { name: 'Exportación de Documentos', desc: 'Genera instantáneamente el reporte formal en PDF o el archivo editable de Word (DOCX) con el formato oficial del plan de campaña.' }
      ],
      faq: [
        { q: '¿Cómo edito las coordenadas manualmente?', a: 'En el modal del mapa, haz clic en la tarjeta del waypoint a la derecha. Se desplegarán los campos numéricos de Latitud y Longitud para edición exacta, o puedes arrastrar el marcador en el mapa.' },
        { q: '¿Por qué la fecha de regreso está deshabilitada?', a: 'Se calcula automáticamente sumando el tiempo de navegación y las horas de actividad configuradas en cada waypoint a la fecha de zarpe.' }
      ]
    },
    {
      id: 'participants',
      icon: <TeamOutlined style={{ color: '#52c41a' }} />,
      title: 'Catálogo de Participantes',
      description: 'Directorio de personal científico, estudiantes y externos para cruceros.',
      features: [
        { name: 'Registro Único', desc: 'Registra los datos personales, institución de procedencia, nacionalidad, fotografía y pasaporte de los participantes.' },
        { name: 'Sincronización con Personal', desc: 'Permite buscar e importar directamente datos de empleados activos del CICESE.' },
        { name: 'Semáforo de Vigencias', desc: 'Monitorea el estado del documento de identidad (Pasaporte/INE) indicando visualmente si está vigente, próximo a vencer (menos de 60 días) o vencido.' },
        { name: 'Gestión Documental', desc: 'Sube y visualiza el archivo en PDF o imagen de la identificación oficial necesaria para tramitar el PIS (Permiso de Ingreso a Puerto/Embarcación).' }
      ],
      faq: [
        { q: '¿Cómo cargo la fotografía?', a: 'Abre el detalle del participante haciendo clic en su nombre, presiona en el recuadro de la foto y selecciona una imagen JPG/PNG de rostro.' }
      ]
    },
    {
      id: 'maintenance',
      icon: <ToolOutlined style={{ color: '#faad14' }} />,
      title: 'Mantenimiento de Embarcaciones',
      description: 'Órdenes de mantenimiento preventivo y correctivo para las embarcaciones de la flota.',
      features: [
        { name: 'Tipos de Mantenimiento', desc: 'Diferencia entre mantenimiento preventivo (rutinario) y correctivo (reparación de fallas).' },
        { name: 'Formularios Inteligentes', desc: 'Los campos se adaptan en vivo: si está "Pendiente", se ocultan los datos de ejecución y costos. Se habilitan al pasar a "En Progreso" o "Completado".' },
        { name: 'Seguimiento de Costos y Horas', desc: 'Registra las horas de trabajo reales, costo total de mano de obra y refacciones extras empleadas.' },
        { name: 'Rutinas Predefinidas', desc: 'Asocia el mantenimiento a guías de rutina preestablecidas y carga automáticamente los insumos mínimos necesarios.' }
      ],
      faq: [
        { q: '¿Por qué no veo los campos de Refacciones o Costo real?', a: 'Estos campos solo se habilitan cuando cambias el estado del mantenimiento a "En Progreso" o "Completado" en el formulario.' }
      ]
    },
    {
      id: 'documents',
      icon: <FileTextOutlined style={{ color: '#eb2f96' }} />,
      title: 'Documentación Oficial',
      description: 'Certificados marítimos de seguridad, permisos de navegación y vigencias de la flota.',
      features: [
        { name: 'Categorías de Documentos', desc: 'Clasifica los certificados por tipo (Seguridad, Matrícula, Inspección, Contaminación, etc.).' },
        { name: 'Semáforo de Vencimientos', desc: 'El sistema calcula los días restantes para el vencimiento del certificado y alerta en rojo/amarillo de forma automática.' },
        { name: 'Repositorio Centralizado', desc: 'Almacena archivos PDF/imágenes de cada certificado para consulta directa y rápida por el departamento.' }
      ],
      faq: [
        { q: '¿Qué pasa si un documento no tiene fecha de vencimiento?', a: 'Deja el campo de fecha de vencimiento vacío. El sistema lo marcará como "Permanente" (sin alerta de vencimiento).' }
      ]
    },
    {
      id: 'equipment',
      icon: <SettingOutlined style={{ color: '#722ed1' }} />,
      title: 'Equipos y Sistemas',
      description: 'Inventario de instrumentación oceanográfica, equipos de navegación y radiocomunicación.',
      features: [
        { name: 'Catálogo de Equipos', desc: 'Registra marca, modelo, número de serie, categoría y estado operativo (Operativo, En Mantenimiento, Fuera de Servicio).' },
        { name: 'Fichas de Dispositivos', desc: 'Almacena manuales de usuario (PDF), especificaciones técnicas e histórico de calibración.' },
        { name: 'Asignación a Embarcaciones', desc: 'Indica a qué embarcación está asignada físicamente cada equipo o si se encuentra ressegurado en almacén.' }
      ],
      faq: [
        { q: '¿Cómo registro que un equipo requiere calibración?', a: 'Edita el estado del equipo a "Fuera de Servicio" o "En Mantenimiento" y detalla la fecha requerida de calibración en la descripción.' }
      ]
    },
    {
      id: 'logbooks',
      icon: <BookOutlined style={{ color: '#13c2c2' }} />,
      title: 'Bitácoras de Navegación',
      description: 'Diario electrónico de sucesos, maniobras, clima y reportes diarios a bordo.',
      features: [
        { name: 'Eventos Geolocalizados', desc: 'Registra sucesos con fecha, hora, coordenadas de latitud/longitud y categoría del evento.' },
        { name: 'Tipos de Eventos Personalizados', desc: 'Configura tipos de evento específicos (Navegación, Clima, Maniobra de Cubierta, Avistamiento) asociando iconos curados.' },
        { name: 'Línea de Tiempo del Viaje', desc: 'Muestra cronológicamente las anotaciones del capitán para reconstruir con precisión el transcurso de la campaña.' }
      ],
      faq: [
        { q: '¿Quién puede realizar anotaciones?', a: 'Cualquier usuario con permisos de edición asignado al crucero o el capitán a cargo de la embarcación.' }
      ]
    },
    {
      id: 'inventory',
      icon: <InboxOutlined style={{ color: '#fa541c' }} />,
      title: 'Inventario de Almacén',
      description: 'Control de refacciones, consumibles, herramientas y stock mínimo de seguridad.',
      features: [
        { name: 'Gestión de Stock', desc: 'Registra entradas, salidas y cantidad actual de cada artículo en almacén.' },
        { name: 'Alertas de Stock Mínimo', desc: 'Recibe advertencias automáticas cuando el inventario de un artículo cae por debajo del nivel de seguridad configurado.' },
        { name: 'Ubicación y Categorías', desc: 'Organiza el almacén por estanterías, pasillos y categorías (Cubierta, Máquinas, Cocina, Seguridad).' }
      ],
      faq: [
        { q: '¿Cómo registro una salida de material?', a: 'Presiona el botón de salida, especifica la cantidad que se retira, la embarcación de destino y quién realiza la solicitud.' }
      ]
    },
    {
      id: 'billing',
      icon: <DollarOutlined style={{ color: '#27AE60' }} />,
      title: 'Facturación y Cobros',
      description: 'Módulo financiero para gestionar tarifas oficiales de 2025, consumo de combustible y registro de cobros.',
      features: [
        { name: 'Tarifas Oficiales 2025', desc: 'Permite registrar y vigilar tarifas por tipo de proyecto y embarcación.' },
        { name: 'Desglose Lancha y Vehículo', desc: 'Para la Rigel, separa la renta fija de la embarcación y la del pickup de remolque, agregando litros de gasolina del vehículo.' },
        { name: 'Documentación de Cobro', desc: 'Control e inspección de tres documentos digitales obligatorios: Recibo oficial, Orden de Embarcación y Orden Firmada.' },
        { name: 'KPIs y Gráficos SVG', desc: 'Estadísticas de facturación mensual e ingresos recuperados mediante gráficos dinámicos interactivos en el Dashboard.' }
      ],
      faq: [
        { q: '¿Por qué la tasa de IVA inicia en 0.0%?', a: 'Por defecto, se predetermina en 0.0% por la condición de la institución, pudiendo ajustarse según las particularidades de cada cobro.' },
        { q: '¿Cómo cargo los documentos de cobro?', a: 'En la pestaña "Facturación" de un crucero completado, abre el formulario y selecciona los archivos PDF del recibo y las órdenes.' }
      ]
    },
    {
      id: 'admin',
      icon: <UserOutlined style={{ color: '#0A2647' }} />,
      title: 'Administración del Sistema',
      description: 'Gestión de accesos, perfiles de usuario, roles, catálogo de puertos y actividad general.',
      features: [
        { name: 'Usuarios y Permisos', desc: 'Creación de cuentas, restablecimiento de claves y control granular mediante roles.' },
        { name: 'Catálogo de Puertos', desc: 'Registra los puertos oficiales de salida y regreso en mapa Leaflet interactivo.' },
        { name: 'Actividad del Sistema (Auditoría)', desc: 'Muestra el registro de acciones realizadas con filtros avanzados por usuario, acción, módulo y rango de fechas, con visor JSON de detalles.' }
      ],
      faq: [
        { q: '¿Cómo consulto qué cambió en un registro?', a: 'En la sección "Actividad del Sistema", busca el evento y haz clic en "Ver detalles". Se mostrará un bloque de código JSON con los datos exactos del cambio.' }
      ]
    }
  ];

  // Filtrar módulos por búsqueda
  const filteredModules = modules.filter(m =>
    m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.features.some(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()) || f.desc.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '10px 20px' }}>
      {/* Encabezado Principal */}
      <Card
        style={{
          borderRadius: 16,
          background: 'linear-gradient(135deg, #0A2647 0%, #1B4F72 100%)',
          color: '#fff',
          marginBottom: 24,
          boxShadow: '0 4px 20px rgba(10, 38, 71, 0.15)',
          border: 'none',
        }}
      >
        <Row align="middle" gutter={24}>
          <Col xs={24} md={16}>
            <Title level={2} style={{ color: '#fff', margin: 0 }}>
              <QuestionCircleOutlined /> Centro de Ayuda y Manuales SIAE
            </Title>
            <Paragraph style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: 14, marginTop: 8, marginBottom: 0 }}>
              Consulta las guías interactivas, preguntas frecuentes y funcionalidades disponibles para cada uno de los módulos del Sistema Integral de Administración de Embarcaciones (SIAE).
            </Paragraph>
          </Col>
          <Col xs={24} md={8}>
            <Search
              placeholder="Buscar en el manual..."
              allowClear
              enterButton={<SearchOutlined />}
              size="large"
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)'
              }}
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={[24, 24]}>
        {/* Panel Izquierdo: Módulos del Sistema */}
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <BookOutlined style={{ color: '#0A2647' }} />
                <span>Manual de Módulos Operativos</span>
                {searchTerm && <Badge count={filteredModules.length} style={{ backgroundColor: '#108ee9' }} />}
              </Space>
            }
            style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
          >
            {filteredModules.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <InfoCircleOutlined style={{ fontSize: 32, color: '#bfbfbf', marginBottom: 12 }} />
                <Paragraph type="secondary">No se encontraron resultados para la búsqueda.</Paragraph>
              </div>
            ) : (
              <Collapse accordion defaultActiveKey={['cruises']} expandIconPosition="end" style={{ background: 'none', border: 'none' }}>
                {filteredModules.map((m) => (
                  <Panel
                    header={
                      <Space>
                        {m.icon}
                        <Text strong style={{ fontSize: 14, color: '#0A2647' }}>{m.title}</Text>
                        <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>— {m.description}</Text>
                      </Space>
                    }
                    key={m.id}
                    style={{
                      marginBottom: 10,
                      background: '#f9f9f9',
                      borderRadius: 8,
                      border: '1px solid #f0f0f0',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ padding: '0 8px' }}>
                      <Divider orientation="left" style={{ margin: '10px 0', fontSize: 12, color: '#666' }}>Funciones Disponibles</Divider>
                      <List
                        size="small"
                        dataSource={m.features}
                        renderItem={(item) => (
                          <List.Item style={{ padding: '8px 0', border: 'none' }}>
                            <List.Item.Meta
                              avatar={<SendOutlined style={{ color: '#0A2647', fontSize: 10, marginTop: 4 }} />}
                              title={<Text strong style={{ fontSize: 13 }}>{item.name}</Text>}
                              description={<Text type="secondary" style={{ fontSize: 12 }}>{item.desc}</Text>}
                            />
                          </List.Item>
                        )}
                      />

                      <Divider orientation="left" style={{ margin: '15px 0 10px 0', fontSize: 12, color: '#666' }}>Preguntas Frecuentes</Divider>
                      {m.faq.map((f, idx) => (
                        <div key={idx} style={{ marginBottom: 12, background: '#fff', padding: 10, borderRadius: 6, borderLeft: '3px solid #0A2647' }}>
                          <Text strong style={{ fontSize: 12, display: 'block', color: '#333' }}>❓ {f.q}</Text>
                          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>💡 {f.a}</Text>
                        </div>
                      ))}
                    </div>
                  </Panel>
                ))}
              </Collapse>
            )}
          </Card>
        </Col>

        {/* Panel Derecho: Recursos de Ayuda y Contacto */}
        <Col xs={24} lg={8}>
          <Card
            title={<Space><InfoCircleOutlined style={{ color: '#0A2647' }} /><span>Guía Rápida de Roles</span></Space>}
            style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 24 }}
          >
            <Timeline
              items={[
                {
                  color: '#0A2647',
                  children: (
                    <div>
                      <Text strong>Super Administrador / TI</Text>
                      <Paragraph style={{ fontSize: 12, color: '#666', margin: 0 }}>
                        Acceso total. Configura roles y permisos, crea cuentas y audita el sistema.
                      </Paragraph>
                    </div>
                  ),
                },
                {
                  color: '#1b4f72',
                  children: (
                    <div>
                      <Text strong>Jefe del DEO / Coordinador</Text>
                      <Paragraph style={{ fontSize: 12, color: '#666', margin: 0 }}>
                        Aprueba planes de crucero, gestiona vigencias de documentos oficiales y revisa reportes de mantenimiento.
                      </Paragraph>
                    </div>
                  ),
                },
                {
                  color: '#2c74b3',
                  children: (
                    <div>
                      <Text strong>Científico / Investigador</Text>
                      <Paragraph style={{ fontSize: 12, color: '#666', margin: 0 }}>
                        Planifica la ruta del derrotero, asigna investigadores del catálogo y descarga el plan en PDF/Word.
                      </Paragraph>
                    </div>
                  ),
                },
                {
                  color: '#52c41a',
                  children: (
                    <div>
                      <Text strong>Capitán / Tripulación</Text>
                      <Paragraph style={{ fontSize: 12, color: '#666', margin: 0 }}>
                        Visualiza el plan aprobado y completa la bitácora de navegación geolocalizada durante el viaje.
                      </Paragraph>
                    </div>
                  ),
                },
              ]}
            />
          </Card>

          <Card
            style={{
              borderRadius: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
              background: '#f0f5ff',
              border: '1px solid #d6e4ff'
            }}
          >
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Text strong style={{ fontSize: 15, color: '#0A2647' }}>¿Necesitas soporte técnico?</Text>
              <Paragraph style={{ fontSize: 13, color: '#555', margin: 0 }}>
                Si detectas alguna falla en el cálculo de distancias, errores al generar los reportes de Word/PDF, o requieres registrar una nueva embarcación, comunícate al Departamento de Embarcaciones Oceanográficas (DEO) del CICESE.
              </Paragraph>
              <Paragraph style={{ fontSize: 13, color: '#555', margin: '4px 0 12px 0' }}>
                Contacto de soporte:
                <br />
                📧 <a href="mailto:evalenzu@cicese.mx">evalenzu@cicese.mx</a>
                <br />
                📧 <a href="mailto:lenero@cicese.mx">lenero@cicese.mx</a>
              </Paragraph>
              <Button type="primary" block style={{ background: '#0A2647', border: 'none', borderRadius: 6 }}
                onClick={() => window.open('mailto:evalenzu@cicese.mx,lenero@cicese.mx')}>
                📧 Enviar correo a soporte
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
