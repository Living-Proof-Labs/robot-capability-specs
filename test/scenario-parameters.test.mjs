// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import { routeLength } from '../tooling/world-layout.mjs';

const SCHEMA = 'specs/scenarios/scenario-parameters.schema.json';
const HALLWAY = 'specs/scenarios/walk-hallway/';
const HALLWAY_OPEN = 'test/fixtures/worlds/hallway-open-0.1.0.world.json';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const validator = async () =>
  new Ajv2020({ allErrors: true, strict: true, strictRequired: false }).compile(await json(SCHEMA));

// Evaluates a parameter-file expression; wall_clearance resolves for the robot's class.
function evaluate(e, ctx) {
  if (typeof e === 'number') return e;
  if ('input' in e) {
    assert.ok(e.input in ctx.inputs, `input ${e.input} is supplied`);
    return ctx.inputs[e.input];
  }
  if ('parameter' in e) {
    const p = ctx.parameters[e.parameter];
    if (p.by === 'robot_class') return p.values[ctx.robot_class];
    return p.value;
  }
  const args = e.args.map(a => evaluate(a, ctx));
  const ops = { add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => a / b,
    le: (a, b) => a <= b, lt: (a, b) => a < b, ge: (a, b) => a >= b, gt: (a, b) => a > b };
  return args.reduce(ops[e.op]);
}
// Python's round() is half-to-even; none of these values sits on a half, so this matches.
const round = (v, n) => (n === undefined ? v : Number(v.toFixed(n)));

async function resolve(robot_width, robot_class, fall_base_height) {
  const p = await json(HALLWAY + 'parameters.json');
  const world = await json(HALLWAY_OPEN);
  const inputs = {
    route_length: routeLength(world, p.places),
    clear_width: world.dimensions.clear_width,
    robot_width,
    fall_base_height,
  };
  const ctx = { inputs, parameters: p.parameters, robot_class };
  const limits = Object.fromEntries(Object.entries(p.limits).map(([k, l]) => [k, round(evaluate(l.expression, ctx), l.round_decimals)]));
  const pre = Object.fromEntries(Object.entries(p.preconditions).map(([k, c]) => [k, evaluate(c.condition, ctx)]));
  return { inputs, limits, pre };
}

test('scenario parameters schema is versioned and compiles', async () => {
  const schema = await json(SCHEMA);
  assert.equal(schema.title, 'livingproof-scenario-parameters/0.1');
  assert.equal(schema.properties.format.const, schema.title);
  assert.equal(typeof (await validator()), 'function');
});

test('walk-hallway parameters validate and name places that hallway-open declares', async () => {
  const validate = await validator();
  const p = await json(HALLWAY + 'parameters.json');
  assert.ok(validate(p), JSON.stringify(validate.errors));
  const world = await json(HALLWAY_OPEN);
  assert.deepEqual([p.world.id, p.world.content_version], [world.id, world.content_version]);
  const places = Object.fromEntries(world.places.map(x => [x.name, x.type]));
  assert.equal(places[p.places.start], 'pose');
  assert.equal(places[p.places.exit], 'segment');
  assert.equal(places[p.places.route], 'polyline');
  assert.deepEqual(p.places.through, []);
});

