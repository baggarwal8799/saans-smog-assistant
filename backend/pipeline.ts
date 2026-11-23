/** From an admitted request to the answer: ground it in live air data, ask the model (one repair), render it. */
import type { AssistantRequest, AssistantResponse } from '../core/contract.js';
import { buildPlan } from '../core/recommend.js';
import { type ModelAnswer, renderAnswer } from './answer.js';
import type { CheckInput } from './checks.js';
import { buildContext } from './context.js';
import type { Cooldown } from './cooldown.js';
import { type Deadline, MIN_REPAIR_MS } from './deadline.js';
import { callGemini } from './gemini.js';
import { GeminiError } from './geminiReply.js';
import { errorResponse, proceed, retryAfter, type Step, stop } from './http.js';
import type { Limits } from './limits.js';
import { errorText } from './log.js';
import { buildUserPrompt } from './prompt.js';
import { dailyLimit } from './quota.js';
import { guardedAnswer } from './repair.js';
import { fetchAirReport } from './serverAir.js';
import type { AssistantEnv, Logger } from './types.js';

/** The prompt, for the handler and the evaluation script: the server, never the body, sets its numbers. */
export async function groundedInput(
  req: AssistantRequest,
  fetchImpl: typeof fetch,
  log: Logger,
): Promise<CheckInput | null> {
  try {
    const report = await fetchAirReport(req.place, fetchImpl);
    const plan = buildPlan(report, req.profile, req.lang);
    const said = req.mode === 'question' ? [req.question, ...req.history] : [];
    const context = buildContext({ report, profile: req.profile, plan, lang: req.lang, said });
    return { prompt: buildUserPrompt(req, context), req, epaReply: context.epaReply };
  } catch (err) {
    log.warn('assistant: air data unavailable', errorText(err));
    return null;
  }
}

export interface AnswerDeps {
  env: AssistantEnv;
  fetchImpl: typeof fetch;
  log: Logger;
  limits: Limits;
  deadline: Deadline;
  cooldown: Cooldown;
}

export async function answerRequest(input: CheckInput, deps: AnswerDeps): Promise<Step<AssistantResponse>> {
  const { env, fetchImpl, log, limits, deadline, cooldown } = deps;
  const limit = dailyLimit(env.MAX_AI_CALLS_PER_DAY);
  // Charged per upstream HTTP attempt, fallbacks and retries included, so real calls never pass the daily cap.
  const charge = (): Promise<boolean> => limits.takeGlobal(limit);
  const ask = (prompt: string): Promise<ModelAnswer> =>
    callGemini(prompt, env, fetchImpl, { log, deadline, charge, cooldown });
  const canRepair = async (): Promise<boolean> =>
    deadline.remaining() >= MIN_REPAIR_MS && (await limits.globalRemaining(limit)) > 0;
  try {
    // Reply word, refusal and medical lines are fixed text added by code.
    const model = await guardedAnswer(input, ask, log, canRepair);
    return proceed({ text: renderAnswer(model, input.req, input.epaReply) });
  } catch (err) {
    // Upstream details can echo the key: log the cause on the server only.
    log.warn('assistant: no answer', errorText(err));
    if (err instanceof GeminiError && err.status === 429)
      return stop(errorResponse(429, 'ai_rate_limited', retryAfter('60')));
    return stop(errorResponse(502, 'ai_unavailable'));
  }
}
