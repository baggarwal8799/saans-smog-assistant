import { toPlace } from '../../core/place.js';
import { DEFAULT_PROFILE, sanitizeProfile } from '../../core/profile.js';
import type { Lang, Place, Profile } from '../../core/types.js';

export const PROFILE_KEY = 'saans.profile.v1';
export const PLACE_KEY = 'saans.place.v1';
export const LANG_KEY = 'saans.lang';

/**
 * Storage can be missing (Node) or throw on access (private mode, blocked cookies). Everything stored is a
 * convenience, so any failure falls back and the app works regardless.
 */
function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** A write that may fail: nothing stored is essential, so a failed one is simply skipped. */
const tryWrite = (write: () => void): void => {
  safely(write, undefined);
};

// Read inside `safely`, so a throwing `localStorage` getter falls back too.
const store = (storage: Storage | undefined): Storage => storage ?? globalThis.localStorage;

/** Node 20 has no `navigator`, and some browsers no `language`. */
const browserLang = (): Lang => safely(() => (navigator.language.startsWith('hi') ? 'hi' : 'en'), 'en');

export function loadProfile(storage?: Storage): Profile {
  return safely(
    () => {
      const raw = store(storage).getItem(PROFILE_KEY);
      return raw ? sanitizeProfile(JSON.parse(raw)) : { ...DEFAULT_PROFILE };
    },
    { ...DEFAULT_PROFILE },
  );
}

/** Until the person saves their own household, the plan is built on the sample one. */
export function hasSavedProfile(storage?: Storage): boolean {
  return safely(() => store(storage).getItem(PROFILE_KEY) !== null, false);
}

export function saveProfile(profile: Profile, storage?: Storage): void {
  tryWrite(() => store(storage).setItem(PROFILE_KEY, JSON.stringify(profile)));
}

export function loadPlace(storage?: Storage): Place | null {
  return safely(() => {
    const raw = store(storage).getItem(PLACE_KEY);
    return raw ? toPlace(JSON.parse(raw)) : null;
  }, null);
}

export function savePlace(place: Place, storage?: Storage): void {
  tryWrite(() => store(storage).setItem(PLACE_KEY, JSON.stringify(place)));
}

export function loadLang(storage?: Storage): Lang {
  const saved = safely(() => store(storage).getItem(LANG_KEY), null);
  return saved === 'hi' || saved === 'en' ? saved : browserLang();
}

export function saveLang(lang: Lang, storage?: Storage): void {
  tryWrite(() => store(storage).setItem(LANG_KEY, lang));
}
