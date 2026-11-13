// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { crossesExit, distanceToRoute, routeLength } from '../tooling/world-layout.mjs';
import {
  evaluate, quantizeHalfUpDecimalText, referenceErrors, resolve, roundHalfEvenBinary,
  ScenarioParameterError,
} from '../tooling/scenario-parameters.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

function parameterResult(parameters, raw) {
  try {
    const result = resolve(parameters, raw);
    return { status: 'ok', limits: result.limits, preconditions: result.preconditions, inputs: result.inputs };
  } catch (error) {
    if (!(error instanceof ScenarioParameterError)) throw error;
    return { status: error.status, message: error.message };
  }
}

test('JavaScript and Python give the same results for every parameter and geometry case', async () => {
  const parameters = await json('../specs/scenarios/walk-hallway/parameters.json');
  const cases = await json('../specs/scenarios/walk-hallway/parameter-cases.json');
  const geometry = await json('../specs/scenarios/route-geometry-cases.json');
  const hallway = await json('../test/fixtures/worlds/hallway-open-0.1.0.world.json');
  const corner = await json('../test/fixtures/worlds/l-shaped.world.json');
  const sample = cases.cases[0].inputs;
  const halfEven = [[0.40625, 4], [0.21875, 4], [2.675, 2], [-0.40625, 4], [27, 4]];
  const halfUp = [[1.0295, 3], [1.0305, 3], [-0.0005, 3], [1e-7, 3], [1.03, 3], [0.05, 3], [1.13, 3]];
  const mutations = {};
  const mutate = (name, edit) => {
    const copy = structuredClone(parameters);
    edit(copy);
    mutations[name] = copy;
  };
  mutate('by_not_category', p => { p.parameters.wall_clearance.by = 'robot_width'; });
  mutate('bare_number', p => { p.preconditions.fits_width.condition.args[0].args[1].args[0] = 0.5; });
  mutate('not_an_expression', p => { p.limits.fall_height.expression = null; });
  mutate('unknown_input', p => { p.limits.lateral_limit.expression.args[0].args[0] = { input: 'hallway_width' }; });
  mutate('input_not_quantity', p => { p.limits.fall_height.expression = { input: 'robot_class' }; });
  mutate('unknown_parameter', p => { p.limits.time_limit.expression.args[0].args[1] = { parameter: 'speed' }; });
  mutate('parameter_not_numeric', p => { p.limits.time_limit.expression.args[0].args[1] = { parameter: 'trials' }; });
  mutate('unknown_operator', p => { p.limits.time_limit.expression = { op: 'pow', args: [2, 3] }; });
  mutate('quantize_div', p => { p.preconditions.fits_width.condition.args[1] = { op: 'div', args: [{ input: 'clear_width' }, 1] }; });
  mutate('unknown_comparison', p => { p.preconditions.fits_width.condition.op = 'eq'; });
  mutate('check_limit', p => { p.checks[1].limit = 'lateral'; });
  mutate('command_reference', p => { p.command.forward = { input: 'nope' }; });

  const python = process.env.SCENARIO_PARAMETERS_PYTHON || 'python3';
  const env = { ...process.env };
  if (!process.env.SCENARIO_PARAMETERS_PYTHON) env.PYTHONPATH = `${root}/python`;
  const child = spawnSync(python, [`${root}/test/python/dump_cases.py`], {
    cwd: root,
    env,
    input: JSON.stringify({ rounding: { half_even: halfEven, half_up: halfUp }, mutations }),
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const py = JSON.parse(child.stdout);

  const jsParameters = cases.cases.map(item => ({ name: item.name, ...parameterResult(parameters, item.inputs) }));
  assert.equal(jsParameters.length, 20);
  assert.equal(jsParameters.filter(item => item.status === 'ERROR').length, 6);
  assert.deepEqual(py.parameters, jsParameters);

  const jsGeometry = geometry.cases.map(item => ({
    name: item.name,
    distances: item.distances.map(query => distanceToRoute(item.route, query.point)),
    crossings: item.crossings.map(query => crossesExit(query.p0, query.p1, item.route, item.exit)),
  }));
  assert.deepEqual(py.geometry, jsGeometry);
  assert.deepEqual(py.route_length, [
    { name: 'hallway-open', length: routeLength(hallway, parameters.places) },
    { name: 'l-shaped', length: routeLength(corner, { start: 'spawn-entrance', route: 'route-centreline' }) },
  ]);
  assert.deepEqual(py.speed, [0, -0.5].map(value => {
    const trial = structuredClone(parameters);
    trial.parameters.command_speed.value = value;
    return { value, ...parameterResult(trial, sample) };
  }));
  let divideByZero;
  try {
    evaluate({ op: 'div', args: [1, 0] }, parameters, {});
  } catch (error) {
    divideByZero = { status: error.status, message: error.message };
  }
  assert.deepEqual(py.divide_by_zero, divideByZero);
  assert.deepEqual(py.rounding, {
    half_even: halfEven.map(([value, decimals]) => roundHalfEvenBinary(value, decimals)),
    half_up: halfUp.map(([value, decimals]) => Number(quantizeHalfUpDecimalText(value, decimals))),
  });
  const jsMutations = Object.fromEntries(Object.entries(mutations).map(([name, doc]) => [name, referenceErrors(doc)]));
  assert.deepEqual(py.mutations, jsMutations);
  for (const errors of Object.values(jsMutations)) assert.ok(errors.length > 0);
});
