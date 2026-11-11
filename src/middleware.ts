import { NextRequest, NextResponse } from 'next/server';

async function computeToken(username: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(username));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function middleware(request: NextRequest) {
  const session = request.cookies.get('cume_session')?.value;
  const username = process.env.AUTH_USERNAME;
  const secret = process.env.SESSION_SECRET;

  if (!session || !username || !secret) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const expected = await computeToken(username, secret);
  if (session !== expected) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/cume/:path*'],
};
