import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi panel · Tappia', robots: { index: false, follow: false } };
const COOKIE = 'tappia_admin';
const zone = 'America/Mexico_City';
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text = (form, key) => String(form.get(key) || '').trim();

async function api(path, token, options = {}, privileged = false) {
  const base = process.env.SUPABASE_URL;
  const key = privileged ? process.env.SUPABASE_SECRET_KEY : process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key || !process.env.ADMIN_USER_ID) throw new Error('Configuration');
  return fetch(new URL(path, base), {
    ...options,
    headers: { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json', ...options.headers },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
  });
}
async function data(path, token, options = {}, privileged = false) {
  const result = await api(path, token, options, privileged);
  if (!result.ok) throw new Error('Request failed');
  return result.status === 204 ? null : result.json();
}
async function rows(path, token) {
  const all = [];
  for (let offset = 0; offset < 100000;) {
    const batch = await data(`${path}&limit=500&offset=${offset}`, token);
    if (!Array.isArray(batch)) throw new Error('Invalid data');
    if (!batch.length) return all;
    all.push(...batch); offset += batch.length;
  }
  throw new Error('Reduce date range');
}
async function identity() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const result = await api('/auth/v1/user', token);
  if ([401, 403].includes(result.status)) return null;
  if (!result.ok) throw new Error('Unavailable');
  const user = await result.json();
  if (!user.id) return null;
  return { token, user, admin: user.id === process.env.ADMIN_USER_ID };
}
async function requireAdmin() {
  const session = await identity();
  if (!session?.admin) throw new Error('Unauthorized');
  return session;
}
async function login(form) {
  'use server';
  let session;
  try {
    const email = text(form, 'email');
    const password = String(form.get('password') || '');
    if (!email || email.length > 254 || !password || password.length > 1024) throw new Error();
    session = await data('/auth/v1/token?grant_type=password', null, { method: 'POST', body: JSON.stringify({ email, password }) });
    if (!session.access_token || !session.user?.id) throw new Error();
    if (session.user.id !== process.env.ADMIN_USER_ID) {
      const businesses = await data('/rest/v1/businesses?select=id&limit=1', session.access_token);
      if (!businesses.length) throw new Error();
    }
  } catch { redirect('/admin?error=login'); }
  (await cookies()).set(COOKIE, session.access_token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/admin',
    maxAge: Math.max(1, Math.min(Number(session.expires_in) || 3600, 3600)),
  });
  redirect('/admin');
}
async function logout() {
  'use server';
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) { try { await api('/auth/v1/logout?scope=local', token, { method: 'POST' }); } catch {} }
  jar.set(COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/admin', maxAge: 0 });
  redirect('/admin');
}
async function createBusiness(form) {
  'use server';
  let ok = false;
  try {
    await requireAdmin();
    const name = text(form, 'name'); const id = text(form, 'id');
    if (!uuid(id) || !name || name.length > 120) throw new Error();
    await data('/rest/v1/businesses?on_conflict=id', null, {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ id, name }),
    }, true);
    ok = true;
  } catch {}
  redirect(`/admin?${ok ? 'done=business' : 'error=save'}#management`);
}
async function createAccess(form) {
  'use server';
  let message = 'access';
  let ok = false;
  try {
    await requireAdmin();
    const businessId = text(form, 'business_id');
    const email = text(form, 'email').toLowerCase();
    const password = String(form.get('password') || '');
    if (!uuid(businessId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12 || password.length > 128) throw new Error();
    const [business] = await data(`/rest/v1/businesses?id=eq.${businessId}&select=id,owner_id`, null, {}, true);
    if (!business || business.owner_id) throw new Error();
    let user;
    const created = await api('/auth/v1/admin/users', null, {
      method: 'POST', body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { tappia_business_id: businessId } }),
    }, true);
    if (created.ok) {
      const payload = await created.json(); user = payload.user || payload;
    } else {
      // Recover only an account created for this same business by this workflow.
      // An unrelated existing account is never reassigned or reset.
      for (let page = 1; page <= 100; page++) {
        const payload = await data(`/auth/v1/admin/users?page=${page}&per_page=100`, null, {}, true);
        const users = payload.users || [];
        const existing = users.find(u => u.email?.toLowerCase() === email);
        if (existing) {
          if (existing.app_metadata?.tappia_business_id === businessId) user = existing;
          break;
        }
        if (users.length < 100) break;
      }
      if (!user) { message = 'existing'; throw new Error(); }
    }
    if (!uuid(user.id) || user.id === process.env.ADMIN_USER_ID) throw new Error();
    const updated = await data(`/rest/v1/businesses?id=eq.${businessId}&owner_id=is.null`, null, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ owner_id: user.id }),
    }, true);
    if (!updated?.length) throw new Error();
    ok = true;
  } catch {}
  redirect(`/admin?${ok ? 'done=access' : `error=${message}`}#management`);
}
function destination(value) {
  const target = new URL(value);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || value.length > 2048) throw new Error();
  // Prevent redirect chains through Tappia's own resolver.
  if (/^\/r(?:\/|$)/.test(target.pathname)) throw new Error();
  return target.href;
}
async function savePlate(form) {
  'use server';
  let ok = false;
  try {
    await requireAdmin();
    const code = text(form, 'code');
    const businessId = text(form, 'business_id');
    const mode = text(form, 'mode');
    if (!/^[A-Z0-9_-]{1,32}$/.test(code) || !uuid(businessId) || !['create', 'edit'].includes(mode)) throw new Error();
    const [business] = await data(`/rest/v1/businesses?id=eq.${businessId}&select=id,name`, null, {}, true);
    if (!business) throw new Error();
    const values = { business_id: business.id, business: business.name, destination: destination(text(form, 'destination')), active: form.get('active') === 'on' };
    if (mode === 'create') {
      await data('/rest/v1/links', null, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ code, ...values }) }, true);
    } else {
      const [existing] = await data(`/rest/v1/links?code=eq.${code}&select=business_id`, null, {}, true);
      if (!existing || (existing.business_id && existing.business_id !== businessId)) throw new Error();
      const condition = existing.business_id ? `eq.${existing.business_id}` : 'is.null';
      const updated = await data(`/rest/v1/links?code=eq.${code}&business_id=${condition}`, null, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(values),
      }, true);
      if (!updated?.length) throw new Error();
    }
    ok = true;
  } catch {}
  redirect(`/admin?${ok ? 'done=plate' : 'error=plate'}#management`);
}

