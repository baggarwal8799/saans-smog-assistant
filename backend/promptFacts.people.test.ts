import { describe, expect, it } from 'vitest';

import { askedPeopleFact } from './promptFacts.js';

describe('askedPeopleFact', () => {
  it('names two or more people always, and a single person only in a follow-up', () => {
    expect(askedPeopleFact('Can my kids and my father go out?', 'en')).toEqual([
      'People asked about: children, father. Answer for each of them by name.',
    ]);
    expect(askedPeopleFact('Can my kids go out?', 'en')).toEqual([]);
    expect(askedPeopleFact('And what about my father?', 'en', { followUp: true })).toEqual([
      'Person asked about: father. Name them in the answer.',
    ]);
    expect(askedPeopleFact('Is the air bad today?', 'en', { followUp: true })).toEqual([]);
  });
});
