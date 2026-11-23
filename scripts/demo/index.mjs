// @ts-check
// Records a captioned, narrated demo of the real app (live air data + real Gemini answers):
//   demo/saans-demo-desktop.mp4 (16:9, YouTube/Drive) and demo/saans-demo-mobile.mp4 (9:16, Instagram reel).
//
// Usage: docker compose up --build -d   (with GEMINI_API_KEY in .env)
//        BASE_URL=http://127.0.0.1:8080 CITY=Delhi npm run demo:video
// Options: ONLY=desktop|mobile   NARRATE=false (silent video)
//
// Voice: a LOCAL model when PIPER_MODEL is set (Piper: free, offline, no quota). PIPER_BIN is the piper executable
// (default: `piper` on PATH) and PIPER_MODEL the voice's .onnx file. One-time setup, in any folder outside the repo:
//   uv venv /opt/tts/venv && VIRTUAL_ENV=/opt/tts/venv uv pip install piper-tts
//   /opt/tts/venv/bin/python -m piper.download_voices --data-dir /opt/tts/voices en_US-lessac-high
//   PIPER_BIN=/opt/tts/venv/bin/piper PIPER_MODEL=/opt/tts/voices/en_US-lessac-high.onnx npm run demo:video
// TTS=gemini uses Gemini text-to-speech instead (your key; small daily quota). VOICE picks the Gemini voice.
//
// Clips are cached in demo/voice/, so re-recording is instant. Needs ffmpeg/ffprobe on PATH.
import { chromium } from '@playwright/test';

import { ENGINE, ONLY, OUT, PIPER_MODEL, VOICE } from './config.mjs';
import { encode } from './encode.mjs';
import { LINES } from './lines.mjs';
import { desktop, mobile } from './scenes.mjs';
import { clipPath, NARRATE, prepareVoice } from './voice.mjs';

/** @import { Cue, Durations, LineId } from './lines.mjs' */

function announceVoice() {
  if (NARRATE) {
    const voice = ENGINE === 'piper' ? `Piper (local) ${PIPER_MODEL.split('/').pop()}` : `Gemini TTS ${VOICE}`;
    console.log(`Voice: ${voice}`);
  } else {
    console.log('Recording silent videos (NARRATE=false, or no voice engine configured: see the top of this file).');
  }
}

/** @param {Durations} durations */
function listClips(durations) {
  for (const [id, d] of Object.entries(durations))
    console.log(`${id.padEnd(12)} ${d.toFixed(1)}s  ${clipPath(LINES[/** @type {LineId} */ (id)])}`);
}

/**
 * @param {Durations} voiceDesktop
 * @param {Durations} voiceMobile
 * @returns {Promise<{ desktopCues: Cue[]; mobileCues: Cue[] }>}
 */
async function record(voiceDesktop, voiceMobile) {
  const browser = await chromium.launch();
  const desktopCues = ONLY === 'mobile' ? [] : await desktop(browser, voiceDesktop);
  const mobileCues = ONLY === 'desktop' ? [] : await mobile(browser, voiceMobile);
  await browser.close();
  return { desktopCues, mobileCues };
}

async function main() {
  announceVoice();
  const voiceDesktop = ONLY === 'mobile' ? {} : await prepareVoice('d_');
  const voiceMobile = ONLY === 'desktop' ? {} : await prepareVoice('m_');
  // VOICE_ONLY=true: just generate (and cache) the narration clips, e.g. to listen to or check them first.
  if (process.env.VOICE_ONLY === 'true') {
    listClips({ ...voiceDesktop, ...voiceMobile });
    process.exit(0);
  }
  const { desktopCues, mobileCues } = await record(voiceDesktop, voiceMobile);
  if (ONLY !== 'mobile') encode(`${OUT}/raw-desktop`, 'saans-demo-desktop', '', desktopCues);
  if (ONLY !== 'desktop') encode(`${OUT}/raw-mobile`, 'saans-demo-mobile', 'scale=1080:1920:flags=lanczos', mobileCues);
}

// Awaited at the top level so a failure exits exactly as before: Node prints it and exits 1.
await main();
