// Syntax-check the newsroom interface.
//
// The whole UI is one HTML file with a single inline <script>. It is deliberately not
// compiled and not linted, so a stray bracket ships silently and the app boots to a blank
// stage. This pulls the script out and hands it to Node's parser, which is the cheapest
// possible guard. Run it before every commit that touches the interface.
//
//   node scripts/check-ui.mjs
//
// It also fails on debug scaffolding that should never be committed: the mock bridge used
// when driving the page in a plain browser, and any ad-hoc window.__X inspection hooks
// other than the two documented diagnostic surfaces.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'docs', 'prototype', 'newsroom-screen-test.html');
const html = readFileSync(file, 'utf8');

const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 1) {
  console.error(`FAIL  expected exactly one inline <script>, found ${scripts.length}.`);
  console.error('      A second one is usually a mock bridge that was left behind.');
  process.exit(1);
}

const body = scripts[0][1];
const tmp = join(tmpdir(), `le-ui-check-${process.pid}.js`);
writeFileSync(tmp, body, 'utf8');
try {
  execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
} catch (err) {
  console.error('FAIL  the interface script does not parse:\n');
  // Point at the real file, not the temp copy. A plain split/join, because a Windows
  // path is full of regex metacharacters.
  console.error(
    String(err.stderr || err.message)
      .split(tmp)
      .join(file),
  );
  process.exit(1);
} finally {
  try {
    unlinkSync(tmp);
  } catch {
    /* the temp file is disposable */
  }
}

// Debug scaffolding that must not reach a commit. `__leFloor` and `__leProbe` are the two
// documented diagnostic surfaces the headless checks read; anything else is a leftover.
const ALLOWED = new Set(['__leFloor', '__leProbe']);
const leaks = [];
if (/__mock_bridge/.test(html)) leaks.push('__mock_bridge (a browser mock bridge)');
for (const m of body.matchAll(/window\.(__[A-Za-z0-9_]+)/g)) {
  if (!ALLOWED.has(m[1]) && !leaks.some((l) => l.startsWith(m[1]))) {
    leaks.push(`${m[1]} (an undocumented debug hook)`);
  }
}
if (leaks.length) {
  console.error('FAIL  debug scaffolding left in the interface:');
  for (const l of leaks) console.error(`      - ${l}`);
  process.exit(1);
}

// The interface must not reach the network. Every font it names has to ship next to it,
// and nothing may point at an external host. That is the app's privacy statement, and it
// was broken once by three <link> tags to Google Fonts.
const missing = [...html.matchAll(/url\("(fonts\/[^"]+)"\)/g)]
  .map((m) => m[1])
  .filter((rel) => !existsSync(join(dirname(file), rel)));
const external = [...html.matchAll(/(?:src=|href=|url\()["']?(https?:\/\/[^"'\s)]+)/g)].map(
  (m) => m[1],
);
if (missing.length || external.length) {
  console.error('FAIL  the interface would not load offline:');
  for (const m of missing) console.error(`      - ${m} is referenced but not in docs/prototype/`);
  for (const u of external) console.error(`      - loads ${u} from the network`);
  process.exit(1);
}

const quips = [...body.matchAll(/lines:\[(.*?)\] \}/g)].map((m) => m[1].split("','").length);
console.log(
  `OK    interface parses · ${(body.length / 1024).toFixed(0)}kB of script · ` +
    `${quips.length} cast members · ${quips.reduce((a, b) => a + b, 0)} quips · no debug leftovers · no network loads`,
);
