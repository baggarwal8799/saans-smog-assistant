import { fineToGoOut } from '../../core/concern.js';
import type { MessageKey } from '../../core/i18n.js';
import type { TimeWindow } from '../../core/types.js';

/**
 * The UI labels for the cleanest window: "best" wording only when that window's own air allows it, and no "if you
 * must go out" when the EPA guide says the household should avoid all physical activity outdoors.
 */
export function bestLabels(
  w: TimeWindow | null,
  { avoidAllOutdoors = false }: { avoidAllOutdoors?: boolean } = {},
): { window: MessageKey; key: MessageKey } {
  if (avoidAllOutdoors) return { window: 'bestWindowStayIn', key: 'keyBestNeutral' };
  if (w && fineToGoOut(w.avgPm25)) return { window: 'bestWindow', key: 'keyBest' };
  return { window: 'bestWindowNeutral', key: 'keyBestNeutral' };
}
