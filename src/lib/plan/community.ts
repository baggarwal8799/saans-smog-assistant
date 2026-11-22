/**
 * Community action for the winter: pooled rides, a no-burning pledge and a shared clean room. These are community
 * figures, so they are never added to the household's own total.
 */
import { cautious } from '../concern.js';
import {
  EMISSION_KG_PER_KM,
  INDOOR_RATIO,
  WASTE_BURNED_KG_PER_PERSON_WEEK,
  WASTE_BURNING_PM25_G_PER_KG,
  WEEKS_PER_MONTH,
  monthlyCommuteCo2Kg,
  pctCut,
  round,
} from '../impact.js';
import * as copy from './copy/community.js';
import { HEAVY_EXERTION_AQI } from './shared.js';
import { bilingual, joinList, type Text } from './text.js';
import { local } from './place.js';
import { num } from './format.js';
import { persons } from './household.js';
import type { RecDraft, RuleInput } from './rule.js';
import { wastePm25GPerMonth } from './swaps.js';
import { monthlyCommuteKm } from './commute.js';
import type { Concern, Profile } from '../types.js';

/** Stated assumptions: four people to a pooled car; a pledge signed by 20 homes on one street or block. */
const POOL = 4;
const PLEDGE_HOMES = 20;
/** The route used for people who do not drive, so the pool figure is a labelled example, not their own. */
const EXAMPLE_KM = 10;

/** "a; b; and c" / "a; b; और c": the steps, which contain commas of their own. */
const steps = (items: readonly string[], and: string): string =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join('; ')}; ${and} ${items.slice(-1).join('')}`;
const stepList = (items: readonly Text[]): Text =>
  bilingual(
    steps(
      items.map((t) => t.en),
      'and',
    ),
    steps(
      items.map((t) => t.hi),
      'और',
    ),
  );
const sentences = (items: readonly Text[]): Text =>
  bilingual(items.map((t) => t.en).join(' '), items.map((t) => t.hi).join(' '));

type PlaceWords = (typeof copy.PLACE_WORDS)[keyof typeof copy.PLACE_WORDS];

/** One community step: its short name, its wording for the place, and its working. */
interface Step {
  name: Text;
  what: (w: PlaceWords) => Text;
  working: Text;
}

/** Pooled rides, offered to drivers and to families with children; `kg` is the CO₂ the other cars stop emitting. */
function poolStep(p: Profile): (Step & { kg: number }) | null {
  const pool = copy.poolName(p.commuteMode === 'car', p.hasChildren);
  if (!pool) return null;
  const own = p.commuteMode === 'car' && p.commuteKm > 0;
  const km = own ? p.commuteKm : EXAMPLE_KM;
  const cars = POOL - 1;
  const kg = round(monthlyCommuteCo2Kg('car', km) * cars, 1);
  const working = copy.poolWorking({
    pool: POOL,
    own,
    km,
    cars,
    monthKm: num(monthlyCommuteKm(km)),
    ef: EMISSION_KG_PER_KM.car,
    kg,
  });
  return { name: copy.STEP_NAME.pool, what: () => pool, working, kg };
}

/** The no-burning pledge applies everywhere (winter smoke comes from burning in every city). */
function pledgeStep(people: number): Step {
  const working = copy.pledgeWorking({
    homes: PLEDGE_HOMES,
    who: persons(people),
    kgWeek: WASTE_BURNED_KG_PER_PERSON_WEEK,
    gPerKg: WASTE_BURNING_PM25_G_PER_KG,
    weeks: WEEKS_PER_MONTH,
    grams: wastePm25GPerMonth(PLEDGE_HOMES * people),
  });
  return { name: copy.STEP_NAME.pledge, what: (w) => copy.pledge(w.burnt, w.to), working };
}

/** A shared clean room keeps outdoor smog out, so it is skipped on a clean-air day. */
function roomStep(concern: Concern): (Step & { cut: number }) | null {
  if (concern === 'low') return null;
  const { closed, purifier } = INDOOR_RATIO;
  const cut = pctCut(closed, purifier);
  const working = copy.roomWorking(num(closed * 100), num(purifier * 100), cut);
  return { name: copy.STEP_NAME.room, what: (w) => copy.cleanRoom(w.place), working, cut };
}

/** Every household gets at least the pledge. */
export function communityRec({ profile: p, concern, india }: RuleInput): RecDraft | null {
  const pool = poolStep(p);
  const room = roomStep(concern);
  const parts = [pool, pledgeStep(p.householdSize), room].filter((s): s is Step => s !== null);
  const lead = copy.lead(parts.length > 1);
  const what = (w: PlaceWords): Text => stepList(parts.map((s) => s.what(w)));
  return {
    id: 'community-plan',
    category: 'community',
    priority: cautious(concern) ? 2 : 3,
    title: copy.title(joinList(parts.map((s) => s.name))),
    detail: local(
      india,
      copy.detailIndia(lead, what(copy.PLACE_WORDS.india), HEAVY_EXERTION_AQI),
      copy.detailAbroad(lead, what(copy.PLACE_WORDS.abroad), HEAVY_EXERTION_AQI),
    ),
    explanation: sentences([...parts.map((s) => s.working), copy.COMMUNITY_NOTE]),
    ...(pool ? { co2KgPerMonth: pool.kg } : {}),
    // The pledge takes burning smoke out of the street's air: a source removed, counted for the community only.
    removesSource: true,
    ...(room ? { exposureCutPct: room.cut, scope: copy.ROOM_SCOPE } : {}),
    community: true,
  };
}
