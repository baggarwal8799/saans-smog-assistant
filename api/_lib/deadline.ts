/**
 * One time budget per request, shared by every Gemini attempt and the repair call. vercel.json gives the function
 * 30 s (maxDuration); 25 s leaves room for the air fetch before it and the response after it.
 */
export const REQUEST_BUDGET_MS = 25_000;
/** Ceiling for one model attempt; an attempt never gets more than what is left of the budget. */
export const ATTEMPT_TIMEOUT_MS = 9_000;
/** The repair call runs only with at least this much left, so one attempt can still finish. */
export const MIN_REPAIR_MS = 8_000;
/** Below this, a new attempt has no realistic chance to answer, so none is started. */
export const MIN_ATTEMPT_MS = 1_000;

export interface Deadline {
  /** Milliseconds left, never negative. */
  remaining(): number;
}

export function startDeadline(budgetMs = REQUEST_BUDGET_MS, now: () => number = () => Date.now()): Deadline {
  const end = now() + budgetMs;
  return { remaining: () => Math.max(0, end - now()) };
}

/** How long the next attempt may take: the per-attempt ceiling or the time left, whichever is shorter. */
export const attemptTimeout = (deadline: Deadline): number => Math.min(ATTEMPT_TIMEOUT_MS, deadline.remaining());
