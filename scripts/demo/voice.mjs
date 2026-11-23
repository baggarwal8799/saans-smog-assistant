// @ts-check
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

import { ENGINE, PIPER_BIN, PIPER_MODEL, VOICE, VOICE_DIR } from './config.mjs';
import { LINES } from './lines.mjs';
import { HAS_GEMINI_KEY, synthesizeGemini } from './tts-gemini.mjs';

export const NARRATE = process.env.NARRATE !== 'false' && (ENGINE === 'piper' ? Boolean(PIPER_MODEL) : HAS_GEMINI_KEY);
// Keyed by engine + voice + text. "v2": v1 sent a style line, which the TTS read aloud.
const voiceId = () => (ENGINE === 'piper' ? `piper2|${PIPER_MODEL.split('/').pop()}` : `v2|${VOICE}`);
export const clipPath = (/** @type {string} */ text) => {
  const key = `${voiceId()}|${text}`;
  // eslint-disable-next-line sonarjs/hashing -- a cache file name, not a security use
  return `${VOICE_DIR}/${createHash('sha1').update(key).digest('hex').slice(0, 16)}.wav`;
};

const PROBE_ARGS = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0'];

/**
 * @param {string} file
 * @returns {number} the clip's length in seconds
 */
export function durationOf(file) {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- dev script: the local ffprobe is the point
  const out = execFileSync('ffprobe', [...PROBE_ARGS, file], { encoding: 'utf8' });
  return Number(out.trim());
}

/**
 * A slightly longer length scale gives a calmer demo pace.
 * @param {string} text
 * @param {string} file
 */
function synthesizeLocal(text, file) {
  execFileSync(PIPER_BIN, ['-m', PIPER_MODEL, '-f', file, '--length-scale', '1.12', '--sentence-silence', '0.25'], {
    // Spoken only: an English voice says "Saans" like "songs"; "Sahns" gives the Hindi साँस (long a).
    input: text.replaceAll('Saans', 'Saahns'),
    stdio: ['pipe', 'ignore', 'pipe'],
  });
}

/**
 * @param {string} text
 * @param {string} file
 */
async function synthesize(text, file) {
  if (ENGINE === 'piper') synthesizeLocal(text, file);
  else await synthesizeGemini(text, file);
}

/** Natural speech is roughly 110–200 words a minute; outside this band a clip is suspect. */
const MIN_WPM = 75;
const MAX_WPM = 245;

/**
 * Makes the clip for one line unless it is already cached; false when it could not be made.
 * @param {string} id
 * @param {string} text
 * @param {string} file
 */
async function ensureClip(id, text, file) {
  if (existsSync(file)) return true;
  console.log(`Voice: generating ${id}`);
  try {
    await synthesize(text, file);
    return true;
  } catch (err) {
    // The free TTS quota is small and daily; a missing line just plays silently, the video still renders.
    console.warn(`Voice: skipping ${id} (${err instanceof Error ? err.message : String(err)})`);
    return false;
  }
}

/**
 * Far slower than natural speech means extra speech (e.g. an instruction read aloud); far faster means the line was
 * cut short. Either way the clip is kept: this only warns, and names the file to delete so the next run regenerates it.
 * @param {string} id
 * @param {string} text
 * @param {string} file
 * @param {number} seconds
 */
function warnIfOffPace(id, text, file, seconds) {
  const wpm = (text.split(/\s+/).length / seconds) * 60;
  if (wpm < MIN_WPM || wpm > MAX_WPM)
    console.warn(`Voice: ${id} sounds wrong (${wpm.toFixed(0)} words/min); delete ${file} to regenerate`);
}

/**
 * @param {string} prefix
 * @returns {Promise<import('./lines.mjs').Durations>}
 */
export async function prepareVoice(prefix) {
  /** @type {import('./lines.mjs').Durations} */
  const durations = {};
  if (!NARRATE) return durations;
  for (const [key, text] of Object.entries(LINES)) {
    const id = /** @type {import('./lines.mjs').LineId} */ (key);
    const file = clipPath(text);
    if (!id.startsWith(prefix) || !(await ensureClip(id, text, file))) continue;
    const seconds = durationOf(file);
    durations[id] = seconds;
    warnIfOffPace(id, text, file, seconds);
  }
  return durations;
}
