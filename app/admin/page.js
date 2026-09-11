import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Panel privado · Tappia', robots: { index: false, follow: false } };
const COOKIE = 'tappia_admin';
const zone = 'America/Mexico_City';

function config() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const admin = process.env.ADMIN_USER_ID;
  if (!base || !key || !admin) throw new Error('Configuration');
  return { base, key, admin };
}

async function api(path, token, options = {}) {
  const { base, key } = config();
  return fetch(new URL(path, base), {
    ...options,
    headers: {
      apikey: key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
}

async function login(form) {
  'use server';
  let session;
  try {
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    if (!email || email.length > 254 || !password || password.length > 1024) throw new Error();
    const response = await api('/auth/v1/token?grant_type=password', null, {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error();
    session = await response.json();
    if (session.user?.id !== config().admin || !session.access_token) throw new Error();
  } catch { redirect('/admin?error=login'); }
  (await cookies()).set(COOKIE, session.access_token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/admin',
    maxAge: Math.max(1, Math.min(Number(session.expires_in) || 3600, 3600)),
  });
  redirect('/admin');
}

async function logout() {
  'use server';
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    try { await api('/auth/v1/logout?scope=local', token, { method: 'POST' }); } catch {}
  }
  jar.set(COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/admin', maxAge: 0 });
  redirect('/admin');
}

async function rows(path, token) {
  const all = [];
  for (let offset = 0; offset < 100000;) {
    const response = await api(`${path}&limit=500&offset=${offset}`, token);
    if (!response.ok) throw new Error('Read failed');
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('Invalid data');
    if (!batch.length) return all;
    all.push(...batch);
    offset += batch.length;
  }
  throw new Error('Report too large');
}

const day = value => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const date = value => value ? new Intl.DateTimeFormat('es-MX', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin visitas';
const number = value => value.toLocaleString('es-MX');
const box = { background: 'white', border: '1px solid #dce3d5', borderRadius: 16, padding: 24, marginBottom: 20 };
const button = { background: '#214a35', color: 'white', padding: '12px 18px', border: 0, borderRadius: 8, cursor: 'pointer', fontSize: 16 };
const cell = { padding: '14px 16px', textAlign: 'left', borderBottom: '1px solid #e8eede', whiteSpace: 'nowrap' };

export default async function Admin({ searchParams }) {
  const query = await searchParams;
  const token = (await cookies()).get(COOKIE)?.value;
  let authorized = false;
  let unavailable = false;
  try {
    config();
    if (token) {
      const response = await api('/auth/v1/user', token);
      if (response.ok) authorized = (await response.json()).id === config().admin;
      else if (![401, 403].includes(response.status)) unavailable = true;
    }
  } catch { unavailable = true; }

  let content;
  if (unavailable) {
    content = <section style={box}><h2>No pudimos conectar</h2><p>Intenta de nuevo en unos momentos.</p><a href="/admin">Reintentar</a></section>;
  } else if (!authorized) {
    content = <section style={{ ...box, maxWidth: 440, margin: '24px auto' }}>
      <h2>Entrar a Tappia</h2><p>Acceso privado de administrador.</p>
      {(query.error || token) && <p role="alert">No pudimos validar tu acceso. Vuelve a iniciar sesión.</p>}
      <form action={login} style={{ display: 'grid', gap: 16 }}>
        <label>Correo<input name="email" type="email" required autoComplete="username" maxLength={254} style={{ display: 'block', width: '100%', padding: 12, marginTop: 6 }} /></label>
        <label>Contraseña<input name="password" type="password" required autoComplete="current-password" maxLength={1024} style={{ display: 'block', width: '100%', padding: 12, marginTop: 6 }} /></label>
        <button style={button}>Entrar</button>
      </form><p style={{ fontSize: 13 }}>La sesión dura hasta una hora. Después podrás volver a entrar.</p>
    </section>;
  } else {
    try {
      const cutoff = new Date().toISOString();
      const [links, visits] = await Promise.all([
        rows('/rest/v1/links?select=code,business,active&order=code.asc', token),
        rows(`/rest/v1/visits?select=id,link_code,visited_at&order=visited_at.asc,id.asc&visited_at=lte.${encodeURIComponent(cutoff)}`, token),
      ]);
      const byPlate = new Map();
      const byDay = new Map();
      for (const visit of visits) {
        const value = byPlate.get(visit.link_code) || { total: 0, last: null };
        value.total++;
        if (!value.last || visit.visited_at > value.last) value.last = visit.visited_at;
        byPlate.set(visit.link_code, value);
        const key = day(visit.visited_at);
        byDay.set(key, (byDay.get(key) || 0) + 1);
      }
      const today = day(cutoff);
      const days = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(`${today}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - i);
        return day(d);
      });
      content = <>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[[ 'Visitas totales', visits.length ], [ 'Visitas hoy', byDay.get(today) || 0 ], [ 'Placas', links.length ]].map(([label, value]) => <section key={label} style={{ ...box, flex: '1 1 180px' }}><p>{label}</p><strong style={{ fontSize: 36 }}>{number(value)}</strong></section>)}
        </div>
        <section style={box}><h2>Visitas por placa</h2><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Placa', 'Negocio', 'Estado', 'Visitas', 'Última visita'].map(t => <th key={t} style={cell}>{t}</th>)}</tr></thead>
          <tbody>{links.map(link => <tr key={link.code}><td style={cell}>{link.code}</td><td style={cell}>{link.business}</td><td style={cell}>{link.active ? 'Activa' : 'Pausada'}</td><td style={cell}>{number(byPlate.get(link.code)?.total || 0)}</td><td style={cell}>{date(byPlate.get(link.code)?.last)}</td></tr>)}</tbody>
        </table></div>{!links.length && <p>No hay placas disponibles.</p>}</section>
        <section style={box}><h2>Visitas por día</h2><p>Últimos 14 días · Todas las placas</p>
          {days.map(d => <div key={d} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #e8eede' }}><span>{d}</span><strong>{number(byDay.get(d) || 0)}</strong></div>)}
        </section>
        <p>Actualizado: {date(cutoff)} · Hora de Ciudad de México.</p>
        <p>Son aperturas registradas, no personas únicas. Incluyen tus pruebas y pueden incluir bots. QR y NFC se cuentan juntos si usan el mismo enlace.</p>
      </>;
    } catch {
      content = <section style={box}><h2>No pudimos cargar las métricas</h2><p>Reintenta. Si persiste, revisaremos la conexión y los permisos. Este panel inicial admite menos de 100,000 registros por consulta.</p><a href="/admin">Reintentar</a></section>;
    }
  }
  return <div style={{ maxWidth: 1100, margin: 'auto', padding: '28px 20px' }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
      <div><a href="/" style={{ color: '#214a35', fontWeight: 'bold', fontSize: 28 }}>tappia</a><h1 style={{ fontSize: 32, letterSpacing: -1, margin: '12px 0' }}>Panel privado</h1></div>
      {authorized && <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}><a href="/admin">Actualizar</a><form action={logout}><button style={button}>Cerrar sesión</button></form></div>}
    </header>{content}
  </div>;
}
