// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';

const workflow = YAML.parse(await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8'));

const sharedReleaseCaller = {
  owner: 'Living-Proof-Labs',
  repo: 'collaboration-guidelines',
  path: '.github/workflows/semantic-release.yml',
};
const fullSemverTag = /^v\d+\.\d+\.\d+$/;

function classifyReleaseCaller(uses) {
  if (typeof uses !== 'string') return { accepted: false, reason: 'unparsed' };
  const match = /^([^/\s]+)\/([^/\s]+)\/(.+)@([^@\s]+)$/.exec(uses);
  if (!match) return { accepted: false, reason: 'unparsed' };
  const call = { owner: match[1], repo: match[2], path: match[3], ref: match[4] };
  if (call.owner !== sharedReleaseCaller.owner) return { accepted: false, reason: 'owner', ...call };
  if (call.repo !== sharedReleaseCaller.repo) return { accepted: false, reason: 'repo', ...call };
  if (call.path !== sharedReleaseCaller.path) return { accepted: false, reason: 'workflow-path', ...call };
  if (!fullSemverTag.test(call.ref)) return { accepted: false, reason: 'ref', ...call };
  return { accepted: true, reason: 'full-semver-tag', ...call };
}

function releaseCallerUses(ref, identity = sharedReleaseCaller) {
  return `${identity.owner}/${identity.repo}/${identity.path}@${ref}`;
}

test('shared release source is an explicit version tag, never a moving branch or alias', (t) => {
  const call = classifyReleaseCaller(workflow.jobs.release.uses);
  assert.equal(call.owner, sharedReleaseCaller.owner);
  assert.equal(call.repo, sharedReleaseCaller.repo);
  assert.equal(call.path, sharedReleaseCaller.path);
  assert.match(call.ref, fullSemverTag);
  assert.equal(call.accepted, true);
  assert.equal(call.reason, 'full-semver-tag');
  assert.equal(workflow.jobs.release.uses, releaseCallerUses(call.ref));
  assert.match(workflow.jobs.release.uses, /@v\d+\.\d+\.\d+$/);
  assert.equal(workflow.jobs.release.steps, undefined);
  assert.equal(workflow.jobs.release.secrets, undefined);
  t.diagnostic(`current workflow accepted with explicit full semver tag @${call.ref}`);
});
test('publication waits for local verification and retains main/off-switch restrictions', () => {
  assert.equal(workflow.jobs.release.needs, 'verify');
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.equal(workflow.on.pull_request, undefined);
  assert.equal(workflow.on.pull_request_target, undefined);
  assert.match(workflow.jobs.release.if, /github.ref == 'refs\/heads\/main'/);
  assert.match(workflow.jobs.release.if, /vars.RELEASES_ENABLED == '' \|\| vars.RELEASES_ENABLED == 'true'/);
  assert.ok(workflow.jobs.verify.steps.some(step => step.run === 'task verify'));
});
test('consumer verification remains read-only and only release requests contents write', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.jobs.verify.permissions, undefined);
  assert.deepEqual(workflow.jobs.release.permissions, { contents: 'write' });
  assert.equal(workflow.jobs.verify.steps[0].with['persist-credentials'], false);
});

const releaseCallerCases = [
  ['accepts full semver tag v2.3.4', releaseCallerUses('v2.3.4'), true, 'full-semver-tag', 'v2.3.4'],
  ['accepts full semver tag v7.10.1', releaseCallerUses('v7.10.1'), true, 'full-semver-tag', 'v7.10.1'],
  ['rejects the wrong owner', releaseCallerUses('v2.3.4', {
    ...sharedReleaseCaller, owner: 'Other-Org',
  }), false, 'owner', 'v2.3.4'],
  ['rejects the wrong repo', releaseCallerUses('v2.3.4', {
    ...sharedReleaseCaller, repo: 'other-repo',
  }), false, 'repo', 'v2.3.4'],
  ['rejects the wrong workflow path', releaseCallerUses('v2.3.4', {
    ...sharedReleaseCaller, path: '.github/workflows/other.yml',
  }), false, 'workflow-path', 'v2.3.4'],
  ['rejects a branch ref @main', releaseCallerUses('main'), false, 'ref', 'main'],
  ['rejects moving or partial alias @v7', releaseCallerUses('v7'), false, 'ref', 'v7'],
  ['rejects moving or partial alias @v7.10', releaseCallerUses('v7.10'), false, 'ref', 'v7.10'],
  ['rejects moving or partial alias @latest', releaseCallerUses('latest'), false, 'ref', 'latest'],
];

for (const [name, uses, accepted, reason, ref] of releaseCallerCases) {
  test(name, (t) => {
    const call = classifyReleaseCaller(uses);
    assert.equal(call.ref, ref);
    assert.equal(call.reason, reason);
    assert.equal(call.accepted, accepted);
    if (!accepted) {
      assert.throws(() => assert.equal(call.accepted, true), { name: 'AssertionError' });
      t.diagnostic(`rejected as intended (${reason}): ${uses}`);
      return;
    }
    assert.equal(call.owner, sharedReleaseCaller.owner);
    assert.equal(call.repo, sharedReleaseCaller.repo);
    assert.equal(call.path, sharedReleaseCaller.path);
    t.diagnostic(`accepted explicit full semver tag @${call.ref}`);
  });
}
