import https from 'https';
import { NextRequest, NextResponse } from 'next/server';

const BUPI_QUERY_URL =
  'https://geo.bupi.gov.pt/gisbupi/rest/services/opendata/RGG_DadosGovPT/MapServer/0/query';

export async function GET(req: NextRequest) {
  const rawId = req.nextUrl.searchParams.get('processoid');
  if (!rawId) {
    return NextResponse.json({ error: 'processoid required' }, { status: 400 });
  }

  const processoid = rawId.replace(/'/g, '');
  const where = /^\d+$/.test(processoid)
    ? `processoid=${processoid}`
    : `processoid='${processoid}'`;
  const url = `${BUPI_QUERY_URL}?where=${encodeURIComponent(where)}&outFields=*&returnGeometry=true&f=geojson`;

  return new Promise<NextResponse>((resolve) => {
    const req = https.get(url, (proxyRes) => {
      let data = '';
      proxyRes.on('data', (chunk: Buffer) => (data += chunk.toString()));
      proxyRes.on('end', () =>
        resolve(
          new NextResponse(data, {
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );
    });

    req.setTimeout(15_000, () => {
      req.destroy();
      resolve(NextResponse.json({ error: 'BUPI timeout' }, { status: 504 }));
    });

    req.on('error', (err: Error) =>
      resolve(NextResponse.json({ error: err.message }, { status: 500 })),
    );
  });
}
