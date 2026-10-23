import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import dayjs from 'dayjs';

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 32,
    fontSize: 8.5,
    fontFamily: 'Helvetica',
    color: '#1e293b',
    lineHeight: 1.35,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: '#0A2647',
    paddingBottom: 8,
  },
  logoCicese: {
    width: 105,
    height: 38,
    objectFit: 'contain',
  },
  logoSiae: {
    width: 40,
    height: 40,
    objectFit: 'contain',
  },
  headerCenter: {
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  headerInstitute: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#0A2647',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  headerDepartment: {
    fontSize: 6.5,
    color: '#475569',
    textAlign: 'center',
    marginTop: 1,
  },
  docTitle: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#0A2647',
    textAlign: 'center',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  docSubtitle: {
    fontSize: 7.5,
    color: '#0284c7',
    textAlign: 'center',
    fontWeight: 'bold',
    marginTop: 1,
  },

  // Sección de Título
  sectionTitle: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#ffffff',
    backgroundColor: '#0A2647',
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginTop: 8,
    marginBottom: 5,
    borderRadius: 2,
    textTransform: 'uppercase',
  },

  // Grid de Parámetros Generales
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
  },
  metaItem: {
    width: '25%',
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  metaItemLastInRow: {
    width: '25%',
    padding: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  metaLabel: {
    fontSize: 6.5,
    fontWeight: 'bold',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#0f172a',
    marginTop: 1,
  },

  // Tarjetas Resumen Ejecutivo (KPIs)
  kpiContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  kpiCard: {
    width: '24%',
    padding: 6,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: '#f8fafc',
  },
  kpiTitle: {
    fontSize: 7,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: '#475569',
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0A2647',
  },
  kpiSubtext: {
    fontSize: 6.5,
    color: '#64748b',
    marginTop: 2,
  },

  // Tabla Principal de Estaciones
  table: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 3,
    marginBottom: 8,
  },
  tableRowHeader: {
    flexDirection: 'row',
    backgroundColor: '#0A2647',
    borderBottomWidth: 1,
    borderBottomColor: '#0A2647',
    paddingVertical: 4,
  },
  tableCellHeader: {
    color: '#ffffff',
    fontSize: 7,
    fontWeight: 'bold',
    paddingHorizontal: 4,
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 3.5,
    alignItems: 'center',
  },
  tableRowEven: {
    backgroundColor: '#f8fafc',
  },
  tableRowWarning: {
    backgroundColor: '#fffbeb',
  },
  tableCell: {
    fontSize: 7.2,
    paddingHorizontal: 4,
    textAlign: 'center',
  },
  stationBadge: {
    fontWeight: 'bold',
    color: '#0A2647',
  },
  warningText: {
    color: '#b45309',
    fontSize: 6.5,
    fontWeight: 'bold',
  },
  successText: {
    color: '#15803d',
    fontSize: 6.5,
    fontWeight: 'bold',
  },

  // Cuadro de Alertas / Avisos
  alertBox: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    marginBottom: 6,
  },
  alertTitle: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: 2,
  },
  alertItem: {
    fontSize: 7,
    color: '#b45309',
    marginLeft: 6,
    marginBottom: 1,
  },

  // Notas Técnicas
  notesBox: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  notesTitle: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 2,
  },
  notesText: {
    fontSize: 6.5,
    color: '#64748b',
    lineHeight: 1.3,
  },

  // Footer fijo
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 4,
    fontSize: 6.5,
    color: '#94a3b8',
  },
});

/**
 * Documento Oficial de Reporte Meteorológico de Derrota y Navegación (CICESE/SIAE).
 * Diseñado en orientación horizontal (Landscape) para máxima claridad en tablas náuticas.
 */
