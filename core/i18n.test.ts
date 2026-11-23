import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatNumber, isLangReady, t, tn } from './i18n.js';
import { en } from './i18n-en.js';
import { hi } from './i18n-hi.js';

describe('i18n', () => {
  it('interpolates parameters', () => {
    expect(t('en', 'co2Saved', { kg: 12 })).toBe('Saves ≈ 12 kg CO₂/month');
    expect(t('hi', 'exposureCut', { pct: 40 })).toContain('40%');
  });

  it('leaves unknown placeholders visible rather than blank', () => {
    expect(t('en', 'co2Saved')).toContain('{kg}');
  });

  it('formats numbers with Indian grouping', () => {
    expect(formatNumber('en', 123456)).toBe('1,23,456');
    expect(formatNumber('en', 1.26, 1)).toBe('1.3');
  });

  it('has Hindi synchronously outside the browser build, for the AI prompt', () => {
    expect(isLangReady('hi')).toBe(true);
    expect(t('hi', 'search')).toBe('खोजें');
  });
});

describe('counted strings', () => {
  it('uses the singular for one and the plural otherwise, in English and Hindi', () => {
    expect(tn('en', 'peopleCount', 1)).toBe('1 person');
    expect(tn('en', 'peopleCount', 4)).toBe('4 people');
    expect(tn('hi', 'peopleCount', 1)).toBe('1 व्यक्ति');
    expect(tn('hi', 'peopleCount', 4)).toBe('4 लोग');
    expect(tn('en', 'cigarettes', 1)).toMatch(/smoking 1 cigarette\.$/);
    expect(tn('en', 'cigarettes', 0.5)).toMatch(/smoking 0\.5 cigarettes\.$/);
    expect(tn('en', 'cigarettes', 5.3)).toMatch(/smoking 5\.3 cigarettes\.$/);
  });

  it('never puts a raw count next to a noun outside a _one/_other pair', () => {
    // A {n} next to a noun must go through tn(). tooLong counts QUESTION_MAX characters, a fixed number far above 1.
    const fixedCounts = new Set(['tooLong']);
    for (const dict of [en, hi] as Record<string, string>[]) {
      for (const [key, text] of Object.entries(dict)) {
        if (!text.includes('{n}') || fixedCounts.has(key)) continue;
        expect(key, `"${text}" counts {n} without plural forms`).toMatch(/_(one|other)$/);
        const base = key.replace(/_(one|other)$/, '');
        expect(dict[`${base}_one`] && dict[`${base}_other`], key).toBeTruthy();
      }
    }
  });
});

describe('the Hindi dictionary in the browser', () => {
  afterEach(() => {
    vi.doUnmock('./i18n-preloaded');
    vi.doUnmock('./i18n-hi');
    vi.resetModules();
  });

  /** A fresh i18n module as the browser build sees it: nothing preloaded. */
  async function browserI18n() {
    vi.resetModules();
    vi.doMock('./i18n-preloaded', () => ({ preloaded: {} }));
    return import('./i18n.js');
  }

  it('starts English-only, falls back to English while loading, and loads Hindi once for every caller', async () => {
    const i18n = await browserI18n();
    expect(i18n.isLangReady('en')).toBe(true);
    expect(i18n.isLangReady('hi')).toBe(false);
    // A stray early call shows English, never a raw key.
    expect(i18n.t('hi', 'search')).toBe('Search');
    const a = i18n.loadDictionary('hi');
    expect(i18n.loadDictionary('hi')).toBe(a);
    await a;
    expect(i18n.isLangReady('hi')).toBe(true);
    expect(i18n.t('hi', 'search')).toBe('खोजें');
    await expect(i18n.loadDictionary('en')).resolves.toBeUndefined();
  });

  it('forgets a failed fetch, so the next attempt tries again', async () => {
    let fail = true;
    const i18n = await browserI18n();
    vi.doMock('./i18n-hi', async (importOriginal) => {
      if (fail) throw new Error('offline');
      return importOriginal();
    });
    await expect(i18n.loadDictionary('hi')).rejects.toThrow();
    expect(i18n.isLangReady('hi')).toBe(false);
    fail = false;
    vi.resetModules();
    await i18n.loadDictionary('hi');
    expect(i18n.t('hi', 'search')).toBe('खोजें');
  });
});
