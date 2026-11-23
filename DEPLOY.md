# Deploying Saans

This guide takes you from the code on your machine to a public URL. Pick **one** option:

| Option | Cost | Best for |
|---|---|---|
| **A. Vercel** (recommended) | Free (Hobby plan), no card | The submission: a public HTTPS URL in about 5 minutes |
| **B. Docker on any server** | Whatever the server costs | Your own VM or VPS, or a college or office server |
| **C. Google Cloud Run** | Free tier, but needs a billing account | Running fully on Google Cloud |

All three serve the same app with the same security headers. The Gemini key always stays on the server and never reaches the browser.

---

## 0. Before you deploy

1. **Run every check** (lint, types, unit tests, build, size and end-to-end tests):
   ```bash
   npm run verify:all
   ```
2. **Have your Gemini key ready.** It's free at https://aistudio.google.com/apikey (free tier: https://ai.google.dev/gemini-api/docs/pricing).
3. **Know what stays private.** `.env` (your key), `demo/` (videos), `node_modules/`, `dist/` and `screenshots/` are all gitignored, so they are never pushed. You set the key in the hosting dashboard instead.

---

## 1. Push the code to a public GitHub repo

The submission needs a **public** repo under 10 MB. This one is about 0.5 MB.

```bash
cd smog-assistant
git add -A
git status                       # check: no .env, no demo/, no node_modules
git commit -m "feat: Saans smog-season assistant"
gh repo create saans-smog-assistant --public --source . --push
```

No `gh` CLI? Create an empty **public** repo on github.com, then:
```bash
git remote add origin https://github.com/<your-user>/saans-smog-assistant.git
git push -u origin main
```

**Check before going public:** `git ls-files | grep -i env` must print only `.env.example`.

---

## 2. Option A: Vercel (recommended)

1. Sign in at **https://vercel.com** with GitHub. The Hobby plan is free with no card.
2. Click **Add New → Project**, then **Import** your `saans-smog-assistant` repo.
3. Vercel detects **Vite**, and `vercel.json` already sets the build command, the output folder, the security headers and the API function. Change nothing here.
4. Open **Environment Variables** and add:
   | Name | Value |
   |---|---|
   | `GEMINI_API_KEY` | your key |
   | `GEMINI_MODEL` | *(optional)* leave unset for the default `gemini-flash-lite-latest` |
5. Click **Deploy**. It takes about a minute. You get a URL like `https://saans-smog-assistant.vercel.app`.
6. **If you added the key after the first deploy:** go to Deployments → ⋯ → **Redeploy**. Environment variables only apply to new deployments.
7. *(Optional)* **Share the limits across instances:** Project → **Storage** (Marketplace) → **Upstash** → Redis, free plan, connected to this project. It sets `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; redeploy. Without it, the limits are per instance and start again on a cold start.

How it runs: the static site is served from Vercel's CDN, and `/api/assistant` runs as a serverless function (`api/assistant.ts`, 30 s limit). Files under `backend/` are helpers, not routes.

---

## 3. Option B: Docker on any server

On any Linux server with Docker and Docker Compose:

```bash
git clone https://github.com/<your-user>/saans-smog-assistant.git
cd saans-smog-assistant
cp .env.example .env          # set GEMINI_API_KEY=your-key
docker compose up --build -d  # serves http://<server-ip>:8080
docker compose logs           # first lines: "AI: Gemini (...)" confirms the key loaded
```

The container is small (Alpine, no `node_modules`). It runs as a non-root user with a read-only filesystem and all capabilities dropped, has a `/healthz` health check, and restarts automatically.

**HTTPS (needed for "Use my location" on a real domain):** put a TLS proxy in front. For example, Caddy obtains certificates automatically:

```
# /etc/caddy/Caddyfile
saans.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Then set these in `.env` and run `docker compose up -d`:
```
TRUST_PROXY=true            # the proxy sets X-Forwarded-For; used for rate limiting
SERVE_HTTPS_HEADERS=true    # turns on HSTS and upgrade-insecure-requests
```

**Update to a new version:** `git pull && docker compose up --build -d`.

---

## 4. Option C: Google Cloud Run

Cloud Run has a generous free tier, but Google requires a **billing account** to use it. The Dockerfile works as is, because Cloud Run sets `PORT=8080`, which the server reads.

```bash
gcloud auth login
gcloud config set project <your-project-id>
gcloud run deploy saans \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=<your-key>,SERVE_HTTPS_HEADERS=true,TRUST_PROXY=true
```

`asia-south1` is Mumbai. Cloud Run serves HTTPS, so the two header flags are correct here. For a stricter setup, keep the key in **Secret Manager** and use `--set-secrets GEMINI_API_KEY=<secret-name>:latest` instead.

---

## 5. After deploying: check the live site

1. Open the URL in a browser:
   - **Search a city:** the coloured air band and the 24-hour ribbon appear.
   - **Use my location:** it shows your real city name.
   - **Edit household → Coal heating:** the carbon-monoxide warning becomes step 1.
   - **Explain my plan** (it also loads on its own): you get a written answer from Gemini, not the "needs a Gemini API key" message.
   - **हिन्दी:** the whole page switches to Hindi.
2. Or run the automated checks against the live URL from your machine:
   ```bash
   BASE_URL=https://<your-url> npm run check:live
   BASE_URL=https://<your-url> EXPECT_AI=true npm run check:clickthrough
   ```
3. Put the live URL in the README, under "Saans", and in your submission.

---

## 6. Troubleshooting

| You see | Cause | Fix |
|---|---|---|
| "The assistant needs a Gemini API key" | The key is not set on the host | Add `GEMINI_API_KEY`, then **redeploy** (Vercel) or `docker compose up -d` |
| "The free Gemini limit was reached" | The free-tier per-minute or daily limit | Wait a minute; for heavy use, enable billing on the key's project |
| "That's a lot of questions in one minute" | The app's own limit (15 per minute per user) | Wait a moment; it protects your free quota |
| "The assistant could not answer" | Gemini was busy or failing on every model | Try again; server logs (Vercel → Logs, or `docker compose logs`) show Gemini's exact error |
| No air data / "Could not load air quality" | Open-Meteo unreachable from the browser | Check the network; the CSP allows `air-quality-api.open-meteo.com` |
| *Use my location* shows coordinates instead of a city | The reverse-geocoding service is unreachable | Harmless fallback; searching works |
| *Use my location* does nothing | Not served over HTTPS (browsers block geolocation) | Use Vercel, Cloud Run or the Caddy setup above |
| A 404 for the model in the logs | `GEMINI_MODEL` names a model your key can't use | Remove `GEMINI_MODEL` to use the default chain |

---

## 7. Keep your key safe

- Never commit `.env` or paste the key into code, issues or chat.
- If a key was ever exposed, create a new one at https://aistudio.google.com/apikey, delete the old one, update the host and redeploy.
