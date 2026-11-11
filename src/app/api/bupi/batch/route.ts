import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

const BUPI_QUERY_URL =
  'https://geo.bupi.gov.pt/gisbupi/rest/services/opendata/RGG_DadosGovPT/MapServer/0/query';

const OUT_FIELDS = 'processoid,numeromatriz,dicofre,freguesiadesc,concelhodesc';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FC = { type: 'FeatureCollection'; features: any[] };

async function queryBupi(params: Record<string, string>): Promise<FC> {
  const qs = new URLSearchParams({
    outFields: OUT_FIELDS,
    returnGeometry: 'true',
    outSR: '4326',
    geometryPrecision: '7',
    f: 'geojson',
    ...params,
  });
  const res = await fetch(`${BUPI_QUERY_URL}?${qs}`, {
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`BUPI ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'Erro BUPI');
  return { type: 'FeatureCollection', features: json.features ?? [] };
}

function matrixNumbers(numeromatriz: unknown): number[] {
  if (typeof numeromatriz !== 'string') return [];
  return Array.from(numeromatriz.matchAll(/R-(\d+)/g), (m) => Number(m[1]));
}

/**
 * GET /api/bupi/batch
 *   ?processoids=1,2,3                        → parcelas por nº de processo
 *   ?dicofre=090102&from=2380&to=2470         → artigos rústicos num intervalo da matriz
 *   ?bbox=minLon,minLat,maxLon,maxLat         → todas as parcelas numa área (máx. ~5 km)
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  try {
    const ids = sp.get('processoids');
    if (ids) {
      const list = ids.split(',').map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
      if (!list.length || list.length > 200) {
        return NextResponse.json({ error: 'processoids inválidos' }, { status: 400 });
      }
      return NextResponse.json(await queryBupi({ where: `processoid IN (${list.join(',')})` }));
    }

    const dicofre = sp.get('dicofre');
    if (dicofre) {
      const from = Number(sp.get('from'));
      const to = Number(sp.get('to'));
      if (!/^\d{6}$/.test(dicofre) || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to - from > 500) {
        return NextResponse.json({ error: 'parâmetros inválidos' }, { status: 400 });
      }
      // Pré-filtro por centenas no servidor BUPi; filtro exato a seguir.
      const prefixes = new Set<string>();
      for (let h = Math.floor(from / 100); h <= Math.floor(to / 100); h++) prefixes.add(String(h));
      const like = Array.from(prefixes, (p) => `numeromatriz LIKE '%R-${p}%'`).join(' OR ');
      const fc = await queryBupi({ where: `dicofre='${dicofre}' AND (${like})` });
      fc.features = fc.features.filter((f) =>
        matrixNumbers(f.properties?.numeromatriz).some((n) => n >= from && n <= to),
      );
      return NextResponse.json(fc);
    }

    const bbox = sp.get('bbox');
    if (bbox) {
      const b = bbox.split(',').map(Number);
      if (b.length !== 4 || b.some((v) => !Number.isFinite(v)) || b[2] <= b[0] || b[3] <= b[1] ||
          b[2] - b[0] > 0.06 || b[3] - b[1] > 0.05) {
        return NextResponse.json({ error: 'bbox inválida' }, { status: 400 });
      }
      return NextResponse.json(await queryBupi({
        where: '1=1',
        geometry: b.join(','),
        geometryType: 'esriGeometryEnvelope',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
      }));
    }

    return NextResponse.json({ error: 'Use processoids, dicofre+from+to ou bbox' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('timeout') || msg.includes('aborted') ? 504 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
