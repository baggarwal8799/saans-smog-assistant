// One-command setup on any machine: installs dependencies, the Playwright browser, and a local .env.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  console.error(`Node ${process.versions.node} found; Node 20 or newer is required (see .nvmrc).`);
  process.exit(1);
}
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
run('npm ci');
run('npx playwright install chromium');
if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log('Created .env from .env.example. Add GEMINI_API_KEY for the AI assistant (free: https://aistudio.google.com/apikey).');
}
console.log('Setup done. Next: npm run dev');
