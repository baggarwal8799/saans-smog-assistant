/** Shared test helpers for the API: request builders and fake network calls. Test-only code. */
import { vi } from 'vitest';
import { buildContext } from '../../src/lib/context';
import { buildPlan } from '../../src/lib/recommend';
import { jsonResponse, openMeteoPayload, profile, report, weatherPayload } from '../../src/test/fixtures';
import type { ModelAnswer } from './answer';
import type { AssistantRequest } from './contract';
import { buildUserPrompt } from './prompt';
import { parseAssistantRequest } from './validate';

export const place = { name: 'New Delhi', lat: 28.61, lon: 77.21, region: 'Delhi', country: 'India' };
export const body = (overrides: Record<string, unknown> = {}) =>
  ({ lang: 'en', mode: 'summary', question: '', place, profile: profile(), ...overrides });

/** A validated question request, and a validated summary request. */
export const ask = (question: string, o: Record<string, unknown> = {}) =>
  parseAssistantRequest(body({ mode: 'question', question, ...o }));
export const summary = (o: Record<string, unknown> = {}) => parseAssistantRequest(body(o));

/** Serves the Open-Meteo calls the server makes itself, and hands every other call (Gemini) to `inner`. */
export function withAir(inner: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.includes('air-quality-api')) return jsonResponse(openMeteoPayload(6));
    if (url.includes('api.open-meteo.com')) return jsonResponse(weatherPayload());
    return inner(input, init);
  });
}

let ipCounter = 0;
/** Headers every browser fetch from the app's own page sends. */
const SAME_ORIGIN = { host: 'localhost', origin: 'http://localhost' } as const;

/** A same-origin POST from a fresh client address, so tests never share a rate-limit bucket by accident. */
export function post(payload: unknown, headers: Record<string, string> = {}): Request {
  ipCounter += 1;
  const ip = `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
  return new Request('http://localhost/api/assistant', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...SAME_ORIGIN, ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

/** A typed answer as the model would send it; a string is one plain line with no reply word. */
export type Said = string | Partial<ModelAnswer>;
export const modelJson = (said: Said): string =>
  JSON.stringify({ offTopic: false, reply: 'none', ...(typeof said === 'string' ? { lines: [said] } : said) });

/** A Gemini HTTP reply whose text part is `text` (raw, so a test can send broken JSON). */
export const geminiResponse = (text: string, finishReason = 'STOP') =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason }] }), { status: 200 });

/** A Gemini mock that answers with each answer in turn, then keeps repeating the last one. */
export const replies = (...answers: Said[]) => {
  let i = 0;
  return vi.fn<typeof fetch>(async () => geminiResponse(modelJson(answers[Math.min(i++, answers.length - 1)] ?? '')));
};

export const gemini = (said: Said = 'ok') => replies(said);

/** The request body sent to Gemini in a recorded call, and its prompt text. */
export const sentBody = (f: ReturnType<typeof gemini>, call = 0) =>
  JSON.parse(String((f.mock.calls[call]?.[1] as RequestInit).body));
export const sentPrompt = (f: ReturnType<typeof gemini>, call = 0): string =>
  sentBody(f, call).contents[0].parts[0].text as string;

/** The answer text a handler response carries. */
export const textOf = async (res: Response): Promise<string> => ((await res.json()) as { text: string }).text;

export const quietLog = { warn: vi.fn() };

export const ctx = () => buildContext(report(), profile(), buildPlan(report(), profile(), 'en'), 'en');

/** The real prompt the model would see for this request (fixture air data: AQI 260, PM2.5 210, N95 ≈ 80%…). */
export const promptFor = (req: AssistantRequest) =>
  buildUserPrompt(req, buildContext(report(), req.profile, buildPlan(report(), req.profile, req.lang), req.lang));
