// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

const DIR = 'specs/robots/';
const EXAMPLES = DIR + 'examples/manifests/';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const validator = async () =>
  new Ajv2020({ allErrors: true, strict: true, strictRequired: false }).compile(await json(DIR + 'robot-manifest.schema.json'));

test('robot manifest schema is versioned and compiles', async () => {
  const schema = await json(DIR + 'robot-manifest.schema.json');
  assert.equal(schema.title, 'livingproof-robot-manifest/0.1');
  assert.equal(schema.properties.format.const, schema.title);
  assert.equal(typeof (await validator()), 'function');
});

test('G1, Go1 and T1 example manifests validate', async () => {
  const validate = await validator();
  const names = (await readdir(EXAMPLES)).sort();
  assert.deepEqual(names, ['booster-t1.json', 'unitree-g1.json', 'unitree-go1.json']);
  for (const name of names) {
    const manifest = await json(EXAMPLES + name);
    assert.ok(validate(manifest), `${name}: ${JSON.stringify(validate.errors)}`);
    assert.equal(manifest.robot + '.json', name);
    assert.match(manifest.$comment, /^Example built from /, name);
    assert.ok(manifest.configurations.filter(c => c.default).length <= 1, name);
    for (const simulator of Object.keys(manifest.simulators ?? {})) assert.match(simulator, /^[a-z]/);
  }
});

test('manifest rejects a bad digest, an unknown field and a malformed adapter', async () => {
  const validate = await validator();
  const good = await json(EXAMPLES + 'unitree-g1.json');
  const bad = [
    m => { m.assets[0].sha256 = 'abc'; },
    m => { m.extra = true; },
    m => { m.adapter.entry_point = 'lpl_g1.adapter'; },
    m => { m.features.media = 'yes'; },
    m => { m.simulators.mujoco.status = 'works'; },
    m => { delete m.configurations[0].sha256; },
    m => { m.assets[0].path = '../escape'; },
  ];
  for (const mutate of bad) {
    const m = structuredClone(good);
    mutate(m);
    assert.equal(validate(m), false, mutate.toString());
  }
  const minimal = structuredClone(good);
  delete minimal.simulators;
  assert.ok(validate(minimal), 'simulators is optional');
});

test('scenarios is an optional list of unique scenario ids the adapter supports', async () => {
  const validate = await validator();
  const good = await json(EXAMPLES + 'unitree-g1.json');
  const schema = await json(DIR + 'robot-manifest.schema.json');
  assert.equal(schema.required.includes('scenarios'), false);
  for (const name of await readdir(EXAMPLES)) {
    assert.equal('scenarios' in (await json(EXAMPLES + name)), false, `${name} predates the list and still validates`);
  }
  const declared = structuredClone(good);
  declared.scenarios = ['walk-hallway', 'walk-corner'];
  assert.ok(validate(declared), JSON.stringify(validate.errors));
  const empty = structuredClone(good);
  empty.scenarios = [];
  assert.ok(validate(empty), 'an empty list declares no scenario');
  for (const scenarios of [['walk-corner', 'walk-corner'], ['Walk-Corner'], ['walk_corner'], ['walk-corner-'], 'walk-corner', [{ id: 'walk-corner' }]]) {
    const m = structuredClone(good);
    m.scenarios = scenarios;
    assert.equal(validate(m), false, JSON.stringify(scenarios));
  }
  // Every id a manifest can declare has the scenario parameters id form, and the catalog's scenarios fit it.
  const pattern = new RegExp(schema.properties.scenarios.items.pattern);
  const parameters = await json('specs/scenarios/scenario-parameters.schema.json');
  assert.equal(schema.properties.scenarios.items.pattern, parameters.$defs.id.pattern);
  for (const id of ['walk-hallway', 'walk-corner']) assert.match(id, pattern);
});

test('the README states that an undeclared scenario is UNSUPPORTED, never a FAIL', async () => {
  const readme = await readFile(DIR + 'README.md', 'utf8');
  const section = readme.slice(readme.indexOf('## Scenario support'));
  assert.ok(section.startsWith('## Scenario support'));
  for (const phrase of ['`scenarios`', '`scenario_supported`', '`UNSUPPORTED`', 'never a `FAIL`', 'No trial runs']) {
    assert.ok(section.includes(phrase), phrase);
  }
});
