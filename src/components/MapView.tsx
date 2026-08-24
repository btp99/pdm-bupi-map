'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-control-geocoder/dist/Control.Geocoder.css';

import { useEffect, useRef, useState } from 'react';

const WMS_LAYERS = [
  'ran', 'ren', 'trocoaltatensao', 'trocomediatensao',
  'condutaadutora_adutoradistribuidora', 'espacosagricolasdeproducao',
  'espacosurbanosdebaixadensidade1', 'espacosurbanosdebaixadensidade2',
  'espacosverdes', 'espacosdeatividadeseconomicas', 'espacoderecursosgeologicos',
  'espacoderecursosgeologicos_CM', 'espacoderecursosgeologicos_U',
  'espacoderecursosgeologicos_R', 'espacosdeusosmultiplos',
  'estruturaecologicamunicipal', 'linhasdeagua',
];

const WMS_BASE = 'https://sig.cm-aguiardabeira.pt/0901/qgis_mapserv.fcgi?';

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localTilesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const highlightRef = useRef<any>(null);

  const [opacity, setOpacity] = useState(0.7);
  const [tilesVisible, setTilesVisible] = useState(true);
  const [processId, setProcessId] = useState('');
  const [searchResult, setSearchResult] = useState('');

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    let cancelled = false;

    const init = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = ((await import('leaflet')) as any).default as any;
      if (cancelled) return;
      lRef.current = L;

      // Fix marker icons broken by webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(containerRef.current!, {
        center: [40.816, -7.544],
        zoom: 13,
        minZoom: 13,
        maxZoom: 17,
      });
      mapRef.current = map;

      const satellite = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri' },
      ).addTo(map);

      const overlayLayers: Record<string, ReturnType<typeof L.tileLayer.wms>> = {};
      WMS_LAYERS.forEach((name) => {
        overlayLayers[name.toUpperCase()] = L.tileLayer.wms(WMS_BASE, {
          layers: name,
          format: 'image/png',
          transparent: true,
          version: '1.3.0',
          crs: L.CRS.EPSG3857,
          map: 'pdm_db.qgs',
          updateWhenZooming: false,
          keepBuffer: 2,
        });
      });

      if (cancelled) { map.remove(); mapRef.current = null; return; }

      const esri = await import('esri-leaflet');
      if (cancelled) { map.remove(); mapRef.current = null; return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bupiCadastro = (esri as any).featureLayer({
        url: 'https://geo.bupi.gov.pt/gisbupi/rest/services/opendata/RGG_DadosGovPT/MapServer/0',
        style: { color: '#e8630a', weight: 1.5, fillOpacity: 0 },
        minZoom: 15,
        attribution: '© BUPI / DGTERRITÓRIO',
      });

      bupiCadastro.bindPopup((layer: any) => {
        const p = layer.feature.properties;
        const area = p['st_area(shape)'];
        const areaStr = area ? (area / 10000).toFixed(4) + ' ha' : '—';
        return `
          <b>Parcela Cadastral</b><br>
          <b>Artigo matriz:</b> ${p.numeromatriz || '—'}<br>
          <b>Freguesia:</b> ${p.freguesiadesc || '—'}<br>
          <b>Concelho:</b> ${p.concelhodesc || '—'}<br>
          <b>Distrito:</b> ${p.distritodesc || '—'}<br>
          <b>Área:</b> ${areaStr}<br>
          <b>Processo:</b> ${p.processoid || '—'}
        `;
      });

      const bupiOrtos = L.tileLayer.wms(
        'https://cartografia.dgterritorio.gov.pt/wms/ortos2018',
        {
          layers: 'Ortos2018-RGB',
          format: 'image/png',
          transparent: true,
          version: '1.3.0',
          crs: L.CRS.EPSG3857,
          updateWhenZooming: false,
          keepBuffer: 2,
          attribution: '© BUPI / DGTERRITÓRIO',
        },
      );

      L.control
        .layers(
          { Satellite: satellite },
          {
            ...overlayLayers,
            'BUPI — Parcelas Cadastrais': bupiCadastro,
            'BUPI — Ortofotos 2018': bupiOrtos,
          },
          { collapsed: false },
        )
        .addTo(map);

      overlayLayers['RAN']?.addTo(map);
      overlayLayers['REN']?.addTo(map);

      // Local tiles via Next.js API route (reutiliza cache existente)
      const localTiles = L.tileLayer('/api/tiles/{z}/{x}/{y}', {
        maxZoom: 18,
        minZoom: 13,
        opacity: 0.7,
        updateWhenZooming: false,
        keepBuffer: 2,
      });
      localTilesRef.current = localTiles;
      localTiles.addTo(map);

      // Geocoder
      await import('leaflet-control-geocoder');
      if (cancelled) { map.remove(); mapRef.current = null; return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (L as any).Control.geocoder().addTo(map);

      // Locate button
      const locateControl = L.control({ position: 'topright' });
      locateControl.onAdd = () => {
        const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const btn = L.DomUtil.create('a', '', div);
        btn.innerHTML = '📍';
        btn.href = '#';
        btn.title = 'Mostrar localização';
        L.DomEvent.on(btn, 'click', L.DomEvent.stop).on(btn, 'click', () => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              L.marker([pos.coords.latitude, pos.coords.longitude])
                .addTo(map)
                .bindPopup('Está aqui!')
                .openPopup();
              map.setView([pos.coords.latitude, pos.coords.longitude], 16);
            },
            () => alert('Não foi possível obter localização.'),
          );
        });
        return div;
      };
      locateControl.addTo(map);

      // Draw controls
      await import('leaflet-draw');
      const GeometryUtil = (await import('leaflet-geometryutil')).default;
      if (cancelled) { map.remove(); mapRef.current = null; return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const LD = L as any;
      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);

      const drawControl = new LD.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: {
          polygon: { allowIntersection: false, showArea: true },
          polyline: true,
          rectangle: true,
          circle: true,
          marker: false,
          circlemarker: false,
        },
      });
      map.addControl(drawControl);

      map.on(LD.Draw.Event.CREATED, (event: any) => {
        const layer = event.layer;
        drawnItems.addLayer(layer);
        let content = '';
        if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
          content = `Comprimento: ${GeometryUtil.length(layer).toFixed(1)} m`;
        } else if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
          content = `Área: ${GeometryUtil.geodesicArea(layer.getLatLngs()[0] as L.LatLng[]).toFixed(1)} m²`;
        } else if (layer instanceof L.Circle) {
          content = `Área círculo: ${(Math.PI * layer.getRadius() ** 2).toFixed(1)} m²`;
        }
        if (content) {
          layer.bindTooltip(content, { permanent: true, direction: 'center' }).openTooltip();
        }
      });
    };

    init().catch(console.error);

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const handleOpacity = (val: number) => {
    setOpacity(val);
    localTilesRef.current?.setOpacity(val);
  };

  const handleToggle = () => {
    setTilesVisible((prev) => {
      const next = !prev;
      const map = mapRef.current;
      const tiles = localTilesRef.current;
      if (map && tiles) {
        if (next) map.addLayer(tiles);
        else map.removeLayer(tiles);
      }
      return next;
    });
  };

  const searchParcel = async () => {
    const id = processId.trim();
    if (!id) return;
    setSearchResult('A pesquisar...');

    try {
      const res = await fetch(`/api/bupi/parcel?processoid=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const geojson = await res.json();

      if (!geojson.features?.length) {
        setSearchResult('Parcela não encontrada.');
        return;
      }

      const L = lRef.current;
      const map = mapRef.current;
      if (!L || !map) return;

      if (highlightRef.current) map.removeLayer(highlightRef.current);

      const layer = L.geoJSON(geojson, {
        style: { color: '#0055ff', weight: 3, fillColor: '#0055ff', fillOpacity: 0.15 },
      }).addTo(map);
      highlightRef.current = layer;
      map.fitBounds(layer.getBounds(), { maxZoom: 17, padding: [40, 40] });

      const p = geojson.features[0].properties;
      const area = p['st_area(shape)'];
      const areaStr = area ? (area / 10000).toFixed(4) + ' ha' : '—';
      setSearchResult(`${p.numeromatriz || '—'} · ${p.freguesiadesc || '—'} · ${areaStr}`);

      layer
        .bindPopup(
          `<b>Parcela Cadastral</b><br>
          <b>Artigo matriz:</b> ${p.numeromatriz || '—'}<br>
          <b>Freguesia:</b> ${p.freguesiadesc || '—'}<br>
          <b>Concelho:</b> ${p.concelhodesc || '—'}<br>
          <b>Área:</b> ${areaStr}<br>
          <b>Processo:</b> ${p.processoid || '—'}`,
        )
        .openPopup();
    } catch (err: unknown) {
      setSearchResult('Erro: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const clearParcel = () => {
    if (highlightRef.current && mapRef.current) {
      mapRef.current.removeLayer(highlightRef.current);
      highlightRef.current = null;
    }
    setProcessId('');
    setSearchResult('');
  };

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />

      <div
        style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          zIndex: 1000,
          background: 'white',
          padding: 10,
          borderRadius: 5,
          boxShadow: '0 0 5px rgba(0,0,0,0.5)',
          minWidth: 220,
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          Opacidade:
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={opacity}
            onChange={(e) => handleOpacity(parseFloat(e.target.value))}
          />
        </label>

        <button
          onClick={handleToggle}
          style={{ marginTop: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 13 }}
        >
          {tilesVisible ? 'Ocultar Imagem' : 'Mostrar Imagem'}
        </button>

        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #ddd' }}>
          <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 5 }}>
            Pesquisar parcela BUPI
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={processId}
              onChange={(e) => setProcessId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchParcel()}
              placeholder="Nº Processo"
              style={{
                padding: '4px 6px',
                width: 130,
                border: '1px solid #ccc',
                borderRadius: 3,
                fontSize: 13,
              }}
            />
            <button
              onClick={searchParcel}
              style={{ padding: '4px 8px', cursor: 'pointer', fontSize: 13 }}
            >
              Pesquisar
            </button>
            <button
              onClick={clearParcel}
              style={{ padding: '4px 8px', cursor: 'pointer', fontSize: 13 }}
            >
              Limpar
            </button>
          </div>
          {searchResult && (
            <div style={{ marginTop: 5, fontSize: '0.82em', color: '#444' }}>
              {searchResult}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
