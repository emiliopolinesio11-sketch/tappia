'use client';

import { useEffect, useRef, useState } from 'react';

const inputStyle = { display: 'block', boxSizing: 'border-box', width: '100%', padding: 12, marginTop: 8, borderRadius: 8, border: '1px solid #89988b', fontSize: 16 };

export default function RecoveryForm({ changePassword }) {
  const token = useRef('');
  const initialized = useRef(false);
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access = params.get('access_token');
    if (params.get('type') === 'recovery' && access && access.length <= 16000) {
      token.current = access;
      setValid(true);
    }
    if (params.get('error') || params.get('error_code')) {
      setError('El enlace venció o ya se utilizó. Solicita uno nuevo.');
    }
    // Keep credentials only in memory and remove them from browser history.
    window.history.replaceState(null, '', window.location.pathname);
    setReady(true);
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    form.set('access_token', token.current);
    try {
      const result = await changePassword(form);
      if (result.success) {
        token.current = '';
        setSuccess(true);
      } else setError(result.error);
    } catch {
      setError('No pudimos conectar. Inténtalo de nuevo.');
    } finally { setBusy(false); }
  }

  return <div style={{ maxWidth: 480, margin: '60px auto', padding: 28, background: 'white', border: '1px solid #dce3d5', borderRadius: 20 }}>
    <p style={{ fontWeight: 'bold', fontSize: 28 }}>tappia</p>
    <h1 style={{ fontSize: 30 }}>Recuperar acceso</h1>
    {error && <p role="alert">{error}</p>}
    {!ready ? <p>Preparando recuperación…</p> : success ? <>
      <h2>Contraseña actualizada</h2>
      <p>Guárdala como “Acceso a Tappia” en tu gestor de contraseñas.</p>
      <a href="/admin">Ir al inicio de sesión</a>
    </> : valid ? <>
      <p>Elige una contraseña nueva de entre 12 y 128 caracteres.</p>
      <form onSubmit={submit} style={{ display: 'grid', gap: 18 }}>
        <label>Nueva contraseña<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" style={inputStyle} /></label>
        <label>Repite la contraseña<input name="confirmation" type="password" required minLength={12} maxLength={128} autoComplete="new-password" style={inputStyle} /></label>
        <button disabled={busy} style={{ background: '#214a35', color: 'white', padding: 14, border: 0, borderRadius: 8, fontSize: 16 }}>{busy ? 'Guardando…' : 'Guardar nueva contraseña'}</button>
      </form>
    </> : <><p>Abre el enlace del correo de recuperación para elegir tu nueva contraseña. Si recargaste esta pantalla, solicita un enlace nuevo.</p><a href="/admin">Volver al inicio de sesión</a></>}
  </div>;
}
