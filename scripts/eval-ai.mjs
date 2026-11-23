#!/usr/bin/env node
// @ts-check
/**
 * AI evaluation: asks a running server fixed scenario questions and checks each REAL answer with the server's own
 * content checks plus simple semantic expectations. Uses the free Gemini quota: about 9 requests, each charged per
 * upstream attempt (fallbacks and a repair call included).
 *
 *   BASE_URL=http://127.0.0.1:8088 npm run check:ai
 *
 * The number check rebuilds the prompt from live Open-Meteo data, so it can differ if the forecast updated between the
 * server's fetch and this one. Prints PASS or FAIL per scenario and exits 1 on any failure.
 */
import { fileURLToPath } from 'node:url';

import { runnerImport } from 'vite';

import { scenarios, trapHour } from './eval-ai/scenarios.mjs';

/**
 * @import * as Server from './eval-ai/server.js'
 * @import { CheckInput } from '../backend/checks.js'
 * @import { Plan, Profile } from '../core/types.js'
 * @import { Scenario, Trap } from './eval-ai/scenarios.mjs'
 * @import { InlineConfig } from 'vite'
 */

const BASE_URL = (process.env.BASE_URL ?? 'http://127.0.0.1:8088').replace(/\/$/, '');
const PAUSE_MS = 4_000; // the server allows 15 requests per minute per client
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PLACE = { name: 'New Delhi', lat: 28.61, lon: 77.21, country: 'India' };

/**
 * @typedef {object} Payload
 * @property {'en' | 'hi'} lang
 * @property {'summary' | 'question'} mode
 * @property {string} [question]
 * @property {typeof PLACE} place
 * @property {Profile} profile
 * @property {string[]} [history]
 */
/** @typedef {typeof Server} ServerModule */

/** @type {(id: string, config: InlineConfig) => Promise<{ module: ServerModule }>} */
const importServer = runnerImport;

/**
 * Loads the server's TypeScript (with its .js-suffixed imports) through Vite, without a build.
 * @returns {Promise<ServerModule>}
 */
async function loadServer() {
  const entry = fileURLToPath(new URL('eval-ai/server.ts', import.meta.url));
  const { module } = await importServer(entry, { configFile: false, logLevel: 'error', root: ROOT });
  return module;
}

/**
 * The server's line checks, run on the whole text the user saw as one line: its fixed lines contain no numbers and
 * are Devanagari, and reply 'none' skips the yes/no check, which needs the model's own reply field.
 * @param {ServerModule} server
 * @param {string} text
 * @param {CheckInput} input
 * @returns {string[]}
 */
const contentProblems = (server, text, input) =>
  server.checkAnswer({ offTopic: false, reply: 'none', lines: [text] }, input);

const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {Payload} payload
 * @returns {Promise<string>}
 */
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

/**
 * The server's check input for this request (its prompt, parsed request and EPA reply), built by the server's code.
 * @param {ServerModule} server
 * @param {Payload} payload
 */
async function groundedFor(server, payload) {
  const input = await server.groundedInput(server.parseAssistantRequest(payload), fetch, console);
  if (!input) throw new Error('air data unavailable');
  return input;
}

/**
 * The plan for the eval's place and default household, to pick the hour the trap scenario asks about.
 * @param {ServerModule} server
 * @returns {Promise<Plan>}
 */
async function basePlan(server) {
  const { parseAssistantRequest, DEFAULT_PROFILE, buildPlan, fetchAirReport } = server;
  const req = parseAssistantRequest({ lang: 'en', mode: 'summary', place: PLACE, profile: { ...DEFAULT_PROFILE } });
  return buildPlan(await fetchAirReport(req.place, fetch), req.profile, req.lang);
}

/**
 * Asks one scenario's question, prints its result and returns whether it failed.
 * @param {ServerModule} server
 * @param {Scenario} s
 * @param {Trap} trap
 */
async function runScenario(server, s, trap) {
  /** @type {Payload} */
  const payload = {
    lang: s.lang ?? 'en',
    mode: 'question',
    question: s.question({ trap }),
    place: PLACE,
    profile: { ...server.DEFAULT_PROFILE, ...s.profile },
    history: s.history ?? [],
  };
  /** @type {string[]} */
  let problems;
  let text = '';
  try {
    text = await ask(payload);
    problems = [...contentProblems(server, text, await groundedFor(server, payload)), ...s.check(text, { trap })];
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
  const server = await loadServer();
  console.log(`AI evaluation against ${BASE_URL}\n`);
  const trap = trapHour(await basePlan(server));
  let failed = 0;

  // ONLY=<text> re-checks just the matching scenarios without spending quota on all.
  const chosen = scenarios(server).filter((s) => !process.env.ONLY || s.name.includes(process.env.ONLY));
  for (const [i, s] of chosen.entries()) {
    if (i > 0) await sleep(PAUSE_MS);
    if (await runScenario(server, s, trap)) failed += 1;
  }

  console.log(`\n${chosen.length - failed}/${chosen.length} scenarios passed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
