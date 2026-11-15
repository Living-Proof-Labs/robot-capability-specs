// SPDX-License-Identifier: Apache-2.0
// walk-corner time limit (#51): 2 × route_length ÷ command_speed + 5 s, derived from the world and the
// reference speed only, identical for every robot, and stated the same way in every file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readInputs, resolve, ScenarioParameterError } from '../tooling/scenario-parameters.mjs';

const json = async p => JSON.parse(await readFile(p, 'utf8'));
const CORNER = 'specs/scenarios/walk-corner/';
const WORLD = 'test/fixtures/worlds/hallway-corner-0.1.0.world.json';
const inputsOf = c => structuredClone(c.inputs);
const refs = (e, out = new Set()) => {
  if (e && typeof e === 'object') {
    if ('input' in e) out.add('input:' + e.input);
    if ('parameter' in e) out.add('parameter:' + e.parameter);
    for (const a of e.args ?? []) refs(a, out);
  }
  return out;
};

test('the time limit is derived from the world route and command_speed: 27 s', async () => {
  const p = await json(CORNER + 'parameters.json');
  const world = await json(WORLD);
  const robot = await json('specs/robots/examples/unitree-g1/robot.json');
  const configuration = await json('specs/robots/examples/unitree-g1/configurations/playground.json');
  const r = resolve(p, readInputs(p, { world, robot, configuration }));
  const speed = p.parameters.command_speed;
  assert.deepEqual(speed, { value: 0.5, unit: 'm/s' });
  assert.equal(p.limits.time_limit.unit, 's');
  assert.equal(r.inputs.route_length, 5.5);
  assert.equal(r.limits.time_limit, 2 * 5.5 / speed.value + 5);
  assert.equal(r.limits.time_limit, 27);
  assert.deepEqual([...refs(p.limits.time_limit.expression)].sort(), ['input:route_length', 'parameter:command_speed']);
  assert.equal(p.inputs.route_length.source, 'world');
  assert.equal(p.inputs.route_length.unit, 'm');
});

test('the time limit is the same for every robot, class and configuration', async () => {
  const p = await json(CORNER + 'parameters.json');
  const cases = (await json(CORNER + 'parameter-cases.json')).cases.filter(c => !c.expect.error);
  const limits = new Set();
  for (const c of cases) {
    for (const width of [0.2, 0.52, 1.4]) for (const robot_class of ['humanoid', 'quadruped']) for (const fall of [0.1, 0.5]) {
      const i = inputsOf(c);
      Object.assign(i, { robot_width: { value: width, unit: 'm' }, robot_class, fall_base_height: { value: fall, unit: 'm' } });
      limits.add(resolve(p, i).limits.time_limit);
    }
  }
  assert.deepEqual([...limits], [27]);
  // The pace it asks for: 5.5 m in 27 s is about 0.204 m/s on average, well under the 0.5 m/s reference.
  assert.ok(5.5 / 27 < 0.5 / 2);
});

test('the time limit scales with the route and the reference speed, and a speed of 0 is an ERROR', async () => {
  const p = await json(CORNER + 'parameters.json');
  const base = (await json(CORNER + 'parameter-cases.json')).cases[0];
  for (const [route, speed, expected] of [[5.5, 0.5, 27], [6.0, 0.5, 29], [5.5, 1.0, 16], [3.0, 0.25, 29]]) {
    const q = structuredClone(p);
    q.parameters.command_speed.value = speed;
    const i = inputsOf(base); i.route_length = route;
    assert.equal(resolve(q, i).limits.time_limit, expected, `${route} m at ${speed} m/s`);
  }
  for (const speed of [0, -0.5]) {
    const q = structuredClone(p);
    q.parameters.command_speed.value = speed;
    assert.throws(() => resolve(q, inputsOf(base)), e => e instanceof ScenarioParameterError && e.status === 'ERROR');
  }
});

test('README, description and Gherkin state the same derivation, and nothing is sent at command_speed', async () => {
  const p = await json(CORNER + 'parameters.json');
  const d = await json(CORNER + 'description.json');
  const readme = await readFile(CORNER + 'README.md', 'utf8');
  const feature = await readFile(CORNER + 'walk-corner.feature', 'utf8');
  assert.equal(p.limits.time_limit.formula, '2 × route_length ÷ command_speed + 5 s');
  assert.equal(d.parameters.time_limit.formula, p.limits.time_limit.formula);
  assert.equal(d.parameters.time_limit.value, 27);
  assert.match(d.mission.time_limit_explained, /2 × 5\.5 m ÷ 0\.5 m\/s \+ 5 s/);
  assert.match(d.mission.description, /5\.5 m along the route, within 27 s/);
  assert.ok(readme.includes('| `time_limit` | 2 × route length ÷ `command_speed` + 5 s | Route length 5.5 m |'));
  assert.match(readme, /Nothing is sent at this speed: the adapter chooses how fast to go\./);
  assert.match(feature, /Then the runner sends no command from the scenario/);
  assert.equal('command' in p, false);
});
