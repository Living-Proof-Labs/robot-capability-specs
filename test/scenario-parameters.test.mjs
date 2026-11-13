// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  evaluate, quantizeHalfUpDecimalText, readInputs, referenceErrors, resolve, roundHalfEvenBinary,
  ScenarioParameterError,
} from '../tooling/scenario-parameters.mjs';

const SCHEMA = 'specs/scenarios/scenario-parameters.schema.json';
const HALLWAY = 'specs/scenarios/walk-hallway/';
const HALLWAY_OPEN = 'test/fixtures/worlds/hallway-open-0.1.0.world.json';
const EXAMPLES = 'specs/robots/examples/unitree-g1/';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const validator = async () =>
  new Ajv2020({ allErrors: true, strict: true, strictRequired: false }).compile(await json(SCHEMA));
const isError = e => e instanceof ScenarioParameterError && e.status === 'ERROR';

test('scenario parameters schema is versioned and compiles', async () => {
  const schema = await json(SCHEMA);
  assert.equal(schema.title, 'livingproof-scenario-parameters/0.1');
  assert.equal(schema.properties.format.const, schema.title);
  assert.equal(typeof (await validator()), 'function');
  for (const op of ['add', 'sub', 'mul', 'div', 'le', 'lt', 'ge', 'gt']) {
    assert.ok(schema.$defs.expression.description.includes(op), op);
  }
  assert.equal(schema.properties.parameters.properties.command_speed.properties.value.exclusiveMinimum, 0);
});

test('walk-hallway parameters validate, have no dangling reference and name places hallway-open declares', async () => {
  const validate = await validator();
  const p = await json(HALLWAY + 'parameters.json');
  assert.ok(validate(p), JSON.stringify(validate.errors));
  assert.deepEqual(referenceErrors(p), []);
  const world = await json(HALLWAY_OPEN);
  assert.deepEqual([p.world.id, p.world.content_version], [world.id, world.content_version]);
  const places = Object.fromEntries(world.places.map(x => [x.name, x.type]));
  assert.equal(places[p.places.start], 'pose');
  assert.equal(places[p.places.exit], 'segment');
  assert.equal(places[p.places.route], 'polyline');
  assert.deepEqual(p.places.through, []);
  assert.equal(p.preconditions.fits_width.quantize.decimals, 3);
  assert.equal(p.preconditions.fits_width.quantize.mode, 'half-up-decimal-text');
  for (const l of Object.values(p.limits)) if (l.round) assert.equal(l.round.mode, 'half-even-binary');
});

test('every conformance case resolves exactly, including ties and exact fits', async () => {
  const p = await json(HALLWAY + 'parameters.json');
  const cases = await json(HALLWAY + 'parameter-cases.json');
  assert.equal(cases.format, 'livingproof-scenario-parameter-cases/0.1');
  assert.equal(cases.parameters, 'parameters.json');
  for (const c of cases.cases) {
    if (c.expect.error) {
      assert.throws(() => resolve(p, c.inputs), isError, c.name);
      continue;
    }
    const r = resolve(p, c.inputs);
    assert.deepEqual(r.limits, c.expect.limits, c.name);
    assert.deepEqual(r.preconditions, c.expect.preconditions, c.name);
  }
  const names = cases.cases.map(c => c.name).join('\n');
  for (const needed of [/tie 0\.40625/, /tie 0\.21875/, /1\.03 \+ 2 × 0\.05 = 1\.13/, /One millimetre too wide/, /class with no wall clearance/, /centimetres/]) {
    assert.match(names, needed);
  }
  // The exact fit is false with raw floats, which is why the comparison is quantized.
  assert.equal(1.03 + 2 * 0.05 <= 1.13, false);
  assert.equal(1.3 + 2 * 0.05 <= 1.4, false);
});

test('rounding matches Python round() on ties, and quantizing rounds half up from decimal text', () => {
  assert.equal(roundHalfEvenBinary(0.40625, 4), 0.4062);
  assert.equal((0.40625).toFixed(4), '0.4063'); // why toFixed is not the reference
  assert.equal(roundHalfEvenBinary(0.21875, 4), 0.2188);
  assert.equal(roundHalfEvenBinary(2.675, 2), 2.67); // binary value is below the tie
  assert.equal(roundHalfEvenBinary(-0.40625, 4), -0.4062);
  assert.equal(roundHalfEvenBinary(27, 4), 27);
  assert.equal(quantizeHalfUpDecimalText(1.0295, 3), 1030n);
  assert.equal(quantizeHalfUpDecimalText(1.0305, 3), 1031n);
  assert.equal(quantizeHalfUpDecimalText(-0.0005, 3), -1n);
  assert.equal(quantizeHalfUpDecimalText(1e-7, 3), 0n);
  assert.throws(() => roundHalfEvenBinary(Infinity, 4), isError);
});

test('inputs read from the example G1 profiles resolve to .value with their units checked', async () => {
  const p = await json(HALLWAY + 'parameters.json');
  const world = await json(HALLWAY_OPEN);
  const robot = await json(EXAMPLES + 'robot.json');
  for (const name of ['stock', 'playground']) {
    const configuration = await json(`${EXAMPLES}configurations/${name}.json`);
    const raw = readInputs(p, { world, robot, configuration });
    assert.deepEqual(raw.robot_width, robot.dimensions.width);
    assert.equal(raw.robot_class, 'humanoid');
    const r = resolve(p, raw);
    // The example profile's illustrative width is 0.45 m; v1.18.1 resolves 0.525 m from it.
    assert.equal(r.inputs.robot_width, 0.45);
    assert.equal(r.inputs.route_length, 5.5);
    assert.deepEqual(r.limits, { time_limit: 27, lateral_limit: 0.525, exit_segment: 0.75, fall_height: 0.5 });
    assert.equal(r.preconditions.fits_width, true);
  }
});

