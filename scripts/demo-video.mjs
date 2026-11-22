// Records a captioned, narrated demo of the real app (live air data + real Gemini answers):
//   demo/saans-demo-desktop.mp4 (16:9, YouTube/Drive) and demo/saans-demo-mobile.mp4 (9:16, Instagram reel).
//
// Usage: docker compose up --build -d   (with GEMINI_API_KEY in .env)
//        BASE_URL=http://127.0.0.1:8080 CITY=Delhi npm run demo:video
// Options: ONLY=desktop|mobile   NARRATE=false (silent video)
//
// Voice: a LOCAL model by default (Piper: free, offline, no quota). One-time setup, outside the repo:
//   uv venv ~/gen-ai/.tts/venv && VIRTUAL_ENV=~/gen-ai/.tts/venv uv pip install piper-tts
//   ~/gen-ai/.tts/venv/bin/python -m piper.download_voices --data-dir ~/gen-ai/.tts/voices en_US-lessac-high
//   PIPER_BIN=~/gen-ai/.tts/venv/bin/piper PIPER_MODEL=~/gen-ai/.tts/voices/en_US-lessac-high.onnx npm run demo:video
// TTS=gemini uses Gemini text-to-speech instead (your key; small daily quota). VOICE picks the Gemini voice.
//
// Clips are cached in demo/voice/ (keyed by engine, voice and text), so re-recording is instant. Each scene
// waits until its line has been spoken, then the clips are mixed onto the video at the exact moment each scene
// started. Needs ffmpeg/ffprobe on PATH.
import './demo/index.mjs';
