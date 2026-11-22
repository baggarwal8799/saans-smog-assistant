import { describe, expect, it } from 'vitest';
import { readCapped } from './body';

/** A request whose body arrives in chunks with no Content-Length, as a chunked upload does. */
function chunked(parts: string[]): Request {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of parts) c.enqueue(enc.encode(p));
      c.close();
    },
  });
  return new Request('http://x/api', { method: 'POST', body, duplex: 'half' } as RequestInit);
}

describe('readCapped', () => {
  it('returns the whole body when it fits, including multi-byte text split across chunks', () => {
    return expect(readCapped(chunked(['{"q":"दि', 'ल्ली"}']), 100)).resolves.toBe('{"q":"दिल्ली"}');
  });

  it('stops at the cap for a chunked body with no Content-Length', async () => {
    expect(await readCapped(chunked(['a'.repeat(60), 'b'.repeat(60)]), 100)).toBeNull();
  });

  it('reads an empty body as empty text', async () => {
    expect(await readCapped(new Request('http://x/api', { method: 'POST' }), 100)).toBe('');
  });
});
