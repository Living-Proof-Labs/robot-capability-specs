// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const read = path => YAML.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const verify = read('../.github/workflows/verify.yml');
const pages = read('../.github/workflows/pages.yml');
const release = read('../.github/workflows/release.yml');
const sha = 'a'.repeat(40);
const successful = result => {
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

test('PR and release callers share the verified manual while previews and examples are preserved', () => {
  const jobs = verify.jobs;
  assert.match(jobs.version.if, /pull_request.*main/);
  assert.deepEqual(jobs.version.permissions, { contents: 'read' });
  assert.ok(jobs.verify.steps.some(s => s.run === 'task validate:manifests'));
  assert.ok(jobs.verify.steps.some(s => s.run === 'task preview'));
  assert.ok(jobs.verify.steps.some(s => s.with?.path === 'artifacts/preview.json'));
  assert.ok(jobs.verify.steps.some(s => s.run === 'task verify'));
  assert.match(jobs['artifact-readback'].if, /needs.verify.result == 'success'/);
  assert.deepEqual(jobs['artifact-readback'].permissions, { contents: 'read' });
  assert.match(release.jobs.release.if, /sealed_attempt == github.run_attempt/);
  assert.match(release.jobs.release.if, /sealed_run_id == github.run_id/);
  assert.deepEqual(release.jobs.release.needs, ['candidate', 'package-parity', 'manual']);
  assert.deepEqual(Object.keys(pages.on), ['workflow_call']);
  assert.equal(pages.jobs.deploy.steps.at(-1).with.artifact_name, 'github-pages-${{ inputs.run_attempt }}');
});

test('a real Pages tar rejects wrong version, source, run, attempt, dirty data, and changed bytes', t => {
  const dir = mkdtempSync(join(tmpdir(), 'catalog-manual-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const checker = new URL('../tooling/check-manual-artifact.py', import.meta.url).pathname;
  const version = '3.1.12';
  const proper = { version, revision: sha, dirty: false, run_id: '431', run_attempt: '2' };
  const archive = join(dir, 'artifact.tar');
  const data = extra => {
    writeFileSync(join(dir, 'build.json'), JSON.stringify({ ...proper, ...extra }));
    successful(spawnSync('tar', ['-cf', archive, '-C', dir, 'build.json'], { encoding: 'utf8' }));
  };
  const call = (mode, args) => spawnSync('python3', [checker, mode, archive, ...args], { encoding: 'utf8' });
  const identity = [version, sha, '431', '2'];
  data({});
  const digest = successful(call('seal', identity));
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(successful(call('check', [...identity, digest])), digest);
  for (const [key, value] of [['version','3.1.13'], ['revision', 'b'.repeat(40)], ['run_id','432'], ['run_attempt','1'], ['dirty',true]]) {
    data({ [key]: value });
    assert.notEqual(call('seal', identity).status, 0, key);
  }
  data({ version: '3.1.12-pr.88.12.2' });
  assert.notEqual(call('check', [...identity, digest]).status, 0);
  successful(call('seal', ['3.1.12-pr.88.12.2', sha, '431', '2']));
  data({});
  successful(spawnSync('tar', ['-rf', archive, '-C', dir, 'build.json'], { encoding: 'utf8' }));
  assert.match(call('seal', identity).stderr, /one regular build.json/);
  assert.notEqual(call('check', [...identity, '']).status, 0);
  assert.notEqual(call('check', [...identity.slice(0, 3), '1', digest]).status, 0);
});

test('deployment guard peels an annotated tag and rejects wrong tags, drafts, and stale attempts', t => {
  const dir = mkdtempSync(join(tmpdir(), 'catalog-published-tag-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => successful(spawnSync('git', args, { cwd: dir, encoding: 'utf8' }));
  git('init', '-q');
  git('config', 'user.name', 'Local fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('commit', '--allow-empty', '-qm', 'test: initial');
  const commit = git('rev-parse', 'HEAD');
  git('tag', '-am', 'Fixture annotated tag', 'v3.1.12');
  git('tag', 'v3.1.11');
  git('commit', '--allow-empty', '-qm', 'test: second');
  git('tag', 'v3.1.13', 'HEAD');
  git('checkout', '--detach', commit);
  writeFileSync(join(dir, 'gh'), '#!/bin/sh\nprintf "%s" "$MOCK_RELEASE"\n', { mode: 0o755 });
  const script = pages.jobs.deploy.steps.find(x => x.name?.startsWith('Verify the published release')).run;
  const live = { tag_name: 'v3.1.12', draft: false, prerelease: false, published_at: '2026-11-22T00:00:00Z' };
  const run = (env = {}, record = live) => spawnSync('bash', ['-e', '-c', script], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, PATH: dir + ':' + process.env.PATH, RELEASE_TAG: 'v3.1.12', VERSION: '3.1.12',
      COMMIT: commit, GITHUB_SHA: commit, RUN_ID: '431', GITHUB_RUN_ID: '431', ATTEMPT: '2',
      GITHUB_RUN_ATTEMPT: '2', ARTIFACT_ID: '11', GITHUB_REPOSITORY: 'Living-Proof-Labs/robot-capability-specs',
      MOCK_RELEASE: JSON.stringify(record), ...env },
  });
  successful(run());
  for (const failure of [
    run({ RELEASE_TAG: 'v3.1.13', VERSION: '3.1.13' }),
    run({ RELEASE_TAG: 'v3.1.12-rc.1' }),
    run({ ATTEMPT: '1' }), run({ RUN_ID: '400' }),
    run({}, { ...live, draft: true }), run({}, { ...live, prerelease: true }),
    run({}, { ...live, published_at: null }), run({}, { ...live, tag_name: 'v3.1.11' }),
  ]) assert.notEqual(failure.status, 0);
});
