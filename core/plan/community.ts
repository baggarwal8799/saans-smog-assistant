/**
 * Community action for the winter: pooled rides, a no-burning pledge and a shared clean room. These are community
 * figures, so they are never added to the household's own total.
 */
import { cautious } from '../concern.js';
import { joinList, joinSteps, joinText, type Text } from '../copy/text.js';
import { fmt } from '../figures.js';
import {
  EMISSION_KG_PER_KM,
  INDOOR_RATIO,
  monthlyCommuteCo2Kg,
  pctCut,
  round,
  WASTE_BURNED_KG_PER_PERSON_WEEK,
  WASTE_BURNING_PM25_G_PER_KG,
  WEEKS_PER_MONTH,
} from '../impact.js';
import { local } from '../place.js';
import type { Concern, Profile } from '../types.js';
import { monthlyCommuteKm } from './commute.js';
import * as copy from './copy/community.js';
import { persons } from './household.js';
import { exposureCut, type RecDraft, type RuleInput } from './rule.js';
import { HEAVY_EXERTION_AQI } from './shared.js';
import { wastePm25GPerMonth } from './swaps.js';

/** Stated assumptions: four people to a pooled car; a pledge signed by 20 homes on one street or block. */
const POOL = 4;
const PLEDGE_HOMES = 20;
/** The route used for people who do not drive, so the pool figure is a labelled example, not their own. */
const EXAMPLE_KM = 10;

type PlaceWords = (typeof copy.PLACE_WORDS)[keyof typeof copy.PLACE_WORDS];

interface Step {
  name: Text;
  what: (words: PlaceWords) => Text;
  working: Text;
}

/** Pooled rides, offered to drivers and to families with children; `savedKg` is what the other cars stop emitting. */
function poolStep(profile: Profile): (Step & { savedKg: number }) | null {
  const pool = copy.poolName({ car: profile.commuteMode === 'car', kids: profile.hasChildren });
  if (!pool) return null;
  const own = profile.commuteMode === 'car' && profile.commuteKm > 0;
  const routeKm = own ? profile.commuteKm : EXAMPLE_KM;
  const cars = POOL - 1;
  const savedKg = round(monthlyCommuteCo2Kg('car', routeKm) * cars, 1);
  const working = copy.poolWorking({
    pool: POOL,
    own,
    routeKm,
    cars,
    monthKm: fmt(monthlyCommuteKm(routeKm)),
    kgPerKm: EMISSION_KG_PER_KM.car,
    savedKg,
  });
  return { name: copy.STEP_NAME.pool, what: () => pool, working, savedKg };
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
  return { name: copy.STEP_NAME.pledge, what: (words) => copy.pledge(words.burnt, words.to), working };
}

/** A shared clean room keeps outdoor smog out, so it is skipped on a clean-air day. */
function roomStep(concern: Concern): (Step & { cut: number }) | null {
  if (concern === 'low') return null;
  const { closed, purifier } = INDOOR_RATIO;
  const cut = pctCut(closed, purifier);
  const working = copy.roomWorking(fmt(closed * 100), fmt(purifier * 100), cut);
  return { name: copy.STEP_NAME.room, what: (words) => copy.cleanRoom(words.place), working, cut };
}

export function communityRec({ profile, concern, india }: RuleInput): RecDraft | null {
  const pool = poolStep(profile);
  const room = roomStep(concern);
  const parts = [pool, pledgeStep(profile.householdSize), room].filter((s): s is Step => s !== null);
  const lead = copy.lead(parts.length);
  const what = (words: PlaceWords): Text => joinSteps(parts.map((s) => s.what(words)));
  return {
    id: 'community-plan',
    category: 'community',
    priority: cautious(concern) ? 2 : 3,
    title: copy.title(joinList(parts.map((s) => s.name))),
    detail: local(
      { india },
      copy.detailIndia(lead, what(copy.PLACE_WORDS.india), HEAVY_EXERTION_AQI),
      copy.detailAbroad(lead, what(copy.PLACE_WORDS.abroad), HEAVY_EXERTION_AQI),
    ),
    explanation: joinText([...parts.map((s) => s.working), copy.COMMUNITY_NOTE], ' '),
    impact: {
      ...(pool ? { co2KgPerMonth: pool.savedKg } : {}),
      ...(room ? exposureCut(room.cut, copy.ROOM_SCOPE) : {}),
      // The pledge takes burning smoke out of the street's air: a source removed, counted for the community only.
      removesSource: true,
      community: true,
    },
  };
}
