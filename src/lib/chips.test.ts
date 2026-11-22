import { describe, expect, it } from 'vitest';
import { impactChips } from './chips';

describe('exposure chip without a scope', () => {
  it('has no double space in English or Hindi', () => {
    for (const lang of ['en', 'hi'] as const) {
      const [chip] = impactChips({ exposureCutPct: 40, explanation: '' }, lang);
      expect(chip?.text).not.toMatch(/ {2}/);
      expect(chip?.text).toMatch(/40%/);
    }
  });
});
