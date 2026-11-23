/** Sustainable swaps: cleaner cooking, safe heating, no burning, smoke-free mosquito control. */
import { fmt } from '../figures.js';
import {
  CLEAN_FUEL_KITCHEN_CUT,
  MOSQUITO_COIL_CIGARETTES,
  RANGE_HOOD_CUT,
  round,
  WASTE_BURNED_KG_PER_PERSON_WEEK,
  WASTE_BURNING_PM25_G_PER_KG,
  WEEKS_PER_MONTH,
} from '../impact.js';
import type { Concern } from '../types.js';
import { cleanCookingCopy, exhaustCopy, KIDS_OUT_OF_KITCHEN } from './copy/cooking.js';
import { SCOPE } from './copy/shared.js';
import { coilCopy, GAS_HEATER, INCENSE, solidHeatingCopy, wasteCopy } from './copy/swaps.js';
import { forMembers, persons } from './household.js';
import { type DraftImpact, exposureCut, type RecDraft, type RuleInput } from './rule.js';

const REMOVES_SOURCE: DraftImpact = { removesSource: true };
const SAFE_SOURCE_FIX: Pick<RecDraft, 'impact' | 'traits'> = { impact: REMOVES_SOURCE, traits: { safety: true } };

export function cookingRec({ profile, india }: RuleInput): RecDraft {
  if (profile.cooking === 'biomass' || profile.cooking === 'kerosene') {
    const fuelCut = round(CLEAN_FUEL_KITCHEN_CUT * 100);
    const kids = forMembers(profile, { children: KIDS_OUT_OF_KITCHEN });
    return {
      id: 'clean-cooking',
      category: 'swap',
      priority: 1,
      ...cleanCookingCopy({ india, kids, fuelCut }),
      impact: exposureCut(fuelCut, SCOPE.kitchen),
      traits: { safety: true },
    };
  }
  const hoodCut = round(RANGE_HOOD_CUT * 100);
  return {
    id: 'kitchen-exhaust',
    category: 'indoor',
    priority: 3,
    ...exhaustCopy(hoodCut),
    impact: exposureCut(hoodCut, SCOPE.kitchen),
  };
}

/** Carbon monoxide can kill overnight, so every fuel-burning heater gets a safety step. */
export function heatingRec({ profile, india }: RuleInput): RecDraft | null {
  if (profile.heating === 'gas') {
    return { id: 'gas-heater-safety', category: 'swap', priority: 1, ...GAS_HEATER, ...SAFE_SOURCE_FIX };
  }
  if (profile.heating !== 'coal' && profile.heating !== 'wood') return null;
  return {
    id: 'safe-heating',
    category: 'swap',
    priority: 1,
    ...solidHeatingCopy({ india }),
    ...SAFE_SOURCE_FIX,
  };
}

export function wastePm25GPerMonth(people: number): number {
  return round(people * WASTE_BURNED_KG_PER_PERSON_WEEK * WASTE_BURNING_PM25_G_PER_KG * WEEKS_PER_MONTH);
}

export function wasteRec({ profile, india }: RuleInput): RecDraft | null {
  if (!profile.burnsWaste) return null;
  const figures = {
    india,
    who: persons(profile.householdSize),
    kgPerPersonWeek: WASTE_BURNED_KG_PER_PERSON_WEEK,
    pm25GramsPerKg: WASTE_BURNING_PM25_G_PER_KG,
    weeks: WEEKS_PER_MONTH,
    total: fmt(wastePm25GPerMonth(profile.householdSize)),
  };
  return { id: 'stop-burning', category: 'swap', priority: 1, ...wasteCopy(figures), impact: REMOVES_SOURCE };
}

/** Where coils are unlikely, only incense and candles are left: worth a word on smoggy days, never urgent. */
function incenseRec(concern: Concern): RecDraft | null {
  if (concern === 'low') return null;
  return {
    id: 'no-smoke-indoors',
    category: 'swap',
    priority: 3,
    ...INCENSE,
    impact: REMOVES_SOURCE,
    traits: { shutsWindows: true, unreported: true },
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
    ...coilCopy({ windowsShut: shut, low, high }),
    impact: REMOVES_SOURCE,
    traits: { shutsWindows: shut, unreported: true },
  };
}
