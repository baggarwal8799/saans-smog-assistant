/** Gemini's side of a call: the typed answer in its reply, or the error it stands for. */
import { type ModelAnswer, parseAnswer } from './answer.js';

export class GeminiError extends Error {
  /** `detail` is Gemini's own error text: logged on the server for debugging, never sent to the browser. */
  constructor(
    readonly status: number,
    readonly detail = '',
  ) {
    super(detail ? `Gemini HTTP ${status}: ${detail}` : `Gemini HTTP ${status}`);
  }
}

/** The global daily cap refused an upstream attempt: the chain stops at once instead of trying the next model. */
export class CapReachedError extends GeminiError {
  constructor() {
    super(429, 'daily AI call ceiling reached');
  }
}

async function upstreamMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return (body.error?.message ?? '').slice(0, 160);
  } catch {
    return '';
  }
}

interface Part {
  text?: string;
  thought?: boolean;
}
interface Candidate {
  content?: { parts?: Part[] };
  finishReason?: string;
}

function candidateText(candidate: Candidate | undefined): string {
  const parts = candidate?.content?.parts ?? [];
  return parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim();
}

export async function readReply(res: Response): Promise<ModelAnswer> {
  if (!res.ok) throw new GeminiError(res.status, await upstreamMessage(res));
  const data = (await res.json()) as { candidates?: Candidate[] };
  return answerOf(data.candidates?.[0]);
}

/** The typed answer in the first candidate; a missing, blocked or malformed one is a failed attempt (502). */
function answerOf(candidate: Candidate | undefined): ModelAnswer {
  const reason = candidate?.finishReason;
  const text = candidateText(candidate);
  if (!text || reason === 'SAFETY') throw new GeminiError(502, `empty reply (${reason ?? 'no candidate'})`);
  // A reply cut off by the token limit is broken JSON: a failed attempt (502), so the next model is tried.
  const answer = parseAnswer(text);
  if (!answer) throw new GeminiError(502, `reply does not fit the schema (${reason ?? 'no reason'})`);
  return answer;
}
