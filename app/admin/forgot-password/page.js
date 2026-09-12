import { redirect } from 'next/navigation';
export const metadata = { title: 'Recuperar contraseña · Tappia', robots: { index: false, follow: false } };
async function recover(form) {
  'use server';
  const email = String(form.get('email') || '').trim();
  let success = false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254) {
    try {
      const url = new URL('/auth/v1/recover', process.env.SUPABASE_URL);
      url.searchParams.set('redirect_to', 'https://tappia-taupe.vercel.app/admin/reset-password');
      const result = await fetch(url, { method: 'POST', headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
      success = result.ok;
    } catch {}
  }
  redirect(`/admin/forgot-password?${success ? 'sent=1' : 'error=1'}`);
}
export default async function Forgot({ searchParams }) {
  const params = await searchParams;
  return <main className="auth-page"><a className="brand" href="/">tappia</a><h1>Recupera tu acceso</h1><p>Escribe el correo con el que se creó tu cuenta.</p>
    {params.sent && <p role="status">Si existe una cuenta con ese correo, recibirás un enlace para elegir una contraseña nueva. Revisa también spam.</p>}
    {params.error && <p role="alert">No pudimos solicitar el correo. Intenta más tarde o <a href="https://wa.me/525578806465">contacta a Tappia</a> para revisar tu acceso.</p>}
    <form action={recover}><label>Correo electrónico<input type="email" name="email" autoComplete="email" required maxLength={254} /></label><button className="button">Enviar enlace de recuperación</button></form><p><a href="/admin">Volver a iniciar sesión</a></p></main>;
}
