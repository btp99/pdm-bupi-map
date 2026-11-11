'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as turf from '@turf/turf';
import {
  DEFAULT_BAND_M, DICOFRE_CARAPITO, FINDINGS, GAP_COLOR, GROUPS, HYPOTHESIS_COLORS, INTERP_COLOR,
  INTERP_WINDOW, KNOWN_PARCELS, MATRIX_RANGE, NEIGHBOUR_COLOR, RESOLVED_CONSTRAINTS, TARGET_PARCELS,
  ZONE_COLOR, type Confrontacoes, type GroupId, type KnownParcel,
} from '@/config/cume';
import { computeHypotheses, parcelEdges, sideAnchor, type Hypothesis, type Side } from '@/lib/cumeHypotheses';

type LayerKey = 'known' | 'sides' | 'neighbours' | 'zone' | 'gaps' | 'hyps' | 'interp';

const LAYER_LABELS: Record<LayerKey, string> = {
  known: 'Parcelas identificadas',
  sides: 'Lados de cada parcela (com o vizinho)',
  neighbours: `Outros artigos ${MATRIX_RANGE[0]}–${MATRIX_RANGE[1]} (BUPi)`,
  zone: 'Zona estimada do Cume',
  gaps: 'Áreas sem registo BUPi',
  hyps: 'Hipóteses por confrontação',
  interp: 'Posição pela numeração da matriz',
};

const CONFRONT_LAYERS: LayerKey[] = ['sides', 'hyps'];
const DRAW_COLOR = '#84cc16';
const DRAWINGS_KEY = 'cume-desenhos';

interface Drawing { id: number; name: string; feature: any; areaM2: number }

function roundCoords(c: any): any {
  return Array.isArray(c[0]) ? c.map(roundCoords) : c.map((v: number) => Math.round(v * 1e7) / 1e7);
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

const SIDE_SHORT: Record<Side, string> = { norte: 'N', nascente: 'Nasc.', sul: 'S', poente: 'Poe.' };

const ptNF = new Intl.NumberFormat('pt-PT');
const fmtHa = (m2: number) => ptNF.format(Number((m2 / 10000).toFixed(m2 >= 10000 ? 2 : 3))) + ' ha';
const fmtM2 = (m2: number) => ptNF.format(Math.round(m2)) + ' m²';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function matrixNumbers(numeromatriz: unknown): number[] {
  if (typeof numeromatriz !== 'string') return [];
  return Array.from(numeromatriz.matchAll(/R-(\d+)/g), (m) => Number(m[1]));
}

async function getFC(url: string): Promise<any> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || `Erro ${res.status}`);
  return json;
}

