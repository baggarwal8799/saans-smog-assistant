/**
 * An answer that breaks a rule is sent back once, the one with fewer violations is kept, and any line still failing
 * is dropped, so a failed repair never ships an invented number.
 */
import type { ModelAnswer } from './answer.js';
import { type CheckInput, inspectAnswer, type Inspection, withPassingLines } from './checks.js';
import { GeminiError } from './geminiReply.js';
import { errorText } from './log.js';
import type { Logger } from './types.js';

/** Appended to the same prompt for the single retry. Angle brackets are dropped so nothing can close a fence. */
function repairNote(violations: string[]): string {
  const items = violations.map((v) => `- ${v.replace(/[<>]/g, '')}`).join('\n');
  const ask = 'Your previous answer broke these rules. Write the whole answer again, following every rule:';
  return `\n<FIX>\n${ask}\n${items}\n</FIX>`;
}

async function bestAnswer(
  input: CheckInput,
  ask: (prompt: string) => Promise<ModelAnswer>,
  log: Logger,
  canRetry: () => boolean | Promise<boolean>,
): Promise<Inspection> {
  const first = inspectAnswer(await ask(input.prompt), input);
  if (first.problems.length === 0) return first;
  log.warn('assistant: answer broke the rules', first.problems);
  if (!(await canRetry())) {
    log.warn('assistant: no repair call (daily cap or time budget left too small)');
    return first;
  }
  let repaired: ModelAnswer;
  try {
    repaired = await ask(input.prompt + repairNote(first.problems));
  } catch (err) {
    // The first answer is still a real answer; a failed repair must not turn it into an error.
    log.warn('assistant: repair call failed, keeping the first answer', errorText(err));
    return first;
  }
  // Checked against the original prompt: the FIX note repeats the bad numbers, which must not count as grounded.
  const second = inspectAnswer(repaired, input);
  if (second.problems.length > 0) log.warn('assistant: repaired answer still broke the rules', second.problems);
  return second.problems.length < first.problems.length ? second : first;
}

/** The answer to render: always a real model answer, never a canned one. Throws a 502 when no line passes. */
export async function guardedAnswer(
  input: CheckInput,
  ask: (prompt: string) => Promise<ModelAnswer>,
  log: Logger,
  canRetry: () => boolean | Promise<boolean> = () => true,
): Promise<ModelAnswer> {
  const kept = withPassingLines(await bestAnswer(input, ask, log, canRetry), input.req);
  if (!kept) throw new GeminiError(502, 'no answer line passed the content checks');
  return kept;
}
