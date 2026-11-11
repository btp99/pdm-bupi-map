/* eslint-disable @typescript-eslint/no-explicit-any */
import * as turf from '@turf/turf';
import { KNOWN_PARCELS, NAME_GROUPS, RESOLVED_CONSTRAINTS, type Confrontacoes } from '@/config/cume';

export type Side = keyof Confrontacoes; // 'norte' | 'sul' | 'nascente' | 'poente'

// "Margarida Rosa fica a norte do 2444" → a terra dela está do lado norte do 2444.
const SIDE_LABEL: Record<Side, string> = {
  norte: 'a norte do', sul: 'a sul do', nascente: 'a nascente do', poente: 'a poente do',
};

export interface Constraint { artigo: number; side: Side; text: string }

export interface Hypothesis {
  key: string;
  name: string;
  feature: any;
  areaM2: number;
  used: Constraint[];
  missing: Constraint[];
  /** forte: as faixas sobrepõem-se · ligada: faixas unidas pela área livre entre elas · fraca: uma só faixa */
  kind: 'forte' | 'ligada' | 'fraca';
  strong: boolean;
}

const MIN_AREA = 400;

export function normalizeName(s: string) {
  return s
    .toLowerCase()
    .replace(/\be outros\b/g, '')
    .replace(/\bherd\.?\s*(de\s+)?/g, 'herdeiros de ')
    .replace(/\s+d[aeo]s?\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Nomes equivalentes (ex.: "António Moreira" e "Herd. de António Moreira") contam como um só vizinho.
const GROUP_OF = new Map<string, { key: string; label: string }>();
for (const g of NAME_GROUPS) {
  const key = normalizeName(g.names[0]);
  for (const n of g.names) GROUP_OF.set(normalizeName(n), { key, label: g.label });
}

const SIDES: Side[] = ['norte', 'nascente', 'sul', 'poente'];
const DEG = Math.PI / 180;

export interface Edge { a: number[]; b: number[]; bearing: number; length: number; side: Side }

function outerRings(parcel: any): number[][][] {
  const g = parcel.geometry ?? parcel;
  if (g.type === 'Polygon') return [g.coordinates[0]];
  if (g.type === 'MultiPolygon') return g.coordinates.map((p: number[][][]) => p[0]);
  return [];
}

/**
 * Lados da parcela com a direção para onde cada um está virado.
 * Numa parcela rodada (como o 2458, na diagonal), os quatro lados das cadernetas não são
 * os pontos cardeais exatos: procura-se a rotação da parcela (entre −45° e +45°) que melhor
 * alinha os lados com N/E/S/O e cada lado recebe o ponto cardeal "rodado" mais próximo.
 */
export function parcelEdges(parcel: any): { edges: Edge[]; rotation: number } {
  const raw: Omit<Edge, 'side'>[] = [];
  for (const ring of outerRings(parcel)) {
    const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const kx = 111320 * Math.cos(lat0 * DEG), ky = 110574;
    let signed = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      signed += ring[i][0] * kx * ring[i + 1][1] * ky - ring[i + 1][0] * kx * ring[i][1] * ky;
    }
    const ccw = signed > 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1];
      const dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * ky;
      const length = Math.hypot(dx, dy);
      if (length < 0.5) continue;
      // Normal exterior: (dy, −dx) para anel anti-horário, (−dy, dx) para horário.
      const nx = ccw ? dy : -dy, ny = ccw ? -dx : dx;
      const bearing = (Math.atan2(nx, ny) / DEG + 360) % 360;
      raw.push({ a, b, bearing, length });
    }
  }
  const dev = (x: number) => { const m = ((x % 90) + 90) % 90; return Math.min(m, 90 - m); };
  let rotation = 0, bestCost = Infinity;
  for (let t = -45; t < 45; t++) {
    const cost = raw.reduce((s, e) => s + e.length * dev(e.bearing - t), 0);
    if (cost < bestCost - 1e-6 || (Math.abs(cost - bestCost) < 1e-6 && Math.abs(t) < Math.abs(rotation))) {
      bestCost = cost; rotation = t;
    }
  }
  const edges = raw.map((e) => {
    const rel = (e.bearing - rotation + 360) % 360;
    return { ...e, side: SIDES[Math.round(rel / 90) % 4] };
  });
  return { edges, rotation };
}

/** Ponto médio do maior lado virado para `side`, afastado `offsetM` para fora (para rótulos). */
export function sideAnchor(parcel: any, side: Side, offsetM = 10): number[] | null {
  const e = parcelEdges(parcel).edges.filter((x) => x.side === side).sort((x, y) => y.length - x.length)[0];
  if (!e) return null;
  const mid = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
  return turf.destination(mid, offsetM, e.bearing, { units: 'meters' }).geometry.coordinates;
}

/**
 * Faixa de `distM` metros encostada aos lados da parcela virados para `side`
 * (cada lado é empurrado para fora na perpendicular), menos a própria parcela.
 */