function confrontHtml(c?: Confrontacoes) {
  if (!c) return '';
  const rows = ([['Norte', c.norte], ['Nascente', c.nascente], ['Sul', c.sul], ['Poente', c.poente]] as const)
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="color:#64748b;padding-right:8px">${k}</td><td>${esc(v!)}</td></tr>`)
    .join('');
  return `<table style="font-size:12px;margin-top:4px">${rows}</table>`;
}

interface GapInfo { id: number; areaM2: number; center: [number, number]; touches: number[] }
interface InterpInfo { artigo: number; center: [number, number] | null; used: number[]; inGap: boolean }

export default function CumeMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const groupsRef = useRef<Partial<Record<LayerKey, any>>>({});
  const parcelLayersRef = useRef<Map<number, any>>(new Map());

  const [status, setStatus] = useState('A carregar parcelas do BUPi…');
  const [error, setError] = useState('');
  const [visible, setVisible] = useState<Record<LayerKey, boolean>>({
    known: true, sides: true, neighbours: true, zone: true, gaps: true, hyps: true, interp: true,
  });
  const [found, setFound] = useState<Map<number, { areaM2: number }>>(new Map());
  const [gaps, setGaps] = useState<GapInfo[]>([]);
  const [zoneArea, setZoneArea] = useState(0);
  const [interp, setInterp] = useState<InterpInfo[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [dataReady, setDataReady] = useState(false);
  const [bandM, setBandM] = useState(DEFAULT_BAND_M);
  const [showWeak, setShowWeak] = useState(false);
  const [hyps, setHyps] = useState<Hypothesis[]>([]);
  const [showConfront, setShowConfront] = useState(false);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [copied, setCopied] = useState('');
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const drawnRef = useRef<any>(null);
  const drawNamesRef = useRef<Map<number, string>>(new Map());
  const knownByArtigoRef = useRef<Map<number, any>>(new Map());
  const gapUnionRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const hypLayersRef = useRef<Map<string, any>>(new Map());

  const targetTotal = useMemo(() => TARGET_PARCELS.reduce((s, t) => s + t.areaM2, 0), []);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current) return;
      leafletRef.current = L;

      const map = L.map(containerRef.current, { center: [40.7752, -7.4765], zoom: 16, maxZoom: 19 });
      mapRef.current = map;
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri · Parcelas © BUPI / DGTERRITÓRIO', maxZoom: 19 },
      ).addTo(map);
      L.control.scale({ imperial: false }).addTo(map);

      const groups: Record<LayerKey, any> = {
        zone: L.layerGroup().addTo(map),
        neighbours: L.layerGroup().addTo(map),
        gaps: L.layerGroup().addTo(map),
        hyps: L.layerGroup().addTo(map),
        known: L.layerGroup().addTo(map),
        sides: L.layerGroup().addTo(map),
        interp: L.layerGroup().addTo(map),
      };
      groupsRef.current = groups;

      // Desenho de polígonos (leaflet-draw usa o L global).
      (window as any).L = L;
      await import('leaflet-draw');
      if (cancelled) return;
      const LD = L as any;
      LD.drawLocal.draw.toolbar.buttons.polygon = 'Desenhar polígono';
      LD.drawLocal.draw.toolbar.buttons.rectangle = 'Desenhar retângulo';
      LD.drawLocal.draw.toolbar.actions.text = 'Cancelar';
      LD.drawLocal.draw.toolbar.finish.text = 'Terminar';
      LD.drawLocal.draw.toolbar.undo.text = 'Apagar último ponto';
      LD.drawLocal.draw.handlers.polygon.tooltip = {
        start: 'Clica para começar o polígono.',
        cont: 'Clica para continuar.',
        end: 'Clica no primeiro ponto para fechar.',
      };
      LD.drawLocal.edit.toolbar.buttons.edit = 'Editar desenhos';
      LD.drawLocal.edit.toolbar.buttons.remove = 'Apagar desenhos';
      LD.drawLocal.edit.toolbar.actions.save.text = 'Guardar';
      LD.drawLocal.edit.toolbar.actions.cancel.text = 'Cancelar';
      LD.drawLocal.edit.toolbar.actions.clearAll.text = 'Apagar tudo';

      const drawn = new L.FeatureGroup().addTo(map);
      drawnRef.current = drawn;
      const shapeOptions = { color: DRAW_COLOR, weight: 3, fillColor: DRAW_COLOR, fillOpacity: 0.25 };
      map.addControl(new LD.Control.Draw({
        position: 'topright',
        edit: { featureGroup: drawn },
        draw: {
          polygon: { allowIntersection: false, showArea: true, shapeOptions },
          rectangle: { shapeOptions },
          polyline: false, circle: false, marker: false, circlemarker: false,
        },
      }));
      map.on(LD.Draw.Event.CREATED, (ev: any) => {
        drawn.addLayer(ev.layer);
        drawNamesRef.current.set(L.stamp(ev.layer), `Desenho ${drawn.getLayers().length}`);
        syncDrawings();
      });
      map.on(LD.Draw.Event.EDITED, () => syncDrawings());
      map.on(LD.Draw.Event.DELETED, () => syncDrawings());

      // Repor desenhos guardados neste browser.
      try {
        const saved = JSON.parse(localStorage.getItem(DRAWINGS_KEY) || '[]');
        if (Array.isArray(saved)) addFeaturesToDrawn(saved);
      } catch { /* sem armazenamento disponível */ }

      try {
        // 1. Parcelas indicadas (por processo BUPi)
        const knownFC = await getFC(`/api/bupi/batch?processoids=${KNOWN_PARCELS.map((p) => p.processo).join(',')}`);
        if (cancelled) return;
        const byProc = new Map<number, any>();
        for (const f of knownFC.features) byProc.set(f.properties.processoid, f);

        const foundMap = new Map<number, { areaM2: number }>();
        const centroidByArtigo = new Map<number, [number, number]>();
        const cumeFeatures: any[] = [];

        for (const p of KNOWN_PARCELS) {
          const f = byProc.get(p.processo);
          if (!f) continue;
          const areaM2 = turf.area(f);
          foundMap.set(p.processo, { areaM2 });
          knownByArtigoRef.current.set(p.artigo, f);
          const c = turf.centroid(f).geometry.coordinates as [number, number];
          centroidByArtigo.set(p.artigo, c);
          if (p.group === 'cume' || p.group === 'cume-registo') cumeFeatures.push(f);

          const color = GROUPS[p.group].color;
          const layer = L.geoJSON(f, {
            style: { color, weight: 2.5, fillColor: color, fillOpacity: 0.3 },
          });
          layer.bindPopup(knownPopup(p, f, areaM2), { maxWidth: 320 });
          layer.bindTooltip(String(p.artigo), {
            permanent: true, direction: 'center', className: 'cume-label',
          });
          layer.addTo(groups.known);
          parcelLayersRef.current.set(p.processo, layer);

          // Rótulo de cada lado com o vizinho das confrontações (lados rodados com a parcela).
          const conf = p.doc?.confrontacoes;
          if (conf) {
            (Object.keys(conf) as Side[]).forEach((side) => {
              const name = conf[side];
              const at = name ? sideAnchor(f, side, 12) : null;
              if (!at || !name) return;
              L.marker([at[1], at[0]], {
                interactive: false,
                icon: L.divIcon({
                  className: 'cume-side',
                  html: `<span>${SIDE_SHORT[side]} · ${esc(name)}</span>`,
                  iconSize: [0, 0],
                }),
              }).addTo(groups.sides);
            });
          }
        }
        setFound(foundMap);

        // 2. Zona estimada do Cume: envolvente das parcelas do Cume + 40 m
        let zone: any = null;
        if (cumeFeatures.length >= 3) {
          const hull = turf.convex(turf.featureCollection(cumeFeatures));
          if (hull) {
            zone = turf.buffer(hull, 40, { units: 'meters' });
            if (zone) {
              setZoneArea(turf.area(zone));
              L.geoJSON(zone, {
                style: { color: ZONE_COLOR, weight: 2, dashArray: '8 6', fill: false },
                interactive: false,
              }).addTo(groups.zone);
              map.fitBounds(L.geoJSON(zone).getBounds(), { padding: [30, 30] });
            }
          }
        }

        setStatus('A carregar artigos vizinhos da matriz…');

        // 3. Outros artigos do intervalo da matriz (contexto + interpolação)
        const knownProcs = new Set(KNOWN_PARCELS.map((p) => p.processo));
        const rangeFC = await getFC(
          `/api/bupi/batch?dicofre=${DICOFRE_CARAPITO}&from=${MATRIX_RANGE[0]}&to=${MATRIX_RANGE[1]}`,
        );
        if (cancelled) return;
        for (const f of rangeFC.features) {
          const nums = matrixNumbers(f.properties.numeromatriz);
          const c = turf.centroid(f).geometry.coordinates as [number, number];
          for (const n of nums) if (!centroidByArtigo.has(n)) centroidByArtigo.set(n, c);
          if (knownProcs.has(f.properties.processoid)) continue;
          const layer = L.geoJSON(f, {
            style: { color: NEIGHBOUR_COLOR, weight: 1.2, fillColor: NEIGHBOUR_COLOR, fillOpacity: 0.08 },
          });
          const label = nums.filter((n) => n >= MATRIX_RANGE[0] && n <= MATRIX_RANGE[1]).join(' / ');
          layer.bindTooltip(label, { permanent: true, direction: 'center', className: 'cume-label cume-label-dim' });
          layer.bindPopup(
            `<b>Artigo ${esc(String(f.properties.numeromatriz))}</b><br>` +
            `Processo BUPi ${f.properties.processoid}<br>Área BUPi: ${fmtM2(turf.area(f))}`,
          );
          layer.addTo(groups.neighbours);
        }

        // 4. Áreas sem registo dentro da zona do Cume
        if (zone) {
          setStatus('A calcular áreas sem registo…');
          const [minX, minY, maxX, maxY] = turf.bbox(zone);
          const bboxFC = await getFC(`/api/bupi/batch?bbox=${[minX, minY, maxX, maxY].map((v) => v.toFixed(6)).join(',')}`);
          if (cancelled) return;
          const gapInfos = computeGaps(zone, bboxFC.features, byProc);
          gapInfos.forEach((g) => {
            L.geoJSON(g.feature, {
              style: { color: GAP_COLOR, weight: 2, fillColor: GAP_COLOR, fillOpacity: 0.28, dashArray: '4 4' },
            })
              .bindPopup(
                `<b>Área sem registo BUPi #${g.id}</b><br>${fmtHa(g.areaM2)}` +
                (g.touches.length ? `<br>Encosta a: ${g.touches.join(', ')}` : '') +
                `<br><span style="color:#64748b;font-size:12px">Terrenos de José Pedro Pinto (matriz): ${fmtHa(targetTotal)}</span>`,
              )
              .bindTooltip(`Sem registo · ${fmtHa(g.areaM2)}`, { direction: 'center', className: 'cume-label cume-label-gap' })
              .addTo(groups.gaps);
          });
          setGaps(gapInfos.map(({ feature: _f, ...rest }) => rest));
          gapUnionRef.current = unionAll(gapInfos.map((g) => g.feature));

          // 5. Interpolação pela numeração da matriz
          const interpInfos: InterpInfo[] = TARGET_PARCELS.map((t) => {
            const used: number[] = [];
            let wx = 0, wy = 0, ws = 0;
            for (let d = 1; d <= INTERP_WINDOW; d++) {
              for (const n of [t.artigo - d, t.artigo + d]) {
                const c = centroidByArtigo.get(n);
                if (!c) continue;
                const w = 1 / d;
                wx += c[0] * w; wy += c[1] * w; ws += w; used.push(n);
              }
            }
            if (!ws) return { artigo: t.artigo, center: null, used, inGap: false };
            const center: [number, number] = [wx / ws, wy / ws];
            const pt = turf.point(center);
            const inGap = gapInfos.some((g) => turf.booleanPointInPolygon(pt, g.feature));
            const latlng: [number, number] = [center[1], center[0]];
            used.forEach((n) => {
              const c = centroidByArtigo.get(n)!;
              L.polyline([latlng, [c[1], c[0]]], {
                color: INTERP_COLOR, weight: 1, opacity: 0.7, dashArray: '2 4', interactive: false,
              }).addTo(groups.interp);
            });
            L.circleMarker(latlng, {
              radius: 9, color: '#111827', weight: 2, fillColor: INTERP_COLOR, fillOpacity: 0.95,
            })
              .bindTooltip(`${t.artigo}?`, { permanent: true, direction: 'top', offset: [0, -8], className: 'cume-label cume-label-interp' })
              .bindPopup(
                `<b>Art. ${t.artigo} (estimativa)</b><br>${esc(t.titular)} · ${fmtM2(t.areaM2)} (matriz)` +
                confrontHtml(t.confrontacoes) +
                `<div style="margin-top:6px;font-size:12px;color:#64748b">Média dos artigos com números próximos: ${used.sort((a, b) => a - b).join(', ')}. ` +
                `A numeração só dá uma indicação aproximada.</div>`,
                { maxWidth: 320 },
              )
              .addTo(groups.interp);
            return { artigo: t.artigo, center, used, inGap };
          });
          setInterp(interpInfos);
        }

        setStatus('');
        setDataReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setStatus('');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      parcelLayersRef.current.clear();
    };
  }, [targetTotal]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (Object.keys(visible) as LayerKey[]).forEach((k) => {
      const g = groupsRef.current[k];
      if (!g) return;
      const on = visible[k] && (!CONFRONT_LAYERS.includes(k) || showConfront);
      if (on && !map.hasLayer(g)) map.addLayer(g);
      if (!on && map.hasLayer(g)) map.removeLayer(g);
    });
  }, [visible, status, showConfront]);

  // ---- Desenhos ----
  function syncDrawings() {
    const L = leafletRef.current;
    const drawn = drawnRef.current;
    if (!L || !drawn) return;
    const list: Drawing[] = [];
    drawn.eachLayer((layer: any) => {
      const id = L.stamp(layer);
      const name = drawNamesRef.current.get(id) ?? `Desenho ${id}`;
      const gj = layer.toGeoJSON();
      const areaM2 = turf.area(gj);
      const feature = {
        type: 'Feature',
        properties: { nome: name, area_m2: Math.round(areaM2), crs: 'EPSG:4326 (WGS84, lon/lat)' },
        geometry: { type: gj.geometry.type, coordinates: roundCoords(gj.geometry.coordinates) },
      };
      if (layer.getTooltip()) layer.setTooltipContent(name);
      else layer.bindTooltip(name, { permanent: true, direction: 'center', className: 'cume-label cume-label-draw' });
      list.push({ id, name, feature, areaM2 });
    });
    setDrawings(list);
    try { localStorage.setItem(DRAWINGS_KEY, JSON.stringify(list.map((d) => d.feature))); } catch { /* ignorar */ }
  }

  function addFeaturesToDrawn(features: any[]) {
    const L = leafletRef.current;
    const drawn = drawnRef.current;
    if (!L || !drawn) return 0;
    let n = 0;
    for (const f of features) {
      const geom = f?.type === 'Feature' ? f.geometry : f;
      if (!geom || !/Polygon/.test(geom.type)) continue;
      const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
      for (const coords of polys) {
        const layer = L.polygon(
          coords.map((ring: number[][]) => ring.map(([lon, lat]) => [lat, lon])),
          { color: DRAW_COLOR, weight: 3, fillColor: DRAW_COLOR, fillOpacity: 0.25 },
        );
        drawn.addLayer(layer);
        drawNamesRef.current.set(L.stamp(layer), f?.properties?.nome || `Desenho ${drawn.getLayers().length}`);
        n++;
      }
    }
    syncDrawings();
    return n;
  }

  const renameDrawing = (id: number, name: string) => {
    drawNamesRef.current.set(id, name);
    syncDrawings();
  };

  const removeDrawing = (id: number) => {
    const layer = drawnRef.current?.getLayer(id);
    if (layer) drawnRef.current.removeLayer(layer);
    drawNamesRef.current.delete(id);
    syncDrawings();
  };

  const focusDrawing = (id: number) => {
    const layer = drawnRef.current?.getLayer(id);
    if (layer && mapRef.current) mapRef.current.fitBounds(layer.getBounds(), { maxZoom: 18, padding: [60, 60] });
  };

  const copyDrawings = async (list: Drawing[], label: string) => {
    const payload = list.length === 1
      ? list[0].feature
      : { type: 'FeatureCollection', features: list.map((d) => d.feature) };
    const ok = await copyText(JSON.stringify(payload));
    setCopied(ok ? `${label} copiado` : 'Não foi possível copiar');
    setTimeout(() => setCopied(''), 2500);
  };

  const importDrawings = () => {
    try {
      const json = JSON.parse(importText);
      const features = json.type === 'FeatureCollection' ? json.features : [json];
      const n = addFeaturesToDrawn(features);
      setImportMsg(n ? `${n} polígono(s) adicionados.` : 'Não encontrei polígonos nesse texto.');
      if (n) {
        setImportText('');
        const drawn = drawnRef.current;
        if (drawn && mapRef.current) mapRef.current.fitBounds(drawn.getBounds(), { maxZoom: 18, padding: [60, 60] });
      }
    } catch {
      setImportMsg('Texto inválido: cola um GeoJSON (Feature, FeatureCollection ou Polygon).');
    }
  };

  // Hipóteses por confrontação: recalcula quando muda a largura da faixa.
  useEffect(() => {
    if (!dataReady) return;
    setHyps(computeHypotheses(knownByArtigoRef.current, gapUnionRef.current, bandM));
  }, [dataReady, bandM]);

  useEffect(() => {
    const L = leafletRef.current;
    const group = groupsRef.current.hyps;
    if (!L || !group) return;
    group.clearLayers();
    hypLayersRef.current.clear();
    hyps.forEach((h, i) => {
      if (!h.strong && !showWeak) return;
      const color = HYPOTHESIS_COLORS[i % HYPOTHESIS_COLORS.length];
      const layer = L.geoJSON(h.feature, {
        style: {
          color,
          weight: h.kind === 'forte' ? 2.5 : 1.5,
          dashArray: h.kind === 'forte' ? undefined : h.kind === 'ligada' ? '10 5' : '6 4',
          fillColor: color,
          fillOpacity: h.kind === 'forte' ? 0.4 : h.kind === 'ligada' ? 0.18 : 0.12,
        },
      })
        .bindTooltip(`${h.name}${h.kind === 'ligada' ? ' (ligada)' : h.kind === 'fraca' ? ' ?' : ''}`, {
          permanent: h.kind !== 'fraca', direction: 'center', className: 'cume-label cume-label-hyp',
        })
        .bindPopup(hypPopup(h), { maxWidth: 320 })
        .addTo(group);
      hypLayersRef.current.set(h.key, layer);
    });
  }, [hyps, showWeak]);

  const focusHyp = (key: string) => {
    const layer = hypLayersRef.current.get(key);
    if (!layer || !mapRef.current) return;
    mapRef.current.fitBounds(layer.getBounds(), { maxZoom: 18, padding: [60, 60] });
    layer.openPopup();
  };

  const focusParcel = (proc: number) => {
    const layer = parcelLayersRef.current.get(proc);
    if (!layer || !mapRef.current) return;
    mapRef.current.fitBounds(layer.getBounds(), { maxZoom: 18, padding: [60, 60] });
    layer.openPopup();
  };

  const focusPoint = (c: [number, number] | null, zoom = 18) => {
    if (c && mapRef.current) mapRef.current.setView([c[1], c[0]], zoom);
  };

  const grouped = (Object.keys(GROUPS) as GroupId[]).map((g) => ({
    id: g, parcels: KNOWN_PARCELS.filter((p) => p.group === g),
  }));
  const biggestGap = gaps[0];

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        .cume-label { background: rgba(17,24,39,.78); color: #fff; border: none; box-shadow: none;
          font-size: 11px; font-weight: 600; padding: 1px 5px; border-radius: 4px; }
        .cume-label::before { display: none; }
        .cume-label-dim { background: rgba(71,85,105,.6); font-weight: 500; font-size: 10px; }
        .cume-label-gap { background: rgba(8,145,178,.9); }
        .cume-label-interp { background: #facc15; color: #111827; }
        .cume-label-hyp { background: rgba(88,28,135,.85); }
        .cume-label-draw { background: rgba(63,98,18,.9); }
        .cume-panel input[type=text], .cume-panel textarea { width: 100%; border: 1px solid #cbd5e1;
          border-radius: 4px; padding: 3px 6px; font: inherit; font-size: 12px; }
        .cume-btn { border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 4px; padding: 2px 8px;
          font-size: 12px; cursor: pointer; }
        .cume-btn:hover { background: #e2e8f0; }
        .cume-side span { position: absolute; transform: translate(-50%, -50%); white-space: nowrap;
          background: rgba(255,255,255,.88); color: #7c2d12; border: 1px solid #fdba74;
          font-size: 10px; font-weight: 600; padding: 0 4px; border-radius: 3px; pointer-events: none; }
        .cume-panel button.link { background: none; border: none; padding: 0; color: #0f172a;
          cursor: pointer; text-align: left; font: inherit; }
        .cume-panel button.link:hover { text-decoration: underline; }
      `}</style>

      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      <button
        onClick={() => setPanelOpen((v) => !v)}
        style={{
          position: 'absolute', zIndex: 1001, top: 10, left: panelOpen ? 372 : 10, padding: '6px 10px',
          background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 13,
        }}
      >
        {panelOpen ? '◀ Fechar' : '▶ Painel'}
      </button>

      {panelOpen && (
        <aside
          className="cume-panel"
          style={{
            position: 'absolute', zIndex: 1000, top: 0, left: 0, bottom: 0, width: 360, overflowY: 'auto',
            background: 'rgba(255,255,255,.97)', borderRight: '1px solid #e2e8f0', padding: '14px 16px',
            fontSize: 13, lineHeight: 1.45, color: '#0f172a',
          }}
        >
          <h1 style={{ fontSize: 17, fontWeight: 600, marginBottom: 2 }}>Cume · Carapito</h1>
          <p style={{ color: '#64748b', marginBottom: 10 }}>
            Parcelas BUPi conhecidas e estimativa de onde ficam os terrenos de José Pedro Pinto.{' '}
            <a href="/" style={{ color: '#2563eb' }}>Voltar ao mapa</a>
          </p>

          {status && <p style={{ color: '#0369a1', marginBottom: 8 }}>{status}</p>}
          {error && <p style={{ color: '#b91c1c', marginBottom: 8 }}>Erro ao consultar o BUPi: {error}</p>}

          <Section title="Camadas">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontWeight: 600 }}>
              <input type="checkbox" checked={showConfront} onChange={(e) => setShowConfront(e.target.checked)} />
              Mostrar confrontações (lados e hipóteses)
            </label>
            {(Object.keys(LAYER_LABELS) as LayerKey[]).filter((k) => showConfront || !CONFRONT_LAYERS.includes(k)).map((k) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={visible[k]}
                  onChange={(e) => setVisible((v) => ({ ...v, [k]: e.target.checked }))}
                />
                <Swatch layer={k} />
                {LAYER_LABELS[k]}
              </label>
            ))}
          </Section>

          <Section title="Os meus desenhos">
            <p style={{ color: '#475569', marginBottom: 6 }}>
              Usa os botões no canto superior direito do mapa para desenhar onde achas que o terreno fica.
              Depois copia o polígono (GeoJSON em coordenadas WGS84) e cola-o na conversa.
            </p>
            {drawings.length === 0 && <p style={{ color: '#94a3b8' }}>Ainda não há desenhos.</p>}
            {drawings.map((d) => (
              <div key={d.id} style={{ marginBottom: 8 }}>
                <input type="text" value={d.name} onChange={(e) => renameDrawing(d.id, e.target.value)} aria-label="Nome do desenho" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <span style={{ fontSize: 12, color: '#475569', flex: 1 }}>{fmtHa(d.areaM2)} · {fmtM2(d.areaM2)}</span>
                  <button className="cume-btn" onClick={() => copyDrawings([d], d.name)}>Copiar</button>
                  <button className="cume-btn" onClick={() => focusDrawing(d.id)}>Ver</button>
                  <button className="cume-btn" onClick={() => removeDrawing(d.id)}>Apagar</button>
                </div>
              </div>
            ))}
            {drawings.length > 1 && (
              <button className="cume-btn" onClick={() => copyDrawings(drawings, 'Todos os desenhos')}>Copiar todos</button>
            )}
            {copied && <p style={{ color: '#15803d', fontSize: 12, marginTop: 4 }}>{copied}</p>}
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', color: '#334155' }}>Colar um polígono</summary>
              <textarea
                rows={3} value={importText} placeholder='{"type":"Feature","geometry":{"type":"Polygon",...}}'
                onChange={(e) => { setImportText(e.target.value); setImportMsg(''); }}
                style={{ marginTop: 4 }}
              />
              <button className="cume-btn" onClick={importDrawings} disabled={!importText.trim()}>Mostrar no mapa</button>
              {importMsg && <p style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{importMsg}</p>}
            </details>
          </Section>

          <Section title="Estimativa">
            {zoneArea > 0 && <p>Zona estimada do Cume: <b>{fmtHa(zoneArea)}</b>.</p>}
            {biggestGap ? (
              <p style={{ marginTop: 4 }}>
                Maior área sem registo:{' '}
                <button className="link" onClick={() => focusPoint(biggestGap.center, 17)}>
                  <b>{fmtHa(biggestGap.areaM2)}</b>
                </button>
                {biggestGap.touches.length > 0 && <> (encosta a {biggestGap.touches.join(', ')})</>}.
                <br />
                Terrenos de José Pedro Pinto na matriz: <b>{fmtHa(targetTotal)}</b>.
              </p>
            ) : !status && !error && <p>Não foram encontradas áreas sem registo.</p>}
            {gaps.length > 1 && (
              <p style={{ marginTop: 4, color: '#475569' }}>
                Outras áreas sem registo:{' '}
                {gaps.slice(1, 6).map((g, i) => (
                  <span key={g.id}>
                    {i > 0 && ', '}
                    <button className="link" onClick={() => focusPoint(g.center, 17)}>{fmtHa(g.areaM2)}</button>
                  </span>
                ))}
              </p>
            )}
          </Section>

          {showConfront && (
          <Section title="Hipóteses por confrontação">
            <p style={{ color: '#475569', marginBottom: 6 }}>
              Para cada vizinho dos documentos, uma faixa encostada ao lado certo de cada parcela onde ele aparece,
              cortada pelas áreas sem registo. Onde as faixas se sobrepõem fica a hipótese forte. Quando não se cruzam,
              a hipótese &quot;ligada&quot; junta-as pela área livre entre elas, como faria um terreno comprido.
            </p>
            <label style={{ display: 'block', marginBottom: 4 }}>
              Largura da faixa: <b>{bandM} m</b>
              <input
                type="range" min={40} max={160} step={10} value={bandM}
                onChange={(e) => setBandM(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={showWeak} onChange={(e) => setShowWeak(e.target.checked)} />
              Mostrar também as hipóteses fracas (só uma confrontação)
            </label>
            {!dataReady && !error && <p style={{ color: '#94a3b8' }}>À espera dos dados…</p>}
            {hyps.filter((h) => h.strong || showWeak).map((h) => {
              const i = hyps.indexOf(h);
              return (
                <div key={h.key} style={{ marginBottom: 6 }}>
                  <button className="link" onClick={() => focusHyp(h.key)}>
                    <span style={{
                      width: 10, height: 10, borderRadius: 2, display: 'inline-block', marginRight: 6,
                      background: HYPOTHESIS_COLORS[i % HYPOTHESIS_COLORS.length],
                    }} />
                    <b>{h.name}</b> · {fmtHa(h.areaM2)}{h.kind === 'forte' ? '' : ` (${h.kind})`}
                  </button>
                  <div style={{ fontSize: 12, color: '#475569', paddingLeft: 16 }}>
                    {h.kind === 'ligada' ? 'liga: ' : ''}{h.used.map((c) => c.text).join(h.kind === 'ligada' ? ', ' : ' e ')}
                    {h.missing.length > 0 && <span style={{ color: '#94a3b8' }}> · não encaixa: {h.missing.map((c) => c.text).join(', ')}</span>}
                  </div>
                </div>
              );
            })}
            {dataReady && hyps.length > 0 && !hyps.some((h) => h.strong) && !showWeak && (
              <p style={{ color: '#94a3b8' }}>Nenhuma hipótese forte com esta largura. Experimenta aumentar a faixa.</p>
            )}
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Ignoradas porque já correspondem a parcelas registadas: {RESOLVED_CONSTRAINTS.map((r) => `${r.side} do ${r.artigo} → ${r.resolvedTo}`).join('; ')}.
              Os nomes são dos donos de 1976. A terra de um "vizinho" pode hoje ser de José Pedro Pinto.
            </p>
          </Section>
          )}

          <Section title="Terrenos de José Pedro Pinto (sem BUPi)">
            {TARGET_PARCELS.map((t) => {
              const i = interp.find((x) => x.artigo === t.artigo);
              return (
                <div key={t.artigo} style={{ marginBottom: 8 }}>
                  <button className="link" onClick={() => focusPoint(i?.center ?? null)}>
                    <b>Art. {t.artigo}</b> · {fmtHa(t.areaM2)} · {t.titular}
                  </button>
                  <div style={{ color: '#475569', fontSize: 12 }}>
                    N: {t.confrontacoes.norte} · S: {t.confrontacoes.sul} · Nasc.: {t.confrontacoes.nascente} · Poe.: {t.confrontacoes.poente}
                  </div>
                  {i && (
                    <div style={{ fontSize: 12, color: i.center ? '#854d0e' : '#94a3b8' }}>
                      {i.center
                        ? `Pela matriz: perto de ${i.used.slice().sort((a, b) => a - b).join(', ')}${i.inGap ? ', dentro de uma área sem registo' : ''}`
                        : 'Sem artigos próximos no BUPi para interpolar'}
                    </div>
                  )}
                </div>
              );
            })}
          </Section>

          <Section title="Leitura das confrontações">
            <ul style={{ paddingLeft: 16 }}>
              {FINDINGS.map((f, i) => <li key={i} style={{ marginBottom: 4 }}>{f}</li>)}
            </ul>
          </Section>

          <Section title="Parcelas identificadas">
            {grouped.map(({ id, parcels }) => (
              <div key={id} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 2 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: GROUPS[id].color, display: 'inline-block' }} />
                  {GROUPS[id].label}
                </div>
                {parcels.map((p) => {
                  const f = found.get(p.processo);
                  return (
                    <div key={p.processo} style={{ paddingLeft: 18 }}>
                      <button className="link" onClick={() => focusParcel(p.processo)} disabled={!f}>
                        Art. {p.artigo} · proc. {p.processo}
                        {f ? ` · ${fmtM2(f.areaM2)}` : status ? '' : ' · não encontrado'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </Section>

          <p style={{ color: '#94a3b8', fontSize: 11, marginTop: 8 }}>
            Estimativa feita com dados abertos do BUPi e as confrontações das matrizes de 1976. Não substitui um levantamento topográfico.
          </p>
        </aside>
      )}
    </div>
  );
}

function knownPopup(p: KnownParcel, f: any, areaM2: number) {
  const d = p.doc;
  return (
    `<div style="font-size:13px">` +
    `<b>Art. ${p.artigo}</b> · ${esc(GROUPS[p.group].label)}<br>` +
    `Processo BUPi ${p.processo}<br>` +
    `Área BUPi: ${fmtM2(areaM2)}${d?.areaDoc ? ` · registo: ${esc(d.areaDoc)}` : ''}<br>` +
    sidesInfo(f) +
    (d?.titular ? `Titular: ${esc(d.titular)}<br>` : '') +
    confrontHtml(d?.confrontacoes) +
    (d?.nota ? `<div style="margin-top:6px;color:#854d0e;font-size:12px">${esc(d.nota)}</div>` : '') +
    (f.properties?.numeromatriz ? `<div style="margin-top:4px;color:#94a3b8;font-size:11px">BUPi: ${esc(String(f.properties.numeromatriz))}</div>` : '') +
    `</div>`
  );
}

function sidesInfo(f: any) {
  const { edges, rotation } = parcelEdges(f);
  if (Math.abs(rotation) < 10) return '';
  const card = (b: number) => ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(b / 45) % 8];
  const bySide = (['norte', 'nascente', 'sul', 'poente'] as Side[]).map((s) => {
    const e = edges.filter((x) => x.side === s).sort((a, b) => b.length - a.length)[0];
    return e ? `${SIDE_SHORT[s]} = lado virado a ${card(e.bearing)}` : '';
  }).filter(Boolean).join(' · ');
  return `<div style="font-size:11px;color:#9a3412;margin:2px 0">Parcela rodada ${Math.abs(rotation)}°: ${bySide}</div>`;
}

function hypPopup(h: Hypothesis) {
  return (
    `<div style="font-size:13px"><b>${esc(h.name)}</b> (hipótese ${h.kind})<br>` +
    (h.kind === 'ligada' ? `<div style="font-size:12px;color:#475569">As faixas não se cruzam todas: esta é a área livre entre elas, a forma mínima de um terreno que toque em todos estes lados.</div>` : '') +
    `Área possível: ${fmtHa(h.areaM2)}<br>` +
    `<div style="margin-top:4px">Encaixa: ${h.used.map((c) => esc(c.text)).join('; ')}</div>` +
    (h.missing.length ? `<div style="color:#94a3b8">Não encaixa: ${h.missing.map((c) => esc(c.text)).join('; ')}</div>` : '') +
    `<div style="margin-top:6px;font-size:11px;color:#64748b">Nome do dono em 1976, tirado das confrontações. Não confirma a propriedade atual.</div></div>`
  );
}

function unionAll(features: any[]): any {
  if (!features.length) return null;
  if (features.length === 1) return features[0];
  try { return turf.union(turf.featureCollection(features)); } catch { return features[0]; }
}

function computeGaps(zone: any, features: any[], knownByProc: Map<number, any>) {
  const polys = features.filter((f) => f.geometry && /Polygon/.test(f.geometry.type));
  if (!polys.length) return [];

  let registered: any = null;
  try {
    registered = turf.union(turf.featureCollection(polys));
  } catch {
    // Geometria inválida numa parcela: unir uma a uma e ignorar as que falham.
    for (const f of polys) {
      try {
        registered = registered ? turf.union(turf.featureCollection([registered, f])) : f;
      } catch { /* ignorar */ }
    }
  }
  if (!registered) return [];

  let diff: any = null;
  try {
    diff = turf.difference(turf.featureCollection([zone, registered]));
  } catch {
    return [];
  }
  if (!diff) return [];

  // Abertura morfológica (−4 m / +4 m) para tirar as fendas entre parcelas vizinhas.
  const shrunk: any = turf.buffer(diff, -4, { units: 'meters' });
  const opened: any = shrunk ? turf.buffer(shrunk, 4, { units: 'meters' }) : null;
  if (!opened) return [];

  const knownList = Array.from(knownByProc.values());
  const artigoByProc = new Map(KNOWN_PARCELS.map((p) => [p.processo, p.artigo]));

  const parts = turf.flatten(opened).features
    .map((feature: any) => ({ feature, areaM2: turf.area(feature) }))
    .filter((g: any) => g.areaM2 >= 1500)
    .sort((a: any, b: any) => b.areaM2 - a.areaM2);

  return parts.map((g: any, i: number) => {
    const ring: any = turf.buffer(g.feature, 15, { units: 'meters' });
    const touches = ring
      ? knownList
          .filter((k) => { try { return turf.booleanIntersects(ring, k); } catch { return false; } })
          .map((k) => artigoByProc.get(k.properties.processoid))
          .filter((a): a is number => typeof a === 'number')
          .sort((a, b) => a - b)
      : [];
    const center = turf.pointOnFeature(g.feature).geometry.coordinates as [number, number];
    return { id: i + 1, feature: g.feature, areaM2: g.areaM2, center, touches };
  });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, marginTop: 10 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', color: '#334155', marginBottom: 6 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Swatch({ layer }: { layer: LayerKey }) {
  const base = { width: 14, height: 14, borderRadius: 3, display: 'inline-block', flex: '0 0 auto' } as const;
  switch (layer) {
    case 'sides': return <span style={{ ...base, background: '#fff', border: '1px solid #fdba74', fontSize: 9, lineHeight: '12px', textAlign: 'center', color: '#7c2d12' }}>N</span>;
    case 'known': return <span style={{ ...base, background: `linear-gradient(135deg, ${GROUPS['cume-registo'].color} 50%, ${GROUPS.cume.color} 50%)` }} />;
    case 'neighbours': return <span style={{ ...base, border: `2px solid ${NEIGHBOUR_COLOR}`, background: '#64748b' }} />;
    case 'zone': return <span style={{ ...base, border: '2px dashed #334155' }} />;
    case 'gaps': return <span style={{ ...base, background: GAP_COLOR, opacity: 0.8 }} />;
    case 'hyps': return <span style={{ ...base, background: `linear-gradient(135deg, ${HYPOTHESIS_COLORS[0]} 50%, ${HYPOTHESIS_COLORS[1]} 50%)` }} />;
    case 'interp': return <span style={{ ...base, borderRadius: '50%', background: INTERP_COLOR, border: '2px solid #111827' }} />;
  }
}
