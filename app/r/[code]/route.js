import { resolveLink } from '../../../lib/links.mjs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow' };
export async function GET(request, { params }) {
  try {
    const { code } = await params;
    const result = await resolveLink(code);
    if (result.status === 307) {
      // Prevent a configured destination from looping back to this redirect service.
      const target = new URL(result.destination);
      if (target.origin === new URL(request.url).origin && /^\/r(?:\/|$)/.test(target.pathname)) {
        return new Response('Destino no disponible.', { status: 503, headers });
      }
      return new Response(null, { status: 307, headers: { ...headers, Location: result.destination } });
    }
    const messages = { 404: 'No encontramos esta placa.', 410: 'Esta placa está pausada.', 503: 'Destino no disponible.' };
    return new Response(messages[result.status], { status: result.status, headers });
  } catch {
    return new Response('Servicio temporalmente no disponible.', { status: 503, headers });
  }
}
