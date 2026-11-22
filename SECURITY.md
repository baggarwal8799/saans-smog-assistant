# Security policy

## Reporting a vulnerability

Please report security issues privately, not in a public issue or pull request.

1. Open the repository on GitHub and go to **Security → Advisories → Report a vulnerability** (a private security advisory).
2. Describe the issue, how to reproduce it, and what an attacker could do with it.

You should get a first reply within a few days. Once a fix is released, the advisory is published with credit to you, unless you ask otherwise. Only the latest version on `main` is supported.

## Threat model in short

Saans is a public web app with no accounts, no cookies and no stored personal data. The assets worth protecting are the server's Gemini API key, its free-tier quota, and the integrity of the numbers and advice the app shows.

| Threat | Mitigation |
|---|---|
| Key theft | The Gemini key lives only on the server (`GEMINI_API_KEY`), is sent to Google in a header, never in a URL, and never reaches the browser. Error responses never echo upstream text. |
| Forged facts | The server ignores any plan data in the request. It fetches the air and weather data itself and recomputes the plan with the same deterministic engine, so a client cannot make the model "confirm" made-up numbers. |
| Prompt injection | The user's question is fenced (`<QUESTION>`), stripped of angle brackets, control and bidi-override characters, and the system rules tell the model to ignore embedded instructions. The reply must fit a JSON schema; the server writes the refusal and the yes/no verdict, and drops any line that quotes a number not in its context. |
| Markup injection (XSS) | Model output is rendered as text, never as HTML or Markdown. The CSP allows scripts, styles and fonts only from the app's own origin, with no inline or eval script. |
| Quota draining and abuse | A per-client rate limit (15 per minute), a per-client daily cap and a global daily cap on Gemini calls; a 15,000-byte request body cap; time-boxed upstream calls. |
| Malformed input | Strict allow-list validation of every request field with size limits (`api/_lib/validate.ts`); unknown fields, including any client-made context, are dropped. |
| Cross-site use of the API | A POST must come from the app's own page (same-origin `Origin` or `Sec-Fetch-Site`). |
| Clickjacking, sniffing, leaks | `frame-ancestors 'none'` and `X-Frame-Options: DENY`, `nosniff`, `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`, `X-Permitted-Cross-Domain-Policies: none`, a strict Referrer-Policy, a Permissions-Policy that allows only geolocation on this site, and HSTS over HTTPS. `connect-src` is limited to Open-Meteo, BigDataCloud and the app itself. |
| Vulnerable dependencies | CI fails on any high-severity advisory in the production tree (`npm audit`); Dependabot proposes weekly updates; CodeQL scans every push and pull request. |

All headers come from `vercel.json`. Vercel serves them, and the self-hosted server and `vite preview` read the same file, so every deployment sends the same set. `src/securityHeaders.test.ts` asserts each header and its value, for the config and for the self-hosted server's responses.

## Known limitations

- **The origin check is header-based.** It stops other websites from calling the API through a visitor's browser, but a script or `curl` can set any `Origin` it likes. Non-browser abuse is bounded by the rate limits and caps, not by the origin check.
- **Limits are per instance without Upstash.** With `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` set, the rate limit and the daily caps are shared across all instances. Without them, each serverless instance or container counts on its own, so the real ceiling is the limit times the number of warm instances. If Redis fails, the global cap refuses and the per-client limits fall back to memory.
- **The client address comes from the platform.** On the self-hosted server, `X-Forwarded-For` is trusted only with `TRUST_PROXY=true`; behind a proxy that does not overwrite it, clients could spoof their address to dodge the per-client limits.
- **The free Gemini tier may use prompts to improve Google's products.** Don't type personal details into the assistant.
- **HSTS and `upgrade-insecure-requests` are off on the self-hosted server by default**, so it works over plain HTTP on a LAN. Set `SERVE_HTTPS_HEADERS=true` when it is served over HTTPS.
