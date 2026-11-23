/** Static files for the self-hosted server: safe paths, Brotli/gzip compression, and ETag/304. */
import { createReadStream, type Stats } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';

import { ttlCache } from '../core/ttlCache.js';

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

/** Null when the path would escape `root` (path traversal). */
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
const DAY_MS = 24 * 60 * 60 * 1000;
const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

type Encoding = 'br' | 'gzip';

export function pickEncoding(acceptEncoding: string | undefined): Encoding | null {
  const accepted = (acceptEncoding ?? '').toLowerCase();
  if (/\bbr\b/.test(accepted)) return 'br';
  if (/\bgzip\b/.test(accepted)) return 'gzip';
  return null;
}

/** Maximum quality: each file is compressed once per version, off the event loop, then served from memory. */
const encode = (raw: Buffer, encoding: Encoding): Promise<Buffer> =>
  encoding === 'br'
    ? brotliAsync(raw, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } })
    : gzipAsync(raw, { level: 9 });

/** A cheap validator from size and modification time: unchanged files answer 304 instead of being sent again. */
const etagOf = (stat: Stats): string => `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;

export const isFile = (path: string): Promise<boolean> =>
  stat(path).then(
    (s) => s.isFile(),
    () => false,
  );

async function compressibleFiles(root: string): Promise<string[]> {
  const assets = join(root, 'assets');
  const built = (await readdir(assets).catch(() => [])).map((name) => join(assets, name));
  return [join(root, 'index.html'), ...built].filter((file) => COMPRESSIBLE.has(extname(file)));
}

/** One app's compressed copies; kept per app, so two servers (or two tests) never share a cache. */
export class StaticFiles {
  /** Capped, so memory stays bounded whatever is requested. */
  private readonly compressed = ttlCache<Buffer>(DAY_MS, 100);
  /** Concurrent first requests for a file share one job. */
  private readonly pending = new Map<string, Promise<Buffer>>();

  private compress(file: string, encoding: Encoding, etag: string): Promise<Buffer> {
    const key = `${encoding}:${etag}:${file}`;
    const done = this.compressed.get(key);
    if (done) return Promise.resolve(done);
    let job = this.pending.get(key);
    if (!job) {
      job = readFile(file)
        .then((raw) => encode(raw, encoding))
        .then((body) => {
          this.compressed.set(key, body);
          return body;
        })
        .finally(() => this.pending.delete(key));
      this.pending.set(key, job);
    }
    return job;
  }

  /** Compresses the build at startup, one file at a time, so no visitor waits for Brotli. Never rejects. */
  async precompress(root: string): Promise<void> {
    for (const file of await compressibleFiles(root)) {
      for (const encoding of ['br', 'gzip'] as const) {
        try {
          await this.compress(file, encoding, etagOf(await stat(file)));
        } catch {
          // An unreadable file is left to its first request, which answers 500.
        }
      }
    }
  }

  /** Resolves once the response is written; rejects only if the file cannot be read. */
  async serveFile(
    req: IncomingMessage,
    res: ServerResponse,
    file: string,
    headers: Record<string, string>,
  ): Promise<void> {
    const ext = extname(file);
    const stats = await stat(file);
    const etag = etagOf(stats);
    const base = {
      ...headers,
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      etag,
      vary: 'Accept-Encoding',
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, base).end();
      return;
    }
    const encoding = COMPRESSIBLE.has(ext) ? pickEncoding(req.headers['accept-encoding']) : null;
    if (encoding) {
      const body = await this.compress(file, encoding, etag);
      res.writeHead(200, { ...base, 'content-encoding': encoding, 'content-length': String(body.length) });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    res.writeHead(200, { ...base, 'content-length': String(stats.size) });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  }
}

export const createStaticServer = (): StaticFiles => new StaticFiles();
