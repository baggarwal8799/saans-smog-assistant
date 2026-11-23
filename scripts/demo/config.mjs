// @ts-check
// Environment options for the demo recorder. Paths are relative to the repo root (run via npm run demo:video).
import { mkdirSync } from 'node:fs';

export const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
export const CITY = process.env.CITY ?? 'Delhi';
export const ONLY = process.env.ONLY;
export const VOICE = process.env.VOICE ?? 'Kore';
export const PIPER_BIN = process.env.PIPER_BIN ?? 'piper';
export const PIPER_MODEL = process.env.PIPER_MODEL ?? '';
export const ENGINE = process.env.TTS ?? (PIPER_MODEL ? 'piper' : 'gemini');
export const OUT = 'demo';
export const VOICE_DIR = `${OUT}/voice`;
mkdirSync(VOICE_DIR, { recursive: true });
