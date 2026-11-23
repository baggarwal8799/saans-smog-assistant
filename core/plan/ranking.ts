/** Ranking and urgency: the order tips are shown in, and which of them stay "Do these first". */
import { cautious } from '../concern.js';
import type { Concern, Recommendation } from '../types.js';
import type { RecDraft } from './rule.js';

/** At most this many non-safety items are "Do these first": a list where everything is urgent tells people nothing. */
export const MAX_URGENT = 3;

/** Life-safety items (carbon monoxide, heavy indoor smoke) always outrank comfort and emissions advice. */
const rank = (draft: RecDraft): number => draft.priority * 2 - (draft.traits?.safety ? 1 : 0);

/** A tip that only protects the people breathing (a mask, staying in, timing): no CO₂, no source removed. */
export const protectsOnly = ({ impact, traits }: RecDraft): boolean =>
  !(impact.co2KgPerMonth ?? 0) && !impact.removesSource && !traits?.safety;

/**
 * Order within a priority: EPA core activity actions first (masks are only a supplement), then, from "sensitive
 * groups" up, other protection before emissions advice. So the MAX_URGENT cut drops a CO₂ switch, then a mask, first.
 */
function kindRank(draft: RecDraft, concern: Concern): number {
  if (draft.traits?.epaActivity) return 0;
  return cautious(concern) && !protectsOnly(draft) ? 2 : 1;
}

/** Stable sort keeps the authored order within a priority; safety items sort ahead of their priority. */
export function rankDrafts(drafts: readonly RecDraft[], concern: Concern): RecDraft[] {
  return [...drafts].sort((a, b) => rank(a) - rank(b) || kindRank(a, concern) - kindRank(b, concern));
}

export function demoteBeyondUrgent(ranked: readonly Recommendation[], concern: Concern): Recommendation[] {
  const slots = concern === 'low' ? 0 : MAX_URGENT;
  const kept: Recommendation[] = [];
  let urgent = 0;
  for (const r of ranked) {
    const takesSlot = !r.safety && r.priority === 1;
    if (takesSlot) urgent += 1;
    kept.push(takesSlot && urgent > slots ? { ...r, priority: 2 as const } : r);
  }
  return kept;
}
