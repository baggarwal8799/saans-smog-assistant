/**
 * A spent free quota resets only daily, so that model is skipped for a while instead of costing every request a
 * wasted round trip. In memory: a cold start costs at most one extra attempt.
 */
export const QUOTA_COOLDOWN_MS = 10 * 60_000;
/** Gemini's 429 text for a spent quota, as opposed to a brief per-minute burst. */
const QUOTA = /quota/i;

export interface Cooldown {
  note(model: string, status: number, detail: string, now?: number): void;
  /** The models to try now: those not cooling down, or every model when all of them are (one may have reset). */
  usable(models: readonly string[], now?: number): string[];
}

export function createCooldown(): Cooldown {
  const coolingUntil = new Map<string, number>();
  return {
    note(model, status, detail, now = Date.now()) {
      if (status === 429 && QUOTA.test(detail)) coolingUntil.set(model, now + QUOTA_COOLDOWN_MS);
    },
    usable(models, now = Date.now()) {
      const ready = models.filter((m) => (coolingUntil.get(m) ?? 0) <= now);
      return ready.length > 0 ? ready : [...models];
    },
  };
}
