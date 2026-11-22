# AGENTS.md: Saans (smog-season assistant)

The single guide for humans and AI agents (Antigravity, Codex, Cursor and others). New here? Start with `SETUP.md`. `README.md` is the judge-facing overview; this is the working manual.

---

## 1. What this is

**Saans** (Hindi for *breath*) is a web app built for the **PromptWars: Virtual** challenge (Google for Developers × Hack2skill, Nov 2026):

> Create a gen-AI powered assistant that helps families and communities navigate severe winter smog and urban air pollution. The application should suggest low-emission daily routines, indoor air quality hacks and sustainable alternatives tailored to their location and lifestyle, while clearly explaining the direct impact of their choice.

**Judging parameters:** code quality, security, efficiency, testing, accessibility, problem-statement alignment.

**How it works:**

1. **Location:** the user searches a city (Open-Meteo Geocoding) or taps *Use my location*. The browser GPS position is rounded to about 1 km and named through BigDataCloud reverse geocoding.
2. **Live air:** Open-Meteo Air Quality (CAMS) returns current US AQI, its sub-indices, PM2.5, PM10, NO₂ and O₃, plus a 72-hour hourly forecast.
3. **Household profile:** people, children, elderly, heart or lung conditions, commute mode and distance, outdoor exercise, cooking fuel, heating, purifier and waste burning. It is stored only in `localStorage`.
4. **Plan engine (deterministic):** combines the air data and the profile into ranked recommendations in four groups: routine, indoor, swap and community. Each carries a computed impact: kg CO₂/month, a % PM2.5 cut scoped to where it applies, or "removes a smoke source". The engine also produces the cleanest and worst 2-hour windows, a daily inhaled-dose estimate and a cigarette equivalent.
5. **AI assistant:** a serverless function sends those *computed* numbers (plus the last three questions the user asked, for follow-ups) to Gemini, which returns a typed JSON object (`offTopic`, `reply`, `lines`) that the server renders as the answer, in English or Hindi. No key: `503 not_configured`; free-tier or global daily cap: `429 ai_rate_limited` (a client's own cap: `daily_limit`); Gemini failing: `502 ai_unavailable`, each a plain message in the UI. **It never shows a made-up or canned answer.**

**The core invariant: the LLM never produces numbers.** All figures come from `src/lib/impact.ts` and the rules in `src/lib/plan/`, which are unit-tested. The model may quote only the numbers in its context: any other number is sent back once, then its line dropped (`checks.ts`).

---

## 2. Quick start (any machine)

### Option A: Docker (one time, nothing else to install)

```bash
cp .env.example .env          # then paste your key into GEMINI_API_KEY (see 2.1)
docker compose up --build -d  # builds and starts; open http://localhost:8080
docker compose logs -f        # the first lines say whether AI is on, and how to turn it on if not
```

You only change `.env` after that. Apply changes with `docker compose up -d`, which recreates the container with the new settings. Stop it with `docker compose down`. The container runs read-only as a non-root user with all capabilities dropped, and has a `/healthz` health check.

### Option B: Node (for development)

Requirements: **Node 20 or newer** (22 recommended, see `.nvmrc`) and npm 10 or newer. Playwright downloads its own Chromium.

```bash
nvm use            # optional, picks Node 22 from .nvmrc
npm run setup      # npm ci + Playwright Chromium + creates .env from .env.example
npm run dev        # http://localhost:5173, also serves /api/assistant
npm run build:all && npm start   # production server locally (same as Docker), http://localhost:8080
```

### 2.1 Getting an AI key (free)

Free tier proof: https://ai.google.dev/gemini-api/docs/pricing (Flash models are "Free of charge"). Without a key, everything except **Ask Saans** works; the assistant shows "needs a Gemini API key", and the server prints these steps at startup.

**Gemini (recommended):**
1. Open https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key**. Choose or create any Google Cloud project if asked. No billing or card is needed for the free tier.
3. Copy the key into `.env`: `GEMINI_API_KEY=your-key`, with no quotes and no spaces.
4. Restart: `docker compose up -d`, or re-run `npm run dev` / `npm start`.
5. Check: the plan explanation loads on its own. You should get a written answer, not the "needs a Gemini API key" message.

The free-tier providers may use prompts to improve their products, so don't type personal details into the assistant.

### 2.2 All settings (`.env`)

Every setting lives in `.env`; `.env.example` documents each one.

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `GEMINI_API_KEY` | empty | dev, Docker, `npm start`, Vercel | The Gemini key (the only AI provider). Server-side only. |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` | same | First model to try. The name goes into the URL path, so only `[\w-]+(\.[\w-]+)*` is accepted. |
| `PORT` | `8080` | Docker (host port), `npm start` | Where the production server listens. |
| `TRUST_PROXY` | `false` | Docker, `npm start` | Trust `X-Forwarded-For` only behind a real reverse proxy (rate-limit key). |
| `SERVE_HTTPS_HEADERS` | `false` | Docker, `npm start` | Turn on HSTS + `upgrade-insecure-requests` when served over HTTPS. |
| `UPSTASH_REDIS_REST_URL`, `_TOKEN` | empty | all | Optional Upstash Redis for the limits (`store.ts`). |

`.env` is gitignored and dockerignored, and must never be committed. There are no client-side keys: nothing in `src/` may read a secret. On Vercel, set the same variables in Project → Settings → Environment Variables.

---

## 3. Commands

| Command | What it does |
|---|---|
| `npm run setup` | First-time setup (dependencies, Playwright browser, `.env`) |
| `npm run dev` | Vite dev server with the real `/api/assistant` handler |
| `npm run build` | Type check, then production build to `dist/` |
| `npm run preview` | Serve `dist/` on http://127.0.0.1:4173 **with the production security headers from `vercel.json`** and the API |
| `npm run lint` · `npm run format` | ESLint (TS strict, jsx-a11y strict, react-hooks, SonarJS) · Prettier |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| `npm test` | Vitest unit and integration tests (jsdom, with axe checks) |
| `npm run test:coverage` | Same, with coverage thresholds (99% lines, statements and branches; 98% functions) |
| `npm run test:e2e` | Playwright on desktop and mobile against the **production build** with the real CSP, including WCAG 2.2 AA scans |
| `npm run check:size` | Fails if the source is over 5 MB (the submission cap is 10 MB) |
| `npm run check:live` | Smoke test against **real** services (needs `npm run preview` running). `EXPECT_AI=true` makes it fail unless Gemini actually answers |
| `npm run check:clickthrough` | Clicks every control on a running build (use the Docker one: `BASE_URL=http://127.0.0.1:8080`). With `EXPECT_AI=true` it also checks real Gemini answers, Hindi replies and prompt-injection refusal. Screenshots go to `screenshots/clickthrough` |
| `npm run demo:video` | Narrated demo videos into `demo/` from a running build (local Piper voice; setup at the top of `scripts/demo-video.mjs`) |
| `npm run shots` | Screenshots of the main states into `./screenshots` (needs `npm run preview` running; real data) |
| `npm run build:server` | Bundle `server/index.ts` into `dist-server/index.js` (a single file, Node built-ins only) |
| `npm run build:all` | `build` + `build:server` |
| `npm start` | Production server: serves `dist/` + `/api/assistant` + security headers on `PORT` (default 8080) |
| `docker compose up --build -d` | Build the image and run it (reads `.env`) |
| `npm run ci` | lint + typecheck + coverage + build + size (what CI runs, minus e2e) |
| `npm run verify:all` | `ci` + e2e. **Run this before every submission or PR.** |

---

## 4. Architecture and file map

```
Browser (React 19, Vite)                                   Vercel Function (Node, Web handler)
┌──────────────────────────────────────────────┐  POST    ┌─────────────────────────────────────┐
│ LocationPicker → geo.ts (search / reverse)   │  JSON    │ api/assistant.ts → _lib/assistant.ts│
│ aqi/windows/weather: fetch, windows, trap    │ ───────▶ │  same-origin check → size check →   │
│ recommend.ts + plan/ + impact.ts: the plan   │          │  rate limit → validate → cache →    │
│ assistantClient.ts: place + household only   │ ◀─────── │  Gemini JSON → text, or error code  │
│ UI renders text only (never innerHTML)       │  text    └─────────────────────────────────────┘
└──────────────────────────────────────────────┘
```

| Path | Responsibility |
|---|---|
| `src/App.tsx` | Page layout, air fetch lifecycle (loading is *derived*, not stored), focus and scroll after choosing a place, persistence |
| `src/components/LocationPicker.tsx` | Opening question, search, *Use my location* (reverse geocode, falls back to coordinates), collapsed "Change place" bar |
| `src/components/AirNow.tsx` | The "sky" band: AQI badge, words, metrics, main pollutant, window texts (adds "tomorrow" when needed) |
| `src/components/AirRibbon.tsx` | 24 hourly PM2.5 bars marking the best and worst windows (decorative; the same facts are in text) |
| `src/components/PlanView.tsx` | "Safety first" and "Do these first" steps, before-and-after dose bars, CO₂ line, "More ways to help" expandable rows |
| `src/components/ProfileForm.tsx` | Household line; the form is the lazy `ProfileEditor.tsx` (`NumberField` keeps typed drafts) |
| `src/components/Assistant.tsx` | Lazy chunk. Explain / ask; auto-summary skipped in hidden tabs or with Save-Data; text-only answer; per-error messages; remounts on context change |
| `src/components/Skeleton.tsx` | Air, plan and answer skeletons (`aria-hidden`; the parent announces the status) and the button spinner |
| `src/lib/aqi.ts` · `windows.ts` · `weather.ts` | Air + weather fetch (15 min cache, max 500 entries), parsing and AQI bands · cleanest/worst windows (PM2.5 + ozone) · `findSmogTrap` (wind ≤ 8 km/h and mixing height ≤ 200 m for 3 h or more) |
| `src/lib/impact.ts` | **All factors and maths**: emission factors, breathing rates, indoor ratios, N95, cigarette equivalence, dose model |
| `src/lib/recommend.ts` | Builds the `Plan`: windows outside any smog trap, runs the rules, safety-first ranking, at most 3 "do first" items, CO₂ total |
| `src/lib/plan/*.ts` | The rules, one file per kind (`routine`, `alerts`, `indoor`, `swaps`, `community`) plus `shared.ts` (`L(en, hi)`, `RuleInput`, India gating). Rules see only the concern level from `src/lib/concern.ts`, never the raw AQI |
| `src/lib/assistantClient.ts` | Calls `/api/assistant` |
| `src/lib/geo.ts` | Search, reverse geocoding, coordinate labels, browser geolocation (rounded to 0.01°) |
| `src/lib/profile.ts` | Profile, place and language persistence; `sanitizeProfile` (allow-list and clamping) |
| `src/lib/i18n.ts` · `i18n-en.ts` · `i18n-hi.ts` | `t()`, `tn()` plurals · dictionaries; Hindi is a lazy chunk (sync on servers via `i18n-preloaded.ts`) |
| `api/assistant.ts` | Vercel entry (`export function POST(request)`) |
| `api/_lib/assistant.ts` | Handler: validates, **fetches air and weather itself and rebuilds the plan with the same engine** (client plan data is never trusted), then calls Gemini. Also caching, `quota.ts` caps, `origin.ts`, `medical.ts` lines, `gemini.ts`, `deadline.ts` budget |
| `answer.ts` · `checks.ts` · `repair.ts` | Answer schema, parse, render · number and Devanagari checks · one repair, then failing lines dropped |
| `src/lib/context.ts` · `askedTimes.ts` · `verdict.ts` | Plan → grounded Gemini context, asked-time facts, US EPA yes/no verdict (server side) |
| `api/_lib/validate.ts` | Strict request validation, removal of control characters, bidi overrides and angle brackets |
| `api/_lib/prompt.ts` | System instruction and fenced user prompt |
| `limits.ts` · `store.ts` | 15 per minute per client and daily caps: shared across instances when Upstash is configured, per instance otherwise |
| `src/lib/contract.ts` | Types, error codes and limits shared by client and server |
| `server/index.ts` · `static.ts` | Self-hosted production server (Docker / `npm start`) · static files with Brotli/gzip, ETag/304 and traversal protection; SPA fallback, `vercel.json` headers, `/api/assistant`, `/healthz`, 15,000-byte body cap, prints AI status and key steps at startup |
| `Dockerfile`, `compose.yaml`, `.dockerignore` | Two-stage image (build → Alpine runtime without `node_modules`); compose reads `.env` |
| `vite.config.ts` | Dev/preview API middleware, `vercel.json` headers on preview, Vitest config |
| `vercel.json` | CSP and security headers (asserted in `src/securityHeaders.test.ts`; see `SECURITY.md`), asset caching, function timeout |
| `e2e/app.spec.ts` | Playwright tests (mocked external APIs, real CSP, axe) |
| `e2e/budgets.spec.ts` · `chunks.spec.ts` · `src/docs.test.ts` | Guards: font, JS (first load 100 kB gzip) and a11y budgets; lazy chunks · doc numbers, names, paths |
| `scripts/` | `setup`, `check-size`, `live-check`, `screenshots` |

---

## 5. Rules the code relies on (don't break these)

1. **Numbers come from code, never the model.** New impact figures go in `impact.ts` or a rule in `src/lib/plan/`, with a source noted in the README table and a unit test.
2. **Every percentage is scoped.** Set `scope` (e.g. "outdoors", "in the kitchen"). Never claim a whole-day cut. Removing a source uses `removesSource`, not "100%".
3. **Community figures are separate.** Anything with `community: true` is excluded from the household CO₂ total. Switching commute mode and carpooling are alternatives, so only the larger counts.
4. **Safety first.** `safety: true` tips (fuel heating, solid-fuel cooking) are their own group above the `MAX_URGENT = 3` "do first" items and take none of those slots. On a clean-air day nothing else is "do first".
5. **Time windows start at the next full hour** and say "tomorrow" or "कल" when they fall on a later day (`isLaterDay`). Windows weigh PM2.5 *and* ozone (`airScore`). Ozone advice uses the ozone peak, not the overall worst window.
6. **Bilingual everything.** Every visible string is in `i18n.ts` (both `en` and `hi`) or written as `bilingual(en, hi)` in `src/lib/plan/copy/`. Show translated messages instead of raw browser or API error text.
7. **Model output is a typed object, rendered as text.** Never use `dangerouslySetInnerHTML` or render Markdown from the model.
8. **The server never trusts plan data from the browser.** It receives only `place` and `profile` and recomputes everything. **Server validation is an allow-list.** New request fields need validation in `validate.ts`, limits in `contract.ts` and tests. Keep the angle-bracket stripping: it protects the `<CONTEXT>` and `<QUESTION>` fences.
9. **External hosts need the CSP.** Any new `fetch` host must be added to `connect-src` in `vercel.json`. After editing `vercel.json`, **restart `npm run preview`**, because headers are read at startup.
10. **Storage may fail.** Wrap every `localStorage` access in try/catch (see `profile.ts`). The app must work in private mode.
11. **Accessibility is a requirement.** Labels on every input, one `h1`, logical heading order, ≥44 px targets, visible `:focus-visible`, colour never the only signal, AA contrast in both themes. `npm run test:e2e` must stay at zero axe violations.
12. **Sorting:** never write a bare `.sort()`. Always pass a comparator (Sonar S2871). For identifiers whose order matters, use code-unit order, not `localeCompare`.
13. **No file over 200 lines; one job per module.** Split by concern before a file grows past it (tests too). Tests mock every network call.
14. **Comments explain *why*,** not what. Keep functions pure where possible; side effects live in `App.tsx`, `aqi.ts` (fetch and cache) and the API handler.

---

## 6. Common tasks

**Add a recommendation**
1. Write a `xxxRec(input: RuleInput): RecDraft | null` in the matching `src/lib/plan/*.ts` with `bilingual(en, hi)` text, and an impact (`co2KgPerMonth`, or `exposureCutPct` + `scope`, or `removesSource`).
2. Add it to `draftsFor` in `recommend.ts` (array order breaks ties; set `epaActivity` if it changes who goes out or how hard).
3. Put any new factor in `impact.ts` with a source comment and add it to the README sources table.
4. Add tests in `src/lib/recommend.test.ts`: when it appears, when it doesn't, and its impact.

**Add or change UI text**
1. Add the key to **both** `src/lib/i18n-en.ts` and `i18n-hi.ts`. TypeScript fails if `hi` is missing a key.
2. Use `t(lang, 'key', { param })` in the component.

**Change the LLM**
1. Set `GEMINI_MODEL` in `.env`, or change `DEFAULT_MODEL` / `FALLBACK_MODELS` in `api/_lib/gemini.ts`.
2. The chain is `GEMINI_MODEL` → `gemini-flash-lite-latest` → `gemini-3.1-flash-lite` → `gemini-flash-latest`. Each attempt gets min(9 s, time left of a 25 s budget shared with the repair; `deadline.ts`). The next model is tried on 404/429/5xx/timeout. A 400 first retries the same model without `thinkingConfig`.
3. Flash-Lite is the fastest, so it comes first; full Flash was often 503 in Nov 2026 tests.
4. `thinkingLevel: "low"` is accepted by Flash and Flash-Lite; `"minimal"` is rejected by full Flash.
5. Run `npm test`, then `EXPECT_AI=true npm run check:clickthrough` against a running build with a key.

---

## 7. Testing guide

- **Unit and integration (`npm test`):** pure logic in `src/lib/*.test.ts` and `api/**/*.test.ts` (server tests run in the `node` environment). `gemini.contract.test.ts` replays real Gemini bodies (`api/_lib/fixtures/`). `src/App*.test.tsx` drive the whole UI with every network call mocked (`src/test/network.ts`) and run axe-core; API tests share `src/test/apiHelpers.ts` and `src/test/fakeRedis.ts`.
- **End to end (`npm run test:e2e`):** builds the app and serves it with `vite preview`, so the production CSP is enforced. External APIs are mocked with `page.route`. Any CSP violation in the console fails the test. It covers the full flow, profile changes, geolocation naming, change place, keyboard use, no horizontal scroll at 360 px, API rejection paths, and axe scans in light, dark, English and Hindi.
- **Real services:** `npm run preview`, then `npm run check:live` (geolocation → Lucknow, plan, assistant) and `npm run shots` (visual review). Look at the screenshots: automated checks miss visual bugs.
- **When something fails in the browser but not in tests,** first check for a stale `npm run preview` server (old headers) and a cached build (hard refresh).

---

## 8. Deploy (free)

**Full step-by-step guide: [DEPLOY.md](DEPLOY.md)** (GitHub, Vercel, Docker with HTTPS, Cloud Run, post-deploy checks, troubleshooting).

**Self-host anywhere with Docker:** `docker compose up --build -d` on any machine or VM. Put it behind a TLS proxy (Caddy, nginx) for HTTPS, then set `TRUST_PROXY=true` and `SERVE_HTTPS_HEADERS=true`.

**Vercel (free hobby plan):**
1. Push to a **public** GitHub repo (needed for submission).
2. Go to vercel.com/new and import the repo. The framework is detected as Vite and `vercel.json` sets the rest.
3. Add `GEMINI_API_KEY` under Project → Settings → Environment Variables, then redeploy.
4. Open the URL and run through: search a city, *Use my location*, the plan explanation. With the key set you must get a written answer.

The function is `api/assistant.ts` (`maxDuration` 30 s). Files under `api/_lib/` are not routes (underscore prefix). Relative imports in `api/` use `.js` suffixes on purpose, for Node ESM after compilation.

---

## 9. Submission checklist (PromptWars: Virtual, Challenge 6)

- [ ] Public GitHub repo link; source under 10 MB (`npm run check:size`).
- [ ] Demo video link: **unlisted YouTube or Google Drive with access granted**. The same video can go to Instagram for the reels bonus.
- [ ] Only **3 submissions** are allowed. Run `npm run verify:all` and a manual click-through before each one.
- [ ] Deadline: the challenge started on 16 Nov 2026. Submissions close on day 13 of the cycle, around 28 Nov 2026. **Confirm the exact time (IST) on the Hack2skill dashboard.**
- [ ] Live URL (Vercel) in the README, with the AI key set and verified.
- [ ] Check whether this challenge also wants the blog and LinkedIn "build in public" posts named in the general rules.
- [ ] The rules page says Google Antigravity is required; this repo was not built with it.

---

## 10. Known issues and backlog

Highest impact first. The file to start from is given for each.

1. **Re-check the real AI path after any prompt or model change.** Unit tests mock `fetch`. With a key set, run `EXPECT_AI=true npm run check:clickthrough` and read the answers: grounded numbers, Hindi, injection refusal.
2. **Place-name language.** Names come in the language used when searching or locating. Switching EN↔HI afterwards does not translate the stored name. Start from `LocationPicker.tsx` and `geo.ts`, e.g. re-resolve when the language changes.
3. **Search results include foreign namesakes** (e.g. "Lucknow, Victoria, Australia", "Dunn, North Carolina" for "Lucknow"). Consider ranking the user's country first. Start from `geo.ts`.
4. **Impact factors are rounded approximations** (DEFRA, EPA, Berkeley Earth and others; see the README). Indoor ozone at "about half of outdoor" and DIY-filter ratios are estimates.

---

## 11. Gotchas learned while building

- **ESLint is pinned to v9** because `eslint-plugin-jsx-a11y` does not support ESLint 10 yet.
- **`vite preview` reads `vercel.json` once at startup.** Restart it after header or CSP changes, or you will chase CSP errors that are already fixed.
- **The CSP blocks inline `style` attributes**, but React's `style={{…}}` (CSSOM) is allowed.
- **Gemini model ids change under you.** `gemini-2.5-flash` was closed to new keys in Nov 2026. The `-latest` aliases plus the fallback chain keep the app working; the server log shows Gemini's real error text.
- **Past the per-minute limit** the UI says "too many questions" (`too_many_requests`).
- **A Gemini model name in the URL path** must not contain `/` or `..` (validated).
- **A mocked `Response` body can be read once.** Use `vi.fn(async () => new Response(…))` for mocks called more than once.
- **The Docker runtime has no `node_modules`:** `server/` may import only Node built-ins and repo code.
- **Fonts are self-hosted** through `@fontsource` (Baloo 2 + Mukta; `unicode-range` means only the subsets in use download), because the CSP allows only `font-src 'self'`.

---

## 12. Conventions for agents

- Keep this file under **24 KB**: Antigravity truncates rule files above 24,000 bytes.
- Run `npm run verify:all` before saying a change is done, and look at `npm run shots` output for any UI change.
- Keep changes small and tested: a bug fix comes with a test that fails before it and passes after.
- Do not commit `.env`, `screenshots/`, `dist/`, `coverage/` or `test-results/` (all gitignored).
- Times shown to the owner are in **IST** (Asia/Kolkata).
- Commit messages: Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
