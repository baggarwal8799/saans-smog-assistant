/** What a rule sees (RuleInput), what it returns (RecDraft), and how a draft becomes one language's tip. */
import type { Text } from '../copy/text.js';
import type {
  AqiLevel,
  Concern,
  Impact,
  Lang,
  Pollutant,
  Profile,
  RecId,
  Recommendation,
  SmogTrap,
  TimeWindow,
} from '../types.js';

/** Everything a rule may look at, built once per plan. */
export interface RuleInput {
  profile: Profile;
  /** How bad the air is, for priorities and caution words; no rule applies its own threshold. */
  concern: Concern;
  /** The US EPA band every rule about going out reads its strictness from. */
  band: AqiLevel;
  avg: number;
  /** Cleanest daytime window outside any smog trap. */
  best: TimeWindow | null;
  worst: TimeWindow | null;
  ozonePeak: TimeWindow | null;
  trap: SmogTrap | null;
  dominant: Pollutant | null;
  now: string;
  /** India-specific schemes and words (Ujjwala, RWA, angithi) only make sense there. */
  india: boolean;
  /** Mosquito-coil advice only where coils are a common habit: India, in the mosquito belt. */
  mosquitoes: boolean;
}

/** A percentage always says which pollutant it cuts, and its scope, so the cut is never claimed for the whole day. */
type Cut = Required<Pick<Impact, 'exposureCutPct' | 'pollutant'>> & { scope: Text };
type NoCut = Partial<Record<keyof Cut, never>>;

/** The Recommendation's impact before a language is picked, without the explanation, which comes with the copy. */
export type DraftImpact = Pick<Impact, 'co2KgPerMonth' | 'removesSource' | 'community'> & (Cut | NoCut);

/** How a tip is ranked, filtered and caveated. Only `safety` reaches the Recommendation. */
export interface Traits {
  /** Life safety: its own group, above "Do these first", never counted against MAX_URGENT. */
  safety?: true;
  /** It tells people to shut windows, so it needs the carbon-monoxide caveat when fuel burns indoors. */
  shutsWindows?: boolean;
  /** A US EPA core action, changing WHO goes out or HOW HARD: it ranks first within its priority. */
  epaActivity?: true;
  /** Its only purpose is keeping outdoor smog out, so on a clean-air day there is nothing for it to do. */
  smogDefence?: true;
  /** A habit the form never asks about (coils, incense): shown, but never the basis of a headline claim. */
  unreported?: true;
}

export interface RecDraft {
  id: RecId;
  category: Recommendation['category'];
  priority: Recommendation['priority'];
  title: Text;
  detail: Text;
  explanation: Text;
  impact: DraftImpact;
  traits?: Traits;
}

/** Below this, a tip that only cuts exposure changes too little to ask for, like the commute rule's 25% minimum. */
export const MIN_EXPOSURE_CUT_PCT = 10;

/** A cut with its keys in a fixed order: the percentage, the pollutant, then the scope. */
export const exposureCut = (exposureCutPct: number, scope: Text, pollutant: Cut['pollutant'] = 'PM2.5'): Cut => ({
  exposureCutPct,
  pollutant,
  scope,
});

/** The impact's figures with `scope` in the reader's language, overwritten in place so the keys keep their order. */
function figuresIn(impact: DraftImpact, lang: Lang): Omit<Impact, 'explanation'> {
  const { scope, ...figures } = impact;
  return scope ? { ...impact, scope: scope[lang] } : figures;
}

export function localize(draft: RecDraft, lang: Lang): Recommendation {
  const { title, detail, explanation, impact, traits } = draft;
  const rec: Recommendation = {
    id: draft.id,
    category: draft.category,
    priority: draft.priority,
    title: title[lang],
    detail: detail[lang],
    impact: { explanation: explanation[lang], ...figuresIn(impact, lang) },
  };
  if (traits?.safety) rec.safety = true;
  return rec;
}
