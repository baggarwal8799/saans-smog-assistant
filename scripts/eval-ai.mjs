#!/usr/bin/env node
/**
 * AI evaluation: asks a running server fixed scenario questions and checks each REAL answer with the same content
 * checks the server uses (api/_lib/numbers.ts, api/_lib/script.ts) plus simple semantic expectations. Uses the free
 * Gemini quota: about 9 requests, each charged per upstream attempt (fallbacks and a repair call included).
 *
 *   BASE_URL=http://127.0.0.1:8088 npm run check:ai
 *
 * The prompt the model saw is rebuilt here with the server's own code and live Open-Meteo data, so the number check
 * runs against the same CONTEXT (it can differ if the forecast updated between the server's fetch and this one).
 * Prints PASS or FAIL per scenario and exits 1 on any failure.
 */
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import { scenarios, trapHour } from './eval-ai/scenarios.mjs';

const BASE_URL = (process.env.BASE_URL ?? 'http://127.0.0.1:8088').replace(/\/$/, '');
const PAUSE_MS = 4_000; // the server allows 15 requests per minute per client
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PLACE = { name: 'New Delhi', lat: 28.61, lon: 77.21, country: 'India' };

/** Loads the server's TypeScript modules (with their .js-suffixed imports) through Vite, without a build. */
async function load(path) {
  const { module } = await runnerImport(`${ROOT}${path}`, { configFile: false, logLevel: 'error', root: ROOT });
  return module;
}

const MODULES = [
  'api/_lib/numbers.ts',
  'api/_lib/script.ts',
  'api/_lib/answer.ts',
  'api/_lib/prompt.ts',
  'api/_lib/validate.ts',
  'src/lib/aqi.ts',
  'src/lib/recommend.ts',
  'src/lib/context.ts',
  'src/lib/profile.ts',
  'api/_lib/medical.ts',
];
const [
  { ungroundedNumbers },
  { nonDevanagariWords },
  { REFUSAL_TEXT },
  { buildUserPrompt },
  { parseAssistantRequest },
  { fetchAirReport },
  { buildPlan },
  { buildContext },
  { DEFAULT_PROFILE },
  { MEDICAL_LINE },
] = await Promise.all(MODULES.map(load));

/** The server's content checks, run on the text the user saw (its fixed lines contain no numbers and are Devanagari). */
function contentProblems(text, prompt, req) {
  const numbers = ungroundedNumbers(text, prompt);
  const words = req.lang === 'hi' ? nonDevanagariWords(text) : [];
  return [
    ...(numbers.length > 0 ? [`numbers not in CONTEXT: ${numbers.join(', ')}`] : []),
    ...(words.length > 0 ? [`not Devanagari: ${words.join(', ')}`] : []),
  ];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SCENARIOS = scenarios({ REFUSAL_TEXT, MEDICAL_LINE });

async function ask(payload) {
  const res = await fetch(`${BASE_URL}/api/assistant`, {
    method: 'POST',
    // The server refuses POSTs without a same-origin Origin header, as a browser on the page would send.
    headers: { 'content-type': 'application/json', origin: new URL(BASE_URL).origin },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.text !== 'string') throw new Error(`HTTP ${res.status} ${data.error ?? ''}`.trim());
  return data.text;
}

/** The prompt the server built for this request, rebuilt with the same code. */
async function promptFor(payload) {
  const req = parseAssistantRequest(payload);
  const report = await fetchAirReport(req.place);
  const plan = buildPlan(report, req.profile, req.lang);
  const said = req.mode === 'question' ? [req.question, ...req.history] : [];
  return {
    req,
    plan,
    prompt: buildUserPrompt(req, buildContext({ report, profile: req.profile, plan, lang: req.lang, said })),
  };
}

/** Asks one scenario's question, prints its result and returns whether it failed. */
async function runScenario(s, trap) {
  const payload = {
    lang: s.lang ?? 'en',
    mode: 'question',
    question: s.question({ trap }),
    place: PLACE,
    profile: { ...DEFAULT_PROFILE, ...s.profile },
    history: s.history ?? [],
  };
  let problems;
  let text = '';
  try {
    text = await ask(payload);
    const { req, prompt } = await promptFor(payload);
    problems = [...contentProblems(text, prompt, req), ...s.check(text, { trap })];
  } catch (err) {
    problems = [`request failed: ${err instanceof Error ? err.message : String(err)}`];
  }
  console.log(`${problems.length === 0 ? 'PASS' : 'FAIL'}  ${s.name}`);
  console.log(`      Q: ${payload.question}`);
  // eslint-disable-next-line sonarjs/slow-regex -- dev script over one short model answer
  if (text) console.log(`      A: ${text.replace(/\s*\n\s*/g, ' / ')}`);
  for (const p of problems) console.log(`      - ${p}`);
  return problems.length > 0;
}

async function main() {
  console.log(`AI evaluation against ${BASE_URL}\n`);
  const base = await promptFor({ lang: 'en', mode: 'summary', place: PLACE, profile: { ...DEFAULT_PROFILE } });
  const trap = trapHour(base.plan);
  let failed = 0;

  // ONLY=<text> runs just the scenarios whose name contains it, to re-check one case without spending quota on all.
  const chosen = SCENARIOS.filter((s) => !process.env.ONLY || s.name.includes(process.env.ONLY));
  for (const [i, s] of chosen.entries()) {
    if (i > 0) await sleep(PAUSE_MS);
    if (await runScenario(s, trap)) failed += 1;
  }

  console.log(`\n${chosen.length - failed}/${chosen.length} scenarios passed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
