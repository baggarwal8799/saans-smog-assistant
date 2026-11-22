import { describe, expect, it } from 'vitest';
import { askedPeople, askedPeopleFact } from './askedPeople';

describe('askedPeople', () => {
  it('finds everyone a question names, in English and Hindi', () => {
    expect(askedPeople('Can my kids go to the park and my father go for his walk?').map((p) => p.label.en)).toEqual([
      'children',
      'father',
    ]);
    expect(askedPeople('क्या बच्चे और दादी शाम को बाहर जा सकते हैं?').map((p) => p.label.en)).toEqual([
      'children',
      'grandparents',
    ]);
    expect(askedPeople('Is the air bad today?')).toEqual([]);
  });

  it('names two or more people always, and a single person only in a follow-up', () => {
    expect(askedPeopleFact('Can my kids and my father go out?', 'en')).toEqual([
      'People asked about: children, father. Answer for each of them by name.',
    ]);
    expect(askedPeopleFact('Can my kids go out?', 'en')).toEqual([]);
    expect(askedPeopleFact('And what about my father?', 'en', true)).toEqual([
      'Person asked about: father. Name them in the answer.',
    ]);
    expect(askedPeopleFact('Is the air bad today?', 'en', true)).toEqual([]);
  });
});
