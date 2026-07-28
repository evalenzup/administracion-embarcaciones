/**
 * SIAE — Capa de partículas animadas (estilo Windy) sobre Leaflet.
 * Envuelve L.velocityLayer del plugin leaflet-velocity. Se usa tanto para
 * viento (U/V reales de GFS) como para oleaje (U/V sintéticos en la
 * dirección de propagación del swell, magnitud = altura de ola).
 */
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from '../../utils/leafletGlobal'; // debe importarse antes de leaflet-velocity
import 'leaflet-velocity';
import 'leaflet-velocity/dist/leaflet-velocity.css';

/**
 * @param {object} props
 * @param {Array|null} props.data - JSON formato leaflet-velocity (2 componentes U/V), o null si aún no ha cargado.
 * @param {boolean} props.visible - Si la capa debe mostrarse.
 * @param {object} [props.options] - Overrides de L.velocityLayer (maxVelocity, velocityScale, colorScale, displayOptions...).
 */
function VelocityLayer({ data, visible, options = {} }) {
  const map = useMap();
  const layerRef = useRef(null);
  const lastMouseRef = useRef(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Recordar la última posición del cursor sobre el mapa: el readout del
  // plugin solo se recalcula en mousemove, así que al cambiar la hora del
  // pronóstico (animación/slider) lo re-disparamos manualmente con esa
  // posición para que el valor mostrado corresponda a lo que se está viendo.
  useEffect(() => {
    const remember = (e) => { lastMouseRef.current = e; };
    map.on('mousemove', remember);
    return () => map.off('mousemove', remember);
  }, [map]);

  const refreshReadout = () => {
    const ctl = layerRef.current?._mouseControl;
    if (ctl && lastMouseRef.current) {
      ctl._onMouseMove(lastMouseRef.current);
    }
  };

  useEffect(() => {
    if (!visible || !data) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }

    if (!layerRef.current) {
      layerRef.current = L.velocityLayer({
        displayValues: true,
        displayOptions: {
          velocityType: 'Viento',
          directionString: 'dirección',
          speedString: 'velocidad',
          showCardinal: true,
          position: 'bottomleft',
          emptyString: 'Sin datos en este punto',
          angleConvention: 'bearingCCW',
          speedUnit: 'kt',
        },
        data,
        maxVelocity: 20, // m/s (~40 kt): rango de color de las partículas
        velocityScale: 0.01,
        ...optionsRef.current,
      });
      layerRef.current.addTo(map);
    } else {
      layerRef.current.setData(data);
      // setData reinicia el campo de partículas de forma asíncrona; refrescar
      // el readout en el siguiente tick para leer ya los datos nuevos.
      setTimeout(refreshReadout, 50);
    }
  }, [data, visible, map]);

  // Cleanup al desmontar el componente
  useEffect(() => {
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map]);

  return null;
}

export default VelocityLayer;
