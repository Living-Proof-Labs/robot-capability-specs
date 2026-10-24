// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import semver from 'semver';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { generateNotes } from '@semantic-release/release-notes-generator';
import config from '../release.config.mjs';
import { validTitle } from '../tooling/commit-title.mjs';
const [, analyzerOptions] = config.plugins.find(([name]) => name === '@semantic-release/commit-analyzer');
const [, notesOptions] = config.plugins.find(([name]) => name === '@semantic-release/release-notes-generator');
const repositoryUrl = 'https://github.com/Living-Proof-Labs/robot-capability-specs';
const logger = { log() {}, error() {}, success() {} };
function context(messages) {
  return {
    cwd: process.cwd(), logger, options: { repositoryUrl },
    commits: messages.map((message, i) => ({ message, hash: String(i + 1).repeat(40) })),
    lastRelease: { version: '1.2.3', gitTag: 'v1.2.3', gitHead: 'a'.repeat(40) },
    nextRelease: { version: '1.2.4', gitTag: 'v1.2.4', gitHead: 'b'.repeat(40) },
  };
}
const cases = [
  ['fix: correct criterion', 'patch'], ['feat: add ability', 'minor'],
  ['feat!: remove ability', 'major'], ['fix!: change required evidence', 'major'],
  ['chore!: remove supported tooling interface', 'major'],
  ['docs: examples\n\nBREAKING CHANGE: remove public definition', 'major'],
  ...['docs', 'chore', 'build', 'ci', 'test', 'refactor', 'style', 'perf', 'revert'].map(t => [`${t}: update catalog`, 'patch']),
];
for (const [message, expected] of cases) {
  test(`${message.split('\n')[0]} => ${expected}, with notes and SHA`, async () => {
    const ctx = context([message]);
    assert.equal(await analyzeCommits(analyzerOptions, ctx), expected);
    const notes = await generateNotes(notesOptions, ctx);
    assert.ok(notes.includes(message.split('\n')[0].split(': ')[1]));
    assert.ok(notes.includes(ctx.commits[0].hash.slice(0,7)));
  });
}
test('batch chooses highest severity and summarizes configured change types', async () => {
  const ctx = context(['docs: guide', 'feat: ability', 'fix!: evidence', 'chore: deps']);
  assert.equal(await analyzeCommits(analyzerOptions, ctx), 'major');
  const notes = await generateNotes(notesOptions, ctx);
  for (const commit of ctx.commits) assert.ok(notes.includes(commit.hash.slice(0,7)));
});
test('no commits means no new release', async () => {
  assert.equal(await analyzeCommits(analyzerOptions, context([])), null);
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

test('upstream revert-pair filtering yields no release or redundant notes', async () => {
  const ctx = context(['feat: temporary ability']);
  const original = ctx.commits[0].hash;
  ctx.commits.unshift({ hash: 'c'.repeat(40), message: `revert: feat: temporary ability\n\nThis reverts commit ${original}.` });
  assert.equal(await analyzeCommits(analyzerOptions, ctx), null);
  const notes = await generateNotes(notesOptions, ctx);
  assert.ok(!notes.includes('temporary ability'));
});

test('unclassified messages use upstream no-release behavior', async () => {
  assert.equal(await analyzeCommits(analyzerOptions, context(['Merge pull request #1', 'custom: legacy change'])), null);
});
