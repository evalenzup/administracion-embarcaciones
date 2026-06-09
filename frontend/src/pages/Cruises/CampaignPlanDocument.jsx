import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#333333',
    lineHeight: 1.4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
    paddingBottom: 10,
  },
  logo: {
    width: 140,
    height: 'auto',
  },
  headerRight: {
    textAlign: 'right',
  },
  headerTitle: {
    fontSize: 8,
    color: '#666666',
    fontWeight: 'bold',
  },
  docTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0A2647',
    textAlign: 'center',
    marginBottom: 5,
  },
  docFolio: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#555555',
    textAlign: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0A2647',
    backgroundColor: '#f0f5ff',
    padding: 4,
    marginTop: 15,
    marginBottom: 8,
  },
  table: {
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    marginBottom: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  tableCellHeader: {
    backgroundColor: '#0A2647',
    color: '#ffffff',
    padding: 5,
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  tableCell: {
    padding: 5,
    fontSize: 8.5,
  },
  // Form/Key-Value grid style
  gridRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    minHeight: 18,
    alignItems: 'center',
  },
  gridKey: {
    width: '30%',
    backgroundColor: '#f9f9f9',
    padding: 4,
    fontWeight: 'bold',
    color: '#555555',
    fontSize: 8.5,
    borderRightWidth: 1,
    borderRightColor: '#f0f0f0',
  },
  gridVal: {
    width: '70%',
    padding: 4,
    fontSize: 8.5,
  },
  paragraph: {
    fontSize: 9,
    marginBottom: 8,
    textAlign: 'justify',
  },
  notes: {
    fontSize: 8.5,
    fontStyle: 'italic',
    color: '#666666',
    backgroundColor: '#fbfbfb',
    padding: 6,
    borderLeftWidth: 2,
    borderLeftColor: '#cccccc',
  },
  footer: {
    position: 'absolute',
    bottom: 25,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: '#cccccc',
    paddingTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: '#777777',
  }
});

const ROLE_LABELS = {
  investigador_principal: 'Investigador Principal',
  coinvestigador: 'Co-investigador',
  tecnico: 'Técnico',
  estudiante: 'Estudiante',
  capitan: 'Capitán',
  primer_oficial: '1er Oficial',
  marinero: 'Marinero',
  jefe_maquinas: 'Jefe de Máquinas',
  medico: 'Médico',
  otro: 'Otro',
};

const CREW_ROLES = new Set(['capitan', 'primer_oficial', 'marinero', 'jefe_maquinas', 'medico']);

