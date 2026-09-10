import links from '../data/links.json' with { type: 'json' };

export function validCode(code) {
  return typeof code === 'string' && /^[A-Z0-9_-]{1,32}$/.test(code);
}
export function validDestination(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}
// Storage boundary: replace only this repository when Supabase is connected.
export const linkRepository = {
  async findByCode(code) {
    return links.find(link => link.code === code) ?? null;
  }
};
export async function resolveLink(code, repository = linkRepository) {
  if (!validCode(code)) return { status: 404 };
  const link = await repository.findByCode(code);
  if (!link) return { status: 404 };
  if (!link.active) return { status: 410 };
  if (!validDestination(link.destination)) return { status: 503 };
  return { status: 307, destination: new URL(link.destination).href };
}
