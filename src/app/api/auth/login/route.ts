import { NextRequest, NextResponse } from 'next/server';

async function computeToken(username: string): Promise<string> {
  const secret = process.env.SESSION_SECRET!;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(username));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: NextRequest) {
  const data = await request.formData();
  const username = ((data.get('username') as string | null) ?? '').trim();
  const password = (data.get('password') as string | null) ?? '';

  if (
    username !== process.env.AUTH_USERNAME ||
    password !== process.env.AUTH_PASSWORD
  ) {
    return NextResponse.redirect(new URL('/login?error=1', request.url), { status: 303 });
  }

  const token = await computeToken(username);
  const response = NextResponse.redirect(new URL('/cume', request.url), { status: 303 });
  response.cookies.set('cume_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return response;
}
