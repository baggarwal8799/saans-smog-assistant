/**
 * A small in-memory cache with an age limit and a size cap, shared by the air fetch (aqi.ts) and the assistant's
 * answers (api/_lib/assistant.ts). Expired entries are dropped on every write, and past `max` the oldest write goes
 * first, so random keys can never exhaust memory.
 */
export interface TtlCache<V> {
  /** The value stored under `key`, or undefined when there is none or it is `ttlMs` old or older. */
  get(key: string, now?: number): V | undefined;
  set(key: string, value: V, now?: number): void;
  clear(): void;
  readonly size: number;
}

export function ttlCache<V>(ttlMs: number, max: number): TtlCache<V> {
  const entries = new Map<string, { at: number; value: V }>();
  const fresh = (at: number, now: number): boolean => now - at < ttlMs;
  return {
    get(key, now = Date.now()) {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (fresh(hit.at, now)) return hit.value;
      entries.delete(key);
      return undefined;
    },
    set(key, value, now = Date.now()) {
      for (const [k, v] of entries) if (!fresh(v.at, now)) entries.delete(k);
      // Deleted first, so a rewrite counts as the newest entry.
      entries.delete(key);
      entries.set(key, { at: now, value });
      while (entries.size > max) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}
