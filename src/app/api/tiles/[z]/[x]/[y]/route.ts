import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { TILE_ROOT, pending, buildWmsUrl, fetchAndCache } from '@/lib/tiles';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z, x, y } = await params;
  const tilePath = path.join(TILE_ROOT, z, x, `${y}.svg`);

  if (fs.existsSync(tilePath)) {
    return new NextResponse(fs.readFileSync(tilePath), {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  if (process.env.VERCEL) {
    return new NextResponse(null, { status: 404 });
  }

  if (pending.has(tilePath)) {
    try {
      await pending.get(tilePath);
      return new NextResponse(fs.readFileSync(tilePath), {
        headers: { 'Content-Type': 'image/svg+xml' },
      });
    } catch {
      return new NextResponse('WMS fetch failed.', { status: 502 });
    }
  }

  const url = buildWmsUrl(parseInt(x), parseInt(y), parseInt(z));
  console.log(`Fetching tile: ${z}/${x}/${y}`);

  const promise = fetchAndCache(url, tilePath);
  pending.set(tilePath, promise);

  try {
    await promise;
    return new NextResponse(fs.readFileSync(tilePath), {
      headers: { 'Content-Type': 'image/svg+xml' },
    });
  } catch (err: unknown) {
    console.error(
      `Failed tile ${z}/${x}/${y}:`,
      err instanceof Error ? err.message : err,
    );
    return new NextResponse('Failed to fetch tile.', { status: 500 });
  } finally {
    pending.delete(tilePath);
  }
}
