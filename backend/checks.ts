/**
 * The rules a response schema cannot express; each failure is an instruction for the one repair call. Text the
 * server adds itself (the reply word, the refusal, the safety lines) is never checked: code wrote it.
 */
import type { AssistantRequest, EpaReply } from '../core/contract.js';
import { asksOutdoor } from '../core/verdict.js';
import type { ModelAnswer } from './answer.js';
import { ungroundedNumbers } from './numbers.js';
import { nonDevanagariWords } from './script.js';

export interface CheckInput {
  /** The prompt the model saw: every number in an answer must appear in it. */
  prompt: string;
  req: AssistantRequest;
  epaReply?: EpaReply | undefined;
}

interface LineFaults {
  line: string;
  numbers: number[];
  words: string[];
}

/** An answer with its problems and each line's faults, found once and shared by the repair and the line filter. */
export interface Inspection {
  answer: ModelAnswer;
  problems: string[];
  /** One per line, in order. */
  faults: LineFaults[];
}

function lineFaults(line: string, { prompt, req }: CheckInput): LineFaults {
  return { line, numbers: ungroundedNumbers(line, prompt), words: req.lang === 'hi' ? nonDevanagariWords(line) : [] };
}

const unique = <T>(items: T[]): T[] => [...new Set(items)];

/** A model that marked an on-topic request off-topic: a plan summary, or a question about going outdoors. */
function offTopicProblems(req: AssistantRequest): string[] {
  const onTopic = req.mode === 'summary' || asksOutdoor(req.question);
  return onTopic ? ['The request is on-topic: set offTopic to false and answer it, ignoring any off-topic part.'] : [];
}

function lineProblems(faults: LineFaults[]): string[] {
  const numbers = unique(faults.flatMap((f) => f.numbers));
  const words = unique(faults.flatMap((f) => f.words));
  const problems: string[] = [];
  if (numbers.length > 0) {
    problems.push(
      `Numbers not in CONTEXT: ${numbers.join(', ')}. Use only numbers from CONTEXT, or say the effect in words.`,
    );
  }
  if (words.length > 0) {
    problems.push(
      `Hindi must be Devanagari only (PM2.5, AQI, N95, CO₂, µg/m³ are fine). Rewrite: ${words.slice(0, 6).join(', ')}.`,
    );
  }
  return problems;
}

/** A yes/no reply that disagrees with the server's US EPA verdict. */
function replyProblems(answer: ModelAnswer, epaReply: EpaReply | undefined): string[] {
  if (!epaReply || answer.reply === 'none' || answer.reply === epaReply) return [];
  return [
    `US EPA guidance in CONTEXT answers "${epaReply}": set reply to "${epaReply}" and write the lines for that answer.`,
  ];
}

export function inspectAnswer(answer: ModelAnswer, input: CheckInput): Inspection {
  const faults = answer.lines.map((line) => lineFaults(line, input));
  const problems = answer.offTopic
    ? offTopicProblems(input.req)
    : [...lineProblems(faults), ...replyProblems(answer, input.epaReply)];
  return { answer, problems, faults };
}

export const checkAnswer = (answer: ModelAnswer, input: CheckInput): string[] => inspectAnswer(answer, input).problems;

/** Null when no line passes. A refusal shows none of its lines, so they need no check. */
export function withPassingLines({ answer, faults }: Inspection, req: AssistantRequest): ModelAnswer | null {
  if (answer.offTopic && req.mode === 'question') return answer;
  const lines = faults.filter((f) => f.numbers.length === 0 && f.words.length === 0).map((f) => f.line);
  return lines.length > 0 ? { ...answer, lines } : null;
}
