// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import { generateMessages } from '@cucumber/gherkin';
import { IdGenerator, SourceMediaType } from '@cucumber/messages';

const DIR = 'specs/robots/';
const EXAMPLE = DIR + 'examples/unitree-g1/';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const sha256 = async path => createHash('sha256').update(await readFile(path)).digest('hex');

async function validators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  for (const name of ['robot-profile', 'configuration-profile', 'run-manifest']) {
    ajv.addSchema(await json(`${DIR}${name}.schema.json`), `${name}.schema.json`);
  }
  const get = name => ajv.getSchema(`${name}.schema.json`);
  return { robot: get('robot-profile'), configuration: get('configuration-profile'), manifest: get('run-manifest') };
}
const pickles = async path => {
  const messages = generateMessages(await readFile(path, 'utf8'), path, SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN, {
    newId: IdGenerator.incrementing(), includeGherkinDocument: true, includePickles: true,
  });
  assert.deepEqual(messages.filter(m => m.parseError), []);
  return messages.filter(m => m.pickle).map(m => m.pickle.steps.map(s => s.text).join('\n'));
};

test('schemas compile and name their formats', async () => {
  const v = await validators();
  for (const [name, validate] of Object.entries(v)) assert.equal(typeof validate, 'function', name);
  const manifest = await json(DIR + 'run-manifest.schema.json');
  assert.equal(manifest.properties.trials.properties.count.default, 1);
  assert.deepEqual(manifest.properties.trials.required, ['count']);
});

test('illustrative G1 examples validate and are labelled illustrative', async () => {
  const v = await validators();
  const files = { robot: ['robot.json'], configuration: ['configurations/stock.json', 'configurations/playground.json'],
    manifest: ['run-manifest-stock.json', 'run-manifest-playground.json'] };
  for (const [kind, paths] of Object.entries(files)) {
    for (const path of paths) {
      const record = await json(EXAMPLE + path);
      assert.ok(v[kind](record), `${path}: ${JSON.stringify(v[kind].errors)}`);
      assert.match(record.$comment, /^Illustrative example/, path);
    }
  }
});

test('robot profile offers stock and playground, each file matching its name', async () => {
  const robot = await json(EXAMPLE + 'robot.json');
  assert.deepEqual(robot.configurations.map(c => c.name), ['stock', 'playground']);
  for (const { name, path } of robot.configurations) {
    const profile = await json(EXAMPLE + path);
    assert.equal(profile.name, name);
    assert.equal(profile.robot, robot.id);
  }
  assert.ok(robot.configurations.some(c => c.name === robot.default_configuration));
});

test('run manifests cite profiles by name, version and file sha256 only', async () => {
  const robotHash = await sha256(EXAMPLE + 'robot.json');
  for (const name of ['stock', 'playground']) {
    const manifest = await json(`${EXAMPLE}run-manifest-${name}.json`);
    const profile = await json(`${EXAMPLE}configurations/${name}.json`);
    assert.deepEqual(manifest.configuration, { name, version: profile.version,
      sha256: await sha256(`${EXAMPLE}configurations/${name}.json`) });
    assert.equal(manifest.robot.profile_sha256, robotHash);
    assert.equal(manifest.trials.count, 1);
    assert.equal(Object.hasOwn(manifest.trials, 'seeds'), false);
    assert.equal(Object.hasOwn(manifest.trials, 'required_passes'), false);
  }
});

test('the two G1 manifests differ only in configuration and run_id', async () => {
  const a = await json(EXAMPLE + 'run-manifest-stock.json');
  const b = await json(EXAMPLE + 'run-manifest-playground.json');
  const differing = Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  assert.deepEqual(differing.sort(), ['configuration', 'run_id']);
});

