/** Indoor air quality: when to air the house, purifiers, and cleaning. */
import { fineToGoOut, scaled } from '../concern.js';
import { joinText, NO_TEXT, type Text } from '../copy/text.js';
import { fmt } from '../figures.js';
import { INDOOR_RATIO, pctCut, PEOPLE_PER_ROOM, round, shutRatio, WET_CLEAN_CUT } from '../impact.js';
import { phrase } from '../spans.js';
import type { SmogTrap, TimeWindow } from '../types.js';
import {
  AFTER_TRAP,
  type AiringFigures,
  BEFORE_TRAP,
  GAS_COOKING,
  keepShutCopy,
  LET_IN_SCOPE,
  normalAiringCopy,
  ONCE_TRAP_LIFTS,
  OTHER_COOKING,
  stillDirtierNote,
  WARMEST_HOURS,
  wideAiringCopy,
} from './copy/airing.js';
import { cleaningCopy, coverageCopy, DUST_SCOPE, purifierCopy } from './copy/indoor.js';
import { SCOPE } from './copy/shared.js';
import { persons } from './household.js';
import { exposureCut, type RecDraft, type RuleInput, type Traits } from './rule.js';
import { shut } from './shared.js';

const VENTILATE = { id: 'ventilate-smart', category: 'indoor' } as const;
const SMOG_DAY: Traits = { shutsWindows: true, smogDefence: true };

/** Where the window sits relative to the trap, worked out from the times rather than assumed. */
function trapOrder(best: TimeWindow, trap: SmogTrap | null): Text {
  if (!trap) return NO_TEXT;
  return best.end <= trap.start ? BEFORE_TRAP : AFTER_TRAP;
}

/** Opening windows wide is honest only when the air let in is no dirtier than shut-window indoor air, or Moderate. */
const airingWide = (best: TimeWindow, avg: number): boolean =>
  best.avgPm25 <= avg * INDOOR_RATIO.closed || fineToGoOut(best.avgPm25);

const airingFigures = (best: TimeWindow, avg: number, cut: number): AiringFigures => ({
  bestPm25: fmt(best.avgPm25),
  avg: fmt(avg),
  cut,
});

/** At most Moderate with no trap coming, shutting windows only traps indoor CO₂ and moisture: normal airing. */
function normalAiring({ profile, avg, best, now }: RuleInput, cut: number): RecDraft | null {
  if (!best || cut < 1 || !airingWide(best, avg)) return null;
  const gas = profile.cooking === 'lpg' || profile.cooking === 'png';
  const copy = normalAiringCopy(
    phrase(best, now, 'around'),
    gas ? GAS_COOKING : OTHER_COOKING,
    airingFigures(best, avg, cut),
  );
  return { ...VENTILATE, priority: 3, ...copy, impact: exposureCut(cut, LET_IN_SCOPE) };
}

function briefAiringTime(best: TimeWindow | null, trap: SmogTrap | null, now: string): Text {
  if (best) return phrase(best, now, 'around');
  return trap ? ONCE_TRAP_LIFTS : WARMEST_HOURS;
}

interface SmogDay {
  priority: RecDraft['priority'];
  order: Text;
  cut: number;
}

function wideAiring({ avg, best, now }: RuleInput, { priority, order, cut }: SmogDay): RecDraft | null {
  if (!best || cut < 1 || !airingWide(best, avg)) return null;
  return {
    ...VENTILATE,
    priority,
    ...wideAiringCopy(phrase(best, now, 'around'), order, airingFigures(best, avg, cut)),
    impact: exposureCut(cut, LET_IN_SCOPE),
    traits: SMOG_DAY,
  };
}

/** Outdoor air dirtier than indoors all day: the cut comes from shut windows; the airing is only for fresh air. */
function keepShut({ profile, avg, best, now, trap }: RuleInput, { priority, order }: SmogDay): RecDraft {
  const windows = shut(profile);
  const note = best ? stillDirtierNote(fmt(best.avgPm25), fmt(avg * shutRatio(profile))) : NO_TEXT;
  const when = briefAiringTime(best, trap, now);
  return {
    ...VENTILATE,
    priority,
    ...keepShutCopy({ when, order, hasBest: best !== null }),
    explanation: joinText([windows.working, note]),
    impact: exposureCut(windows.cut, SCOPE.home),
    traits: SMOG_DAY,
  };
}

/** `best` is already outside any smog trap, so this never says "air the house" during one. */
export function ventilateRec(input: RuleInput): RecDraft | null {
  const { concern, avg, best, trap } = input;
  if (concern === 'low') return null;
  const cut = best ? pctCut(avg, best.avgPm25) : 0;
  if (concern === 'moderate' && !trap) return normalAiring(input, cut);
  const day = { priority: scaled(concern, 'severe'), order: best ? trapOrder(best, trap) : NO_TEXT, cut };
  return wideAiring(input, day) ?? keepShut(input, day);
}

/** One purifier cleans one closed room, so the household needs one per bedroom's worth of people. */
function coverage(people: number): Text {
  return coverageCopy(persons(people), PEOPLE_PER_ROOM, Math.ceil(people / PEOPLE_PER_ROOM));
}

/** From "sensitive groups" up, and not for a household with a purifier: its baseline already counts it running. */
export function purifierRec({ profile, avg, concern }: RuleInput): RecDraft | null {
  if (profile.hasPurifier) return null;
  const pct = (ratio: number): string => fmt(ratio * 100);
  const { closed, diyFilter } = INDOOR_RATIO;
  const cut = pctCut(closed, diyFilter);
  const figures = {
    closedPct: pct(closed),
    diyPct: pct(diyFilter),
    closedUg: fmt(avg * closed),
    diyUg: fmt(avg * diyFilter),
    cut,
  };
  return {
    id: 'diy-purifier',
    category: 'indoor',
    priority: scaled(concern, 'high'),
    ...purifierCopy(coverage(profile.householdSize), figures),
    impact: exposureCut(cut, SCOPE.home),
    traits: { smogDefence: true },
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
    impact: exposureCut(pct, DUST_SCOPE),
    traits: { unreported: true },
  };
}