function day(value) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function validDay(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value; }
function shift(value, count) { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10); }
function boundary(value) {
  // Resolve midnight in Mexico City, including historical offset changes.
  const target = Date.parse(`${value}T00:00:00Z`);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
    const get = type => parts.find(p => p.type === type).value;
    const represented = Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`);
    guess += target - represented;
  }
  return new Date(guess).toISOString();
}
function bucket(date, group) {
  if (group === 'year') return date.slice(0, 4);
  if (group === 'month') return date.slice(0, 7);
  if (group === 'week') { const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(); return shift(date, -((weekday + 6) % 7)); }
  return date;
}
function summarize(visits, from, to, group) {
  const periods = new Map(); const plates = new Map();
  for (let d = from; d <= to; d = shift(d, 1)) periods.set(bucket(d, group), 0);
  for (const visit of visits) {
    const key = bucket(day(visit.visited_at), group);
    if (!periods.has(key)) continue;
    periods.set(key, periods.get(key) + 1);
    const value = plates.get(visit.link_code) || { count: 0, last: null };
    value.count++; if (!value.last || visit.visited_at > value.last) value.last = visit.visited_at;
    plates.set(visit.link_code, value);
  }
  return { periods, plates };
}
const box = { background: 'white', border: '1px solid #dce3d5', borderRadius: 16, padding: 24, marginBottom: 20 };
const button = { background: '#214a35', color: 'white', padding: '12px 18px', border: 0, borderRadius: 8, cursor: 'pointer', fontSize: 16 };
const input = { display: 'block', width: '100%', boxSizing: 'border-box', padding: 10, marginTop: 6, border: '1px solid #89988b', borderRadius: 6, fontSize: 16 };
const cell = { padding: 12, textAlign: 'left', borderBottom: '1px solid #e8eede' };
const heading = { fontSize: 24, letterSpacing: '-0.5px', margin: '0 0 16px' };
const grid = { display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', alignItems: 'end' };
const dateLabel = value => value ? new Intl.DateTimeFormat('es-MX', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin visitas';
const notices = {
  login: 'No pudimos validar tu acceso. Revisa el correo y la contraseña, o pide al administrador que vincule tu cuenta.',
  save: 'No se pudo guardar. Verifica los datos e inténtalo de nuevo.',
  access: 'No se completó el acceso. Reintenta con el mismo correo. Si la cuenta ya se creó, conservará la contraseña del primer intento.',
  existing: 'No se creó el acceso. El correo puede tener una cuenta existente o la contraseña fue rechazada. No modificamos cuentas existentes.',
  plate: 'No se guardó la placa. Revisa el código, el enlace y el negocio. Un código existente no se puede duplicar ni trasladar a otro negocio.',
};
const done = { business: 'Negocio creado. Ahora puedes crear su acceso y agregar sus placas.', access: 'Acceso vinculado. El negocio puede entrar en esta misma dirección con su correo y contraseña. No se envió correo automático.', plate: 'Placa guardada.' };

export default async function Admin({ searchParams }) {
  const query = await searchParams;
  let session;
  try { session = await identity(); } catch { return <div style={box}><h1 style={heading}>No pudimos conectar</h1><a href="/admin">Reintentar</a></div>; }
  if (!session) return <div style={{ ...box, maxWidth: 440, margin: '60px auto' }}>
    <h1 style={heading}>Entrar a Tappia</h1><p>Administradores y negocios.</p>
    {query.error && <p role="alert">{notices.login}</p>}
    <form action={login} style={{ display: 'grid', gap: 16 }}>
      <label>Correo<input style={input} name="email" type="email" autoComplete="username" maxLength={254} required /></label>
      <label>Contraseña<input style={input} name="password" type="password" autoComplete="current-password" maxLength={1024} required /></label>
      <button style={button}>Entrar</button>
    </form><p>La sesión dura hasta una hora.</p>
  </div>;
  const { token, admin } = session;
  let content;
  try {
    const [businesses, links] = await Promise.all([
      rows('/rest/v1/businesses?select=id,name,owner_id&order=name.asc,id.asc', token),
      rows('/rest/v1/links?select=code,business,business_id,destination,active&order=code.asc', token),
    ]);
    const today = day(new Date());
    const from = typeof query.from === 'string' && validDay(query.from) ? query.from : `${today.slice(0, 4)}-01-01`;
    const to = typeof query.to === 'string' && validDay(query.to) ? query.to : today;
    const group = ['day', 'week', 'month', 'year'].includes(query.group) ? query.group : 'day';
    const selected = typeof query.business === 'string' ? query.business : '';
    const filteredLinks = links.filter(l => !selected || l.business_id === selected);
    const allowedCodes = new Set(filteredLinks.map(l => l.code));
    const rangeValid = from <= to && (Date.parse(to) - Date.parse(from)) / 86400000 <= 3660;
    let report;
    try {
      if (!rangeValid) throw new Error();
      const visits = await rows(`/rest/v1/visits?select=id,link_code,visited_at&order=visited_at.asc,id.asc&visited_at=gte.${encodeURIComponent(boundary(from))}&visited_at=lt.${encodeURIComponent(boundary(shift(to, 1)))}`, token);
      const filtered = visits.filter(v => allowedCodes.has(v.link_code));
      const { periods, plates } = summarize(filtered, from, to, group);
      report = <>
        <div style={grid}>{[['Aperturas en el periodo', filtered.length], ['Placas', filteredLinks.length]].map(([label, value]) => <section key={label} style={box}><p>{label}</p><strong style={{ fontSize: 32 }}>{value.toLocaleString('es-MX')}</strong></section>)}</div>
        <section style={box}><h2 style={heading}>Visitas por placa</h2><div style={{ overflowX: 'auto' }}><table style={{ width: '100%' }}><thead><tr>{['Placa', 'Negocio', 'Estado', 'Visitas', 'Última del periodo'].map(s => <th style={cell} key={s}>{s}</th>)}</tr></thead>
          <tbody>{filteredLinks.map(l => <tr key={l.code}><td style={cell}>{l.code}</td><td style={cell}>{businesses.find(b => b.id === l.business_id)?.name || l.business}</td><td style={cell}>{l.active ? 'Activa' : 'Pausada'}</td><td style={cell}>{plates.get(l.code)?.count || 0}</td><td style={cell}>{dateLabel(plates.get(l.code)?.last)}</td></tr>)}</tbody></table></div>{!filteredLinks.length && <p>Todavía no hay placas asignadas.</p>}</section>
        <section style={box}><h2 style={heading}>Historial de aperturas</h2><p>{from} a {to} · Hora de Ciudad de México.</p>{group === 'week' && <p>Semanas desde el lunes. Las semanas que cruzan el intervalo cuentan solo los días seleccionados.</p>}
          <div style={{ maxHeight: 440, overflowY: 'auto' }}><table style={{ width: '100%' }}><thead><tr><th style={cell}>Periodo</th><th style={cell}>Aperturas</th></tr></thead><tbody>{[...periods].reverse().map(([period, count]) => <tr key={period}><td style={cell}>{group === 'week' ? `Semana del ${period}` : period}</td><td style={cell}>{count.toLocaleString('es-MX')}</td></tr>)}</tbody></table></div>
        </section><p>Son aperturas registradas, no personas únicas. Incluyen pruebas y pueden incluir bots. QR y NFC se cuentan juntos si usan el mismo enlace.</p>
      </>;
    } catch { report = <section style={box}><h2 style={heading}>No pudimos cargar este periodo</h2><p>Revisa las fechas o reduce el intervalo. El panel admite hasta diez años y menos de 100,000 registros por consulta. También puede haber un problema temporal de conexión.</p></section>; }
    content = <>
      {query.error && <p role="alert">{notices[query.error] || notices.save}</p>}{query.done && <p role="status">{done[query.done] || 'Guardado.'}</p>}
      <section style={box}><h2 style={heading}>Consultar métricas</h2><form method="get" style={grid}>
        <label>Desde<input style={input} name="from" type="date" defaultValue={from} required /></label><label>Hasta<input style={input} name="to" type="date" defaultValue={to} required /></label>
        <label>Agrupar por<select style={input} name="group" defaultValue={group}><option value="day">Día</option><option value="week">Semana</option><option value="month">Mes</option><option value="year">Año</option></select></label>
        <label>Negocio<select style={input} name="business" defaultValue={selected}><option value="">Todos mis negocios</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><button style={button}>Consultar</button>
      </form></section>{report}
      {admin && <div id="management"><h2 style={heading}>Administrar Tappia</h2>
        <section style={box}><h3 style={heading}>Crear negocio</h3><form action={createBusiness} style={grid}><input type="hidden" name="id" value={randomUUID()} /><label>Nombre del negocio<input style={input} name="name" required maxLength={120} placeholder="Saudade" /></label><button style={button}>Crear negocio</button></form></section>
        {businesses.map(b => <section style={box} key={b.id}><h3 style={heading}>{b.name}</h3>{b.owner_id ? <p>Acceso habilitado.</p> : <><p>Crea su acceso con una contraseña de entre 12 y 128 caracteres. Compártela con el responsable por un medio privado. Si reintentas un alta incompleta, se conserva la contraseña del primer intento.</p><form action={createAccess} style={grid}><input name="business_id" type="hidden" value={b.id} /><label>Correo<input name="email" type="email" required maxLength={254} style={input} autoComplete="off" /></label><label>Contraseña inicial<input name="password" type="password" required minLength={12} maxLength={128} style={input} autoComplete="new-password" /></label><button style={button}>Crear acceso</button></form></>}</section>)}
        {!!businesses.length && <section style={box}><h3 style={heading}>Agregar placa</h3><PlateForm businesses={businesses} /></section>}
        {links.map(link => <section style={box} key={link.code}><h3 style={heading}>Editar {link.code}</h3>{!link.business_id && <p>Sin negocio asignado. Al asignarla, ese negocio podrá ver también sus visitas anteriores.</p>}<PlateForm businesses={businesses} link={link} /></section>)}
      </div>}
    </>;
  } catch { content = <section style={box}><h2 style={heading}>No pudimos cargar el panel</h2><p>Revisa la conexión y que la configuración de negocios esté aplicada.</p><a href="/admin">Reintentar</a></section>; }
  return <div style={{ maxWidth: 1100, margin: 'auto', padding: '28px 20px' }}><header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 28 }}><div><a href="/" style={{ color: '#214a35', fontWeight: 'bold', fontSize: 28 }}>tappia</a><h1 style={{ fontSize: 32, letterSpacing: -1 }}>{admin ? 'Panel de administrador' : 'Mi negocio'}</h1><p>{session.user.email}</p></div><div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>{admin && <a href="#management">Administrar</a>}<form action={logout}><button style={button}>Cerrar sesión</button></form></div></header>{content}</div>;
}
function PlateForm({ businesses, link }) {
  return <form action={savePlate} style={grid}>
    <input type="hidden" name="mode" value={link ? 'edit' : 'create'} />
    <label>Código<input style={input} name="code" defaultValue={link?.code || ''} readOnly={!!link} required pattern="[A-Z0-9_-]{1,32}" maxLength={32} placeholder="S001" /></label>
    <label>Negocio<select style={input} name="business_id" defaultValue={link?.business_id || ''} required><option value="" disabled>Selecciona un negocio</option>{businesses.filter(b => !link?.business_id || b.id === link.business_id).map(b => <option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
    <label>Enlace de destino<input style={input} name="destination" type="url" defaultValue={link?.destination || ''} required maxLength={2048} placeholder="https://…" /></label>
    <label><input type="checkbox" name="active" defaultChecked={link ? link.active : true} /> Activa</label><button style={button}>{link ? 'Guardar cambios' : 'Crear placa'}</button>
  </form>;
}
