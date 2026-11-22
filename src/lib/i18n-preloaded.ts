/**
 * Synchronous dictionaries for server code (api/_lib/prompt.ts calls t() in Hindi with no render to wait on).
 * The browser build swaps this for an empty module (vite.config.ts), so Hindi stays a lazy chunk there.
 */
import type { MessageKey } from './i18n-en.js';
import { hi } from './i18n-hi.js';
import type { Lang } from './types.js';

export const preloaded: Partial<Record<Lang, Record<MessageKey, string>>> = { hi };
