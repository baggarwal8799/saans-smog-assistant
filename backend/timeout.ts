/** Not AbortSignal.timeout: fake timers cannot fire Node's internal timer, and the timeout tests rely on them. */
export async function withTimeout<T>(
  ms: number,
  message: string,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new DOMException(message, 'TimeoutError')), ms);
  try {
    return await run(abort.signal);
  } finally {
    clearTimeout(timer);
  }
}
