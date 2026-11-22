/** Ranking and urgency: the order tips are shown in, and which of them stay "Do these first". */
import { cautious } from '../concern.js';
import type { Concern, Recommendation } from '../types.js';
import type { RecDraft } from './rule.js';

/** At most this many non-safety items are "Do these first": a list where everything is urgent tells people nothing. */
export const MAX_URGENT = 3;

/** Life-safety items (carbon monoxide, heavy indoor smoke) always outrank comfort and emissions advice. */
const rank = (d: RecDraft): number => d.priority * 2 - (d.safety ? 1 : 0);

/** A tip that only protects the people breathing (a mask, staying in, timing): no CO₂, no source removed. */
type ImpactFlags = Partial<Record<'removesSource' | 'safety', boolean | undefined>> & {
  co2KgPerMonth?: number | undefined;
};
export const protectsOnly = (d: ImpactFlags): boolean => !(d.co2KgPerMonth ?? 0) && !d.removesSource && !d.safety;

/**
 * Order within a priority: EPA core activity actions first (masks are only a supplement), then, from "sensitive
 * groups" up, other protection before emissions advice. So the MAX_URGENT cut drops a CO₂ switch, then a mask, first.
 */
function kindRank(d: RecDraft, concern: Concern): number {
  if (d.epaActivity) return 0;
  return cautious(concern) && !protectsOnly(d) ? 2 : 1;
}

/** Stable sort keeps the authored order within a priority; safety items sort ahead of their priority. */
export function rankDrafts(drafts: readonly RecDraft[], concern: Concern): RecDraft[] {
  return [...drafts].sort((a, b) => rank(a) - rank(b) || kindRank(a, concern) - kindRank(b, concern));
}

/**
 * Keeps at most MAX_URGENT non-safety items at priority 1 and demotes the rest to 2. Safety items have their own
 * group and take no slot; on a clean-air day nothing else is urgent.
 */
export function demoteBeyondUrgent(ranked: readonly Recommendation[], concern: Concern): Recommendation[] {
  const slots = concern === 'low' ? 0 : MAX_URGENT;
  let urgent = 0;
  return ranked.map((r) => (!r.safety && r.priority === 1 && ++urgent > slots ? { ...r, priority: 2 as const } : r));
}
