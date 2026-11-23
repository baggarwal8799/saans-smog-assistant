// @ts-check
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { VOICE } from './config.mjs';

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (!existsSync('.env')) return '';
  const line = readFileSync('.env', 'utf8')
    .split('\n')
    .find((l) => l.startsWith('GEMINI_API_KEY='));
  return line ? line.slice('GEMINI_API_KEY='.length).trim() : '';
}

const KEY = loadKey();
export const HAS_GEMINI_KEY = Boolean(KEY);
const TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview'];
const MAX_ATTEMPTS = 8;
/** After a 429 (the per-minute limit), long enough for its window to move on. */
const RATE_LIMITED_WAIT_MS = 20_000;
/** After any other failure, a short pause before the next model. */
const RETRY_WAIT_MS = 4_000;
/** The sample rate raw PCM replies use when their MIME type does not say. */
const DEFAULT_PCM_RATE = '24000';
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @typedef {object} TtsReply
 * @property {{ content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] } }[]} [candidates]
 * @property {{ message?: string }} [error]
 */

/**
 * One TTS request: the HTTP status, and the reply body (empty when it is not JSON).
 * @param {string} model
 * @param {string} text
 * @returns {Promise<{ ok: boolean; status: number; data: TtsReply }>}
 */
async function requestSpeech(model, text) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      // Send only the words to speak: the TTS model reads any instruction text aloud as part of the narration.
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
      },
    }),
  });
  /** @type {TtsReply} */
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * @param {TtsReply} data
 */
const audioOf = (data) => data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;

/**
 * @param {{ data: string; mimeType: string }} inline
 * @param {string} file
 */
function writeClip(inline, file) {
  const bytes = Buffer.from(inline.data, 'base64');
  const mime = String(inline.mimeType);
  if (mime.includes('wav')) {
    writeFileSync(file, bytes);
    return;
  }
  // Raw 16-bit PCM ("audio/l16; rate=24000"): wrap it in a WAV container.
  const rate = /rate=(\d+)/.exec(mime)?.[1] ?? DEFAULT_PCM_RATE;
  const raw = `${file}.pcm`;
  writeFileSync(raw, bytes);
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- dev script: the local ffmpeg is the point
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', rate, '-ac', '1', '-i', raw, file]);
  rmSync(raw);
}

/**
 * How long to wait after a failed attempt; throws when a retry cannot help.
 * @param {number} status
 * @param {string} message
 */
function backoffMs(status, message) {
  // "exceeded your current quota" is a daily cap: retrying will not help, so stop early.
  if (status === 429 && /quota/i.test(message)) throw new Error('daily TTS quota used up');
  return status === 429 ? RATE_LIMITED_WAIT_MS : RETRY_WAIT_MS;
}

/**
 * Speaks `text` into `file` with Gemini TTS, retrying with backoff; throws when every attempt failed.
 * @param {string} text
 * @param {string} file
 */
export async function synthesizeGemini(text, file) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const model = TTS_MODELS[attempt % TTS_MODELS.length] ?? '';
    const { ok, status, data } = await requestSpeech(model, text);
    const inline = audioOf(data);
    if (ok && inline) {
      writeClip(inline, file);
      return;
    }
    const message = data.error?.message ?? '';
    const wait = backoffMs(status, message);
    console.warn(`TTS ${model} failed (${status} ${message.slice(0, 80)}); retrying in ${wait / 1000}s`);
    await sleep(wait);
  }
  throw new Error(`Could not synthesize: ${text.slice(0, 40)}…`);
}
