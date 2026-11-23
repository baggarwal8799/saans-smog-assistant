/**
 * Only the app's own pages may call the assistant, so other sites cannot use it as a free Gemini proxy through their
 * visitors' browsers. Scripts can forge these headers, so the per-client daily cap backs this up.
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') return false;
  const origin = request.headers.get('origin');
  if (origin === null) return site === 'same-origin';
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
