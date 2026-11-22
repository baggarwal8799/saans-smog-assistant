/**
 * Reads a request body (a web Request, or the self-hosted server's stream) as text, stopping as soon as it passes
 * `limit` bytes. A chunked upload has no Content-Length to check up front, so the cap is enforced while reading and
 * an oversized body is never held whole.
 */
export async function readCapped(
  source: { body: ReadableStream<Uint8Array> | null },
  limit: number,
): Promise<string | null> {
  if (!source.body) return '';
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}