test('a non-finite result is an ERROR and command_speed <= 0 is an ERROR', async () => {
  const p = await json(HALLWAY + 'parameters.json');
  const c = (await json(HALLWAY + 'parameter-cases.json')).cases[0];
  const message = /command_speed must be greater than 0/;
  for (const value of [0, -0.5]) {
    const speed = structuredClone(p);
    speed.parameters.command_speed.value = value; // the schema forbids this; the evaluator still guards it
    assert.throws(() => resolve(speed, c.inputs), e => isError(e) && message.test(e.message), String(value));
  }
  assert.throws(() => evaluate({ op: 'div', args: [1, 0] }, p, {}), e => isError(e) && /non-finite value Infinity/.test(e.message));
  assert.throws(() => resolve(p, { ...c.inputs, route_length: Infinity }), isError);
});

test('walk-hallway parameter files are the v2.1.0 bytes', async () => {
  const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
  assert.equal(await hash(HALLWAY + 'parameters.json'),
    '9226aa6bc0e577863bdc210514e7e7c3a7edc32f49c4f7b46aa7249837f08b3d');
  assert.equal(await hash(HALLWAY + 'parameter-cases.json'),
    '4697196d94df5d7d6aba8059d48d732137a67fcefcde990cd937efa5ad2d44e4');
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
  for (const name of ['lateral_limit', 'fall_height']) assert.equal(p.limits[name].formula, d.limits[name].formula, name);
  assert.ok(d.limits.exit_segment.formula.endsWith('clear_width ÷ 2'));
  assert.ok(p.limits.exit_segment.formula.startsWith('clear_width ÷ 2'));
  assert.equal(p.preconditions.fits_width.formula, d.limits.fits_width.formula);
  assert.deepEqual(p.checks.map(c => c.evaluator).sort(), d.mission.success_criteria.map(c => c.evaluator).sort());
  assert.match(readme, /\[parameters\.json\]\(parameters\.json\)/);
  assert.match(readme, /\[parameter-cases\.json\]\(parameter-cases\.json\)/);
  assert.match(readme, /whole millimetres/);
  const c = (await json(HALLWAY + 'parameter-cases.json')).cases[0];
  const r = resolve(p, c.inputs);
  assert.equal(r.limits.time_limit, d.parameters.time_limit.value);
  assert.equal(r.inputs.route_length, d.parameters.route_length.value);
});

test('scenario parameters schema rejects an unknown field, seeds, a stated value and a bad expression', async () => {
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
    p => { p.parameters.command_speed.value = 0; },
    p => { p.parameters.command_speed.value = -0.5; },
    p => { p.limits.time_limit.round.mode = 'half-up'; },
    p => { p.preconditions.fits_width.quantize.mode = 'float'; },
    p => { delete p.inputs.robot_class.path; },
    p => { delete p.inputs.robot_width.kind; },
  ];
  for (const mutate of bad) {
    const p = structuredClone(good);
    mutate(p);
    assert.equal(validate(p), false, mutate.toString());
  }
});

test('the reference checker rejects every reference that names nothing real', async () => {
  const validate = await validator();
  const good = await json(HALLWAY + 'parameters.json');
  const cases = [
    [p => { p.limits.lateral_limit.expression.args[0].args[0] = { input: 'hallway_width' }; }, /unknown input hallway_width/],
    [p => { p.limits.time_limit.expression.args[0].args[1] = { parameter: 'speed' }; }, /unknown parameter speed/],
    [p => { p.limits.time_limit.expression.args[0].args[1] = { parameter: 'trials' }; }, /parameter trials is not numeric/],
    [p => { p.limits.fall_height.expression = { input: 'robot_class' }; }, /robot_class is not a quantity/],
    [p => { p.checks[1].limit = 'lateral'; }, /checks\[1\]\.limit names no limit: lateral/],
    [p => { p.parameters.wall_clearance.by = 'robot_kind'; }, /not a category input/],
    [p => { p.preconditions.fits_width.condition.args[1] = { op: 'div', args: [{ input: 'clear_width' }, 1] }; }, /quantize does not allow div/],
    [p => { p.preconditions.fits_width.condition.args[0].args[1].args[0] = 0.5; }, /bare number 0\.5 under quantize must be an integer/],
    [p => { p.command.forward = { input: 'nope' }; }, /command\.forward: unknown input nope/],
  ];
  for (const [mutate, message] of cases) {
    const p = structuredClone(good);
    mutate(p);
    assert.ok(validate(p), `schema alone accepts it: ${mutate}`);
    const errors = referenceErrors(p);
    assert.ok(errors.some(e => message.test(e)), `${mutate} gave ${JSON.stringify(errors)}`);
    const c = (await json(HALLWAY + 'parameter-cases.json')).cases[0];
    assert.throws(() => resolve(p, c.inputs), isError);
  }
});

test('the reference checker reports a structural rule the schema also rejects', async () => {
  const good = await json(HALLWAY + 'parameters.json');
  const cases = [
    [p => { p.limits.fall_height.expression = null; }, /not an expression/],
    [p => { p.limits.time_limit.expression = { op: 'pow', args: [2, 3] }; }, /unknown operator pow/],
    [p => { p.preconditions.fits_width.condition.op = 'eq'; }, /unknown comparison eq/],
  ];
  for (const [mutate, message] of cases) {
    const p = structuredClone(good);
    mutate(p);
    const errors = referenceErrors(p);
    assert.ok(errors.some(e => message.test(e)), `${mutate} gave ${JSON.stringify(errors)}`);
  }
});
