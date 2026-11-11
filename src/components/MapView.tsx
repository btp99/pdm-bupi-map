'use client';



import 'leaflet/dist/leaflet.css';

import 'leaflet-draw/dist/leaflet.draw.css';

import 'leaflet-control-geocoder/dist/Control.Geocoder.css';



import { useEffect, useRef, useState } from 'react';

import * as turf from '@turf/turf';

import { DEFAULT_MUNICIPALITY_ID, MUNICIPALITIES } from '@/config/municipalities';

const BUPI_COLOR = '#ff6b00';
const AREA_STEPS = [0, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000,
                    7500, 10000, 30000, 50000, 75000, 1e5, 2e5, 5e5, 1e6, Infinity];
const BUPI_PRESETS: [string, number, number][] = [
  ['Tudo', 0, AREA_STEPS.length - 1],
  ['> 5 000 m²', 9, AREA_STEPS.length - 1],
  ['> 30 000 m²', 12, AREA_STEPS.length - 1],
  ['> 100 000 m²', 15, AREA_STEPS.length - 1],
];
const ptNF = new Intl.NumberFormat('pt-PT');
const fmtM2 = (m2: number) => (m2 && m2 !== Infinity) ? ptNF.format(Math.round(m2)) + ' m²' : '—';
const fmtHa = (m2: number) => {
  if (!m2) return '—';
  const ha = m2 / 10000;
  return ptNF.format(Number(ha.toFixed(ha >= 10 ? 2 : ha >= 1 ? 3 : 4))) + ' ha';
};
const fmtStep = (m2: number) =>
  m2 === Infinity ? '∞'
  : m2 >= 1e6 ? ptNF.format(Number((m2 / 1e6).toFixed(2))) + ' km²'
  : ptNF.format(Math.round(m2)) + ' m²';

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const radiusLayerRef = useRef<any>(null);

  const directionMarkersRef = useRef<any>(null);
  const directionUpdateRef = useRef<(() => void) | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const layerControlRef = useRef<any>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const bupiLayersRef = useRef<{ cadastro: any; ortos: any; labels: any } | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const pdmLayersRef = useRef<Record<string, any>>({});

  const pdmOpacityRef = useRef(0.8);



  const [opacity, setOpacity] = useState(0.7);

  const [pdmOpacity, setPdmOpacity] = useState(0.8);

  const [tilesVisible, setTilesVisible] = useState(true);

  const [processId, setProcessId] = useState('');

  const [searchResult, setSearchResult] = useState('');
  const [parcelDirectionsVisible, setParcelDirectionsVisible] = useState(false);

  const [municipalityId, setMunicipalityId] = useState(DEFAULT_MUNICIPALITY_ID);

  const [mapReady, setMapReady] = useState(false);

  const [aMinIdx, setAMinIdx] = useState(0);
  const [aMaxIdx, setAMaxIdx] = useState(AREA_STEPS.length - 1);
  const [bupiOutline, setBupiOutline] = useState(false);
  const [bupiStat, setBupiStat] = useState('');

  const [outerRadiusInput, setOuterRadiusInput] = useState('200');

  const [innerRadiusInput, setInnerRadiusInput] = useState('50');



  // Initialize map once (no PDM layers — those are set up in the second effect)

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



      const defaultMunicipality = MUNICIPALITIES.find((m) => m.id === DEFAULT_MUNICIPALITY_ID)!;



      const map = L.map(containerRef.current!, {

        center: defaultMunicipality.center,

        zoom: defaultMunicipality.zoom,

        minZoom: 13,

        maxZoom: 17,

      });

      mapRef.current = map;



      L.tileLayer(

        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',

        { attribution: 'Tiles © Esri' },

      ).addTo(map);



      if (cancelled) { map.remove(); mapRef.current = null; return; }



      const esri = await import('esri-leaflet');

      if (cancelled) { map.remove(); mapRef.current = null; return; }



      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      const bupiCadastro = (esri as any).featureLayer({

        url: 'https://geo.bupi.gov.pt/gisbupi/rest/services/opendata/RGG_DadosGovPT/MapServer/0',

        style: { color: BUPI_COLOR, weight: 1.5, opacity: 0.95, fillColor: BUPI_COLOR, fillOpacity: 0.12 },

        minZoom: 15,

        attribution: '© BUPI / DGTERRITÓRIO',

      });



      bupiCadastro.bindPopup((layer: any) => {

        const p = layer.feature.properties;

        const area = p['st_area(shape)'] || 0;

        const perim = p['st_length(shape)'];

        return (

          "<table style='border-collapse:collapse;font-size:12px'>" +
          "<tr><th style='text-align:left;padding:2px 8px 2px 0;color:#555'>Processo</th><td>" + (p.processoid || '—') + '</td></tr>' +
          "<tr><th style='text-align:left;padding:2px 8px 2px 0;color:#555'>Concelho</th><td>" + (p.concelhodesc || '—') + '</td></tr>' +
          "<tr><th style='text-align:left;padding:2px 8px 2px 0;color:#555'>Freguesia</th><td>" + (p.freguesiadesc || '—') + '</td></tr>' +
          "<tr><th style='text-align:left;padding:2px 8px 2px 0;color:#555'>Matriz</th><td>" + (p.numeromatriz || '—') + '</td></tr>' +
          "<tr><th style='text-align:left;padding:2px 8px 2px 0;color:#555'>Área</th><td>" + fmtM2(area) + ' · ' + fmtHa(area) + '</td></tr>' +
          "<tr><th style='text-align:left;padding:2px 8px 2px 0;color:#555'>Perímetro</th><td>" + (perim ? ptNF.format(Math.round(perim)) + ' m' : '—') + '</td></tr>' +
          '</table>'
        );

      });



      bupiCadastro.on('load', () => {

        let count = 0, totalArea = 0;

        bupiCadastro.eachLayer((layer: any) => {

          count++;

          const p = layer.feature?.properties;

          const area = p?.['st_area(shape)'] || 0;

          totalArea += area;

          if (layer.getTooltip()) return;

          const proc = p?.processoid ? 'Processo ' + p.processoid : 'sem processo';

          layer.bindTooltip(

            proc + '<br>' + (p?.numeromatriz || 'sem matriz') + '<br>' +
            (p?.freguesiadesc || '') + '<br>' + fmtM2(area) + ' · ' + fmtHa(area),

            { sticky: true, direction: 'top', offset: [0, -4] },

          );

        });

        if (count > 0) {

          setBupiStat(ptNF.format(count) + ' parcelas · ' + fmtHa(totalArea));

        }

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



      // Labels overlay (parishes, cities, villages) — always on top via high zIndex

      const labels = L.tileLayer(

        'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png',

        {

          attribution: '© <a href="https://carto.com/">CARTO</a>',

          subdomains: 'abcd',

          opacity: 0.9,

          zIndex: 650,

        },

      );



      bupiLayersRef.current = { cadastro: bupiCadastro, ortos: bupiOrtos, labels };



      // Local tiles for Aguiar da Beira fire hazard layer

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

          content = `${GeometryUtil.length(layer).toFixed(1)} m`;

        } else if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {

          content = `Área: ${GeometryUtil.geodesicArea(layer.getLatLngs()[0] as L.LatLng[]).toFixed(1)} m²`;

        } else if (layer instanceof L.Circle) {

          content = `Área círculo: ${(Math.PI * layer.getRadius() ** 2).toFixed(1)} m²`;

        }

        if (content) {

          layer.bindTooltip(content, { permanent: true, direction: 'center', opacity: 0.5 }).openTooltip();

        }

      });



      if (!cancelled) setMapReady(true);

    };



    init().catch(console.error);



    return () => {

      cancelled = true;

      mapRef.current?.remove();

      mapRef.current = null;

    };

  }, []);



  // Update PDM layers and layer control whenever municipality changes (or map becomes ready)

  useEffect(() => {

    if (!mapReady || !lRef.current || !mapRef.current || !bupiLayersRef.current) return;

    const L = lRef.current;

    const map = mapRef.current;

    const { cadastro, ortos, labels } = bupiLayersRef.current;



    const municipality = MUNICIPALITIES.find((m) => m.id === municipalityId);

    if (!municipality) return;



    // Remove previous layer control and PDM layers

    layerControlRef.current?.remove();

    Object.values(pdmLayersRef.current).forEach((layer) => {

      if (map.hasLayer(layer)) map.removeLayer(layer);

    });



    // Build new PDM overlay layers

    const overlayLayers: Record<string, ReturnType<typeof L.tileLayer.wms>> = {};

    municipality.pdmLayers.forEach((def) => {

      const layer = L.tileLayer.wms(def.wmsBase, {

        ...def.wmsOptions,

        opacity: pdmOpacityRef.current,

        crs: L.CRS.EPSG3857,

        updateWhenZooming: false,

        keepBuffer: 2,

      });

      overlayLayers[def.label] = layer;

      if (def.defaultOn) layer.addTo(map);

    });

    pdmLayersRef.current = overlayLayers;



    // Labels layer: add to map on first load; preserve user toggle on municipality switch

    if (!map.hasLayer(labels)) labels.addTo(map);



    // Rebuild layer control with new PDM layers + permanent layers

    layerControlRef.current = L.control

      .layers(

        {},

        {

          ...overlayLayers,

          'Nomes de lugares': labels,

          'BUPI — Parcelas Cadastrais': cadastro,

          'BUPI — Ortofotos 2018': ortos,

        },

        { collapsed: true },

      )

      .addTo(map);



    // Show/hide local fire hazard tiles based on municipality support

    const localTiles = localTilesRef.current;

    if (localTiles) {

      if (municipality.hasLocalTiles) {

        if (!map.hasLayer(localTiles)) map.addLayer(localTiles);

      } else {

        if (map.hasLayer(localTiles)) map.removeLayer(localTiles);

      }

    }



    // Pan to municipality center

    map.setView(municipality.center, municipality.zoom);

  }, [mapReady, municipalityId]);



  useEffect(() => {

    const cadastro = bupiLayersRef.current?.cadastro;

    if (!cadastro) return;

    const lo = AREA_STEPS[aMinIdx];

    const hi = AREA_STEPS[aMaxIdx];

    const parts: string[] = [];

    if (lo > 0) parts.push(`st_area(shape) >= ${lo}`);

    if (hi !== Infinity) parts.push(`st_area(shape) <= ${hi}`);

    cadastro.setWhere(parts.length ? parts.join(' AND ') : '1=1');

  }, [aMinIdx, aMaxIdx]);



  useEffect(() => {

    const cadastro = bupiLayersRef.current?.cadastro;

    if (!cadastro) return;

    cadastro.setStyle({

      color: BUPI_COLOR, weight: bupiOutline ? 2.2 : 1.5, opacity: 0.95,

      fill: !bupiOutline, fillColor: BUPI_COLOR, fillOpacity: 0.12,

    });

  }, [bupiOutline]);



  const handleOpacity = (val: number) => {

    setOpacity(val);

    localTilesRef.current?.setOpacity(val);

  };



  const handlePdmOpacity = (val: number) => {

    pdmOpacityRef.current = val;

    setPdmOpacity(val);

    Object.values(pdmLayersRef.current).forEach((layer) => layer.setOpacity(val));

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



  // Place compass arrows just outside the actual parcel perimeter.
  // Screen-space offsets keep the arrows readable at different zoom levels.
  const clearParcelDirectionMarkers = () => {
    const map = mapRef.current;
    if (map && directionUpdateRef.current) {
      map.off('zoomend moveend', directionUpdateRef.current);
    }
    directionUpdateRef.current = null;
    if (map && directionMarkersRef.current) map.removeLayer(directionMarkersRef.current);
    directionMarkersRef.current = null;
  };

  const showParcelDirectionMarkers = (parcelLayer: any) => {
    const L = lRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    clearParcelDirectionMarkers();

    const markers = L.layerGroup().addTo(map);
    directionMarkersRef.current = markers;

    const update = () => {
      markers.clearLayers();
      const vertices: any[] = [];
      // Collect the parcel's true exterior vertices, including multipolygons.
      parcelLayer.eachLayer((shape: any) => {
        const collect = (points: any): void => {
          if (!Array.isArray(points)) return;
          if (points.length && typeof points[0]?.lat === 'number') {
            vertices.push(...points);
          } else {
            points.forEach(collect);
          }
        };
        if (shape.getLatLngs) collect(shape.getLatLngs());
      });
      if (!vertices.length) return;

      const points = vertices.map((vertex) => map.latLngToLayerPoint(vertex));
      const north = points.reduce((a, b) => b.y < a.y ? b : a);
      const south = points.reduce((a, b) => b.y > a.y ? b : a);
      const east = points.reduce((a, b) => b.x > a.x ? b : a);
      const west = points.reduce((a, b) => b.x < a.x ? b : a);

      const labels = [
        { point: north, dx: 0, dy: -34, label: '⬆ Norte' },
        { point: south, dx: 0, dy: 34, label: '⬇ Sul' },
        { point: east, dx: 58, dy: 0, label: '➡ Nascente' },
        { point: west, dx: -58, dy: 0, label: '⬅ Poente' },
      ];
      labels.forEach(({ point, dx, dy, label }) => {
        const position = map.layerPointToLatLng(L.point(point.x + dx, point.y + dy));
        L.marker(position, {
          interactive: false,
          keyboard: false,
          zIndexOffset: 1000,
          icon: L.divIcon({
            className: 'bupi-direction-marker',
            html: `<div style="display:inline-block;white-space:nowrap;padding:4px 7px;background:#fff;border:2px solid #0055ff;border-radius:6px;color:#003a9b;font-size:12px;font-weight:700;box-shadow:0 1px 5px #0005;transform:translate(-50%,-50%)">${label}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
        }).addTo(markers);
      });
    };
    directionUpdateRef.current = update;
    map.on('zoomend moveend', update);
    update();
  };

  const searchParcel = async () => {

    const id = processId.trim();

    if (!id) return;

    setSearchResult('A pesquisar...');
    setParcelDirectionsVisible(false);



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



      clearParcelDirectionMarkers();
      if (highlightRef.current) map.removeLayer(highlightRef.current);

      clearRadiusZone();



      const layer = L.geoJSON(geojson, {

        style: { color: '#0055ff', weight: 3, fillColor: '#0055ff', fillOpacity: 0.15 },

      }).addTo(map);

      highlightRef.current = layer;
      showParcelDirectionMarkers(layer);

      map.fitBounds(layer.getBounds(), { maxZoom: 17, padding: [40, 40] });

      applyRadiusZone();



      const p = geojson.features[0].properties;

      const area = p['st_area(shape)'];

      const areaStr = area ? (area / 10000).toFixed(4) + ' ha' : '—';

      setSearchResult(`${p.numeromatriz || '—'} · ${p.freguesiadesc || '—'} · ${areaStr}`);
      setParcelDirectionsVisible(true);



      layer

        .bindPopup(

          `<b>Parcela Cadastral</b><br>

          <b>Artigo matriz:</b> ${p.numeromatriz || '—'}<br>

          <b>Freguesia:</b> ${p.freguesiadesc || '—'}<br>

          <b>Concelho:</b> ${p.concelhodesc || '—'}<br>

          <b>Área:</b> ${areaStr}<br>

          <b>Processo:</b> ${p.processoid || '—'}<br><br>
          <b>🧭 Orientação:</b><br>
          ⬆️ Norte · ⬇️ Sul<br>
          ⬅️ Poente / Ocidente (Oeste) · ➡️ Nascente (Este)`,

        )

        .openPopup();

    } catch (err: unknown) {

      setSearchResult('Erro: ' + (err instanceof Error ? err.message : String(err)));

    }

  };



  const clearRadiusZone = () => {

    if (radiusLayerRef.current && mapRef.current) {

      mapRef.current.removeLayer(radiusLayerRef.current);

      radiusLayerRef.current = null;

    }

  };



  const applyRadiusZone = () => {

    const L = lRef.current;

    const map = mapRef.current;

    if (!L || !map || !highlightRef.current) return;



    const outerMeters = Number.parseFloat(outerRadiusInput);

    const innerMeters = Number.parseFloat(innerRadiusInput);

    if (!Number.isFinite(outerMeters) || outerMeters <= 0) return;

    if (!Number.isFinite(innerMeters) || innerMeters < 0) return;



    clearRadiusZone();



    const parcelGeo = highlightRef.current.toGeoJSON ? highlightRef.current.toGeoJSON() : highlightRef.current.feature;

    const collection = parcelGeo?.type === 'FeatureCollection' ? parcelGeo.features : [parcelGeo].filter(Boolean);

    const targetFeature = collection.find((feature: any) => feature && feature.geometry) ?? null;

    if (!targetFeature) return;



    const zoneLayer = L.layerGroup();



    const outerBuffered = (turf as any).buffer(targetFeature, outerMeters, { units: 'meters', steps: 64 });

    if (outerBuffered && (turf as any).area(outerBuffered) > 0) {

      const outerZone = L.geoJSON(outerBuffered, {

        style: {

          color: '#8b5cf6',

          weight: 2,

          fillColor: '#8b5cf6',

          fillOpacity: 0.14,

        },

      }).addTo(zoneLayer);

      outerZone.bindTooltip(`Zona exterior: ${outerMeters} m`, { sticky: true, direction: 'top' });

    }



    const safeInnerMeters = Math.min(innerMeters, outerMeters);

    if (safeInnerMeters > 0) {

      const innerInset = (turf as any).buffer(targetFeature, -safeInnerMeters, { units: 'meters', steps: 64 });

      if (innerInset && (turf as any).area(innerInset) > 0) {

        const innerZone = L.geoJSON(innerInset, {

          style: {

            color: '#22c55e',

            weight: 2,

            fillColor: '#22c55e',

            fillOpacity: 0,

            dashArray: '8 6',

          },

        }).addTo(zoneLayer);

        innerZone.bindTooltip(`Zona interior: ${safeInnerMeters} m`, { sticky: true, direction: 'top' });

      }

    }



    if (zoneLayer.getLayers().length > 0) {

      zoneLayer.addTo(map);

      radiusLayerRef.current = zoneLayer;

    }

  };



  const clearParcel = () => {
    clearParcelDirectionMarkers();

    if (highlightRef.current && mapRef.current) {

      mapRef.current.removeLayer(highlightRef.current);

      highlightRef.current = null;

    }

    clearRadiusZone();

    setProcessId('');

    setSearchResult('');
    setParcelDirectionsVisible(false);

  };



  const currentMunicipality = MUNICIPALITIES.find((m) => m.id === municipalityId);



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

        <div style={{ marginBottom: 8 }}>

          <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 3 }}>

            Município

          </label>

          <select

            value={municipalityId}

            onChange={(e) => setMunicipalityId(e.target.value)}

            style={{

              width: '100%',

              padding: '4px 6px',

              border: '1px solid #ccc',

              borderRadius: 3,

              fontSize: 13,

              cursor: 'pointer',

            }}

          >

            {MUNICIPALITIES.map((m) => (

              <option key={m.id} value={m.id}>

                {m.name}

              </option>

            ))}

          </select>

        </div>



        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>

          <span style={{ whiteSpace: 'nowrap', color: '#444' }}>Camadas PDM</span>

          <input

            type="range"

            min={0}

            max={1}

            step={0.05}

            value={pdmOpacity}

            onChange={(e) => handlePdmOpacity(parseFloat(e.target.value))}

            style={{ flex: 1 }}

          />

          <span style={{ fontSize: 11, color: '#888', width: 28, textAlign: 'right' }}>

            {Math.round(pdmOpacity * 100)}%

          </span>

        </label>



        {currentMunicipality?.hasLocalTiles && (

          <>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>

              <span style={{ whiteSpace: 'nowrap', color: '#444' }}>Imagem risco</span>

              <input

                type="range"

                min={0}

                max={1}

                step={0.1}

                value={opacity}

                onChange={(e) => handleOpacity(parseFloat(e.target.value))}

                style={{ flex: 1 }}

              />

              <span style={{ fontSize: 11, color: '#888', width: 28, textAlign: 'right' }}>

                {Math.round(opacity * 100)}%

              </span>

            </label>



            <button

              onClick={handleToggle}

              style={{ marginTop: 2, marginBottom: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 13 }}

            >

              {tilesVisible ? 'Ocultar Imagem' : 'Mostrar Imagem'}

            </button>

          </>

        )}



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
            {parcelDirectionsVisible && (
              <div style={{ marginTop: 8, padding: 8, background: '#f0f7ff', border: '1px solid #c8defa', borderRadius: 5, fontSize: 12, color: '#223' }}>
                <div style={{ fontWeight: 700, marginBottom: 5 }}>🧭 Orientação da parcela</div>
                <div style={{ textAlign: 'center' }}>⬆️ Norte</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, margin: '5px 0' }}>
                  <span>⬅️ Poente / Ocidente<br />(Oeste)</span>
                  <span style={{ textAlign: 'right' }}>Nascente (Este) ➡️</span>
                </div>
                <div style={{ textAlign: 'center' }}>⬇️ Sul</div>
                <div style={{ marginTop: 6, fontSize: 11, color: '#555' }}>
                  Direções geográficas; o mapa está orientado com o norte para cima.
                  Não representam parcelas vizinhas nem confrontações legais.
                </div>
              </div>
            )}



          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #eee' }}>

            <div style={{ fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 6 }}>

              Filtrar por área

            </div>

            <div style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666', marginBottom: 2 }}>
                <span>Mín: {fmtStep(AREA_STEPS[aMinIdx])}</span>
                <span>Máx: {fmtStep(AREA_STEPS[aMaxIdx])}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <input
                  type="range"
                  min={0}
                  max={AREA_STEPS.length - 1}
                  value={aMinIdx}
                  onChange={(e) => {
                    const v = Math.min(Number(e.target.value), aMaxIdx);
                    setAMinIdx(v);
                  }}
                  style={{ width: '100%', accentColor: BUPI_COLOR }}
                />
                <input
                  type="range"
                  min={0}
                  max={AREA_STEPS.length - 1}
                  value={aMaxIdx}
                  onChange={(e) => {
                    const v = Math.max(Number(e.target.value), aMinIdx);
                    setAMaxIdx(v);
                  }}
                  style={{ width: '100%', accentColor: BUPI_COLOR }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
              {BUPI_PRESETS.map(([label, lo, hi]) => (
                <button
                  key={label}
                  onClick={() => { setAMinIdx(lo); setAMaxIdx(hi); }}
                  style={{
                    padding: '2px 7px', cursor: 'pointer', fontSize: 11,
                    border: '1px solid #ccc', borderRadius: 3, background: '#f5f5f5',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#444', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={bupiOutline}
                onChange={(e) => setBupiOutline(e.target.checked)}
              />
              Só contorno
            </label>

            {bupiStat && (
              <div style={{ marginTop: 5, fontSize: '0.78em', color: '#ff6b00', fontWeight: 600 }}>
                {bupiStat}
              </div>
            )}

          </div>



          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #ddd' }}>

            <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 6 }}>Zona de raio</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>

              <label style={{ display: 'grid', gap: 3, fontSize: 12, color: '#666' }}>

                Exterior (m)

                <input

                  type="number"

                  min={0}

                  step={10}

                  value={outerRadiusInput}

                  onChange={(e) => setOuterRadiusInput(e.target.value)}

                  style={{ padding: '4px 6px', border: '1px solid #ccc', borderRadius: 3, fontSize: 13 }}

                />

              </label>

              <label style={{ display: 'grid', gap: 3, fontSize: 12, color: '#666' }}>

                Interior (m)

                <input

                  type="number"

                  min={0}

                  step={10}

                  value={innerRadiusInput}

                  onChange={(e) => setInnerRadiusInput(e.target.value)}

                  style={{ padding: '4px 6px', border: '1px solid #ccc', borderRadius: 3, fontSize: 13 }}

                />

              </label>

            </div>



            <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>

              <button

                onClick={applyRadiusZone}

                style={{ padding: '4px 8px', cursor: 'pointer', fontSize: 13 }}

              >

                Aplicar zona

              </button>

              <button

                onClick={clearRadiusZone}

                style={{ padding: '4px 8px', cursor: 'pointer', fontSize: 13 }}

              >

                Limpar

              </button>

            </div>

          </div>

        </div>

      </div>

    </div>

  );

}
