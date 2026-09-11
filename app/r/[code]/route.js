import { resolveLink } from '../../../lib/links.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
};

async function handle(request, { params }, countVisit) {
  try {
    const { code } = await params;
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;

    if (!base || !key) throw new Error('Missing configuration');

    const api = new URL('/rest/v1/', base);
    if (api.protocol !== 'https:') {
      throw new Error('Invalid configuration');
    }

    const repository = {
      async findByCode(code) {
        const url = new URL('links', api);
        url.searchParams.set('code', `eq.${code}`);
        url.searchParams.set('select', 'code,destination,active');
        url.searchParams.set('limit', '1');

        const response = await fetch(url, {
          headers: { apikey: key },
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) throw new Error('Lookup failed');

        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error('Invalid response');

        return rows[0] ?? null;
      },
    };

    const result = await resolveLink(code, repository);

    if (result.status !== 307) {
      const messages = {
        404: 'No encontramos esta placa.',
        410: 'Esta placa está pausada.',
        503: 'Destino no disponible.',
      };

      return new Response(messages[result.status], {
        status: result.status,
        headers,
      });
    }

    const target = new URL(result.destination);

    if (
      target.origin === new URL(request.url).origin &&
      /^\/r(?:\/|$)/.test(target.pathname)
    ) {
      return new Response('Destino no disponible.', {
        status: 503,
        headers,
      });
    }

    if (countVisit) {
      try {
        const saved = await fetch(new URL('visits', api), {
          method: 'POST',
          headers: {
            apikey: key,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ link_code: code }),
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.timeout(2000),
        });

        if (!saved.ok) {
          console.error('Tappia: no se pudo registrar la visita.');
        }
      } catch {
        console.error('Tappia: no se pudo registrar la visita.');
      }
    }

    return new Response(null, {
      status: 307,
      headers: { ...headers, Location: result.destination },
    });
  } catch {
    console.error('Tappia: consulta de placa no disponible.');

    return new Response('Servicio temporalmente no disponible.', {
      status: 503,
      headers,
    });
  }
}

export async function GET(request, context) {
  return handle(request, context, true);
}

export async function HEAD(request, context) {
  return handle(request, context, false);
}
