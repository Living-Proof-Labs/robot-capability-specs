// SPDX-License-Identifier: Apache-2.0
// walk-corner 0.1.0 on hallway-corner 0.1.0 (specs #40, Part B step 9), tested the way
// walk-hallway is. It states only the outcome: no command, and the adapter drives the robot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import { generateMessages } from '@cucumber/gherkin';
import { IdGenerator, SourceMediaType } from '@cucumber/messages';
import { readInputs, referenceErrors, resolve, ScenarioParameterError } from '../tooling/scenario-parameters.mjs';
import { layoutErrors, routeLength } from '../tooling/world-layout.mjs';

const CORNER = 'specs/scenarios/walk-corner/';
const HALLWAY = 'specs/scenarios/walk-hallway/';
// world.json of hallway-corner 0.1.0 as listed in livingproof-worlds v1.3.0 release.json.
const WORLD = 'test/fixtures/worlds/hallway-corner-0.1.0.world.json';
const WORLD_SHA256 = '8393881e8b38a090f51c3a424ca444623a901f642f75186cb4d41ac7482898f5';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const ajv = () => new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
const parametersValidator = async () => ajv().compile(await json('specs/scenarios/scenario-parameters.schema.json'));
const descriptionValidator = async () => ajv().compile(await json('specs/scenarios/scenario-description.schema.json'));
const isError = e => e instanceof ScenarioParameterError && e.status === 'ERROR';
const pickles = async path => {
  const messages = generateMessages(await readFile(path, 'utf8'), path, SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN, {
    newId: IdGenerator.incrementing(), includeGherkinDocument: true, includePickles: true,
  });
  assert.deepEqual(messages.filter(m => m.parseError), []);
  return messages.filter(m => m.pickle).map(m => m.pickle.steps.map(s => s.text).join('\n'));
};
const placesOf = world => Object.fromEntries(world.places.map(p => [p.name, p]));

test('the hallway-corner fixture is the world.json from livingproof-worlds and meets the layout contract', async () => {
  const bytes = await readFile(WORLD);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), WORLD_SHA256);
  const world = JSON.parse(bytes);
  assert.deepEqual([world.id, world.content_version, world.format], ['hallway-corner', '0.1.0', 'livingproof-world/0.2']);
  const layout = ajv().compile(await json('specs/worlds/world-layout.schema.json'));
  assert.ok(layout(world), JSON.stringify(layout.errors));
  assert.deepEqual(layoutErrors(world, { route: 'route-centreline' }), []);
  const hallway = await json('test/fixtures/worlds/hallway-open-0.1.0.world.json');
  for (const k of ['clear_width', 'wall_height', 'wall_thickness', 'floor_thickness']) {
    assert.equal(world.dimensions[k], hallway.dimensions[k], k);
  }
});

test('walk-corner parameters validate, have no dangling reference and name places hallway-corner declares', async () => {
  const validate = await parametersValidator();
  const p = await json(CORNER + 'parameters.json');
  assert.ok(validate(p), JSON.stringify(validate.errors));
  assert.deepEqual(referenceErrors(p), []);
  const world = await json(WORLD);
  assert.deepEqual([p.world.id, p.world.content_version], [world.id, world.content_version]);
  const places = placesOf(world);
  assert.equal(places[p.places.start].type, 'pose');
  assert.equal(places[p.places.exit].type, 'segment');
  assert.equal(p.places.route, 'route-centreline');
  assert.equal(places[p.places.route].type, 'polyline');
  assert.equal(places[p.places.route].points.length, 3);
  assert.deepEqual(p.places.through, ['corner']);
  assert.equal(places.corner.type, 'region');
  assert.equal(routeLength(world, p.places), 5.5);
});

test('walk-corner uses the issue #40 step vocabulary: one check per observable step', async () => {
  const p = await json(CORNER + 'parameters.json');
  const by = Object.fromEntries(p.checks.map(c => [c.measure, c]));
  assert.deepEqual(Object.keys(by).sort(),
    ['exit-crossing-time', 'max-distance-from-route', 'min-base-height', 'passes-through-places', 'wall-contacts']);
  assert.deepEqual([by['exit-crossing-time'].fail_when, by['exit-crossing-time'].limit], ['absent-or-greater-than-limit', 'time_limit']);
  assert.equal(by['passes-through-places'].fail_when, 'not-in-order');
  assert.deepEqual([by['max-distance-from-route'].fail_when, by['max-distance-from-route'].limit], ['greater-than-limit', 'lateral_limit']);
  assert.equal(by['wall-contacts'].fail_when, 'not-empty');
  assert.deepEqual([by['min-base-height'].fail_when, by['min-base-height'].limit], ['less-than-limit', 'fall_height']);
  for (const c of p.checks) assert.match(c.evaluator, /^corner-/);
});

