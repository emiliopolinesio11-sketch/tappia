import RecoveryForm from './RecoveryForm';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Recuperar acceso · Tappia',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

async function changePassword(form) {
  'use server';
  const token = String(form.get('access_token') || '');
  const password = String(form.get('password') || '');
  const confirmation = String(form.get('confirmation') || '');
  if (!token || token.length > 16000) return { error: 'Abre un enlace de recuperación nuevo.' };
  if (password.length < 8 || password.length > 25 || password !== confirmation) {
    return { error: 'Usa entre 8 y 25 caracteres y repite la misma contraseña.' };
  }
  try {
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    const admin = process.env.ADMIN_USER_ID;
    if (!base || !key || !admin) throw new Error();
    const url = new URL('/auth/v1/user', base);
    const options = {
      headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store', redirect: 'error',
    };
    const check = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
    if (!check.ok || !(await check.json()).id) throw new Error();
    const update = await fetch(url, {
      ...options, method: 'PUT', body: JSON.stringify({ password }), signal: AbortSignal.timeout(10000),
    });
    if (!update.ok) return { error: 'No se pudo guardar. Prueba una contraseña diferente; si persiste, solicita otro enlace.' };
    return { success: true };
  } catch {
    return { error: 'No pudimos verificar el acceso. Solicita un enlace nuevo e inténtalo otra vez.' };
  }
}

export default function ResetPassword() {
  return <RecoveryForm changePassword={changePassword} />;
}
