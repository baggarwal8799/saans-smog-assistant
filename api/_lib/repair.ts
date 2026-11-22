/**
 * Check, repair once, enforce. The model's answer is checked (checks.ts); if it breaks a rule, the model is asked once
 * more with the violations listed, under the same schema, and the answer with fewer violations is kept. Whatever is
 * kept, any line still failing a content check is then dropped, so a failed repair can never ship an invented number.
 * Violations are logged on the server only. `canRetry` is the caller's say on whether a repair still fits (daily cap
 * left, and enough of the request's time budget: see deadline.ts).
 */
import type { ModelAnswer } from './answer.js';
import { checkAnswer, withPassingLines, type CheckInput } from './checks.js';
import { GeminiError } from './gemini.js';
import type { Logger } from './log.js';

/** Appended to the same prompt for the single retry. Angle brackets are dropped so nothing can close a fence. */
function repairNote(violations: string[]): string {
  const items = violations.map((v) => `- ${v.replace(/[<>]/g, '')}`).join('\n');
  return `\n<FIX>\nYour previous answer broke these rules. Write the whole answer again, following every rule:\n${items}\n</FIX>`;
}

async function bestAnswer(
  input: CheckInput,
  ask: (prompt: string) => Promise<ModelAnswer>,
  log: Logger,
  canRetry: () => boolean | Promise<boolean>,
): Promise<ModelAnswer> {
  const first = await ask(input.prompt);
  const firstIssues = checkAnswer(first, input);
  if (firstIssues.length === 0) return first;
  log.warn('assistant: answer broke the rules', firstIssues);
  if (!(await canRetry())) {
    log.warn('assistant: no repair call (daily cap or time budget left too small)');
    return first;
  }
  let second: ModelAnswer;
  try {
    second = await ask(input.prompt + repairNote(firstIssues));
  } catch (err) {
    // The first answer is still a real answer; a failed repair must not turn it into an error.
    log.warn('assistant: repair call failed, keeping the first answer', err instanceof Error ? err.message : 'unknown');
    return first;
  }
  // Checked against the original prompt: the FIX note repeats the bad numbers, which must not count as grounded.
  const secondIssues = checkAnswer(second, input);
  if (secondIssues.length > 0) log.warn('assistant: repaired answer still broke the rules', secondIssues);
  return secondIssues.length < firstIssues.length ? second : first;
}

/** The answer to render: always a real model answer, never a canned one. Throws a 502 when no line passes. */
export async function guardedAnswer(
  input: CheckInput,
  ask: (prompt: string) => Promise<ModelAnswer>,
  log: Logger,
  canRetry: () => boolean | Promise<boolean> = () => true,
): Promise<ModelAnswer> {
  const kept = withPassingLines(await bestAnswer(input, ask, log, canRetry), input);
  if (!kept) throw new GeminiError(502, 'no answer line passed the content checks');
  return kept;
}
