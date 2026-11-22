/** Reading a Gemini HTTP response: the error text on failure, else the typed answer from the reply's parts. */
import { parseAnswer, type ModelAnswer } from './answer.js';
import { GeminiError } from './geminiError.js';

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

/** The reply text from a candidate's parts, without the model's thought parts. */
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
  const candidate = data.candidates?.[0];
  const reason = candidate?.finishReason;
  const text = candidateText(candidate);
  if (!text || reason === 'SAFETY') throw new GeminiError(502, `empty reply (${reason ?? 'no candidate'})`);
  // A reply cut off by the token limit is broken JSON: a failed attempt (502), so the next model is tried.
  const answer = parseAnswer(text);
  if (!answer) throw new GeminiError(502, `reply does not fit the schema (${reason ?? 'no reason'})`);
  return answer;
}
