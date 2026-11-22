/**
 * The model never writes the final text. Gemini returns one typed object under a response schema, and the server
 * renders the answer from it: the fixed refusal for an off-topic question, the reply word (taken from the server's
 * own US EPA verdict whenever it has one), the lines, then the fixed safety lines (medical.ts).
 */
import type { AssistantLang, AssistantRequest, EpaReply } from './contract.js';
import { isUrgent, safetyLines } from './medical.js';

export type Reply = EpaReply | 'only_if' | 'none';

export interface ModelAnswer {
  /** True only when nothing in the question is on-topic. */
  offTopic: boolean;
  /** The answer to a yes/no question, or "none" for any other question and for a plan summary. */
  reply: Reply;
  /** The answer itself: the first line answers directly, each later line is one step. */
  lines: string[];
}

export const MAX_LINES = 6;
/** A cap on one line, so a runaway reply cannot flood the page. */
const MAX_LINE_CHARS = 400;
const REPLIES: readonly Reply[] = ['yes', 'no', 'only_if', 'none'];

/** Sent as `generationConfig.responseSchema` (the OpenAPI subset the Gemini REST API accepts). */
export const ANSWER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    offTopic: { type: 'BOOLEAN' },
    reply: { type: 'STRING', format: 'enum', enum: REPLIES },
    lines: { type: 'ARRAY', items: { type: 'STRING' }, minItems: 1, maxItems: MAX_LINES },
  },
  required: ['offTopic', 'reply', 'lines'],
  propertyOrdering: ['offTopic', 'reply', 'lines'],
} as const;

/** The server draws the bullets, so a line's own bullet and any line breaks inside it are dropped. */
const cleanLine = (line: string): string =>
  line.replace(/\s+/g, ' ').trim().replace(/^[•*-]\s+/u, '').slice(0, MAX_LINE_CHARS);

/** The model's JSON as a ModelAnswer, or null when it does not fit the schema (a reply cut off mid-JSON, say). */
export function parseAnswer(json: string): ModelAnswer | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { offTopic, reply, lines } = data as Record<string, unknown>;
  if (typeof offTopic !== 'boolean' || !REPLIES.includes(reply as Reply) || !Array.isArray(lines)) return null;
  const kept = lines
    .filter((l): l is string => typeof l === 'string')
    .map(cleanLine)
    .filter(Boolean)
    .slice(0, MAX_LINES);
  return kept.length > 0 ? { offTopic, reply: reply as Reply, lines: kept } : null;
}

/** One fixed sentence per language, so a refusal never varies and never carries a health line. */
export const REFUSAL_TEXT: Readonly<Record<AssistantLang, string>> = {
  en: 'I can only help with air pollution, protecting your health from it, indoor air, transport, energy and sustainable living.',
  hi: 'मैं केवल वायु प्रदूषण, उससे सेहत की सुरक्षा, घर के अंदर की हवा, परिवहन, ऊर्जा और टिकाऊ जीवनशैली में मदद कर सकता हूँ।',
};

/** How each reply opens the first line. "Only if" runs on into the condition the first line states. */
export const REPLY_WORD: Readonly<Record<AssistantLang, Record<Exclude<Reply, 'none'>, string>>> = {
  en: { yes: 'Yes.', no: 'No.', only_if: 'Only if' },
  hi: { yes: 'हाँ।', no: 'नहीं।', only_if: 'सिर्फ़ अगर' },
};

type Said = Exclude<Reply, 'none'>;
/** What may follow a copied reply word: punctuation ("No, keep…", "नहीं। …"), or for "Only if" also a space. */
const AFTER_WORD: Readonly<Record<Said, RegExp>> = { yes: /^\s*[,.!:;।—–-]/u, no: /^\s*[,.!:;।—–-]/u, only_if: /^[\s,:—–-]/u };

/**
 * The first line without the model's own copy of its reply word: the server writes that word, and models repeat it
 * even when told not to ("No. No, keep them in."). "No outdoor play today" has no punctuation after "No": it is an
 * instruction, not a reply word, and stays whole.
 */
export function withoutReplyWord(lead: string, reply: Said, lang: AssistantLang): string {
  const word = REPLY_WORD[lang][reply].replace(/[.।]$/u, '').normalize('NFC');
  const text = lead.normalize('NFC');
  const after = text.slice(word.length);
  if (text.slice(0, word.length).toLowerCase() !== word.toLowerCase() || !AFTER_WORD[reply].test(after)) return lead;
  const tail = after.replace(/^\s*[,.!:;।—–-]?\s*/u, '');
  return reply === 'only_if' ? tail : tail.charAt(0).toUpperCase() + tail.slice(1);
}

/**
 * A question that opens with a question word ("What should he do?", "कब जाएँ?") cannot be answered yes or no, so
 * no reply word is written even if the model set one. Hindi "क्या" also marks yes/no questions, so only
 * "क्या करें"-style forms count.
 */
const OPENS_WITH_QUESTION_WORD =
  /^\s*(?:(?:what|when|where|which|who|why|how)\b|(?:कब|कहाँ|कहां|कैसे|कौन|कितन|क्यों)|क्या\s+(?:करें|करूँ|करूं|करना))/iu;

/**
 * The text the user reads. A summary has no reply word and is never a refusal. When the model gives a yes/no
 * reply and the server has an EPA verdict, the verdict's word is used: the server, not the model, says yes or no.
 */
export function renderAnswer(answer: ModelAnswer, req: AssistantRequest, epaReply?: EpaReply): string {
  const question = req.mode === 'question';
  if (question && answer.offTopic) return REFUSAL_TEXT[req.lang];
  const [lead = '', ...rest] = answer.lines;
  const urgent = isUrgent(req);
  const said = question && !urgent && answer.reply !== 'none' && !OPENS_WITH_QUESTION_WORD.test(req.question) ? answer.reply : undefined;
  const reply = said ? (epaReply ?? said) : undefined;
  // An "only if" first line is a condition ("it is short and gentle"); under a different word it would read wrong.
  const body = said === 'only_if' && reply !== 'only_if' ? rest : [withoutReplyWord(lead, said ?? 'no', req.lang), ...rest];
  const first = said && reply ? [`${REPLY_WORD[req.lang][reply]} ${body[0] ?? ''}`.trim(), ...body.slice(1)] : [lead, ...rest];
  const [head = '', ...tail] = first;
  const safety = safetyLines(req);
  // In a breathing emergency the get-help line comes before anything else.
  return (urgent ? [...safety, head, ...tail.map((l) => `• ${l}`)] : [head, ...tail.map((l) => `• ${l}`), ...safety]).join('\n');
}
