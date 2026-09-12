import { NextResponse } from 'next/server';

export async function proxy(request) {
  const path = request.nextUrl.pathname;
  if (path.startsWith('/admin/reset-password') || path.startsWith('/admin/forgot-password')) return NextResponse.next();
  const refresh = request.cookies.get('tappia_refresh')?.value;
  if (!refresh) return NextResponse.next();
  const access = request.cookies.get('tappia_admin')?.value;
  let expires = 0;
  // This only schedules renewal. Supabase still verifies every authenticated request.
  try { expires = JSON.parse(Buffer.from(access.split('.')[1], 'base64url').toString()).exp || 0; } catch {}
  if (expires > Date.now() / 1000 + 120) return NextResponse.next();
  try {
    const result = await fetch(new URL('/auth/v1/token?grant_type=refresh_token', process.env.SUPABASE_URL), {
      method: 'POST', headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!result.ok) {
      if (![400, 401, 403].includes(result.status)) return new NextResponse('No pudimos renovar tu sesión. Recarga en un momento.', { status: 503 });
      request.cookies.delete('tappia_admin'); request.cookies.delete('tappia_refresh');
      const response = NextResponse.next({ request: { headers: request.headers } });
      for (const name of ['tappia_admin', 'tappia_refresh']) response.cookies.set(name, '', { path: '/admin', maxAge: 0 });
      return response;
    }
    const session = await result.json();
    if (!session.access_token || !session.refresh_token) throw new Error();
    request.cookies.set('tappia_admin', session.access_token);
    request.cookies.set('tappia_refresh', session.refresh_token);
    const response = NextResponse.next({ request: { headers: request.headers } });
    const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/admin', maxAge: 60 * 60 * 24 * 30 };
    response.cookies.set('tappia_admin', session.access_token, options);
    response.cookies.set('tappia_refresh', session.refresh_token, options);
    return response;
  } catch { return new NextResponse('No pudimos renovar tu sesión. Recarga en un momento.', { status: 503 }); }
}
export const config = { matcher: '/admin/:path*' };
