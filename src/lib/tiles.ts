import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';

export const TILE_ROOT = process.env.VERCEL
  ? '/tmp/tiles'
  : path.join(process.cwd(), '..', 'map', 'public', 'tiles');

const PREFETCH_ZOOM_LEVELS = [13, 14, 15];
const PREFETCH_CONCURRENCY = 2;
const PREFETCH_BBOX = {
  minx: -855027.68,
  miny: 4965260.04,
  maxx: -820477.5,
  maxy: 4995121.9,
};

const BASE_WMS_URL =
  'http://servicos.dgterritorio.pt/SDISNITWMSPDM1_0901_2027_2/service.svc/get?';
const LAYER =
  'Planta_de_Condicionantes_-_2_6_-_Perigosidade_de_Incendio_Rural';

export const pending = new Map<string, Promise<void>>();

export function tileXYZToBBox(
  x: number,
  y: number,
  z: number,
): [number, number, number, number] {
  const tileSize = 256;
  const initialResolution = (2 * Math.PI * 6378137) / tileSize;
  const originShift = (2 * Math.PI * 6378137) / 2.0;
  const resolution = initialResolution / Math.pow(2, z);
  const minx = x * tileSize * resolution - originShift;
  const maxx = (x + 1) * tileSize * resolution - originShift;
  const maxy = originShift - y * tileSize * resolution;
  const miny = originShift - (y + 1) * tileSize * resolution;
  return [minx, miny, maxx, maxy];
}

export function buildWmsUrl(x: number, y: number, z: number): string {
  const bbox = tileXYZToBBox(x, y, z);
  return (
    `${BASE_WMS_URL}SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap` +
    `&FORMAT=image/svg+xml&TRANSPARENT=true` +
    `&LAYERS=${encodeURIComponent(LAYER)}&STYLES=&CRS=EPSG:3857` +
    `&WIDTH=256&HEIGHT=256&BBOX=${bbox.join(',')}`
  );
}

export function fetchAndCache(url: string, tilePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(tilePath), { recursive: true });
    const fileStream = fs.createWriteStream(tilePath);
    const client = url.startsWith('https') ? https : http;

    const cleanup = () => {
      fileStream.destroy();
      try {
        if (fs.existsSync(tilePath)) fs.unlinkSync(tilePath);
      } catch {}
    };

    const req = client.get(url, (res) => {
      if (res.statusCode !== 200) {
        cleanup();
        return reject(new Error(`WMS returned ${res.statusCode}`));
      }
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      fileStream.on('error', (err) => {
        cleanup();
        reject(err);
      });
    });

    req.setTimeout(55_000, () => {
      req.destroy();
      cleanup();
      reject(new Error('WMS fetch timed out'));
    });
    req.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

function getTileRange(
  bbox: typeof PREFETCH_BBOX,
  z: number,
): { xMin: number; xMax: number; yMin: number; yMax: number } {
  const tileSize = 256;
  const initialResolution = (2 * Math.PI * 6378137) / tileSize;
  const originShift = (2 * Math.PI * 6378137) / 2.0;
  const tileMeters = (tileSize * initialResolution) / Math.pow(2, z);
  return {
    xMin: Math.floor((bbox.minx + originShift) / tileMeters),
    xMax: Math.floor((bbox.maxx + originShift) / tileMeters),
    yMin: Math.floor((originShift - bbox.maxy) / tileMeters),
    yMax: Math.floor((originShift - bbox.miny) / tileMeters),
  };
}

export async function runPrefetch(): Promise<void> {
  if (process.env.ENABLE_PREFETCH === 'false') return;

  const queue: { z: number; x: number; y: number; tilePath: string }[] = [];
  for (const z of PREFETCH_ZOOM_LEVELS) {
    const { xMin, xMax, yMin, yMax } = getTileRange(PREFETCH_BBOX, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const tilePath = path.join(TILE_ROOT, String(z), String(x), `${y}.svg`);
        if (!fs.existsSync(tilePath)) queue.push({ z, x, y, tilePath });
      }
    }
  }

  if (queue.length === 0) {
    console.log('Prefetch: todos os tiles já estão em cache.');
    return;
  }

  const total = queue.length;
  console.log(`Prefetch: ${total} tiles em falta (concorrência: ${PREFETCH_CONCURRENCY})`);
  let done = 0;
  let failed = 0;
  const startTime = Date.now();

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()!;
      const { z, x, y, tilePath } = item;

      if (pending.has(tilePath)) {
        try {
          await pending.get(tilePath);
        } catch {}
        done++;
        continue;
      }

      const url = buildWmsUrl(x, y, z);
      const promise = fetchAndCache(url, tilePath);
      pending.set(tilePath, promise);

      try {
        await promise;
        done++;
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = done / elapsed;
        const etaSec = Math.round(queue.length / rate);
        console.log(
          `Prefetch [${done}/${total}] ${z}/${x}/${y} — ETA: ${Math.floor(etaSec / 60)}m${etaSec % 60}s`,
        );
      } catch (err: unknown) {
        done++;
        failed++;
        console.error(
          `Prefetch falhou ${z}/${x}/${y}:`,
          err instanceof Error ? err.message : err,
        );
      } finally {
        pending.delete(tilePath);
      }
    }
  }

  await Promise.all(Array.from({ length: PREFETCH_CONCURRENCY }, worker));
  console.log(
    `Prefetch concluído: ${done - failed} descarregados, ${failed} falharam.`,
  );
}