test('schemas reject copied profile contents, malformed names and bad hashes', async () => {
  const v = await validators();
  const manifest = await json(EXAMPLE + 'run-manifest-stock.json');
  assert.equal(v.manifest({ ...manifest, configuration: { ...manifest.configuration, controller: {} } }), false);
  assert.equal(v.manifest({ ...manifest, configuration: { ...manifest.configuration, sha256: 'abc' } }), false);
  const profile = await json(EXAMPLE + 'configurations/stock.json');
  assert.equal(v.configuration({ ...profile, name: 'Stock Profile' }), false);
  assert.equal(v.configuration({ ...profile, locomotion: { fall_base_height: { value: 1, unit: 'm', source: 'chosen' } } }), false);
  const trialsWithoutCount = { ...manifest.trials };
  delete trialsWithoutCount.count;
  assert.equal(v.manifest({ ...manifest, trials: trialsWithoutCount }), false);
});

test('walk-hallway examples parse with no numeric literals', async () => {
  for (const file of ['walk-hallway.feature', 'compare-configurations.feature']) {
    const path = 'specs/scenarios/walk-hallway/' + file;
    const source = await readFile(path, 'utf8');
    assert.match(source, /SPDX-License-Identifier: CC-BY-4.0/);
    assert.doesNotMatch(source.replace(/^#.*$/m, ''), /\b\d+(\.\d+)?\s*(m|s|m\/s)\b/);
    assert.ok((await pickles(path)).length >= 3, file);
  }
  const compare = await pickles('specs/scenarios/walk-hallway/compare-configurations.feature');
  assert.ok(compare.some(e => e.includes('"configuration_offered"')));
  assert.ok(compare.some(e => e.includes('even if one has grade FAIL or INSUFFICIENT_EVIDENCE')));
  assert.ok(compare.every(e => !e.includes('grade FAIL or ERROR')));
  assert.ok(compare.some(e => e.includes('reported on the job and on the trial and is never a grade')));
});

test('walk-hallway names one evaluator per acceptance check', async () => {
  const source = await readFile('specs/scenarios/walk-hallway/walk-hallway.feature', 'utf8');
  const ids = ['hallway-exit-reached', 'hallway-lateral-limit', 'hallway-wall-contact', 'hallway-fall'];
  const steps = await pickles('specs/scenarios/walk-hallway/walk-hallway.feature');
  for (const id of ids) assert.ok(steps.some(e => e.includes('"' + id + '"')), id);
  assert.match(source, /policy "all-required-v1"/);
  const doc = await readFile('specs/scenarios/walk-hallway/README.md', 'utf8');
  for (const id of ids) assert.match(doc, new RegExp('`' + id + '`'));
});

test('scenario example numbers are labelled illustrative and grades are listed', async () => {
  const doc = await readFile('specs/scenarios/walk-hallway/README.md', 'utf8');
  assert.match(doc, /illustrative numbers only, not measured/);
  for (const row of doc.split('\n').filter(l => /^\| `(stock|playground)` \| \d/.test(l))) {
    assert.match(row, /illustrative/);
  }
  const glossary = await readFile('docs/glossary.md', 'utf8');
  for (const grade of ['PASS', 'FAIL', 'INSUFFICIENT_EVIDENCE', 'UNSUPPORTED']) {
    assert.match(glossary, new RegExp('\\*\\*`' + grade + '`\\*\\*'));
  }
  assert.match(glossary, /\*\*`ERROR`\*\*/);
  assert.match(glossary, /`ERROR` is not a grade/);
  assert.match(glossary, /never a robot grade/);
  assert.match(glossary, /If no trial completes because of test-system errors, the run is not evaluated and the grade is `INSUFFICIENT_EVIDENCE`/);
  assert.doesNotMatch(glossary, /five values/);
  const robots = await readFile(DIR + 'README.md', 'utf8');
  assert.doesNotMatch(doc + robots, /verdict/i);
  assert.doesNotMatch(robots, /\| `ERROR` \|/);
  assert.match(robots, /never a robot grade/);
  assert.match(glossary, /replacing the earlier word \*verdict\*/);
  const feature = await readFile('specs/scenarios/walk-hallway/walk-hallway.feature', 'utf8');
  assert.match(feature, /\| 1\s+\| 0\s+\| 0\s+\| 1\s+\| INSUFFICIENT_EVIDENCE \|/);
  assert.match(feature, /reported on the job and on the trial and is never a robot grade/);
  assert.match(feature, /if no trial completes the run is not evaluated and the grade is INSUFFICIENT_EVIDENCE/);
});
