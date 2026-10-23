// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import semver from 'semver';
import { analyzeCommits, generateNotes, manifest, validTitle } from '../tooling/policy.mjs';
const repositoryUrl = 'https://github.com/Living-Proof-Labs/robot-capability-specs';
const logger = { log() {}, error() {}, success() {} };
function context(messages) {
  return {
    cwd: process.cwd(), logger, options: { repositoryUrl },
    commits: messages.map((message, i) => ({ message, hash: String(i + 1).padStart(40, '0') })),
    lastRelease: { version: '1.2.3', gitTag: 'v1.2.3', gitHead: 'a'.repeat(40) },
    nextRelease: { version: '1.2.4', gitTag: 'v1.2.4', gitHead: 'b'.repeat(40) },
  };
}
const cases = [
  ['fix: correct criterion', 'patch'], ['feat: add ability', 'minor'],
  ['feat!: remove ability', 'major'], ['fix!: change required evidence', 'major'],
  ['docs: examples\n\nBREAKING CHANGE: remove public definition', 'major'],
  ...['docs', 'chore', 'build', 'ci', 'test', 'refactor', 'style', 'perf', 'revert'].map(t => [`${t}: update catalog`, 'patch']),
  ['Merge pull request #1', 'patch'], ['custom: legacy change', 'patch'],
];
for (const [message, expected] of cases) {
  test(`${message.split('\n')[0]} => ${expected}, with notes and SHA`, async () => {
    const ctx = context([message]);
    assert.equal(await analyzeCommits({}, ctx), expected);
    const notes = await generateNotes({}, ctx);
    assert.ok(notes.includes(message.split('\n')[0]));
    assert.ok(notes.includes(ctx.commits[0].hash));
    assert.ok(notes.includes(ctx.nextRelease.gitHead));
    assert.equal(manifest(ctx).commits[0].hash, ctx.commits[0].hash);
  });
}
test('batch chooses highest severity and retains every commit', async () => {
  const ctx = context(['docs: guide', 'feat: ability', 'fix!: evidence', 'chore: deps']);
  assert.equal(await analyzeCommits({}, ctx), 'major');
  const notes = await generateNotes({}, ctx);
  for (const commit of ctx.commits) assert.ok(notes.includes(commit.hash));
  assert.equal(manifest(ctx).commits.length, 4);
});
test('no commits means no new release', async () => {
  assert.equal(await analyzeCommits({}, context([])), null);
});
test('SemVer and pre-1 policy: no reduced breaking severity', () => {
  assert.equal(semver.inc('1.2.3', 'patch'), '1.2.4');
  assert.equal(semver.inc('1.2.3', 'minor'), '1.3.0');
  assert.equal(semver.inc('1.2.3', 'major'), '2.0.0');
  assert.equal(semver.inc('0.2.3', 'major'), '1.0.0');
  assert.ok(semver.valid(`0.0.0-preview.${'a'.repeat(40)}`));
});
test('PR title policy accepts supported types and rejects multiline/incomplete titles', () => {
  for (const s of ['docs: guide', 'feat(spec)!: changed criterion', 'chore: deps']) assert.ok(validTitle(s));
  for (const s of ['updates', 'feat:', 'unknown: change', 'fix: x\nmalformed']) assert.ok(!validTitle(s));
});

test('reverted pairs still produce a patch and both ledger entries', async () => {
  const ctx = context(['feat: temporary ability']);
  const original = ctx.commits[0].hash;
  ctx.commits.unshift({ hash: 'c'.repeat(40), message: `revert: feat: temporary ability\n\nThis reverts commit ${original}.` });
  assert.equal(await analyzeCommits({}, ctx), 'patch');
  const notes = await generateNotes({}, ctx);
  for (const commit of ctx.commits) assert.ok(notes.includes(commit.hash));
});
