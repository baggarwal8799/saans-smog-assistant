/** The household's members, its size in words, and the EPA activity guidance that applies to them. */
import { joinList, joinText, plural, type Text } from '../copy/text.js';
import { type Activity, epaActivity } from '../epa.js';
import type { Profile } from '../types.js';
import { MEMBER_NAME, PERSON_FORMS } from './copy/household.js';
import type { RuleInput } from './rule.js';

/** The household members advice may name. A sentence about one appears only when the profile has that member. */
const MEMBERS = ['children', 'elderly', 'respiratory'] as const;
type Member = (typeof MEMBERS)[number];
const MEMBER_FLAG = { children: 'hasChildren', elderly: 'hasElderly', respiratory: 'hasRespiratory' } as const;
export const membersOf = (profile: Profile): Member[] => MEMBERS.filter((member) => profile[MEMBER_FLAG[member]]);
export function forMembers(profile: Profile, notes: Partial<Record<Member, Text>>): Text {
  return joinText(membersOf(profile).flatMap((m) => notes[m] ?? []));
}
/** "children and elders" (Hindi in the oblique case, before को), naming only the members the household has. */
export const memberNames = (profile: Profile): Text => joinList(membersOf(profile).map((m) => MEMBER_NAME[m]));

/** "4 people" / "4 लोग", so household size reads naturally in every working. */
export const persons = (count: number): Text => plural(count, PERSON_FORMS);

/** EPA activity guidance for the household's sensitive members: children, elders, a heart or lung condition. */
export const membersActivity = ({ band }: Pick<RuleInput, 'band'>): Activity => epaActivity(band, { sensitive: true });
/** For the adult the profile describes (commute, workout): a sensitive group only with the heart or lung condition. */
export const selfActivity = ({ band, profile }: Pick<RuleInput, 'band' | 'profile'>): Activity =>
  epaActivity(band, { sensitive: profile.hasRespiratory });
export const householdActivity = ({ band, profile }: Pick<RuleInput, 'band' | 'profile'>): Activity =>
  epaActivity(band, { sensitive: membersOf(profile).length > 0 });