test('walk-corner keeps every walk-hallway rule except the places and the checks, and has no command', async () => {
  const corner = await json(CORNER + 'parameters.json');
  const hallway = await json(HALLWAY + 'parameters.json');
  for (const key of ['format', 'parameters', 'inputs', 'limits', 'preconditions']) {
    assert.deepEqual(corner[key], hallway[key], key);
  }
  assert.deepEqual([corner.places.start, corner.places.exit], [hallway.places.start, hallway.places.exit]);
  assert.equal(hallway.command.mode, 'constant');
  assert.equal('command' in corner, false);
});

test('every walk-corner conformance case resolves exactly', async () => {
  const p = await json(CORNER + 'parameters.json');
  const cases = await json(CORNER + 'parameter-cases.json');
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
  const named = Object.fromEntries(cases.cases.map(c => [c.name.split(' ')[0], c]));
  assert.deepEqual(named.G1.expect.limits, { time_limit: 27, lateral_limit: 0.49, exit_segment: 0.75, fall_height: 0.5 });
  assert.equal(named.Go1.expect.limits.lateral_limit, 0.609);
  assert.equal(named.T1.expect.limits.lateral_limit, 0.4795);
  assert.ok(cases.cases.some(c => c.expect.preconditions?.fits_width === false));
});

test('inputs read from hallway-corner and the example G1 profiles give route_length 5.5 m', async () => {
  const p = await json(CORNER + 'parameters.json');
  const world = await json(WORLD);
  const robot = await json('specs/robots/examples/unitree-g1/robot.json');
  const configuration = await json('specs/robots/examples/unitree-g1/configurations/playground.json');
  const r = resolve(p, readInputs(p, { world, robot, configuration }));
  assert.equal(r.inputs.route_length, 5.5);
  assert.equal(r.inputs.clear_width, 1.5);
  assert.equal(r.limits.time_limit, 27);
});

