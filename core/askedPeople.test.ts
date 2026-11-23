import { describe, expect, it } from 'vitest';

import { askedPeople } from './askedPeople.js';

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
});
