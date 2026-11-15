// SPDX-License-Identifier: Apache-2.0
// walk-corner 0.1.0 on hallway-corner 0.1.0 (specs #40, Part B step 9), tested the way
// walk-hallway is, plus the route-follower command it is the first to use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import { generateMessages } from '@cucumber/gherkin';
import { IdGenerator, SourceMediaType } from '@cucumber/messages';
import { readInputs, referenceErrors, resolve, ScenarioParameterError } from '../tooling/scenario-parameters.mjs';
import {
  crossesExit, distanceToRoute, followRoute, layoutErrors, pointAlongRoute, routeLength,
} from '../tooling/world-layout.mjs';

const CORNER = 'specs/scenarios/walk-corner/';
const HALLWAY = 'specs/scenarios/walk-hallway/';
// Copy of livingproof-worlds worlds/hallway-corner/0.1.0/world.json from pull request 14 at
// 90cde4fa27839405067515595f418a20cabf4ae8; its release.json lists this sha256. Replace with
// the released copy once livingproof-worlds releases it (expected v1.3.0).
const WORLD = 'test/fixtures/worlds/hallway-corner-0.1.0.world.json';
const WORLD_SHA256 = '8393881e8b38a090f51c3a424ca444623a901f642f75186cb4d41ac7482898f5';
const FOLLOWER_CASES = 'specs/scenarios/route-follower-cases.json';
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

