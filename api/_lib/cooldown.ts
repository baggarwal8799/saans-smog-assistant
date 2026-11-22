/**
 * A model that answers "quota exceeded" stays out of reach for a while (Gemini's free daily quota resets once a
 * day), so it is skipped for a cooldown instead of costing every request a wasted round trip before the next model.
 * A short "high demand" 503 is not a quota answer and causes no cooldown. Per instance, in memory: losing it on a
 * cold start costs at most one extra attempt.
 */
export const QUOTA_COOLDOWN_MS = 10 * 60_000;
/** Gemini's 429 text for a spent quota, as opposed to a brief per-minute burst. */
const QUOTA = /quota/i;

const coolingUntil = new Map<string, number>();

export function noteFailure(model: string, status: number, detail: string, now = Date.now()): void {
  if (status === 429 && QUOTA.test(detail)) coolingUntil.set(model, now + QUOTA_COOLDOWN_MS);
}

/** The models to try now: those not cooling down, or every model when all of them are (one may have reset). */
export function usableModels(models: readonly string[], now = Date.now()): string[] {
  const ready = models.filter((m) => (coolingUntil.get(m) ?? 0) <= now);
  return ready.length > 0 ? ready : [...models];
}

/** For tests. */
export const resetCooldowns = (): void => coolingUntil.clear();
