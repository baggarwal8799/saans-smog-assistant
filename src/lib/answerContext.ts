import type { Lang, Place, Profile } from '../../core/types.js';

export interface AnswerContext {
  lang: Lang;
  place: Place;
  profile: Profile;
  at: string;
}

/**
 * Ask Saans' React `key`, so no answer, history or pending summary carries over to a new situation. FNV-1a keeps it
 * short and deterministic.
 */
export function answerContextId(context: AnswerContext): string {
  const text = JSON.stringify([context.lang, context.at, context.place, context.profile]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
