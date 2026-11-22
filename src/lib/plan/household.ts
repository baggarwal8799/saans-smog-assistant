/** The household's members, its size in words, and the EPA activity guidance that applies to them. */
import { epaActivity, type Activity } from '../epa.js';
import type { Profile } from '../types.js';
import type { RuleInput } from './rule.js';
import { bilingual, joinList, joinText, plural, type Text } from './text.js';

/** The household members advice may name. A sentence about one appears only when the profile has that member. */
export type Member = 'children' | 'elderly' | 'respiratory';
const MEMBER_FLAG = { children: 'hasChildren', elderly: 'hasElderly', respiratory: 'hasRespiratory' } as const;
const MEMBER_NAME: Readonly<Record<Member, Text>> = {
  children: bilingual('children', 'बच्चों'),
  elderly: bilingual('elders', 'बुज़ुर्गों'),
  respiratory: bilingual('anyone with a heart or lung condition', 'दिल या फेफड़े की बीमारी वालों'),
};
export const membersOf = (p: Profile): Member[] =>
  (Object.keys(MEMBER_FLAG) as Member[]).filter((m) => p[MEMBER_FLAG[m]]);
/** The sentences written for each member, kept only for the members this household has. */
export function forMembers(p: Profile, notes: Partial<Record<Member, Text>>): Text {
  return joinText(...membersOf(p).flatMap((m) => notes[m] ?? []));
}
/** "children and elders" (Hindi in the oblique case, before को), naming only the members the household has. */
export const memberNames = (p: Profile): Text => joinList(membersOf(p).map((m) => MEMBER_NAME[m]));

const PERSON_FORMS = { en: ['person', 'people'], hi: ['व्यक्ति', 'लोग'] } as const;
/** "4 people" / "4 लोग", so household size reads naturally in every working. */
export const persons = (k: number): Text => plural(k, PERSON_FORMS);

/** EPA activity guidance for the household's sensitive members: children, elders, a heart or lung condition. */
export const membersActivity = ({ band }: Pick<RuleInput, 'band'>): Activity => epaActivity(band, true);
/** For the adult the profile describes (commute, workout): a sensitive group only with the heart or lung condition. */
export const selfActivity = ({ band, profile }: Pick<RuleInput, 'band' | 'profile'>): Activity =>
  epaActivity(band, profile.hasRespiratory);
/** The strictest guidance for anyone in this household. */
export const householdActivity = ({ band, profile }: Pick<RuleInput, 'band' | 'profile'>): Activity =>
  epaActivity(band, membersOf(profile).length > 0);
