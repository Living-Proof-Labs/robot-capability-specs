// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validTitle } from '../tooling/commit-title.mjs';
const preview = fileURLToPath(new URL('../tooling/preview.mjs', import.meta.url));

test('PR titles accept supported changes and preserve breaking markers', () => {
  for (const title of ['feat: ability', 'fix: criterion', 'docs: guide', 'chore: tools', 'feat(spec)!: new evidence']) {
    assert.ok(validTitle(title));
  }
  for (const title of ['updates', 'feat:', 'unknown: change', 'fix: x\nextra line']) {
    assert.ok(!validTitle(title));
  }
});

test('consumer preview records exact source SHA, independently of release machinery', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'catalog-preview-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
  try {
    git('init', '-b', 'preview-test');
    git('-c', 'user.name=Local Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'docs: fixture');
    const head = git('rev-parse', 'HEAD');
    execFileSync(process.execPath, [preview], { cwd, env: { ...process.env, PR_TITLE: 'docs: preview' } });
    const data = JSON.parse(await readFile(join(cwd, 'artifacts/preview.json'), 'utf8'));
    assert.equal(data.gitHead, head);
    assert.equal(data.version, `0.0.0-preview.${head}`);
    assert.equal(data.stable, false);
    assert.equal(git('tag', '--list'), '');
    assert.equal(git('rev-parse', 'HEAD'), head);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('invalid PR title fails before producing a preview', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'catalog-invalid-title-'));
  try {
    assert.throws(() => execFileSync(process.execPath, [preview], {
      cwd, env: { ...process.env, PR_TITLE: 'unclassified change' }, stdio: 'pipe',
    }), /PR title must be a supported Conventional Commit/);
    await assert.rejects(readFile(join(cwd, 'artifacts/preview.json')), { code: 'ENOENT' });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
