/** Static files for the self-hosted server: safe paths, Brotli/gzip compression, and ETag/304. */
import { createReadStream, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib';

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

export function pathOf(url: string): string {
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}

/** Resolves a URL path inside ROOT, or null if it would escape it (path traversal). */
export function safePath(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathOf(urlPath));
  } catch {
    return null;
  }
  const full = normalize(join(root, decoded));
  return full === root || full.startsWith(root + sep) ? full : null;
}

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.txt']);
/** Compressed copies of static files, made once per file and encoding (the build output never changes). */
const compressed = new Map<string, Buffer>();

export function pickEncoding(acceptEncoding: string | undefined): 'br' | 'gzip' | null {
  const accepted = (acceptEncoding ?? '').toLowerCase();
  if (/\bbr\b/.test(accepted)) return 'br';
  if (/\bgzip\b/.test(accepted)) return 'gzip';
  return null;
}

function compress(file: string, encoding: 'br' | 'gzip'): Buffer {
  const key = `${encoding}:${file}`;
  let body = compressed.get(key);
  if (!body) {
    const raw = readFileSync(file);
    body =
      encoding === 'br'
        ? brotliCompressSync(raw, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } })
        : gzipSync(raw, { level: 9 });
    compressed.set(key, body);
  }
  return body;
}

export function serveFile(
  req: IncomingMessage,
  res: ServerResponse,
  file: string,
  headers: Record<string, string>,
): void {
  const ext = extname(file);
  const stat = statSync(file);
  const hashedAsset = file.includes(`${sep}assets${sep}`);
  // A cheap validator: unchanged files answer 304 instead of being sent again.
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const base = {
    ...headers,
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    etag,
    vary: 'Accept-Encoding',
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, base).end();
    return;
  }
  const encoding = COMPRESSIBLE.has(ext) ? pickEncoding(req.headers['accept-encoding']) : null;
  if (encoding) {
    const body = compress(file, encoding);
    res.writeHead(200, { ...base, 'content-encoding': encoding, 'content-length': String(body.length) });
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }
  res.writeHead(200, { ...base, 'content-length': String(stat.size) });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}
