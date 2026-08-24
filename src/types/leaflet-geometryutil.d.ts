declare module 'leaflet-geometryutil' {
  import type * as L from 'leaflet';
  const GeometryUtil: {
    length(layer: L.Polyline): number;
    geodesicArea(latLngs: L.LatLng[]): number;
  };
  export default GeometryUtil;
}
