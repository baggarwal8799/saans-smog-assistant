# Setup: from this folder to a running, tested app

Follow these steps in order. They take about 10 minutes the first time.

## 1. What you need

- **A free Gemini API key.** Go to https://aistudio.google.com/apikey, choose **Create API key**, and copy it. It's free: https://ai.google.dev/gemini-api/docs/pricing
- **Docker** (easiest), or **Node.js 20 or newer** (22 recommended) for development and running the tests.
- **Git**, plus a GitHub account to publish the repo.

## 2. Add your key (the only setting you need)

```bash
cp .env.example .env
```

Open `.env` and set:

```
GEMINI_API_KEY=your-key-here
```

`.env` is gitignored, so your key is never committed. Every other setting in it is optional and explained inside the file.

## 3. Run the app

**With Docker (one command):**
```bash
docker compose up --build -d
docker compose logs        # should say: AI: Gemini (gemini-flash-lite-latest)
```
Open **http://localhost:8080**. Stop it with `docker compose down`.

**Or with Node (for development):**
```bash
npm run setup     # installs dependencies, the test browser, and creates .env if missing
npm run dev       # http://localhost:5173
```

## 4. Test it

```bash
npm run setup                     # first time only
npm run verify:all                # lint, types, all unit tests, build, size check, all browser tests
```

With the app running in Docker (step 3), click through every control with real data and real Gemini answers:
```bash
BASE_URL=http://127.0.0.1:8080 EXPECT_AI=true npm run check:clickthrough
```

**By hand (2 minutes):**
1. Search a city.
2. Click **Edit household** and set Winter heating to **Coal / angithi**. A carbon-monoxide warning should become step 1.
3. Under the plan, Gemini's explanation loads on its own (**Explain my plan** asks again). You should get a written answer.
4. Click **हिन्दी**. The page switches to Hindi.

## 5. Publish to GitHub

```bash
git init -b main
git add -A
git status        # check: there's no .env, and no node_modules or dist
git commit -m "feat: Saans smog-season assistant"
gh repo create saans-smog-assistant --public --source . --push
```

No `gh` CLI? Create an empty **public** repo on github.com and push with `git remote add origin …` then `git push -u origin main`. After the push, GitHub Actions runs the checks; wait for the green tick.

## 6. Deploy

Follow **[DEPLOY.md](DEPLOY.md)**. Vercel is recommended: it's free and takes about 5 minutes. Then add the live URL to the top of `README.md`.

## 7. Submit (PromptWars: Virtual)

- **Repo link:** your public GitHub repo, which must be under 10 MB (`npm run check:size`).
- **Video link:** upload the demo video to Google Drive and set sharing to **Anyone with the link → Viewer**. Unlisted YouTube also works.
- You have only **3 submissions**: run step 4 before each one.

## Where to read more

| File | What it covers |
|---|---|
| `README.md` | What the app does, and how it meets each judging criterion |
| `AGENTS.md` | The full manual for developers and AI agents (Antigravity reads it automatically): architecture, commands, rules, how to add features |
| `DEPLOY.md` | Deploying on Vercel, Docker with HTTPS, or Cloud Run, plus troubleshooting |
| `.env.example` | Every setting, with how to get the Gemini key |