test('walk-corner parameters agree with description.json and the README acceptance', async () => {
  const p = await json(CORNER + 'parameters.json');
  const d = await json(CORNER + 'description.json');
  const readme = await readFile(CORNER + 'README.md', 'utf8');
  assert.deepEqual(p.scenario, d.scenario);
  assert.deepEqual([p.world.id, p.world.content_version], [d.world.id, d.world.content_version]);
  assert.deepEqual(p.parameters.command_speed, d.parameters.command_speed);
  assert.deepEqual(p.parameters.wall_clearance.values,
    Object.fromEntries(Object.entries(d.parameters.wall_clearance).map(([k, v]) => [k, v.value])));
  assert.equal(p.parameters.trials.count, d.parameters.trials.count);
  assert.equal(p.parameters.trials.retries, d.parameters.trials.retries);
  assert.equal(p.limits.time_limit.formula, d.parameters.time_limit.formula);
  for (const name of ['lateral_limit', 'fall_height']) assert.equal(p.limits[name].formula, d.limits[name].formula, name);
  assert.equal(p.preconditions.fits_width.formula, d.limits.fits_width.formula);
  assert.deepEqual(p.checks.map(c => c.evaluator).sort(), d.mission.success_criteria.map(c => c.evaluator).sort());
  const r = resolve(p, (await json(CORNER + 'parameter-cases.json')).cases[0].inputs);
  assert.equal(r.limits.time_limit, d.parameters.time_limit.value);
  assert.equal(r.inputs.route_length, d.parameters.route_length.value);
  assert.match(readme, /# Walk around the corner, scenario 0\.1\.0/);
  assert.match(readme, /\| `command_speed` \| 0\.5 m\/s/);
  assert.match(readme, /Route length 5\.5 m/);
  assert.match(readme, /0\.05 m humanoid, 0\.10 m quadruped/);
  assert.match(readme, /\| `trials` \| 1 \|/);
  assert.match(readme, /`scenario_supported`/);
  assert.ok(readme.includes('](../../robots/README.md#scenario-support)'));
  assert.doesNotMatch(readme, /follower|pursuit|lookahead|turn_interface|velocity_interface/);
  for (const c of p.checks) assert.match(readme, new RegExp('`' + c.evaluator + '`'), c.evaluator);
  for (const name of ['clear width ÷ 2 − robot width ÷ 2', 'robot width + 2 × `wall_clearance` ≤ clear width']) {
    assert.ok(readme.includes(name), name);
  }
  for (const link of ['parameters.json', 'parameter-cases.json', 'description.json', 'walk-corner.feature']) {
    assert.ok(readme.includes(`](${link})`), link);
  }
});

test('walk-corner description validates, is in journey order and matches hallway-corner', async () => {
  const validate = await descriptionValidator();
  const d = await json(CORNER + 'description.json');
  assert.ok(validate(d), JSON.stringify(validate.errors));
  assert.equal(d.mission.title, 'Walk around the corner');
  assert.ok(d.mission.description.startsWith('The robot walks down one hallway, turns the corner, and reaches the end of the next hallway.'));
  // Art's card labels on #40, in journey order.
  assert.deepEqual(d.mission.success_criteria.map(c => c.text.split(':')[0]),
    ['Turns the corner', 'Stays on the route', 'Clears the walls', 'Stays upright', 'Reaches the exit in time']);
  for (const rule of Object.values(d.limits)) {
    assert.doesNotMatch(`${rule.text} ${rule.sentence ?? ''}`, /lateral|centreline|\b[xy]\b/i);
    for (const k of (rule.sentence ?? '').match(/\{(\w+)\}/g) ?? []) {
      const name = k.slice(1, -1);
      assert.ok(['robot', 'value'].includes(name) || name in rule.inputs, `${k} is an input`);
    }
  }
  const world = await json(WORLD);
  for (const k of ['clear_width', 'wall_height', 'wall_thickness']) assert.equal(d.world.dimensions[k].value, world.dimensions[k], k);
  const route = placesOf(world)['route-centreline'].points;
  const polyline = route.slice(1).reduce((s, b, i) => s + Math.hypot(b[0] - route[i][0], b[1] - route[i][1]), 0);
  assert.equal(d.world.dimensions.length.value, polyline);
  assert.equal(d.parameters.time_limit.value, 2 * d.parameters.route_length.value / d.parameters.command_speed.value + 5);
});

test('walk-corner Gherkin parses, uses the step vocabulary and names every evaluator', async () => {
  const path = CORNER + 'walk-corner.feature';
  const source = await readFile(path, 'utf8');
  assert.match(source, /SPDX-License-Identifier: CC-BY-4.0/);
  assert.ok(source.endsWith('\n'));
  assert.doesNotMatch(source, /\t| +$/m);
  assert.doesNotMatch(source.replace(/^#.*$/m, ''), /\b\d+(\.\d+)?\s*(m|s|m\/s|rad\/s)\b/);
  const steps = await pickles(path);
  assert.ok(steps.length >= 10);
  const walk = steps.find(e => e.includes('world "hallway-corner"'));
  for (const step of [
    'the base enters "exit" within the README parameter time_limit',
    'the base passes through "corner" before it enters "exit"',
    'the base stays within the README parameter lateral_limit of "route-centreline"',
    'no robot body touches a wall',
    'the base height stays at or above the README parameter fall_height',
  ]) assert.ok(walk.includes(step), step);
  const p = await json(CORNER + 'parameters.json');
  for (const c of p.checks) assert.ok(steps.some(e => e.includes('"' + c.evaluator + '"')), c.evaluator);
  assert.ok(steps.some(e => e.includes('precondition "scenario_supported"')));
  assert.ok(steps.some(e => e.includes('precondition "fits_width"')));
  assert.ok(walk.includes('robot manifest lists scenario "walk-corner"'));
  assert.ok(walk.includes('the robot adapter drives the robot its own way'));
  assert.doesNotMatch(source, /pursuit|follower|turn rate|turn_interface/);
  assert.match(source, /\| 1\s+\| 0\s+\| 0\s+\| 1\s+\| INSUFFICIENT_EVIDENCE \|/);
});

test('the command is optional: walk-corner has none, walk-hallway keeps its constant command', async () => {
  const validate = await parametersValidator();
  const corner = await json(CORNER + 'parameters.json');
  const hallway = await json(HALLWAY + 'parameters.json');
  assert.ok(validate(hallway), JSON.stringify(validate.errors));
  const schema = await json('specs/scenarios/scenario-parameters.schema.json');
  assert.equal(schema.required.includes('command'), false);
  assert.deepEqual(schema.properties.command.properties.mode.enum, ['constant']);
  const withoutCommand = structuredClone(hallway);
  delete withoutCommand.command;
  assert.ok(validate(withoutCommand), JSON.stringify(validate.errors));
  assert.deepEqual(referenceErrors(withoutCommand), []);
  // A command that is present must still be a whole constant command.
  const bad = [
    p => { p.command = { mode: 'constant', forward: { parameter: 'command_speed' }, sideways: 0 }; },
    p => { p.command = { mode: 'route-follower', forward: 0.5, sideways: 0, turn_rate: 0 }; },
    p => { p.command = {}; },
  ];
  for (const mutate of bad) {
    const p = structuredClone(corner);
    mutate(p);
    assert.equal(validate(p), false, mutate.toString());
  }
});
