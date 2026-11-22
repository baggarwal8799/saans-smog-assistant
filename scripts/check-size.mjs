// Fails if the project's source files exceed the submission limit (10 MB) minus a safety margin.
// Uses git's file list when available, otherwise walks the folder (e.g. when unpacked from a zip).
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LIMIT_BYTES = 5 * 1024 * 1024;
const SKIP = new Set(['node_modules', 'dist', 'coverage', '.git', '.vercel', 'test-results', 'playwright-report', 'screenshots']);

function gitFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const files = out.split('\0').filter(Boolean);
    return files.length > 0 ? files : null;
  } catch {
    return null;
  }
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name) || e.name === '.env') return [];
    const path = join(dir, e.name);
    return e.isDirectory() ? walk(path) : [path];
  });
}

const files = gitFiles() ?? walk('.');
const total = files.reduce((sum, f) => {
  try {
    return sum + statSync(f).size;
  } catch {
    return sum;
  }
}, 0);
const mb = (total / 1024 / 1024).toFixed(2);
if (total > LIMIT_BYTES) {
  console.error(`Repository is ${mb} MB, over the 5 MB safety limit (submission cap is 10 MB).`);
  process.exit(1);
}
console.log(`Repository size OK: ${mb} MB across ${files.length} files.`);
