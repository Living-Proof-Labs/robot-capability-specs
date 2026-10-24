// SPDX-License-Identifier: Apache-2.0
// Real semantic-release engine; publishes only to a disposable local bare Git repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Writable } from 'node:stream';
import semanticRelease from 'semantic-release';
const policyPath = new URL('../tooling/policy.mjs', import.meta.url).pathname;

test('engine releases tested heads, batches commits and retries without moving tags', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-engine-'));
  const remote = join(root, 'remote.git');
  const cwd = join(root, 'work');
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const sink = new Writable({ write(chunk, encoding, callback) { callback(); } });
  try {
    execFileSync('git', ['init', '--bare', '--initial-branch=main', remote]);
    execFileSync('git', ['clone', remote, cwd], { stdio: 'pipe' });
    git('config', 'user.name', 'Local Release Test');
    const repositoryUrl = 'https://github.com/Living-Proof-Labs/robot-capability-specs';
    git('config', `url.file://${remote}.insteadOf`, repositoryUrl);
    git('config', 'user.email', 'test@example.invalid');
    git('commit', '--allow-empty', '-m', 'docs: initial catalog');
    git('push', 'origin', 'main');
    const options = {
      branches: ['main'], repositoryUrl, ci: false,
      extends: [], plugins: [policyPath],
    };
    // Ignore any CI variables of the runner: this is a local, isolated engine test.
    const env = { PATH: process.env.PATH, HOME: root, GIT_AUTHOR_NAME: 'Local Release Test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Local Release Test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid' };
    const run = () => semanticRelease(options, { cwd, env, stdout: sink, stderr: sink });
    const initial = await run();
    assert.equal(initial.nextRelease.version, '1.0.0');
    const first = git('rev-parse', 'v1.0.0');
    assert.equal(first, git('rev-parse', 'HEAD'));
    assert.equal(await run(), false);
    assert.equal(git('rev-parse', 'v1.0.0'), first);
    git('commit', '--allow-empty', '-m', 'docs: clarify terms');
    git('commit', '--allow-empty', '-m', 'chore: maintenance');
    git('push', 'origin', 'main');
    const batch = await run();
    assert.equal(batch.nextRelease.version, '1.0.1');
    assert.equal(batch.commits.length, 2);
    const evidence = JSON.parse(await readFile(join(cwd, 'artifacts/release.json'), 'utf8'));
    assert.equal(evidence.version, '1.0.1');
    assert.equal(evidence.gitHead, git('rev-parse', 'HEAD'));
    assert.equal(evidence.commits.length, 2);
    const notes = await readFile(join(cwd, 'artifacts/RELEASE_NOTES.md'), 'utf8');
    for (const commit of evidence.commits) assert.ok(notes.includes(commit.hash));
    assert.equal(git('rev-parse', 'v1.0.1'), git('rev-parse', 'HEAD'));
    git('commit', '--allow-empty', '-m', 'feat: add ability');
    git('push', 'origin', 'main');
    const failurePlugin = join(root, 'failure.cjs');
    await writeFile(failurePlugin, "exports.prepare = () => { throw new Error('simulated preparation failure'); };\n");
    await assert.rejects(semanticRelease({ ...options, plugins: [policyPath, failurePlugin] },
      { cwd, env, stdout: sink, stderr: sink }), /simulated preparation failure/);
    assert.equal(git('tag', '--list', 'v1.1.0'), '');
    assert.equal((await run()).nextRelease.version, '1.1.0');
    git('commit', '--allow-empty', '-m', 'feat!: replace ability');
    git('push', 'origin', 'main');
    assert.equal((await run()).nextRelease.version, '2.0.0');
    assert.equal(git('rev-parse', 'v1.0.0'), first);
  } finally { await rm(root, { recursive: true, force: true }); }
});
