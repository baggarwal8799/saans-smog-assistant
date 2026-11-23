/** The assistant's one-word replies, shared by the verdict facts and the rendered answer. */
import type { EpaReply } from '../contract.js';
import type { Verdict } from '../epa.js';
import { bilingual, type Text } from './text.js';

/** The one yes/no word table, so the CONTEXT and the rendered answer always use the same word. */
export const YES_NO: Readonly<Record<EpaReply, Text>> = {
  yes: bilingual('Yes', 'हाँ'),
  no: bilingual('No', 'नहीं'),
};

/** The one-word reply a yes/no question gets for each verdict, so the model copies it instead of hedging. */
export const VERDICT_REPLY: Readonly<Record<Verdict, Text>> = {
  fine: YES_NO.yes,
  reduce: bilingual('Only briefly and gently', 'सिर्फ़ थोड़ी देर और हल्का'),
  avoid: YES_NO.no,
};
