// Stamp the build with what it is, so the About screen can say so.
//
// A version number on its own tells a bug report nothing: half the useful questions are
// "which build, from which commit, made on what day". This writes those three facts into
// dist/ at build time, where the packaged app can read them offline.
//
// Everything degrades rather than fails. A tarball with no git history still builds; the
// commit simply reads "unknown", which is honest and not worth stopping a release over.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const info = {
  version: pkg.version,
  // Date only. A timestamp to the second invites somebody to read something into it.
  builtOn: new Date().toISOString().slice(0, 10),
  commit: git(['rev-parse', '--short', 'HEAD']) || 'unknown',
  // A dirty tree means the build does not match any commit, and a bug report should say so.
  clean: git(['status', '--porcelain']) === '',
};

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`, 'utf8');
console.log(
  `OK    build ${info.version} · ${info.commit}${info.clean ? '' : '+changes'} · ${info.builtOn}`,
);
