/** The production security headers, read from vercel.json so Vercel, the Node server and Vite agree. */
import { asArray, isRecord } from '../core/parse.js';

interface Header {
  key: string;
  value: string;
}

interface HeaderOptions {
  /** Keep HSTS and upgrade-insecure-requests; over plain HTTP they would break the site. */
  https: boolean;
}

const isHeader = (h: unknown): h is Header => isRecord(h) && typeof h.key === 'string' && typeof h.value === 'string';

/** The headers vercel.json sets on every path (`/(.*)`); malformed entries are skipped. */
function globalHeaders(vercelJson: string): Header[] {
  const config: unknown = JSON.parse(vercelJson);
  const rules = isRecord(config) ? asArray(config.headers) : [];
  const global = rules.find((rule) => isRecord(rule) && rule.source === '/(.*)');
  return isRecord(global) ? asArray(global.headers).filter(isHeader) : [];
}

export function securityHeaders(vercelJson: string, { https }: HeaderOptions): Record<string, string> {
  return Object.fromEntries(
    globalHeaders(vercelJson)
      .filter((h) => https || h.key !== 'Strict-Transport-Security')
      .map((h) => [h.key, https ? h.value : h.value.replace(/;\s*upgrade-insecure-requests/, '')]),
  );
}
