// Reports whether the draw data actually changed, ignoring the generatedAt
// timestamp that every refresh rewrites. Without this a weekly job would
// commit timestamp-only churn on runs where no new draws had happened.
//
// Prints "changed" or "unchanged"; exits 0 either way, 2 on error.
// Run: npm run changed

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Only the per-game draw arrays matter — not generatedAt, not the window bounds.
const payload = (raw) => JSON.stringify(JSON.parse(raw).games);

try {
  const current = payload(fs.readFileSync(path.join(ROOT, 'data', 'draws.json'), 'utf8'));

  let committed;
  try {
    committed = execFileSync('git', ['show', 'HEAD:data/draws.json'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    // No commit yet, or the file is not tracked — treat as changed.
    console.log('changed');
    process.exit(0);
  }

  console.log(payload(committed) === current ? 'unchanged' : 'changed');
} catch (err) {
  console.error(`changed.js: ${err.message}`);
  process.exit(2);
}
