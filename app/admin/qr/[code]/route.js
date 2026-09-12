import { cookies } from 'next/headers';
import QRCode from 'qrcode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
const fail = (message, status) => new Response(message, { status, headers });

export async function GET(request, { params }) {
  const { code } = await params;
  if (!/^[A-Z0-9_-]{1,32}$/.test(code)) return fail('Placa no encontrada.', 404);
  const token = (await cookies()).get('tappia_admin')?.value;
  if (!token) return fail('Inicia sesión en Tappia para descargar el QR.', 401);
  try {
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!base || !key) throw new Error();
    const options = { headers: { apikey: key, Authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) };
    // The user's database permissions determine which plates can be downloaded.
    const result = await fetch(new URL(`/rest/v1/links?select=code&code=eq.${code}&limit=1`, base), options);
    if ([401, 403].includes(result.status)) return fail('Tu sesión venció. Vuelve a iniciar sesión.', 401);
    if (!result.ok) throw new Error();
    const plates = await result.json();
    if (!Array.isArray(plates) || plates[0]?.code !== code) return fail('Placa no encontrada.', 404);
    // Always encode the permanent production address, never a preview hostname or destination.
    const url = `https://tappia-taupe.vercel.app/r/${code}`;
    const png = await QRCode.toBuffer(url, { type: 'png', errorCorrectionLevel: 'M', margin: 4, scale: 24, color: { dark: '#000000', light: '#ffffff' } });
    return new Response(new Uint8Array(png), { headers: { ...headers, 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="Tappia-${code}.png"` } });
  } catch { return fail('No pudimos generar el QR. Inténtalo de nuevo.', 503); }
}
