import { describe, expect, it } from 'vitest';

import { MAX_COMMUTE_KM } from './impact.js';
import { DEFAULT_PROFILE, sampleProfile, sanitizeProfile } from './profile.js';
import { COMMUTE_MODES, COOKING_FUELS, HEATING_TYPES } from './types.js';

describe('sampleProfile', () => {
  it('India keeps the LPG sample; elsewhere gets local options from the same lists', () => {
    expect(sampleProfile('India')).toEqual(DEFAULT_PROFILE);
    expect(sampleProfile('भारत')).toEqual(DEFAULT_PROFILE);
    for (const country of ['United States', 'Germany', undefined]) {
      const p = sampleProfile(country);
      expect(p.cooking).not.toBe('lpg');
      expect(COOKING_FUELS).toContain(p.cooking);
      expect(HEATING_TYPES).toContain(p.heating);
      expect(sanitizeProfile(p)).toEqual(p);
    }
  });
});

describe('sanitizeProfile', () => {
  it('returns defaults for garbage', () => {
    expect(sanitizeProfile(null)).toEqual(DEFAULT_PROFILE);
    expect(sanitizeProfile('x')).toEqual(DEFAULT_PROFILE);
  });

  it('clamps numbers and rejects unknown enum values', () => {
    const p = sanitizeProfile({
      householdSize: 999,
      commuteKm: -4,
      exerciseMinutes: 'abc',
      commuteMode: 'rocket',
      cooking: 'png',
      hasPurifier: 'yes',
    });
    expect(p.householdSize).toBe(20);
    expect(p.commuteKm).toBe(0);
    expect(p.exerciseMinutes).toBe(DEFAULT_PROFILE.exerciseMinutes);
    expect(p.commuteMode).toBe(DEFAULT_PROFILE.commuteMode);
    expect(p.cooking).toBe('png');
    expect(p.hasPurifier).toBe(DEFAULT_PROFILE.hasPurifier);
  });

  it('bounds the one-way distance by mode, so a walk can never be 100 km', () => {
    for (const mode of COMMUTE_MODES) {
      expect(sanitizeProfile({ commuteMode: mode, commuteKm: 500 }).commuteKm, mode).toBe(MAX_COMMUTE_KM[mode]);
    }
    expect(sanitizeProfile({ commuteMode: 'walk', commuteKm: 100 }).commuteKm).toBe(10);
    expect(sanitizeProfile({ commuteMode: 'bicycle', commuteKm: 45 }).commuteKm).toBe(30);
    expect(sanitizeProfile({ commuteMode: 'car', commuteKm: 100 }).commuteKm).toBe(100);
    expect(sanitizeProfile({ commuteMode: 'walk' }).commuteKm).toBe(DEFAULT_PROFILE.commuteKm);
  });

  it('drops unknown keys', () => {
    expect(Object.keys(sanitizeProfile({ evil: '<script>' }))).not.toContain('evil');
  });
});
