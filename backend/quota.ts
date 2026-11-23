/**
 * Daily ceilings, because the per-minute limit cannot stop many addresses draining the free quota: a global cap
 * protects the key, and a per-client cap keeps one client from using up the global one. Reset at 00:00 UTC.
 */
import { isoDate } from '../core/isoTime.js';
import type { CounterStore } from './store.js';

export const DEFAULT_MAX_AI_CALLS_PER_DAY = 1000;
export const DEFAULT_MAX_AI_REQUESTS_PER_CLIENT_PER_DAY = 60;

/** A whole number ≥ 0 from the environment, otherwise `fallback`. */
function envLimit(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n >= 0 ? n : fallback;
}

export const dailyLimit = (raw: string | undefined): number => envLimit(raw, DEFAULT_MAX_AI_CALLS_PER_DAY);

export const clientDailyLimit = (raw: string | undefined): number =>
  envLimit(raw, DEFAULT_MAX_AI_REQUESTS_PER_CLIENT_PER_DAY);

/** Seconds until the next 00:00 UTC, so a day's key expires when the day ends. */
export function secondsToUtcMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

/** Counts per key per UTC day on a counter store. Use one key (the default) for a global cap, or a client address. */
export class DailyQuota {
  constructor(
    private readonly store: CounterStore,
    private readonly name: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private count(key: string, by: number): Promise<number> {
    const now = this.now();
    // The day is in the key, so a new UTC day starts at zero even before the old key expires.
    return this.store.incr(`${this.name}:${isoDate(now.toISOString())}:${key}`, secondsToUtcMidnight(now), by);
  }

  /** Units left today (adds 0, so it only reads). */
  async remaining(limit: number, key = '*'): Promise<number> {
    return Math.max(0, limit - (await this.count(key, 0)));
  }

  /** Counts one; false when today's ceiling for `key` is already reached. */
  async take(limit: number, key = '*'): Promise<boolean> {
    return (await this.count(key, 1)) <= limit;
  }
}
