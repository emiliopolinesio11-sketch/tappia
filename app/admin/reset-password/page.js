import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Recuperar acceso · Tappia',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
const path = '/admin/reset-password';

async function auth(endpoint, body, token) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key || !process.env.ADMIN_USER_ID) throw new Error();
  const response = await fetch(new URL(`/auth/v1/${endpoint}`, base), {
    method: token ? 'PUT' : 'POST',
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error();
  return response.json();
}

async function changePassword(form) {
  'use server';
  const hash = String(form.get('token_hash') || '');
  const password = String(form.get('password') || '');
  const confirmation = String(form.get('confirmation') || '');
  if (!/^[a-f0-9]{32,128}$/i.test(hash)) redirect(`${path}?error=link`);
  if (password.length < 12 || password.length > 128 || password !== confirmation) {
    redirect(`${path}?token_hash=${encodeURIComponent(hash)}&error=password`);
  }
  try {
    const session = await auth('verify', { token_hash: hash, type: 'recovery' });
    if (!session.access_token || session.user?.id !== process.env.ADMIN_USER_ID) throw new Error();
    await auth('user', { password }, session.access_token);
  } catch {
    redirect(`${path}?error=link`);
  }
  redirect(`${path}?success=1`);
}

const input = { display: 'block', width: '100%', padding: 12, marginTop: 8, borderRadius: 8, border: '1px solid #89988b', fontSize: 16 };

export default async function ResetPassword({ searchParams }) {
  const query = await searchParams;
  const hash = typeof query.token_hash === 'string' ? query.token_hash : '';
  const valid = /^[a-f0-9]{32,128}$/i.test(hash);
  return <div style={{ maxWidth: 480, margin: '60px auto', padding: 28, background: 'white', border: '1px solid #dce3d5', borderRadius: 20 }}>
    <p style={{ fontWeight: 'bold', fontSize: 28 }}>tappia</p>
    <h1 style={{ fontSize: 30, letterSpacing: -1 }}>Recuperar acceso</h1>
    {query.success === '1' ? <>
      <h2>Contraseña actualizada</h2>
      <p>Guárdala como “Acceso a Tappia” en tu gestor de contraseñas.</p>
      <a href="/admin">Ir al inicio de sesión</a>
    </> : valid ? <>
      <p>Elige una contraseña nueva de entre 12 y 128 caracteres.</p>
      {query.error === 'password' && <p role="alert">Revisa la longitud y que las dos contraseñas coincidan.</p>}
      <form action={changePassword} style={{ display: 'grid', gap: 18 }}>
        <input type="hidden" name="token_hash" value={hash} />
        <label>Nueva contraseña<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" style={input} /></label>
        <label>Repite la contraseña<input name="confirmation" type="password" required minLength={12} maxLength={128} autoComplete="new-password" style={input} /></label>
        <button style={{ background: '#214a35', color: 'white', padding: 14, border: 0, borderRadius: 8, fontSize: 16, cursor: 'pointer' }}>Guardar nueva contraseña</button>
      </form>
    </> : <>
      <p role="status">{query.error ? 'No pudimos actualizar la contraseña. El enlace puede haber vencido o ya haberse utilizado; solicita otro. Si elegiste una contraseña rechazada por Supabase, usa una diferente.' : 'Abre el enlace del correo de recuperación para elegir tu nueva contraseña.'}</p>
      <p>Durante esta prueba, el correo se solicita desde Supabase: Authentication → Users → tu usuario → Send password recovery.</p>
      <a href="/admin">Volver al inicio de sesión</a>
    </>}
  </div>;
}
