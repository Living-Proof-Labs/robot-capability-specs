// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
const workflow = YAML.parse(await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8'));

test('shared release source is an explicit version tag, never a moving branch or alias', () => {
  assert.equal(workflow.jobs.release.uses,
    'Living-Proof-Labs/collaboration-guidelines/.github/workflows/semantic-release.yml@v2.0.0');
  assert.match(workflow.jobs.release.uses, /@v\d+\.\d+\.\d+$/);
  assert.equal(workflow.jobs.release.steps, undefined);
  assert.equal(workflow.jobs.release.secrets, undefined);
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
