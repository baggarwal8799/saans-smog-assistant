/** Sustainable swaps: cleaner cooking, safe heating, no burning, smoke-free mosquito control. */
import {
  CLEAN_FUEL_KITCHEN_CUT,
  MOSQUITO_COIL_CIGARETTES,
  RANGE_HOOD_CUT,
  WASTE_BURNED_KG_PER_PERSON_WEEK,
  WASTE_BURNING_PM25_G_PER_KG,
  WEEKS_PER_MONTH,
  round,
} from '../impact.js';
import { SCOPE } from './shared.js';
import { forMembers, persons } from './household.js';
import { num } from './format.js';
import type { RecDraft, RuleInput } from './rule.js';
import type { Concern } from '../types.js';
import {
  GAS_HEATER,
  INCENSE,
  KIDS_OUT_OF_KITCHEN,
  cleanCookingCopy,
  coilCopy,
  exhaustCopy,
  solidHeatingCopy,
  wasteCopy,
} from './copy/swaps.js';

export function cookingRec({ profile: p, india }: RuleInput): RecDraft {
  if (p.cooking === 'biomass' || p.cooking === 'kerosene') {
    const fuelCut = round(CLEAN_FUEL_KITCHEN_CUT * 100);
    const kids = forMembers(p, { children: KIDS_OUT_OF_KITCHEN });
    return {
      id: 'clean-cooking',
      category: 'swap',
      priority: 1,
      ...cleanCookingCopy(india, kids, fuelCut),
      exposureCutPct: fuelCut,
      scope: SCOPE.kitchen,
      safety: true,
    };
  }
  const hoodCut = round(RANGE_HOOD_CUT * 100);
  return {
    id: 'kitchen-exhaust',
    category: 'indoor',
    priority: 3,
    ...exhaustCopy(hoodCut),
    exposureCutPct: hoodCut,
    scope: SCOPE.kitchen,
  };
}

/** Carbon monoxide can kill overnight, so every fuel-burning heater gets a safety step. */
export function heatingRec({ profile: p, india }: RuleInput): RecDraft | null {
  if (p.heating === 'gas') {
    return { id: 'gas-heater-safety', category: 'swap', priority: 1, ...GAS_HEATER, removesSource: true, safety: true };
  }
  if (p.heating !== 'coal' && p.heating !== 'wood') return null;
  return {
    id: 'safe-heating',
    category: 'swap',
    priority: 1,
    ...solidHeatingCopy(india),
    removesSource: true,
    safety: true,
  };
}

/** The PM2.5 a household's burning puts into the street each month, from its size. */
export function wastePm25GPerMonth(people: number): number {
  return round(people * WASTE_BURNED_KG_PER_PERSON_WEEK * WASTE_BURNING_PM25_G_PER_KG * WEEKS_PER_MONTH);
}

export function wasteRec({ profile: p, india }: RuleInput): RecDraft | null {
  if (!p.burnsWaste) return null;
  const figures = {
    who: persons(p.householdSize),
    kg: WASTE_BURNED_KG_PER_PERSON_WEEK,
    g: WASTE_BURNING_PM25_G_PER_KG,
    weeks: WEEKS_PER_MONTH,
    total: num(wastePm25GPerMonth(p.householdSize)),
  };
  return { id: 'stop-burning', category: 'swap', priority: 1, ...wasteCopy(india, figures), removesSource: true };
}

/** Where coils are unlikely, only incense and candles are left: worth a word on smoggy days, never urgent. */
function incenseRec(concern: Concern): RecDraft | null {
  if (concern === 'low') return null;
  return {
    id: 'no-smoke-indoors',
    category: 'swap',
    priority: 3,
    ...INCENSE,
    removesSource: true,
    shutsWindows: true,
    unreported: true,
  };
}

export function coilRec({ concern, mosquitoes }: RuleInput): RecDraft | null {
  if (!mosquitoes) return incenseRec(concern);
  const { low, high } = MOSQUITO_COIL_CIGARETTES;
  // "Windows shut for smog" is true only on a smoggy day; on a clean one the smoke is still breathed indoors.
  const shut = concern !== 'low';
  return {
    id: 'no-smoke-indoors',
    category: 'swap',
    priority: 2,
    ...coilCopy(shut, low, high),
    removesSource: true,
    shutsWindows: shut,
    unreported: true,
  };
}