export default function CruiseWeatherReportDocument({
  cruise,
  routeForecast,
  departureDatetime,
  defaultSpeedKnots = 10,
  defaultDurationHours = 1.5,
  weatherModel = 'gfs',
}) {
  const waypoints = routeForecast?.waypoints || [];

  // Cálculos estadísticos y extremos para el resumen ejecutivo
  const validWaypoints = waypoints.filter((w) => w.has_weather);
  const maxWindWp = validWaypoints.length > 0
    ? validWaypoints.reduce((prev, curr) => ((curr.wind_speed_kt || 0) > (prev.wind_speed_kt || 0) ? curr : prev), validWaypoints[0])
    : null;
  const maxWaveWp = validWaypoints.length > 0
    ? validWaypoints.reduce((prev, curr) => ((curr.wave_height_m || 0) > (prev.wave_height_m || 0) ? curr : prev), validWaypoints[0])
    : null;

  const warningWaypoints = waypoints.filter((w) => w.is_warning);
  const totalWarnings = warningWaypoints.length;

  const minAirTemp = validWaypoints.length > 0
    ? Math.min(...validWaypoints.filter((w) => w.air_temp_c != null).map((w) => w.air_temp_c))
    : null;
  const maxAirTemp = validWaypoints.length > 0
    ? Math.max(...validWaypoints.filter((w) => w.air_temp_c != null).map((w) => w.air_temp_c))
    : null;

  const depStr = departureDatetime && dayjs(departureDatetime).isValid()
    ? dayjs(departureDatetime).format('DD/MM/YYYY HH:mm')
    : (routeForecast?.departure_datetime ? dayjs(routeForecast.departure_datetime).format('DD/MM/YYYY HH:mm') : '—');

  const arrStr = routeForecast?.arrival_datetime && dayjs(routeForecast.arrival_datetime).isValid()
    ? dayjs(routeForecast.arrival_datetime).format('DD/MM/YYYY HH:mm')
    : '—';

  const modelLabel = routeForecast?.model_name || (weatherModel === 'ecmwf' ? 'ECMWF IFS Europeo 0.25°' : 'NOAA GFS / WaveWatch III 0.25°');
  const vesselName = cruise?.vessel?.name || cruise?.vessel_name || 'Buque Oceanográfico';
  const chiefScientist = cruise?.chief_scientist || cruise?.responsible_person || '—';

  return (
    <Document
      title={`Reporte Meteorológico — ${cruise?.name || 'Crucero'}`}
      author="CICESE - Departamento de Embarcaciones Oceanográficas"
      subject="Pronóstico Meteorológico Espacio-Temporal para Derrota Marina"
      keywords="CICESE, meteorología, navegación, oleaje, viento, crucero oceanográfico"
    >
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        {/* ENCABEZADO INSTITUCIONAL */}
        <View style={styles.header} fixed>
          <Image src="/cicese_logo.jpg" style={styles.logoCicese} />
          <View style={styles.headerCenter}>
            <Text style={styles.headerInstitute}>
              CENTRO DE INVESTIGACIÓN CIENTÍFICA Y DE EDUCACIÓN SUPERIOR DE ENSENADA, B.C.
            </Text>
            <Text style={styles.headerDepartment}>
              DEPARTAMENTO DE EMBARCACIONES OCEANOGRÁFICAS (DEO) · SISTEMA INTEGRAL DE ADMINISTRACIÓN DE EMBARCACIONES
            </Text>
            <Text style={styles.docTitle}>
              REPORTE METEOROLÓGICO DE DERROTA Y CONDICIONES DE NAVEGACIÓN
            </Text>
            <Text style={styles.docSubtitle}>
              Pronóstico Espacio-Temporal por Estación y Estimación de Zarpe
            </Text>
          </View>
          <Image src="/SIAE_Logo_shield_Isotipo_light_512x512.png" style={styles.logoSiae} />
        </View>

        {/* 1. FICHA TÉCNICA DE LA DERROTA Y SALIDA */}
        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Crucero Oceanográfico</Text>
            <Text style={styles.metaValue}>{cruise?.name || 'Campaña Oceanográfica'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Folio / Clave Oficial</Text>
            <Text style={styles.metaValue}>{cruise?.cruise_number || `CRU-${cruise?.id || '—'}`}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Embarcación Asignada</Text>
            <Text style={styles.metaValue}>{vesselName}</Text>
          </View>
          <View style={styles.metaItemLastInRow}>
            <Text style={styles.metaLabel}>Jefe de Campaña / Responsable</Text>
            <Text style={styles.metaValue}>{chiefScientist}</Text>
          </View>

          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Zarpe Programado (ETD)</Text>
            <Text style={styles.metaValue}>{depStr} hrs</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Retorno Estimado (ETA)</Text>
            <Text style={styles.metaValue}>{arrStr} hrs</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Distancia y Duración Total</Text>
            <Text style={styles.metaValue}>
              {routeForecast ? `${routeForecast.total_distance_nm} nm · ${(routeForecast.total_duration_hours / 24).toFixed(1)} días (${routeForecast.total_duration_hours} h)` : '—'}
            </Text>
          </View>
          <View style={styles.metaItemLastInRow}>
            <Text style={styles.metaLabel}>Velocidad / Permanencia Media</Text>
            <Text style={styles.metaValue}>{defaultSpeedKnots} nudos · {defaultDurationHours} h/estación</Text>
          </View>

          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Modelo Atmosférico</Text>
            <Text style={styles.metaValue}>{modelLabel}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Modelo Oceánico (Oleaje)</Text>
            <Text style={styles.metaValue}>NOAA WaveWatch III (WW3 0.25°)</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Puertos de Salida / Regreso</Text>
            <Text style={styles.metaValue}>
              {cruise?.departure_port_ref?.name || 'Ensenada'} → {cruise?.return_port_ref?.name || 'Ensenada'}
            </Text>
          </View>
          <View style={styles.metaItemLastInRow}>
            <Text style={styles.metaLabel}>Fecha de Emisión del Reporte</Text>
            <Text style={styles.metaValue}>{dayjs().format('DD/MM/YYYY HH:mm')} hrs (Local)</Text>
          </View>
        </View>

        {/* 2. RESUMEN EJECUTIVO DE CONDICIONES NÁUTICAS */}
        <View style={styles.kpiContainer}>
          <View style={[styles.kpiCard, { borderColor: '#bfdbfe', backgroundColor: '#f0f9ff' }]}>
            <Text style={styles.kpiTitle}>💨 Viento Máximo Esperado</Text>
            <Text style={styles.kpiValue}>
              {maxWindWp ? `${maxWindWp.wind_speed_kt} kt` : '—'}
            </Text>
            <Text style={styles.kpiSubtext}>
              {maxWindWp
                ? `Ráfagas: ${maxWindWp.wind_gust_kt || '—'} kt · Dir: ${maxWindWp.wind_dir_deg || '—'}° (${maxWindWp.name})`
                : 'Sin datos extremos'}
            </Text>
          </View>

          <View style={[styles.kpiCard, { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }]}>
            <Text style={styles.kpiTitle}>🌊 Oleaje Máximo Esperado</Text>
            <Text style={styles.kpiValue}>
              {maxWaveWp && maxWaveWp.wave_height_m != null ? `${maxWaveWp.wave_height_m} m` : '—'}
            </Text>
            <Text style={styles.kpiSubtext}>
              {maxWaveWp && maxWaveWp.wave_height_m != null
                ? `Periodo: ${maxWaveWp.wave_period_s ? `${maxWaveWp.wave_period_s}s` : '—'} · Dir: ${maxWaveWp.wave_dir_deg != null ? `${maxWaveWp.wave_dir_deg}°` : '—'} (${maxWaveWp.name})`
                : 'Oleaje dentro de calma'}
            </Text>
          </View>

          <View style={[styles.kpiCard, { borderColor: '#fed7aa', backgroundColor: '#fff7ed' }]}>
            <Text style={styles.kpiTitle}>🌡️ Rango Térmico</Text>
            <Text style={styles.kpiValue}>
              {minAirTemp != null && maxAirTemp != null ? `${minAirTemp}°C - ${maxAirTemp}°C` : '—'}
            </Text>
            <Text style={styles.kpiSubtext}>
              Temp. Aire en superficie marina a 2 metros
            </Text>
          </View>

          <View
            style={[
              styles.kpiCard,
              {
                borderColor: totalWarnings > 0 ? '#fde68a' : '#bbf7d0',
                backgroundColor: totalWarnings > 0 ? '#fffbeb' : '#f0fdf4',
              },
            ]}
          >
            <Text style={styles.kpiTitle}>⚠️ Evaluación Operativa</Text>
            <Text
              style={[
                styles.kpiValue,
                { color: totalWarnings > 0 ? '#b45309' : '#15803d', fontSize: 10 },
              ]}
            >
              {totalWarnings > 0
                ? `${totalWarnings} ${totalWarnings === 1 ? 'Aviso Náutico' : 'Avisos Náuticos'}`
                : 'Condición Favorable'}
            </Text>
            <Text style={styles.kpiSubtext}>
              {totalWarnings > 0
                ? 'Monitorear estaciones con oleaje o viento elevado'
                : 'Navegación segura y maniobras viables'}
            </Text>
          </View>
        </View>

        {/* 3. AVISOS O ALERTAS METEOROLÓGICAS SI EXISTEN */}
        {totalWarnings > 0 && (
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>
              AVISOS DE PRECAUCIÓN EN LA DERROTA:
            </Text>
            {warningWaypoints.map((w, idx) => (
              <Text key={idx} style={styles.alertItem}>
                • {w.name} (ETA {dayjs(w.eta).format('DD/MMM HH:mm')}): {w.warning_reasons?.join('; ') || 'Condiciones límite registradas.'}
              </Text>
            ))}
          </View>
        )}

        {/* 4. TABLA CRONOLÓGICA DE ITINERARIO Y PRONÓSTICO METEOROLÓGICO */}
        <Text style={styles.sectionTitle}>
          ITINERARIO CRONOLÓGICO Y PRONÓSTICO ESPACIO-TEMPORAL POR ESTACIÓN
        </Text>

        <View style={styles.table}>
          {/* Fila de Encabezados */}
          <View style={styles.tableRowHeader}>
            <Text style={[styles.tableCellHeader, { width: '4%' }]}>#</Text>
            <Text style={[styles.tableCellHeader, { width: '12%' }]}>Estación</Text>
            <Text style={[styles.tableCellHeader, { width: '14%' }]}>Coordenadas</Text>
            <Text style={[styles.tableCellHeader, { width: '12%' }]}>ETA Arribo</Text>
            <Text style={[styles.tableCellHeader, { width: '9%' }]}>ETD Zarpe</Text>
            <Text style={[styles.tableCellHeader, { width: '9%' }]}>Tramo (nm)</Text>
            <Text style={[styles.tableCellHeader, { width: '16%' }]}>Viento (kt / dir)</Text>
            <Text style={[styles.tableCellHeader, { width: '13%' }]}>Oleaje (Hs / Tp)</Text>
            <Text style={[styles.tableCellHeader, { width: '6%' }]}>T. Aire</Text>
            <Text style={[styles.tableCellHeader, { width: '5%' }]}>Estado</Text>
          </View>

          {/* Filas de Waypoints */}
          {waypoints.map((wf, idx) => {
            const isWarning = wf.is_warning;
            const isEven = idx % 2 === 1;

            return (
              <View
                key={idx}
                wrap={false}
                style={[
                  styles.tableRow,
                  isEven ? styles.tableRowEven : {},
                  isWarning ? styles.tableRowWarning : {},
                ]}
              >
                <Text style={[styles.tableCell, { width: '4%', fontWeight: 'bold' }]}>
                  {idx + 1}
                </Text>
                <Text style={[styles.tableCell, styles.stationBadge, { width: '12%', textAlign: 'left' }]}>
                  {wf.name}
                </Text>
                <Text style={[styles.tableCell, { width: '14%', color: '#475569', fontSize: 6.8 }]}>
                  {wf.latitude?.toFixed(4)}°N, {Math.abs(wf.longitude || 0).toFixed(4)}°W
                </Text>
                <Text style={[styles.tableCell, { width: '12%', fontWeight: 'bold' }]}>
                  {wf.eta ? dayjs(wf.eta).format('DD/MMM HH:mm') : '—'}
                </Text>
                <Text style={[styles.tableCell, { width: '9%', color: '#475569' }]}>
                  {wf.etd ? dayjs(wf.etd).format('HH:mm') : '—'}
                </Text>
                <Text style={[styles.tableCell, { width: '9%' }]}>
                  {wf.distance_from_prev_nm != null ? `${wf.distance_from_prev_nm} nm` : '—'}
                  {wf.cumulative_distance_nm != null ? ` (${wf.cumulative_distance_nm})` : ''}
                </Text>

                {wf.has_weather ? (
                  <>
                    <Text style={[styles.tableCell, { width: '16%' }]}>
                      {wf.wind_speed_kt != null ? `${wf.wind_speed_kt} kt` : '—'}
                      {wf.wind_gust_kt ? ` (${wf.wind_gust_kt} ráf)` : ''}
                      {wf.wind_dir_deg != null ? ` · ${wf.wind_dir_deg}°` : ''}
                    </Text>
                    <Text style={[styles.tableCell, { width: '13%' }]}>
                      {wf.wave_height_m != null ? `${wf.wave_height_m} m` : '—'}
                      {wf.wave_period_s ? ` · ${wf.wave_period_s}s` : ''}
                      {wf.wave_dir_deg != null ? ` · ${wf.wave_dir_deg}°` : ''}
                    </Text>
                    <Text style={[styles.tableCell, { width: '6%' }]}>
                      {wf.air_temp_c != null ? `${wf.air_temp_c}°C` : '—'}
                    </Text>
                    <Text
                      style={[
                        styles.tableCell,
                        { width: '5%' },
                        isWarning ? styles.warningText : styles.successText,
                      ]}
                    >
                      {isWarning ? '⚠️ Aviso' : '✓ Normal'}
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.tableCell, { width: '40%', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }]}>
                    Fuera de la ventana del modelo numérico
                  </Text>
                )}
              </View>
            );
          })}
        </View>

        {/* 5. NOTAS METODOLÓGICAS Y RECOMENDACIONES DE SEGURIDAD NÁUTICA */}
        <View style={styles.notesBox} wrap={false}>
          <Text style={styles.notesTitle}>
            NOTAS TÉCNICAS Y RECOMENDACIONES PARA EL JEFE DE CAMPAÑA Y TRIPULACIÓN:
          </Text>
          <Text style={styles.notesText}>
            1. El presente informe combina la cronología de navegación con interpolación espaciotemporal en mallas numéricas globales y costeras (NOAA GFS / WW3 y ECMWF IFS).
          </Text>
          <Text style={styles.notesText}>
            2. Validez sinóptica: La fiabilidad del pronóstico es máxima durante las primeras 72 a 96 horas. Se recomienda consultar la actualización de corridas meteorológicas previa a la partida definitiva.
          </Text>
          <Text style={styles.notesText}>
            3. Seguridad en cubierta: Todo despliegue de roseta, CTD, dragas o maniobras de pesca/redes debe coordinarse con el Capitán y Oficial de Guardia si el oleaje supera 1.5 metros o el viento supera 15 nudos.
          </Text>
          <Text style={styles.notesText}>
            4. En caso de condiciones meteorológicas adversas no previstas, el Capitán de la embarcación tiene la facultad de modificar el orden de estaciones o fondear en refugio seguro.
          </Text>
        </View>

        {/* PIE DE PÁGINA (Paginación automática) */}
        <View
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) => (
            <>
              <Text>
                SIAE Meteorología · CICESE Departamento de Embarcaciones Oceanográficas · Documento Informativo
              </Text>
              <Text>
                Página {pageNumber} de {totalPages}
              </Text>
            </>
          )}
        />
      </Page>
    </Document>
  );
}
