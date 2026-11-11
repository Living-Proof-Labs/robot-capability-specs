// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

const SCHEMA = 'specs/scenarios/scenario-description.schema.json';
const HALLWAY = 'specs/scenarios/walk-hallway/';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const validator = async () =>
  new Ajv2020({ allErrors: true, strict: true, strictRequired: false }).compile(await json(SCHEMA));

test('scenario description schema is versioned and compiles', async () => {
  const schema = await json(SCHEMA);
  assert.equal(schema.title, 'livingproof-scenario-description/0.1');
  assert.equal(schema.properties.format.const, schema.title);
  assert.equal(typeof (await validator()), 'function');
  const trials = schema.properties.parameters.properties.trials;
  assert.equal(trials.properties.count.default, 1);
  assert.ok(trials.required.includes('count'));
});

test('walk-hallway description validates and agrees with the README acceptance', async () => {
  const validate = await validator();
  const d = await json(HALLWAY + 'description.json');
  assert.ok(validate(d), JSON.stringify(validate.errors));
  const readme = await readFile(HALLWAY + 'README.md', 'utf8');
  assert.match(readme, new RegExp(`scenario ${d.scenario.revision.replaceAll('.', '\\.')}`));
  const p = d.parameters;
  assert.equal(p.time_limit.value, 2 * p.route_length.value / p.command_speed.value + 5);
  assert.match(readme, /Route length 5\.5 m/);
  assert.match(readme, /\| `command_speed` \| 0\.5 m\/s/);
  assert.match(readme, /0\.05 m humanoid, 0\.10 m quadruped/);
  assert.equal(p.wall_clearance.humanoid.value, 0.05);
  assert.equal(p.wall_clearance.quadruped.value, 0.1);
  assert.match(readme, /\| `trials` \| 1 \|/);
  assert.equal(p.trials.count, 1);
  assert.equal(Object.hasOwn(p.trials, 'seeds'), false);
  assert.equal(Object.hasOwn(p, 'required_passes'), false);
  assert.equal(p.trials.retries, false);
  for (const c of d.mission.success_criteria) assert.match(readme, new RegExp('`' + c.evaluator + '`'), c.evaluator);
  assert.equal(d.mission.success_criteria.length, 4);
  for (const name of ['clear width ÷ 2 − robot width ÷ 2', 'robot width + 2 × `wall_clearance` ≤ clear width']) {
    assert.ok(readme.includes(name), name);
  }
});

test('walk-hallway description world matches the hallway world document', async () => {
  const d = await json(HALLWAY + 'description.json');
  const doc = await readFile('specs/worlds/hallways.md', 'utf8');
  assert.equal(d.world.id, 'hallway-open');
  for (const [name, v] of Object.entries(d.world.dimensions)) {
    assert.ok(doc.includes(v.value.toFixed(2) + ' m'), `${name} ${v.value.toFixed(2)} m in hallways.md`);
  }
});

test('lateral limit rule gives the verifier limits for the G1, Go1 and T1 widths, unrounded', async () => {
  const d = await json(HALLWAY + 'description.json');
  const clear = d.world.dimensions.clear_width.value;
  assert.equal(d.limits.lateral_limit.formula, 'clear_width ÷ 2 − robot_width ÷ 2');
  // Widths from each robot repository's robot.json dimensions.width.value (specs #30).
  const mm = v => Math.round(v * 10000) / 10000;
  for (const [width, limit] of [[0.52, 0.49], [0.282, 0.609], [0.541, 0.4795]]) {
    assert.equal(mm(clear / 2 - width / 2), limit, `width ${width}`);
  }
  for (const rule of Object.values(d.limits)) {
    for (const k of (rule.sentence ?? '').match(/\{(\w+)\}/g) ?? []) {
      const name = k.slice(1, -1);
      assert.ok(['robot', 'value'].includes(name) || name in rule.inputs, `${k} is an input`);
    }
  }
});

test('description rejects an unknown field, a bad unit and a stated resolved limit', async () => {
  const validate = await validator();
  const good = await json(HALLWAY + 'description.json');
  const bad = [
    d => { d.extra = true; },
    d => { d.world.dimensions.clear_width.unit = 'cm'; },
    d => { d.limits.lateral_limit.value = 0.49; },
    d => { delete d.limits.fits_width; },
    d => { d.mission.success_criteria = []; },
    d => { delete d.parameters.time_limit.formula; },
    d => { d.format = 'livingproof-scenario-description/0.2'; },
  ];
  for (const mutate of bad) {
    const d = structuredClone(good);
    mutate(d);
    assert.equal(validate(d), false, mutate.toString());
  }
});