test('walk-corner keeps every walk-hallway rule except the places, the command and the checks', async () => {
  const corner = await json(CORNER + 'parameters.json');
  const hallway = await json(HALLWAY + 'parameters.json');
  for (const key of ['format', 'parameters', 'inputs', 'limits', 'preconditions']) {
    assert.deepEqual(corner[key], hallway[key], key);
  }
  assert.deepEqual([corner.places.start, corner.places.exit], [hallway.places.start, hallway.places.exit]);
  assert.deepEqual([corner.command.forward, corner.command.sideways], [hallway.command.forward, hallway.command.sideways]);
  assert.equal(hallway.command.mode, 'constant');
  assert.equal(corner.command.mode, 'route-follower');
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
  assert.match(readme, new RegExp(`\\| \`lookahead\` \\| ${p.command.turn_rate.lookahead.value} m \\|`));
  assert.match(readme, new RegExp(`\\| \`max_turn_rate\` \\| ${p.command.turn_rate.max_turn_rate.value.toFixed(1)} rad/s \\|`));
  assert.match(readme, /`pure-pursuit-v1`/);
  assert.match(readme, /`turn_interface`/);
  for (const c of p.checks) assert.match(readme, new RegExp('`' + c.evaluator + '`'), c.evaluator);
  for (const name of ['clear width ÷ 2 − robot width ÷ 2', 'robot width + 2 × `wall_clearance` ≤ clear width']) {
    assert.ok(readme.includes(name), name);
  }
  for (const link of ['parameters.json', 'parameter-cases.json', 'description.json', 'walk-corner.feature', '../route-follower-cases.json']) {
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
  assert.ok(steps.some(e => e.includes('precondition "turn_interface"')));
  assert.ok(steps.some(e => e.includes('precondition "fits_width"')));
  assert.ok(steps.some(e => e.includes('rule "pure-pursuit-v1"')));
  assert.match(source, /\| 1\s+\| 0\s+\| 0\s+\| 1\s+\| INSUFFICIENT_EVIDENCE \|/);
});

test('the route-follower cases match the reference: exact zeros, the rest within tolerance', async () => {
  const doc = await json(FOLLOWER_CASES);
  assert.equal(doc.format, 'livingproof-route-follower-cases/0.1');
  assert.equal(doc.rule, 'pure-pursuit-v1');
  const p = await json(CORNER + 'parameters.json');
  const t = p.command.turn_rate;
  assert.deepEqual(doc.follower, {
    forward: p.parameters.command_speed.value, sideways: p.command.sideways,
    lookahead: t.lookahead.value, max_turn_rate: t.max_turn_rate.value,
  });
  const options = { forward: doc.follower.forward, sideways: doc.follower.sideways, lookahead: doc.follower.lookahead, maxTurnRate: doc.follower.max_turn_rate };
  let exact = 0, clamped = 0;
  for (const c of doc.cases) {
    for (const s of c.steps) {
      const got = followRoute(c.route, s.base, s.yaw_deg * Math.PI / 180, options);
      assert.equal(got.length, 3);
      for (let i = 0; i < 3; i++) {
        if (s.command[i] === 0) { assert.ok(Object.is(got[i], 0), `${c.name}: ${s.name} [${i}] must be exactly 0`); exact++; }
        else assert.ok(Math.abs(got[i] - s.command[i]) <= doc.tolerance, `${c.name}: ${s.name} [${i}] ${got[i]} vs ${s.command[i]}`);
      }
      if (Math.abs(s.command[2]) === doc.follower.max_turn_rate) clamped++;
    }
  }
  assert.ok(exact >= 10 && clamped === 2);
  // The straight-route steps are exactly the walk-hallway constant command.
  for (const s of doc.cases[0].steps) assert.deepEqual(s.command, [0.5, 0, 0]);
});

test('the follower measures along the route, past the end and on ties as the rule states', () => {
  const L = [[-3, 0, 0], [0, 0, 0], [0, 3, 0]];
  assert.deepEqual(pointAlongRoute(L, 0), [-3, 0]);
  assert.deepEqual(pointAlongRoute(L, 3.75), [0, 0.75]);
  assert.deepEqual(pointAlongRoute(L, 6.5), [0, 3.5]);
  assert.deepEqual(pointAlongRoute(L, -1), [-3, 0]);
  // (-0.5, 0.5) is 0.5 m from both legs; the earlier leg wins, so the target is (0, 0.25).
  const got = followRoute(L, [-0.5, 0.5], 0, { forward: 0.5, lookahead: 0.75, maxTurnRate: 1 });
  const alpha = Math.atan2(0.25 - 0.5, 0 + 0.5);
  assert.ok(Math.abs(got[2] - 2 * 0.5 * Math.sin(alpha) / 0.75) < 1e-12);
  assert.throws(() => followRoute(L, [0, 0], 0, { forward: 0.5, lookahead: 0, maxTurnRate: 1 }), /lookahead/);
  assert.throws(() => followRoute(L, [0, 0], 0, { forward: 0.5, lookahead: 0.75, maxTurnRate: 0 }), /max_turn_rate/);
});

test('an ideal robot steered by the follower walks around the corner and meets every walk-corner check', async () => {
  // Kinematic check only: a unicycle that turns exactly as commanded, at the controller
  // rate of the example profiles. It shows the rule and its values can pass the scenario;
  // it says nothing about a real robot or controller.
  const p = await json(CORNER + 'parameters.json');
  const world = await json(WORLD);
  const places = placesOf(world);
  const route = places['route-centreline'].points;
  const walls = world.geometry.filter(g => g.role === 'wall');
  const corner = places.corner;
  const t = p.command.turn_rate;
  const options = { forward: p.parameters.command_speed.value, lookahead: t.lookahead.value, maxTurnRate: t.max_turn_rate.value };
  const limits = resolve(p, (await json(CORNER + 'parameter-cases.json')).cases[2].inputs).limits; // T1, the tightest
  let [x, y] = places['spawn-entrance'].position;
  let yaw = places['spawn-entrance'].yaw_deg * Math.PI / 180;
  const dt = 0.02;
  let time = 0, entered = null, exitTime = null, maxDistance = 0, minWallGap = Infinity, maxTurn = 0;
  while (time < limits.time_limit && exitTime === null) {
    const [v, , w] = followRoute(route, [x, y], yaw, options);
    maxTurn = Math.max(maxTurn, Math.abs(w));
    const next = [x + v * Math.cos(yaw) * dt, y + v * Math.sin(yaw) * dt];
    yaw += w * dt;
    time += dt;
    if (crossesExit([x, y], next, route, places.exit)) exitTime = time;
    [x, y] = next;
    if (entered === null && x >= corner.x[0] && x <= corner.x[1] && y >= corner.y[0] && y <= corner.y[1]) entered = time;
    maxDistance = Math.max(maxDistance, distanceToRoute(route, [x, y]));
    for (const wall of walls) {
      const dx = Math.max(Math.abs(x - wall.centre[0]) - wall.size[0] / 2, 0);
      const dy = Math.max(Math.abs(y - wall.centre[1]) - wall.size[1] / 2, 0);
      minWallGap = Math.min(minWallGap, Math.hypot(dx, dy));
    }
  }
  assert.ok(exitTime !== null && exitTime <= limits.time_limit, `exit at ${exitTime}`);
  assert.ok(entered !== null && entered <= exitTime, `corner at ${entered}`);
  assert.ok(maxDistance < 0.2 && maxDistance <= limits.lateral_limit, `route distance ${maxDistance}`);
  assert.ok(minWallGap > 0.5, `wall gap ${minWallGap}`);
  assert.ok(maxTurn <= options.maxTurnRate && maxTurn > 0.5, `turn rate ${maxTurn}`);
});

test('the command schema accepts the follower only in route-follower mode', async () => {
  const validate = await parametersValidator();
  const corner = await json(CORNER + 'parameters.json');
  const hallway = await json(HALLWAY + 'parameters.json');
  const bad = [
    [corner, p => { p.command.mode = 'constant'; }],
    [corner, p => { p.command.turn_rate = 0; }],
    [corner, p => { p.command.turn_rate.rule = 'stanley'; }],
    [corner, p => { p.command.turn_rate.lookahead.value = 0; }],
    [corner, p => { p.command.turn_rate.lookahead.unit = 'cm'; }],
    [corner, p => { p.command.turn_rate.max_turn_rate.unit = 'deg/s'; }],
    [corner, p => { delete p.command.turn_rate.max_turn_rate; }],
    [corner, p => { p.command.turn_rate.gain = 2; }],
    [hallway, p => { p.command.turn_rate = structuredClone(corner.command.turn_rate); }],
  ];
  for (const [good, mutate] of bad) {
    const p = structuredClone(good);
    mutate(p);
    assert.equal(validate(p), false, mutate.toString());
  }
  // The reference checker reports the same mistakes when the schema is not run.
  const unchecked = structuredClone(corner);
  unchecked.command.turn_rate.rule = 'stanley';
  unchecked.command.turn_rate.lookahead.value = 0;
  const errors = referenceErrors(unchecked);
  assert.ok(errors.some(e => /needs rule pure-pursuit-v1, got stanley/.test(e)), JSON.stringify(errors));
  assert.ok(errors.some(e => /turn_rate\.lookahead must be greater than 0/.test(e)), JSON.stringify(errors));
});
