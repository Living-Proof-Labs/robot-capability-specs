// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { validTitle } from './policy.mjs';
const title = process.env.PR_TITLE;
if (title !== undefined && !validTitle(title)) {
  throw new Error('PR title must be a supported Conventional Commit (see CONTRIBUTING.md)');
}
const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/preview.json', JSON.stringify({
  formatVersion: 1, version: `0.0.0-preview.${gitHead}`, gitHead,
  stable: false, description: 'Source preview identity; not a prediction of the next catalog release.',
}, null, 2) + '\n');
