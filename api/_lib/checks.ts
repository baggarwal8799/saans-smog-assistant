/**
 * Content checks on the typed answer: the rules a response schema cannot express. Two read the model's lines (every
 * number must come from what the model saw; Hindi must be Devanagari), and two compare its fields with facts the
 * server computed. A failed check is a short instruction for the single repair call (repair.ts). Text the server adds
 * itself (the reply word, the refusal, the safety lines) is never checked: code wrote it.
 */
import type { ModelAnswer } from './answer.js';
import type { AssistantRequest, EpaReply } from './contract.js';
import { asksOutdoor } from '../../src/lib/verdict.js';
import { ungroundedNumbers } from './numbers.js';
import { nonDevanagariWords } from './script.js';

export interface CheckInput {
  /** The prompt the model saw: every number in an answer must appear in it. */
  prompt: string;
  req: AssistantRequest;
  epaReply?: EpaReply | undefined;
}

/** What is wrong with one line: its invented numbers, and its non-Devanagari words in a Hindi answer. */
function lineFaults(line: string, { prompt, req }: CheckInput): { numbers: number[]; words: string[] } {
  return { numbers: ungroundedNumbers(line, prompt), words: req.lang === 'hi' ? nonDevanagariWords(line) : [] };
}

const unique = <T>(items: T[]): T[] => [...new Set(items)];

/** Rule violations in `answer`, as instructions the model can act on; empty when it passes. */
export function checkAnswer(answer: ModelAnswer, input: CheckInput): string[] {
  const { req, epaReply } = input;
  if (answer.offTopic) {
    // A plan summary, or a question that asks whether or when to go outdoors, always has an on-topic part.
    const onTopic = req.mode === 'summary' || asksOutdoor(req.question);
    return onTopic ? ['The request is on-topic: set offTopic to false and answer it, ignoring any off-topic part.'] : [];
  }
  const faults = answer.lines.map((line) => lineFaults(line, input));
  const numbers = unique(faults.flatMap((f) => f.numbers));
  const words = unique(faults.flatMap((f) => f.words));
  const problems: string[] = [];
  if (numbers.length > 0) {
    problems.push(`Numbers not in CONTEXT: ${numbers.join(', ')}. Use only numbers from CONTEXT, or say the effect in words.`);
  }
  if (words.length > 0) {
    problems.push(`Hindi must be Devanagari only (PM2.5, AQI, N95, CO₂, µg/m³ are fine). Rewrite: ${words.slice(0, 6).join(', ')}.`);
  }
  if (epaReply && answer.reply !== 'none' && answer.reply !== epaReply) {
    problems.push(`US EPA guidance in CONTEXT answers "${epaReply}": set reply to "${epaReply}" and write the lines for that answer.`);
  }
  return problems;
}

/**
 * The answer with every line that still fails a content check removed, so no invented number or mixed-script line
 * ever reaches the user; null when no line is left. A refusal shows none of its lines, so they need no check; a
 * summary is never shown as a refusal (answer.ts), so its lines always are.
 */
export function withPassingLines(answer: ModelAnswer, input: CheckInput): ModelAnswer | null {
  if (answer.offTopic && input.req.mode === 'question') return answer;
  const lines = answer.lines.filter((line) => {
    const { numbers, words } = lineFaults(line, input);
    return numbers.length === 0 && words.length === 0;
  });
  return lines.length > 0 ? { ...answer, lines } : null;
}
