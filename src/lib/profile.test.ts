import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PROFILE,
  LANG_KEY,
  PLACE_KEY,
  PROFILE_KEY,
  loadLang,
  loadPlace,
  loadProfile,
  sanitizeProfile,
  saveLang,
  savePlace,
  saveProfile,
  sampleProfile,
} from './profile';
import { MAX_COMMUTE_KM } from './impact';
import { COMMUTE_MODES, COOKING_FUELS, HEATING_TYPES } from './types';

const throwing = {
  getItem: vi.fn(() => {
    throw new Error('blocked');
  }),
  setItem: vi.fn(() => {
    throw new Error('blocked');
  }),
} as unknown as Storage;

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

describe('storage', () => {
  it('round-trips the profile', () => {
    saveProfile({ ...DEFAULT_PROFILE, householdSize: 6 });
    expect(loadProfile().householdSize).toBe(6);
  });

  it('survives corrupted or blocked storage', () => {
    localStorage.setItem(PROFILE_KEY, '{not json');
    expect(loadProfile()).toEqual(DEFAULT_PROFILE);
    expect(loadProfile(throwing)).toEqual(DEFAULT_PROFILE);
    expect(() => saveProfile(DEFAULT_PROFILE, throwing)).not.toThrow();
    expect(loadPlace(throwing)).toBeNull();
    expect(() => savePlace({ name: 'x', lat: 0, lon: 0 }, throwing)).not.toThrow();
    expect(() => saveLang('hi', throwing)).not.toThrow();
  });

  it('round-trips and validates the place', () => {
    savePlace({ name: 'Patna', lat: 25.6, lon: 85.1, region: 'Bihar', country: 'India' });
    expect(loadPlace()).toEqual({ name: 'Patna', lat: 25.6, lon: 85.1, region: 'Bihar', country: 'India' });
    localStorage.setItem(PLACE_KEY, JSON.stringify({ name: 'Bad', lat: 999, lon: 0 }));
    expect(loadPlace()).toBeNull();
    localStorage.setItem(PLACE_KEY, JSON.stringify({ name: 'Here', lat: 10, lon: 20, region: 5, country: null }));
    expect(loadPlace()).toEqual({ name: 'Here', lat: 10, lon: 20 });
    localStorage.removeItem(PLACE_KEY);
    expect(loadPlace()).toBeNull();
  });

  it('remembers the language and otherwise follows the browser', () => {
    saveLang('hi');
    expect(loadLang()).toBe('hi');
    localStorage.setItem(LANG_KEY, 'fr');
    const spy = vi.spyOn(navigator, 'language', 'get').mockReturnValue('hi-IN');
    expect(loadLang()).toBe('hi');
    spy.mockReturnValue('en-GB');
    expect(loadLang(throwing)).toBe('en');
    spy.mockRestore();
  });
});
