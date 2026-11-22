# Saans 🌫️ · smog-season companion

**Saans** (Hindi for *breath*) is a Gen-AI assistant that helps families and communities get through severe winter smog. It reads **live air quality for your location**, learns a little about **your household and lifestyle**, and builds a plan with four parts:

1. **Low-emission daily routines**: the cleanest hours to go out (weighing PM2.5 *and* ozone), a **winter smog-trap alert** (cold, still air that holds smoke at breathing height, from forecast wind and mixing height), a cleaner commute (only a switch that cuts emissions by at least 25%: cars to the bus, auto-rickshaws and motorbikes to the metro), when to keep children and elders indoors, and N95 guidance. Workouts move indoors from AQI 151, following US EPA guidance.
2. **Indoor air quality hacks**: when to air the house, a DIY box-fan purifier, kitchen exhaust, wet cleaning, and which myths to skip.
3. **Sustainable alternatives**: safe heating (carbon-monoxide safety comes first), clean cooking fuel, alternatives to waste burning, smoke-free mosquito control, and a cleaner commute.
4. **Community action**: a smog plan for your housing society or school, with its shared CO₂ impact shown separately from yours.

Every suggestion shows its **direct impact**: kg of CO₂ avoided per month, or a % cut in PM2.5 *scoped to where it applies* (outdoors, at home, in the kitchen), or "removes a smoke source". A "How we worked this out" panel shows the arithmetic. The tile also names the main pollutant driving the AQI. The whole plan is then summarised as *"PM2.5 you breathe per day: X µg → Y µg"* and *"Breathing today's air ≈ N cigarettes"*.

A Gemini-powered assistant (free tier, `gemini-flash-lite-latest` with automatic fallback to other free Flash models) explains the plan in plain English or Hindi as soon as it appears, and answers follow-up questions, using the last three questions you asked for context. It is grounded strictly in the computed numbers.

## Why the numbers are trustworthy

