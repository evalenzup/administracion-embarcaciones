/**
 * SIAE — Capa raster genérica sobre Leaflet (viento u oleaje).
 *
 * Monta como L.imageOverlay un PNG pre-renderizado por el backend
 * (/weather/wind-image o /weather/waves-image): la imagen ya viene
 * sobremuestreada (~2.7 km/píxel) y, en el caso del oleaje, enmascarada por
 * la línea de costa real. Aquí no se rasteriza nada — solo se posiciona con
 * los bounds (wind_bbox/wave_bbox) que reporta /weather/status.
 */
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from '../../utils/leafletGlobal';

/**
 * @param {object} props
 * @param {string|null} props.imageUrl - Object URL del PNG de oleaje, o null si aún no carga.
 * @param {Array|null} props.bounds - Bounds Leaflet [[latSur, lonOeste], [latNorte, lonEste]].
 * @param {boolean} props.visible - Si la capa debe mostrarse.
 */
function RasterOverlay({ imageUrl, bounds, visible }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!visible || !imageUrl || !bounds) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }

    if (!layerRef.current) {
      layerRef.current = L.imageOverlay(imageUrl, bounds, { opacity: 1, interactive: false }).addTo(map);
    } else {
      layerRef.current.setUrl(imageUrl);
    }
  }, [imageUrl, bounds, visible, map]);

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

export default RasterOverlay;
