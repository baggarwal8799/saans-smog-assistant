/**
 * Only the app's own pages may call the assistant. Every browser fetch POST carries an Origin header, and modern
 * browsers add Sec-Fetch-Site, so a request is accepted only when one of them says it came from this origin. That
 * stops other sites from using the endpoint as a free Gemini proxy through their visitors' browsers, and requests
 * that send neither (scripts) are refused too. Scripts can forge headers, so the per-client daily cap backs this up.
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
