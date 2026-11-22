/**
 * Dictionaries available synchronously, for code that runs outside the browser: the AI prompt (api/_lib/prompt.ts)
 * calls t() in Hindi and has no first render to wait on. The browser build replaces this module with an empty one
 * (vite.config.ts, browserI18n), so there Hindi stays a lazy chunk that only Hindi readers fetch.
 */
import type { MessageKey } from './i18n-en.js';
import { hi } from './i18n-hi.js';
import type { Lang } from './types.js';

export const preloaded: Partial<Record<Lang, Record<MessageKey, string>>> = { hi };
