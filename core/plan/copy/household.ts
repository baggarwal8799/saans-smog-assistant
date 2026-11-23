/** Words for the household: its members' names and its size. */
import { bilingual } from '../../copy/text.js';

/** The household members advice may name; Hindi in the oblique case, before को. */
export const MEMBER_NAME = {
  children: bilingual('children', 'बच्चों'),
  elderly: bilingual('elders', 'बुज़ुर्गों'),
  respiratory: bilingual('anyone with a heart or lung condition', 'दिल या फेफड़े की बीमारी वालों'),
} as const;

export const PERSON_FORMS = { en: ['person', 'people'], hi: ['व्यक्ति', 'लोग'] } as const;