test('walk-hallway parameters reproduce the values capability-verifier v1.18.1 grades against', async () => {
  // capability-verifier v1.18.1 hallway.py thresholds(): time_limit, lateral_limit and half_width
  // rounded to 4 places; fall_height unrounded. Widths and classes are the G1, Go1 and T1 robot.json
  // values used in specs #30. Fall heights are illustrative: the rule passes the configuration value through.
  const cases = [
    [0.52, 'humanoid', 0.5, { time_limit: 27, lateral_limit: 0.49, exit_segment: 0.75, fall_height: 0.5 }],
    [0.282, 'quadruped', 0.18, { time_limit: 27, lateral_limit: 0.609, exit_segment: 0.75, fall_height: 0.18 }],
    [0.541, 'humanoid', 0.45, { time_limit: 27, lateral_limit: 0.4795, exit_segment: 0.75, fall_height: 0.45 }],
  ];
  for (const [width, cls, fall, expected] of cases) {
    const r = await resolve(width, cls, fall);
    assert.equal(r.inputs.route_length, 5.5);
    assert.deepEqual(r.limits, expected, `width ${width}`);
    assert.equal(r.pre.fits_width, true);
    // The same arithmetic as the verifier, written out.
    assert.equal(r.limits.time_limit, Number((2 * 5.5 / 0.5 + 5).toFixed(4)));
    assert.equal(r.limits.lateral_limit, Number((1.5 / 2 - width / 2).toFixed(4)));
  }
  // fits_width fails when the clearance does not fit: 1.45 + 2 × 0.05 > 1.5.
  assert.equal((await resolve(1.45, 'humanoid', 0.5)).pre.fits_width, false);
  assert.equal((await resolve(1.4, 'humanoid', 0.5)).pre.fits_width, true);
});

test('walk-hallway parameters agree with description.json and the README acceptance', async () => {
  const p = await json(HALLWAY + 'parameters.json');
  const d = await json(HALLWAY + 'description.json');
  const readme = await readFile(HALLWAY + 'README.md', 'utf8');
  assert.deepEqual(p.scenario, d.scenario);
  assert.equal(p.world.id, d.world.id);
  assert.equal(p.world.content_version, d.world.content_version);
  assert.deepEqual(p.parameters.command_speed, d.parameters.command_speed);
  assert.deepEqual(p.parameters.wall_clearance.values,
    Object.fromEntries(Object.entries(d.parameters.wall_clearance).map(([k, v]) => [k, v.value])));
  assert.equal(p.parameters.trials.count, d.parameters.trials.count);
  assert.equal(p.parameters.trials.retries, d.parameters.trials.retries);
  assert.equal(Object.hasOwn(p.parameters.trials, 'seeds'), false);
  assert.equal(p.limits.time_limit.formula, d.parameters.time_limit.formula);
  for (const name of ['lateral_limit', 'exit_segment', 'fall_height']) {
    assert.equal(p.limits[name].formula, d.limits[name].formula, name);
  }
  assert.equal(p.preconditions.fits_width.formula, d.limits.fits_width.formula);
  assert.deepEqual(p.checks.map(c => c.evaluator).sort(), d.mission.success_criteria.map(c => c.evaluator).sort());
  assert.match(readme, /\[parameters\.json\]\(parameters\.json\)/);
  const time = await resolve(0.52, 'humanoid', 0.5);
  assert.equal(time.limits.time_limit, d.parameters.time_limit.value);
  assert.equal(time.inputs.route_length, d.parameters.route_length.value);
});

test('scenario parameters reject an unknown field, seeds, a stated value and a bad expression', async () => {
  const validate = await validator();
  const good = await json(HALLWAY + 'parameters.json');
  const bad = [
    p => { p.extra = true; },
    p => { p.parameters.trials.seeds = [0]; },
    p => { p.parameters.trials.identical = false; },
    p => { p.parameters.trials.retries = true; },
    p => { p.limits.lateral_limit.value = 0.49; },
    p => { p.limits.time_limit.expression = { op: 'pow', args: [2, 3] }; },
    p => { p.limits.time_limit.expression = { op: 'add', args: [5] }; },
    p => { p.limits.time_limit.expression = '2 * route_length / command_speed + 5'; },
    p => { delete p.places.route; },
    p => { p.command.mode = 'random'; },
    p => { p.inputs.route_length.source = 'robot'; },
    p => { p.format = 'livingproof-scenario-parameters/0.2'; },
  ];
  for (const mutate of bad) {
    const p = structuredClone(good);
    mutate(p);
    assert.equal(validate(p), false, mutate.toString());
  }
});