export function CampaignPlanDocument({ cruise, staticMapUrl }) {
  if (!cruise) return null;

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      const dateOnly = d.split(/[T ]/)[0];
      const parts = dateOnly.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    } catch (e) { /* */ }
    return d;
  };

  const formatDateTime = (d) => {
    if (!d) return '—';
    try {
      const parts = d.split(/[T ]/);
      const dateParts = parts[0].split('-');
      if (dateParts.length === 3) {
        const dateStr = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        if (parts[1]) {
          const timeStr = parts[1].substring(0, 5); // HH:mm
          return `${dateStr} a las ${timeStr}`;
        }
        return dateStr;
      }
    } catch (e) { /* */ }
    return d;
  };

  const tripulacion = cruise.crew || [];
  const cientificos = cruise.participants || [];

  // Lógica para precalcular distancias y tiempos de arribo/salida (Opción C)
  const computeWaypointsTimeline = () => {
    const list = [];
    const departurePort = cruise.departure_port_ref;
    const returnPort = cruise.return_port_ref;

    // Construir lista de puntos de trayecto
    const tripPoints = [];
    if (departurePort && departurePort.latitude != null && departurePort.longitude != null) {
      tripPoints.push({
        id: 'departure-port',
        is_port: true,
        is_departure: true,
        name: `Salida de ${departurePort.name}`,
        latitude: departurePort.latitude,
        longitude: departurePort.longitude,
        speed_knots: null,
        duration_hours: null,
        activity: 'Salida de puerto'
      });
    }
    
    (cruise.waypoints || []).forEach((wp, idx) => {
      tripPoints.push({
        id: wp.id || `wp-${idx}`,
        is_port: false,
        is_departure: false,
        name: wp.name || `Waypoint ${idx + 1}`,
        latitude: wp.latitude,
        longitude: wp.longitude,
        speed_knots: wp.speed_knots,
        duration_hours: wp.duration_hours,
        activity: wp.activity || wp.description || '—',
        samples: wp.samples
      });
    });

    if (returnPort && returnPort.latitude != null && returnPort.longitude != null) {
      tripPoints.push({
        id: 'return-port',
        is_port: true,
        is_departure: false,
        name: `Regreso a ${returnPort.name}`,
        latitude: returnPort.latitude,
        longitude: returnPort.longitude,
        speed_knots: null,
        duration_hours: null,
        activity: 'Llegada a puerto'
      });
    }

    if (tripPoints.length === 0) return list;
    
    // Haversine para calcular distancia en millas náuticas
    const getDistanceNm = (lat1, lon1, lat2, lon2) => {
      const R = 6371; // Radio de la Tierra en km
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distKm = R * c;
      return (distKm / 1.852); // Convertir a millas náuticas
    };

    const maxSpeed = cruise.vessel?.max_speed_knots || 10;
    
    // Usar zarpe del modelo (datetime)
    let currentDateTime = null;
    if (cruise.departure_date) {
      const parts = cruise.departure_date.split(/[T ]/);
      const datePart = parts[0];
      const timePart = parts[1] || "08:00:00";
      
      const dParts = datePart.split('-');
      const tParts = timePart.split(':');
      if (dParts.length === 3) {
        currentDateTime = new Date(
          parseInt(dParts[0]),
          parseInt(dParts[1]) - 1,
          parseInt(dParts[2]),
          tParts[0] ? parseInt(tParts[0]) : 8,
          tParts[1] ? parseInt(tParts[1]) : 0,
          tParts[2] ? parseInt(tParts[2]) : 0
        );
      }
    }
    
    const formatDateTimeString = (dt) => {
      if (!dt) return '—';
      const day = String(dt.getDate()).padStart(2, '0');
      const month = String(dt.getMonth() + 1).padStart(2, '0');
      const hours = String(dt.getHours()).padStart(2, '0');
      const minutes = String(dt.getMinutes()).padStart(2, '0');
      return `${day}/${month} ${hours}:${minutes}`;
    };

    let cumDist = 0;

    for (let i = 0; i < tripPoints.length; i++) {
      const pt = tripPoints[i];
      let arrivalStr = '—';
      let departureStr = '—';
      
      if (i === 0) {
        // Primer punto (Zarpe / Inicio de viaje)
        if (currentDateTime) {
          arrivalStr = '—'; // no hay arribo
          departureStr = formatDateTimeString(currentDateTime);
          if (pt.duration_hours) {
            currentDateTime.setTime(currentDateTime.getTime() + pt.duration_hours * 60 * 60 * 1000);
            departureStr = formatDateTimeString(currentDateTime);
          }
        }
      } else {
        // Puntos sucesivos
        const prevPt = tripPoints[i - 1];
        const dist = getDistanceNm(prevPt.latitude, prevPt.longitude, pt.latitude, pt.longitude);
        cumDist += dist;
        
        if (currentDateTime) {
          const speed = pt.speed_knots || maxSpeed || 10;
          const transitHours = dist / speed;
          
          // Llegada a este punto = Salida de P anterior + tránsito
          currentDateTime.setTime(currentDateTime.getTime() + transitHours * 60 * 60 * 1000);
          arrivalStr = formatDateTimeString(currentDateTime);
          
          // Salida de este punto = Llegada + duración de actividades
          const duration = pt.duration_hours || 0;
          currentDateTime.setTime(currentDateTime.getTime() + duration * 60 * 60 * 1000);
          departureStr = formatDateTimeString(currentDateTime);
        }
      }

      // Si es el puerto de regreso, no hay hora de salida
      if (pt.is_port && !pt.is_departure) {
        departureStr = '—';
      }
      
      list.push({
        id: pt.id,
        name: pt.name,
        latitude: pt.latitude,
        longitude: pt.longitude,
        cumDist,
        arrivalStr,
        departureStr,
        activity: pt.activity,
        samples: pt.samples
      });
    }
    return list;
  };

  const calculatedWaypoints = computeWaypointsTimeline();

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header} fixed>
          <Image src="/cicese_logo.jpg" style={{ width: 110, height: 'auto' }} />
          <View style={{ flex: 1, textAlign: 'center', paddingHorizontal: 10 }}>
            <Text style={{ fontSize: 7.5, color: '#666666', fontWeight: 'bold', textAlign: 'center' }}>
              SIAE — SISTEMA INTEGRAL DE ADMINISTRACIÓN DE EMBARCACIONES
            </Text>
            <Text style={{ fontSize: 6.5, color: '#999999', marginTop: 2, textAlign: 'center' }}>
              CICESE — DEPARTAMENTO DE EMBARCACIONES OCEANOGRÁFICAS
            </Text>
          </View>
          <Image src="/SIAE_Logo_shield_Isotipo_light_512x512.png" style={{ width: 76, height: 76 }} />
        </View>

        {/* Title */}
        <Text style={styles.docTitle}>PLAN DE CAMPAÑA DE INVESTIGACIÓN MARINA</Text>
        <Text style={styles.docFolio}>Folio: {cruise.cruise_number || '—'}</Text>

        {/* 1. Datos Generales */}
        <Text style={styles.sectionTitle}>1. DATOS GENERALES DEL CRUCERO</Text>
        <View style={styles.table}>
          <View style={styles.gridRow}>
            <Text style={styles.gridKey}>Nombre del Crucero</Text>
            <Text style={styles.gridVal}>{cruise.name}</Text>
          </View>
          <View style={styles.gridRow}>
            <Text style={styles.gridKey}>Embarcación</Text>
            <Text style={styles.gridVal}>{cruise.vessel?.name || '—'}</Text>
          </View>
          <View style={styles.gridRow}>
            <Text style={styles.gridKey}>Capitán</Text>
            <Text style={styles.gridVal}>{cruise.captain?.full_name || 'Sin asignar'}</Text>
          </View>
          <View style={styles.gridRow}>
            <Text style={styles.gridKey}>Proyecto Asociado</Text>
            <Text style={styles.gridVal}>{cruise.project_name || '—'}</Text>
          </View>
          <View style={styles.gridRow}>
            <Text style={styles.gridKey}>Fuente de Financiamiento</Text>
            <Text style={styles.gridVal}>{cruise.funding_source || '—'}</Text>
          </View>
          <View style={styles.gridRow}>
            <Text style={styles.gridKey}>Área de Estudio</Text>
            <Text style={styles.gridVal}>{cruise.study_area || '—'}</Text>
          </View>
          <View style={styles.gridRow}>
            <Text style={styles.gridKey}>Disciplinas Científicas</Text>
            <Text style={styles.gridVal}>{cruise.disciplines || '—'}</Text>
          </View>
          <View style={styles.gridRow}>
            <Text style={styles.gridKey}>Salida / Regreso</Text>
            <Text style={styles.gridVal}>
              Desde {cruise.departure_port || '—'} el {formatDateTime(cruise.departure_date)} hasta {cruise.return_port || '—'} el {formatDateTime(cruise.return_date)}
            </Text>
          </View>
          <View style={styles.gridRow}>
            <Text style={styles.gridKey}>Millas Planificadas</Text>
            <Text style={styles.gridVal}>{cruise.planned_nm ? `${cruise.planned_nm} mn` : '—'}</Text>
          </View>
        </View>

        {/* Objetivo */}
        <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#0A2647', marginTop: 10 }}>OBJETIVO CIENTÍFICO / OPERATIVO:</Text>
        <Text style={[styles.paragraph, { marginTop: 4, fontStyle: 'italic', color: '#444444' }]}>
          {cruise.objective || 'No se ha definido un objetivo para esta campaña.'}
        </Text>

        {/* 2. Personal a Bordo */}
        <Text style={styles.sectionTitle}>2. PARTICIPANTES Y PERSONAL A BORDO</Text>
        
        {/* Tripulación */}
        <Text style={{ fontSize: 9.5, fontWeight: 'bold', marginBottom: 5, color: '#333333' }}>Tripulación</Text>
        {tripulacion.length > 0 ? (
          <View style={styles.table}>
            <View style={[styles.tableRow, { backgroundColor: '#0A2647' }]}>
              <Text style={[styles.tableCellHeader, { width: '8%' }]}>No.</Text>
              <Text style={[styles.tableCellHeader, { width: '38%' }]}>Nombre Completo</Text>
              <Text style={[styles.tableCellHeader, { width: '22%' }]}>Función</Text>
              <Text style={[styles.tableCellHeader, { width: '18%' }]}>Institución</Text>
              <Text style={[styles.tableCellHeader, { width: '14%' }]}>Nacionalidad</Text>
            </View>
            {tripulacion.map((p, i) => (
              <View key={p.id} style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: '8%' }]}>{i + 1}</Text>
                <Text style={[styles.tableCell, { width: '38%' }]}>{p.personnel?.full_name || '—'}</Text>
                <Text style={[styles.tableCell, { width: '22%' }]}>{ROLE_LABELS[p.role] || p.role}</Text>
                <Text style={[styles.tableCell, { width: '18%' }]}>CICESE (Personal DEO)</Text>
                <Text style={[styles.tableCell, { width: '14%' }]}>{p.personnel?.nationality || '—'}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.paragraph, { color: '#888', fontStyle: 'italic', marginBottom: 10 }]}>No se han asignado tripulantes a este crucero.</Text>
        )}

        {/* Científicos */}
        <Text style={{ fontSize: 9.5, fontWeight: 'bold', marginBottom: 5, color: '#333333', marginTop: 8 }}>Personal Científico y Técnico</Text>
        {cientificos.length > 0 ? (
          <View style={styles.table}>
            <View style={[styles.tableRow, { backgroundColor: '#1B4F72' }]}>
              <Text style={[styles.tableCellHeader, { width: '8%' }]}>No.</Text>
              <Text style={[styles.tableCellHeader, { width: '38%' }]}>Nombre Completo</Text>
              <Text style={[styles.tableCellHeader, { width: '22%' }]}>Función / Rol</Text>
              <Text style={[styles.tableCellHeader, { width: '18%' }]}>Institución</Text>
              <Text style={[styles.tableCellHeader, { width: '14%' }]}>Nacionalidad</Text>
            </View>
            {cientificos.map((p, i) => (
              <View key={p.id} style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: '8%' }]}>{i + 1}</Text>
                <Text style={[styles.tableCell, { width: '38%', fontWeight: p.is_principal_investigator ? 'bold' : 'normal' }]}>
                  {p.participant?.full_name || '—'}{p.is_principal_investigator ? ' (IP)' : ''}
                </Text>
                <Text style={[styles.tableCell, { width: '22%' }]}>{ROLE_LABELS[p.role_in_cruise] || p.role_in_cruise}</Text>
                <Text style={[styles.tableCell, { width: '18%' }]}>{p.participant?.institution || '—'}</Text>
                <Text style={[styles.tableCell, { width: '14%' }]}>{p.participant?.nationality || '—'}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.paragraph, { color: '#888', fontStyle: 'italic', marginBottom: 10 }]}>No se han asignado investigadores ni técnicos a este crucero.</Text>
        )}

        {/* 3. Derrotero */}
        <Text style={styles.sectionTitle}>3. DERROTERO Y ESTACIONES DE MUESTREO</Text>
        {calculatedWaypoints.length > 0 && staticMapUrl && (
          <View style={{ alignItems: 'center', marginBottom: 15 }} wrap={false}>
            <Image src={staticMapUrl} style={{ width: 500, height: 290, borderRadius: 6, border: '1px solid #cccccc' }} />
            <Text style={{ fontSize: 7.5, color: '#666666', fontStyle: 'italic', marginTop: 4 }}>
              Mapa general de la derrota y estaciones de la campaña.
            </Text>
          </View>
        )}
        {calculatedWaypoints.length > 0 ? (
          <View style={styles.table}>
            <View style={[styles.tableRow, { backgroundColor: '#2C74B3' }]}>
              <Text style={[styles.tableCellHeader, { width: '6%' }]}>No.</Text>
              <Text style={[styles.tableCellHeader, { width: '12%' }]}>Estación / Punto</Text>
              <Text style={[styles.tableCellHeader, { width: '18%' }]}>Coordenadas</Text>
              <Text style={[styles.tableCellHeader, { width: '12%' }]}>Dist. Acum.</Text>
              <Text style={[styles.tableCellHeader, { width: '14%' }]}>Arribo (Est.)</Text>
              <Text style={[styles.tableCellHeader, { width: '14%' }]}>Salida (Est.)</Text>
              <Text style={[styles.tableCellHeader, { width: '24%' }]}>Actividad</Text>
            </View>
            {calculatedWaypoints.map((wp, i) => (
              <View key={wp.id} style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: '6%' }]}>{i + 1}</Text>
                <Text style={[styles.tableCell, { width: '12%' }]}>{wp.name || `Estación ${i + 1}`}</Text>
                <Text style={[styles.tableCell, { width: '18%' }]}>{wp.latitude.toFixed(4)}°, {wp.longitude.toFixed(4)}°</Text>
                <Text style={[styles.tableCell, { width: '12%' }]}>{wp.cumDist.toFixed(1)} mn</Text>
                <Text style={[styles.tableCell, { width: '14%' }]}>{wp.arrivalStr}</Text>
                <Text style={[styles.tableCell, { width: '14%' }]}>{wp.departureStr}</Text>
                <Text style={[styles.tableCell, { width: '24%' }]}>{wp.activity || wp.description || '—'}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.paragraph, { color: '#888', fontStyle: 'italic', marginBottom: 10 }]}>No hay puntos registrados en el derrotero.</Text>
        )}

        {/* 4. Matriz de Muestreo Científico */}
        <Text style={styles.sectionTitle}>4. MATRIZ DE MUESTREO CIENTÍFICO POR ESTACIÓN</Text>
        {calculatedWaypoints.some(wp => wp.samples && wp.samples.length > 0) ? (
          <View style={styles.table}>
            <View style={[styles.tableRow, { backgroundColor: '#16A085' }]}>
              <Text style={[styles.tableCellHeader, { width: '15%' }]}>Estación</Text>
              <Text style={[styles.tableCellHeader, { width: '10%' }]}>Orden</Text>
              <Text style={[styles.tableCellHeader, { width: '30%' }]}>Variable a Analizar</Text>
              <Text style={[styles.tableCellHeader, { width: '20%' }]}>Científico Responsable</Text>
              <Text style={[styles.tableCellHeader, { width: '10%' }]}>Volumen</Text>
              <Text style={[styles.tableCellHeader, { width: '15%' }]}>Niveles Prof.</Text>
            </View>
            {calculatedWaypoints.map((wp) => (
              (wp.samples || []).map((sample, sIdx) => (
                <View key={sample.id} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { width: '15%' }]}>{sIdx === 0 ? wp.name || `Estación` : ''}</Text>
                  <Text style={[styles.tableCell, { width: '10%' }]}>{sample.sampling_order}</Text>
                  <Text style={[styles.tableCell, { width: '30%', fontWeight: 'bold' }]}>{sample.variable_name}</Text>
                  <Text style={[styles.tableCell, { width: '20%' }]}>{sample.responsible_name || '—'}</Text>
                  <Text style={[styles.tableCell, { width: '10%' }]}>{sample.volume_needed || '—'}</Text>
                  <Text style={[styles.tableCell, { width: '15%' }]}>
                    {[
                      sample.depth_surface ? 'Sup' : '',
                      sample.depth_mid_water ? 'Med' : '',
                      sample.depth_bottom ? 'Fon' : '',
                      sample.depth_custom || ''
                    ].filter(Boolean).join(', ') || '—'}
                  </Text>
                </View>
              ))
            ))}
          </View>
        ) : (
          <Text style={[styles.paragraph, { color: '#888', fontStyle: 'italic', marginBottom: 10 }]}>No hay variables de muestreo registradas en las estaciones.</Text>
        )}

        {/* 5. Lista de Embarque e Inventario */}
        <Text style={styles.sectionTitle}>5. LISTA DE EMBARQUE E INVENTARIO POR INVESTIGADOR</Text>
        {cruise.checklist && cruise.checklist.length > 0 ? (
          <View style={styles.table}>
            <View style={[styles.tableRow, { backgroundColor: '#8E44AD' }]}>
              <Text style={[styles.tableCellHeader, { width: '30%' }]}>Investigador Responsable</Text>
              <Text style={[styles.tableCellHeader, { width: '45%' }]}>Equipo / Material / Reactivo</Text>
              <Text style={[styles.tableCellHeader, { width: '10%' }]}>Cantidad</Text>
              <Text style={[styles.tableCellHeader, { width: '15%' }]}>Estado</Text>
            </View>
            {cruise.checklist.map((item) => (
              <View key={item.id} style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: '30%', fontWeight: 'bold' }]}>{item.investigator_name}</Text>
                <Text style={[styles.tableCell, { width: '45%' }]}>{item.item_name} {item.notes ? `(${item.notes})` : ''}</Text>
                <Text style={[styles.tableCell, { width: '10%' }]}>{item.quantity}</Text>
                <Text style={[styles.tableCell, { width: '15%', color: item.is_boarded ? '#27AE60' : '#E74C3C', fontWeight: 'bold' }]}>
                  {item.is_boarded ? '✓ A bordo' : '✗ Pendiente'}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.paragraph, { color: '#888', fontStyle: 'italic', marginBottom: 10 }]}>No hay equipos o materiales registrados en la lista de embarque.</Text>
        )}

        {/* 6. Descarga y Logística de Muestras */}
        <Text style={styles.sectionTitle}>6. PLAN DE LOGÍSTICA Y DESCARGA DE MUESTRAS</Text>
        {cruise.discharges && cruise.discharges.length > 0 ? (
          <View style={styles.table}>
            <View style={[styles.tableRow, { backgroundColor: '#D35400' }]}>
              <Text style={[styles.tableCellHeader, { width: '25%' }]}>Punto / Puerto de Descarga</Text>
              <Text style={[styles.tableCellHeader, { width: '20%' }]}>Fecha y Hora Estimada</Text>
              <Text style={[styles.tableCellHeader, { width: '25%' }]}>Contacto en Tierra</Text>
              <Text style={[styles.tableCellHeader, { width: '30%' }]}>Laboratorio / Notas</Text>
            </View>
            {cruise.discharges.map((d) => (
              <View key={d.id} style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: '25%', fontWeight: 'bold' }]}>{d.port_name}</Text>
                <Text style={[styles.tableCell, { width: '20%' }]}>{d.discharge_date ? formatDateTime(d.discharge_date) : '—'}</Text>
                <Text style={[styles.tableCell, { width: '25%' }]}>{d.responsible_land_person || '—'}</Text>
                <Text style={[styles.tableCell, { width: '30%' }]}>{d.destination_lab || '—'} {d.notes ? `(${d.notes})` : ''}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.paragraph, { color: '#888', fontStyle: 'italic', marginBottom: 10 }]}>No hay descargas logísticas programadas en la ruta.</Text>
        )}

        {/* Notas */}
        {cruise.notes && (
          <View style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#333333', marginBottom: 4 }}>NOTAS GENERALES:</Text>
            <Text style={styles.notes}>{cruise.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} render={({ pageNumber, totalPages }) => (
          <>
            <Text>Generado por SIAE — CICESE Departamento de Embarcaciones Oceanográficas</Text>
            <Text>Página {pageNumber} de {totalPages}</Text>
          </>
        )} />
      </Page>
    </Document>
  );
}
