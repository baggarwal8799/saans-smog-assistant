// @ts-check
import { execFileSync } from 'node:child_process';
import { readdirSync, renameSync, rmSync } from 'node:fs';

import { OUT } from './config.mjs';
import { LINES } from './lines.mjs';
import { clipPath, durationOf } from './voice.mjs';

/** H.264 at a high quality, in a container that starts playing before it has fully downloaded. */
const VIDEO_ARGS = [
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '20',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
];

/**
 * @param {string} rawDir
 * @param {string} name
 */
function takeRecording(rawDir, name) {
  const raw = readdirSync(rawDir).find((f) => f.endsWith('.webm'));
  if (!raw) throw new Error(`no recording in ${rawDir}`);
  const webm = `${OUT}/${name}.webm`;
  renameSync(`${rawDir}/${raw}`, webm);
  rmSync(rawDir, { recursive: true, force: true });
  return webm;
}

/**
 * @param {string} webm
 * @param {string} vf
 * @param {import('./lines.mjs').Cue[]} cues
 */
function mixGraph(webm, vf, cues) {
  const inputs = ['-i', webm];
  const filters = [];
  if (vf) filters.push(`[0:v]${vf}[v]`);
  cues.forEach((cue, i) => {
    inputs.push('-i', clipPath(LINES[cue.id]));
    filters.push(`[${i + 1}:a]aresample=48000,adelay=${cue.at}|${cue.at}[a${i}]`);
  });
  if (cues.length > 0) {
    const mix = cues.map((_, i) => `[a${i}]`).join('');
    filters.push(
      `${mix}amix=inputs=${cues.length}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad[aout]`,
    );
  }
  return { inputs, filters, videoOut: vf ? '[v]' : '0:v' };
}

/**
 * @param {string} rawDir
 * @param {string} name
 * @param {string} vf an ffmpeg video filter, or '' for none
 * @param {import('./lines.mjs').Cue[]} cues
 */
export function encode(rawDir, name, vf, cues) {
  const webm = takeRecording(rawDir, name);
  const { inputs, filters, videoOut } = mixGraph(webm, vf, cues);
  const audio = cues.length > 0;
  const args = [
    '-y',
    '-loglevel',
    'error',
    ...inputs,
    ...(filters.length ? ['-filter_complex', filters.join(';')] : []),
    '-map',
    videoOut,
    // An explicit length, not -shortest: with a video filter in the graph, -shortest does not stop the padded
    // audio and ffmpeg encodes forever.
    ...(audio
      ? ['-map', '[aout]', '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-t', String(durationOf(webm))]
      : ['-an']),
    ...VIDEO_ARGS,
    `${OUT}/${name}.mp4`,
  ];
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- dev script: the local ffmpeg is the point
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  rmSync(webm);
  const suffix = audio ? ` with ${cues.length} narration lines` : ' (silent)';
  console.log(`Saved ${OUT}/${name}.mp4${suffix}`);
}
