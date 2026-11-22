/** Indoor air quality: when to air the house, purifiers, and cleaning. */
import { fineToGoOut, scaled } from '../concern.js';
import { INDOOR_RATIO, PEOPLE_PER_ROOM, WET_CLEAN_CUT, pctCut, round, shutRatio } from '../impact.js';
import type { SmogTrap, TimeWindow } from '../types.js';
import { SCOPE, shut } from './shared.js';
import { joinText, type Text } from './text.js';
import { num } from './format.js';
import { persons } from './household.js';
import type { RecDraft, RuleInput } from './rule.js';
import { phrase } from './spans.js';
import {
  AFTER_TRAP,
  BEFORE_TRAP,
  GAS_COOKING,
  LET_IN_SCOPE,
  NONE,
  ONCE_TRAP_LIFTS,
  OTHER_COOKING,
  WARMEST_HOURS,
  cleaningCopy,
  coverageCopy,
  keepShutCopy,
  normalAiringCopy,
  purifierCopy,
  stillDirtierNote,
  wideAiringCopy,
} from './copy/indoor.js';

/** Every variant of the airing tip shares its id and category. */
const VENTILATE = { id: 'ventilate-smart', category: 'indoor' } as const;
/** Fields shared by the two smog-day variants, which both ask for shut windows. */
const SMOG_DAY = { shutsWindows: true, smogDefence: true } as const;

/** Where the window sits relative to the trap, worked out from the times rather than assumed. */
function trapOrder(best: TimeWindow, trap: SmogTrap | null): Text {
  if (!trap) return NONE;
  return best.end <= trap.start ? BEFORE_TRAP : AFTER_TRAP;
}

/** Opening windows wide is honest only when the air let in is no dirtier than shut-window indoor air, or Moderate. */
export const airingWide = (best: TimeWindow, avg: number): boolean =>
  best.avgPm25 <= avg * INDOOR_RATIO.closed || fineToGoOut(best.avgPm25);

const airingFigures = (best: TimeWindow, avg: number, cut: number) => ({
  bestPm25: num(best.avgPm25),
  avg: num(avg),
  cut,
});

/**
 * At most Moderate with no trap coming, shutting windows only traps indoor CO₂, moisture and gas-flame NO₂,
 * so the tip is normal airing, timed at the cleanest hours.
 */
function normalAiring({ profile: p, avg, best, now }: RuleInput, cut: number): RecDraft | null {
  if (!best || cut < 1 || !airingWide(best, avg)) return null;
  const gas = p.cooking === 'lpg' || p.cooking === 'png';
  const copy = normalAiringCopy(
    phrase(best, now, 'around'),
    gas ? GAS_COOKING : OTHER_COOKING,
    airingFigures(best, avg, cut),
  );
  return { ...VENTILATE, priority: 3, ...copy, exposureCutPct: cut, scope: LET_IN_SCOPE };
}

/** When to give the brief airing if no window is clean: after a trap lifts, else the best-mixed afternoon. */
function briefAiringTime(best: TimeWindow | null, trap: SmogTrap | null, now: string): Text {
  if (best) return phrase(best, now, 'around');
  return trap ? ONCE_TRAP_LIFTS : WARMEST_HOURS;
}

/**
 * `best` is already chosen outside any smog trap, so this never says "air the house" during one. Clean-air day:
 * nothing to time or shut out, so no tip; Moderate: normal airing.
 */
export function ventilateRec(input: RuleInput): RecDraft | null {
  const { profile: p, concern, avg, best, now, trap } = input;
  if (concern === 'low') return null;
  const priority = scaled(concern, 'severe');
  const cut = best ? pctCut(avg, best.avgPm25) : 0;
  if (concern === 'moderate' && !trap) return normalAiring(input, cut);
  const order = best ? trapOrder(best, trap) : NONE;
  if (best && cut >= 1 && airingWide(best, avg)) {
    return {
      ...VENTILATE,
      priority,
      ...wideAiringCopy(phrase(best, now, 'around'), order, airingFigures(best, avg, cut)),
      exposureCutPct: cut,
      scope: LET_IN_SCOPE,
      ...SMOG_DAY,
    };
  }
  // Outdoor air dirtier than indoors all day: the cut comes from shut windows; the airing is only for fresh air.
  const windows = shut(p);
  const note = best ? stillDirtierNote(num(best.avgPm25), num(avg * shutRatio(p))) : NONE;
  return {
    ...VENTILATE,
    priority,
    ...keepShutCopy(briefAiringTime(best, trap, now), order, best !== null),
    explanation: joinText(windows.working, note),
    exposureCutPct: windows.cut,
    scope: SCOPE.home,
    ...SMOG_DAY,
  };
}

/** One purifier cleans one closed room, so the household needs one per bedroom's worth of people. */
function coverage(people: number): Text {
  return coverageCopy(persons(people), PEOPLE_PER_ROOM, Math.ceil(people / PEOPLE_PER_ROOM));
}

/**
 * Worth building from "sensitive groups" up. A household with a purifier gets no tip: its dose baseline already
 * counts it running, and a tip must change something.
 */
export function purifierRec({ profile: p, avg, concern }: RuleInput): RecDraft | null {
  if (p.hasPurifier) return null;
  const pct = (ratio: number): string => num(ratio * 100);
  const { closed, diyFilter } = INDOOR_RATIO;
  const cut = pctCut(closed, diyFilter);
  const figures = {
    closedPct: pct(closed),
    diyPct: pct(diyFilter),
    closedUg: num(avg * closed),
    diyUg: num(avg * diyFilter),
    cut,
  };
  return {
    id: 'diy-purifier',
    category: 'indoor',
    priority: scaled(concern, 'high'),
    ...purifierCopy(coverage(p.householdSize), figures),
    exposureCutPct: cut,
    scope: SCOPE.home,
    smogDefence: true,
  };
}

export function cleaningRec(): RecDraft {
  const pct = round(WET_CLEAN_CUT * 100);
  // The scope is dust the household stirs up, not outdoor smog, so the dose model does not count it.
  return {
    id: 'wet-clean',
    category: 'indoor',
    priority: 3,
    ...cleaningCopy(pct),
    exposureCutPct: pct,
    unreported: true,
  };
}
