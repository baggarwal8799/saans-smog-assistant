import { vi } from 'vitest';

import type { ModelAnswer } from '../backend/answer.js';
import { buildContext } from '../backend/context.js';
import { buildUserPrompt } from '../backend/prompt.js';
import { parseAssistantRequest } from '../backend/validate.js';
import type { AssistantRequest } from '../core/contract.js';
import { buildPlan } from '../core/recommend.js';
import { urlOf } from './fakeRedis.js';
import { jsonResponse, openMeteoPayload, profile, report, weatherPayload } from './fixtures.js';

export const place = { name: 'New Delhi', lat: 28.61, lon: 77.21, region: 'Delhi', country: 'India' };
export const body = (overrides: Record<string, unknown> = {}) => ({
  lang: 'en',
  mode: 'summary',
  question: '',
  place,
  profile: profile(),
  ...overrides,
});

export const ask = (question: string, o: Record<string, unknown> = {}) =>
  parseAssistantRequest(body({ mode: 'question', question, ...o }));
export const summary = (o: Record<string, unknown> = {}) => parseAssistantRequest(body(o));

/** Serves the Open-Meteo calls the server makes itself, and hands every other call (Gemini) to `inner`. */
export function withAir(inner: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = urlOf(input);
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
type Said = string | Partial<ModelAnswer>;
export const modelJson = (said: Said): string =>
  JSON.stringify({ offTopic: false, reply: 'none', ...(typeof said === 'string' ? { lines: [said] } : said) });

/** A Gemini HTTP reply whose text part is `text` (raw, so a test can send broken JSON). */
export const geminiResponse = (text: string, finishReason = 'STOP') =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason }] }), { status: 200 });

/** A Gemini mock that answers with each answer in turn, then keeps repeating the last one. */
export const replies = (...answers: Said[]) => {
  let i = 0;
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(geminiResponse(modelJson(answers[Math.min(i++, answers.length - 1)] ?? ''))),
  );
};

export const gemini = (said: Said = 'ok') => replies(said);

interface SentBody {
  systemInstruction: { parts: [{ text: string }] };
  contents: [{ parts: [{ text: string }] }];
  generationConfig: Record<string, unknown>;
}

export const sentBody = (f: ReturnType<typeof gemini>, call = 0): SentBody => {
  const sent = f.mock.calls[call]?.[1]?.body;
  return JSON.parse(typeof sent === 'string' ? sent : '') as SentBody;
};
export const sentPrompt = (f: ReturnType<typeof gemini>, call = 0): string =>
  sentBody(f, call).contents[0].parts[0].text;

export const textOf = async (res: Response): Promise<string> => ((await res.json()) as { text: string }).text;

export const quietLog = { warn: vi.fn() };

export const ctx = () =>
  buildContext({ report: report(), profile: profile(), plan: buildPlan(report(), profile(), 'en'), lang: 'en' });

/** The real prompt the model would see for this request (fixture air data: AQI 260, PM2.5 210, N95 ≈ 80%…). */
export const promptFor = (req: AssistantRequest) =>
  buildUserPrompt(
    req,
    buildContext({
      report: report(),
      profile: req.profile,
      plan: buildPlan(report(), req.profile, req.lang),
      lang: req.lang,
    }),
  );