The LLM **never invents numbers**. A pure, unit-tested TypeScript engine computes every figure (`src/lib/impact.ts`, `src/lib/recommend.ts`) from live data and named, sourced factors. Every percentage shown on an impact chip is computed from one of those named factors. The browser runs the engine to show the plan instantly. For the assistant, **the server runs the same engine again on its own**: the browser sends only the place and household, and the server fetches the air and weather data itself, builds the plan, and gives Gemini only those figures as fenced context. A forged request therefore cannot change the numbers or the advice the model sees (there's a test for exactly this). If no Gemini key is set, or Gemini is busy or down, everything else keeps working and the assistant says exactly what to do (add a key, or try again in a minute). It never shows a made-up answer.

```
Browser (React)                                 Server (Vercel function / Docker)
┌──────────────────────────────┐ place +       ┌──────────────────────────────────┐
│ Open-Meteo air + weather     │ household     │ validate → rate-limit →          │
│ Rule engine → plan + impacts │ ────────────▶ │ fetch air + weather itself →     │
│ Profile (localStorage only)  │               │ same rule engine → plan →        │
│ Shows answers as plain text  │ ◀──────────── │ Gemini (key here) → JSON → text  │
└──────────────────────────────┘   text only   └──────────────────────────────────┘
```

**The model returns a typed object, not free text.** Gemini answers under a JSON response schema with three fields: `offTopic`, `reply` (yes, no, only if, or none) and `lines`. The server renders the answer from it (`api/_lib/answer.ts`). An off-topic question gets one fixed refusal sentence. A yes/no answer opens with the word from the server's own US EPA verdict whenever there is one, whatever the model said. The lines become bullets, and code adds the fixed safety lines (carbon monoxide, inhaler, when to get medical help). The checks that remain are the ones no schema can express (`api/_lib/checks.ts`): every number must appear in the context the model saw, a Hindi answer must be in Devanagari, the reply must match the EPA verdict, and a question about going outdoors is never off-topic. A failing answer gets one repair call; any line that still fails is dropped, so an invented number never reaches the user.

## Tech (all free tier)

| Concern | Choice |
|---|---|
| UI | React 19 + TypeScript (strict) + Vite |
| Air quality | [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) (CAMS): free, no key |
| Geocoding | Open-Meteo Geocoding API for search. For "Use my location", browser geolocation rounded to about 1 km, named via BigDataCloud's free client-side reverse geocoding (no key); it falls back to coordinates if that fails. |
| LLM | Google Gemini API ([free tier](https://ai.google.dev/gemini-api/docs/pricing)) via a server-side function; the key never reaches the browser |
| Hosting | Vercel Hobby (static site + one serverless function) |
| Tests | Vitest + Testing Library + axe-core, Playwright + @axe-core/playwright |
| CI | GitHub Actions: lint, format check, type check, coverage, build, size check, `npm audit`, e2e |

**New here? Start with [SETUP.md](SETUP.md)**: key, run, test, publish, deploy and submit, step by step.

## Run with Docker (one command)

```bash
cp .env.example .env            # paste a free Gemini key into GEMINI_API_KEY (steps are inside the file)
docker compose up --build -d    # open http://localhost:8080
```

No key yet? Everything except "Ask Saans" works, and `docker compose logs` prints how to get a free key.

## Run locally

Requirements: Node 20 or newer (`.nvmrc` pins 22).

```bash
npm run setup      # install, Playwright browser, create .env from .env.example
npm run dev        # http://localhost:5173 (the dev server also serves /api/assistant)
```

Add `GEMINI_API_KEY` (free at https://aistudio.google.com/apikey) to `.env` for the AI assistant. Everything else works without it.

```bash
npm test             # unit + integration tests
npm run test:e2e     # Playwright on desktop + mobile, with WCAG 2.2 AA scans and the production CSP
npm run verify:all   # everything: lint, types, coverage, build, size, e2e
```

**Developer and agent guide:** [AGENTS.md](AGENTS.md) covers the architecture, every command, the rules the code relies on, how to add features, the deploy steps, the submission checklist and known issues.

## Deploy (free)

See **[DEPLOY.md](DEPLOY.md)** for step-by-step instructions: Vercel in about 5 minutes (recommended), Docker on any server with HTTPS, or Google Cloud Run, plus checks after deploying and troubleshooting.

## How each judging criterion is covered

**Problem-statement alignment**
- Location: live AQI, PM2.5, PM10, NO₂ and O₃, plus an hourly forecast for any city or your GPS position.
- Lifestyle: household members (children, elderly, respiratory or heart conditions), commute mode and distance, exercise, cooking fuel, heating, purifier, waste burning.
- Routines, indoor fixes and swaps are grouped exactly as the brief asks. Each has a quantified impact and the working behind it.
- Community angle, all winter: a carpool or school-run pool, a no-burning pledge with reporting, and a shared clean room, each quantified (community figures, never added to the household total).

**Code quality**
- Strict TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), with `typescript-eslint` strict and `jsx-a11y` strict rules.
- SonarJS code-smell rules (cognitive complexity, nested conditionals, regex safety), a 120-character line limit and Prettier formatting, all enforced in CI with zero exceptions outside a few justified, commented lines.
- Pure domain logic is kept apart from the UI, and plan wording lives in `src/lib/plan/copy/`, apart from the rules that choose it. Recommendation IDs are a typed union, so a typo fails to compile. Dependencies point one way: the server imports the shared domain code in `src/lib/`, never the reverse.
- The same Web-standard request handler runs in the Vite dev server and in production.

**Security**
- The API key lives only on the server and is sent in a header, never in the URL. Error responses never echo upstream text.
- Strict allow-list validation, size limits, a request body cap of 15,000 bytes, and stripping of control and bidi-override characters.
- A per-client rate limit (15 per minute) and two daily caps (one per client, one global on Gemini calls), so one client can't drain the free quota. The limits are shared across instances when Upstash Redis is configured (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`), and per instance otherwise. If Redis fails, the global cap refuses and the per-client limits count in memory. A POST must come from the app's own page (same-origin `Origin` or `Sec-Fetch-Site`).
- Prompt-injection and forged-request hardening: the server ignores any plan data in the request and computes its own from fresh air data; the user's question is fenced and stripped of angle brackets, and the system rules tell the model to ignore embedded instructions. The reply must fit a JSON schema, and the server, not the model, writes the refusal and the yes/no word.
- Model output is rendered as text, never as HTML, so it can't inject markup.
- Dependencies: CI runs `npm audit --omit=dev --audit-level=high`, so it fails on any high-severity advisory in the production tree. Run `npm audit` for the current state of the full tree; it reported 0 vulnerabilities at the last check.
- Headers: CSP (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri` and `form-action` limited to the app, `connect-src` limited to Open-Meteo and the reverse-geocoding service), HSTS (on Vercel, and on the self-hosted server when `SERVE_HTTPS_HEADERS=true` behind HTTPS), `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` set to `same-origin`, `X-Permitted-Cross-Domain-Policies: none`, and a Permissions-Policy that allows geolocation only on this site. `src/securityHeaders.test.ts` checks every header and value, in `vercel.json` and on the self-hosted server's responses.
- Supply chain: Dependabot proposes grouped weekly npm and GitHub Actions updates, CodeQL scans every push and pull request, and CI runs with read-only permissions.
- Reporting a vulnerability, the threat model and known limits (the origin check is header-based; without Upstash the limits are per instance): see `SECURITY.md`.
- Privacy: the profile and location stay in `localStorage`, and GPS is rounded to about 1 km. The app has no accounts, no tracking and no cookies.

**Lighthouse** (production build, mobile and desktop): Accessibility 100 · Best Practices 100 · SEO 100 · Agentic Browsing 100. Lab LCP is about 0.26 s and CLS is 0.

**Efficiency**
- Air data is cached for 15 minutes per ~1 km grid cell. Assistant answers are cached for 10 minutes per identical request. Both caches are bounded.
- The plan is recomputed with `useMemo` only when its inputs change. Network calls have timeouts.
- Flash-Lite answers first, with the "thinking" level set to low. On the free tier an answer usually takes a few seconds; when Gemini is overloaded it can take longer. Busy models fall back automatically, a second round runs if every model is busy, and one 25-second budget caps the whole request, after which the app shows a plain "try again" message instead of hanging.
- Code-split, so the first load carries only what the empty page needs: one 316 kB script, about 100 kB gzip and 85 kB Brotli (before: 331, 102.6 and 87.7 kB). Most of it is React itself. An end-to-end budget keeps the first-load JavaScript under 108 KB compressed. The rest loads with the action that needs it: the Hindi text (4.3 kB gzip) only in Hindi, fetched before the first render for people who saved Hindi; Ask Saans (2 kB) alongside the air data once a place is set; the household editor (1 kB) when it is opened; the hourly table is built only when expanded.
- The automatic plan summary runs once per place, and never in a background tab or with Save-Data on; the Explain button is always there.
- The Devanagari fonts load only once the page is in Hindi. Fonts are self-hosted. Each face is split by `unicode-range` (Latin, Latin Extended, Vietnamese, Devanagari), so the browser downloads only the subsets the page's text uses: the Latin files on an English page, plus Devanagari in Hindi. Hashed assets get year-long immutable caching. The self-hosted server sends Brotli or gzip, caches the compressed files in memory, and answers repeat requests with ETag/304.

**Testing**
- Unit tests cover the impact maths, AQI parsing and time windows, the recommendation rules, validation, the rate limiter, prompt construction, the answer schema and checks, and the API handler.
- Integration tests drive the full React flow with axe checks.
- Playwright end-to-end tests run on desktop and mobile with WCAG 2.2 AA scans (light and dark, English and Hindi), keyboard-only use, a no-horizontal-scroll check, and the API's rejection paths.
- Plan invariant tests run every rule over thousands of generated households and air conditions (e.g. advice never gets milder as AQI rises, every number in a tip is shown in its working).
- Contract tests replay recorded real Gemini responses; a security-header test checks every header on Vercel's config and on the self-hosted server.
- Coverage is enforced in CI at 99% of lines, statements and branches (98% of functions); every network call is mocked.

**Accessibility**
- Semantic landmarks, a skip link, a single `h1` and a logical heading order. Every input has a label, and live regions announce status changes.
- Text labels sit next to every colour (the AQI level is never shown by colour alone). Contrast meets AA in light and dark mode, and `prefers-contrast` and `prefers-reduced-motion` are respected.
- Tap targets are at least 44 px, keyboard operation and focus styles are visible throughout, and the whole interface works in Hindi with the `lang` attribute switching.

## Impact factors and sources

All factors are rounded and deliberately conservative. They are estimates for awareness, not measurements.

| Factor | Value | Source |
|---|---|---|
| Car / motorbike / bus / metro, kg CO₂e per passenger-km | 0.17 / 0.11 / 0.10 / 0.03 | UK DEFRA GHG conversion factors (approx.) |
| Auto-rickshaw (CNG) | 0.07 | Estimate |
| Breathing rate at rest, light, moderate and heavy effort | 0.5 / 1.0 / 1.6 / 3.0 m³/h | US EPA Exposure Factors Handbook, ch. 6 (approx.) |
| Breathing rate used for every household member | adult rates | Simplification: children breathe less air per hour but more per kilogram of body weight |
| Walk to and from the bus stop or metro station | 10 min each way, at walking breathing rate and street PM2.5 | Assumption |
| Indoor/outdoor PM2.5 ratio: windows open / shut / with HEPA / DIY fan-filter | 0.9 / 0.6 / 0.3 / 0.35 | Infiltration and portable-cleaner studies (approx.). The dose baseline is the household's habit: windows open, or its own purifier running |
| One purifier or fan-filter per bedroom, two people per bedroom | 2 | Assumption |
| Damp cleaning instead of dry sweeping | 10% less indoor PM2.5 | Assumption, kept low |
| N95 real-world filtration | 80% | Lab rating is ≥95%; we allow for fit leaks |
| 22 µg/m³ PM2.5 for one day ≈ 1 cigarette | 22 | Berkeley Earth (Muller & Muller, 2015) |
| Open burning of household waste | ≈ 10 g PM2.5/kg | Wiedinmyer et al., 2014 |
| Waste burned per person a week, where a home burns it | 0.5 kg | Assumption: about a sixth of the ≈ 0.45 kg/day urban Indians generate (CPCB) |
| One mosquito coil ≈ PM2.5 of 75–137 cigarettes | 75–137 | Liu et al., 2003, *Environ. Health Perspect.* |
| Potted plants' air cleaning is negligible | — | Cummings & Waring, 2019 |

Air data: [Open-Meteo](https://open-meteo.com/) (CAMS), licensed CC BY 4.0. The AQI uses the US EPA scale.

## Disclaimer

Saans gives general guidance, not medical advice. If anyone has trouble breathing, chest pain or dizziness, contact a doctor or emergency services.

## License

MIT