function sideBand(parcel: any, side: Side, distM: number): any | null {
  try {
    const quads = parcelEdges(parcel).edges
      .filter((e) => e.side === side)
      .map((e) => {
        const a2 = turf.destination(e.a, distM, e.bearing, { units: 'meters' }).geometry.coordinates;
        const b2 = turf.destination(e.b, distM, e.bearing, { units: 'meters' }).geometry.coordinates;
        return turf.buffer(turf.polygon([[e.a, e.b, b2, a2, e.a]]), 2, { units: 'meters' });
      })
      .filter(Boolean);
    if (!quads.length) return null;
    const swept = quads.length === 1 ? quads[0] : turf.union(turf.featureCollection(quads as any));
    if (!swept) return null;
    return turf.difference(turf.featureCollection([swept, parcel]) as any);
  } catch {
    return null;
  }
}

function safeIntersect(a: any, b: any): any | null {
  if (!a || !b) return null;
  try { return turf.intersect(turf.featureCollection([a, b]) as any); } catch { return null; }
}

function area(f: any) { return f ? turf.area(f) : 0; }

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [h, ...t] = arr;
  return [...combinations(t, k - 1).map((c) => [h, ...c]), ...combinations(t, k)];
}

/** Agrupa as confrontações dos documentos por nome de vizinho. */
export function collectConstraints() {
  const byName = new Map<string, { name: string; constraints: Constraint[] }>();
  for (const p of KNOWN_PARCELS) {
    const c = p.doc?.confrontacoes;
    if (!c) continue;
    (Object.keys(c) as Side[]).forEach((side) => {
      const raw = c[side];
      if (!raw) return;
      if (RESOLVED_CONSTRAINTS.some((r) => r.artigo === p.artigo && r.side === side)) return;
      if (/limite|junta de freguesia/i.test(raw)) return;
      const norm = normalizeName(raw);
      const group = GROUP_OF.get(norm);
      const key = group?.key ?? norm;
      if (!byName.has(key)) byName.set(key, { name: group?.label ?? raw, constraints: [] });
      const alias = group && normalizeName(raw) !== key ? ` (${raw})` : '';
      byName.get(key)!.constraints.push({ artigo: p.artigo, side, text: `${SIDE_LABEL[side]} ${p.artigo}${alias}` });
    });
  }
  return byName;
}

/**
 * Para cada vizinho, cruza as faixas laterais das parcelas onde aparece com as áreas sem registo.
 * Usa o maior conjunto de confrontações que ainda se sobrepõe (≥ 2 → hipótese forte).
 */
export function computeHypotheses(
  knownByArtigo: Map<number, any>,
  gapUnion: any,
  distM: number,
): Hypothesis[] {
  if (!gapUnion) return [];
  const out: Hypothesis[] = [];

  for (const [key, { name, constraints }] of Array.from(collectConstraints())) {
    const bands = constraints
      .map((c) => {
        const parcel = knownByArtigo.get(c.artigo);
        const band = parcel ? safeIntersect(sideBand(parcel, c.side, distM), gapUnion) : null;
        return { c, band };
      })
      .filter((b) => b.band && area(b.band) >= MIN_AREA);

    if (!bands.length) continue;

    let best: { feature: any; used: typeof bands } | null = null;
    for (let k = bands.length; k >= 2 && !best; k--) {
      let bestArea = 0;
      for (const combo of combinations(bands, k)) {
        let acc = combo[0].band;
        for (const b of combo.slice(1)) acc = safeIntersect(acc, b.band);
        const a = area(acc);
        if (a >= MIN_AREA && a > bestArea) { bestArea = a; best = { feature: acc, used: combo }; }
      }
    }

    const all = best && best.used.length === bands.length;
    if (best) {
      out.push({
        key, name, feature: best.feature, areaM2: area(best.feature),
        used: best.used.map((b) => b.c),
        missing: constraints.filter((c) => !best!.used.some((u) => u.c === c)),
        kind: 'forte', strong: true,
      });
    }
    if (!all && bands.length >= 2) {
      // As faixas não se cruzam todas: um terreno comprido pode tocar em vários sítios.
      // Liga-as pela área sem registo que fica entre elas (envolvente convexa ∩ áreas livres).
      let linked: any = null;
      try {
        const hull = turf.convex(turf.featureCollection(bands.map((b) => b.band)) as any);
        linked = safeIntersect(hull, gapUnion);
      } catch { linked = null; }
      if (linked && area(linked) >= MIN_AREA) {
        out.push({
          key: `${key}#ligada`, name, feature: linked, areaM2: area(linked),
          used: bands.map((b) => b.c),
          missing: constraints.filter((c) => !bands.some((b) => b.c === c)),
          kind: 'ligada', strong: true,
        });
      }
    }
    if (!best && bands.length === 1) {
      const b = bands[0];
      out.push({
        key, name, feature: b.band, areaM2: area(b.band),
        used: [b.c], missing: constraints.filter((c) => c !== b.c), kind: 'fraca', strong: false,
      });
    }
  }

  const rank = { forte: 0, ligada: 1, fraca: 2 } as const;
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.used.length - a.used.length || b.areaM2 - a.areaM2);
}
