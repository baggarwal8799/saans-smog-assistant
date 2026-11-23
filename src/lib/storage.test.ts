import { describe, expect, it, vi } from 'vitest';

import { LIMITS } from '../../core/contract.js';
import { DEFAULT_PROFILE } from '../../core/profile.js';
import {
  LANG_KEY,
  loadLang,
  loadPlace,
  loadProfile,
  PLACE_KEY,
  PROFILE_KEY,
  saveLang,
  savePlace,
  saveProfile,
} from './storage.js';

const throwing = {
  getItem: vi.fn(() => {
    throw new Error('blocked');
  }),
  setItem: vi.fn(() => {
    throw new Error('blocked');
  }),
} as unknown as Storage;

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
    localStorage.setItem(PLACE_KEY, 'null');
    expect(loadPlace()).toBeNull();
    localStorage.setItem(PLACE_KEY, JSON.stringify({ name: 'x'.repeat(200), lat: 1, lon: 2, region: 'y'.repeat(200) }));
    expect(loadPlace()).toEqual({
      name: 'x'.repeat(LIMITS.shortText),
      lat: 1,
      lon: 2,
      region: 'y'.repeat(LIMITS.placePart),
    });
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
