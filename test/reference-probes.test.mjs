// SPDX-License-Identifier: Apache-2.0
// Independent probes for the two references, beyond the conformance case files:
// rounding at .5 ties and one ulp either side, half-even against half-up, tiny,
// negative and large values, -0, NaN and infinities, command_speed <= 0, extra
// reference-error mutations, and route geometry edge cases on three routes.
// Every probe runs in JavaScript and in Python (test/python/probe_cases.py), and
// the results must be bit-identical: numbers are compared as IEEE 754 bit patterns.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { crossesExit, distanceToRoute } from '../tooling/world-layout.mjs';
import {
  evaluate, quantizeHalfUpDecimalText, referenceErrors, resolve, roundHalfEvenBinary,
  ScenarioParameterError,
} from '../tooling/scenario-parameters.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

const bits = x => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  return Array.from(new Uint8Array(view.buffer), b => b.toString(16).padStart(2, '0')).join('');
};
const fromBits = hex => {
  const view = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < 8; i++) view.setUint8(i, parseInt(hex.slice(2 * i, 2 * i + 2), 16));
  return view.getFloat64(0);
};
// Integers travel as plain JSON numbers, as a JSON file would carry them, so Python reads
// them as int (decimals must be an int); every other number travels as its bit pattern.
const wire = v => typeof v === 'number' ? (Number.isSafeInteger(v) && !Object.is(v, -0) ? v : { f64: bits(v) })
  : Array.isArray(v) ? v.map(wire)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, wire(x)]))
  : v;
const encode = v => typeof v === 'number' ? { f64: bits(v) }
  : Array.isArray(v) ? v.map(encode)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]))
  : v;
const decode = v => Array.isArray(v) ? v.map(decode)
  : v && typeof v === 'object' ? (Object.keys(v).length === 1 && 'f64' in v ? fromBits(v.f64)
    : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)])))
  : v;
const nextUp = x => { const v = new DataView(new ArrayBuffer(8)); v.setFloat64(0, x); v.setBigUint64(0, v.getBigUint64(0) + (x >= 0 ? 1n : -1n)); return v.getFloat64(0); };
const nextDown = x => { const v = new DataView(new ArrayBuffer(8)); v.setFloat64(0, x); v.setBigUint64(0, v.getBigUint64(0) + (x > 0 ? -1n : 1n)); return v.getFloat64(0); };

const OPERATIONS = {
  round: (value, decimals) => roundHalfEvenBinary(value, decimals),
  quantize: (value, decimals) => String(quantizeHalfUpDecimalText(value, decimals)),
  resolve: (parameters, raw) => resolve(parameters, raw),
  evaluate: (expr, parameters) => evaluate(expr, parameters, {}),
  reference_errors: parameters => referenceErrors(parameters),
  distance: (points, point) => distanceToRoute(points, point),
  crosses: (p0, p1, points, exit) => crossesExit(p0, p1, points, exit),
};
function runJs([operation, args]) {
  try {
    return { ok: encode(OPERATIONS[operation](...decode(args))) };
  } catch (error) {
    if (error instanceof ScenarioParameterError) return { status: error.status, message: error.message };
    return { crash: error.constructor.name };
  }
}
function runPython(probes) {
  const python = process.env.SCENARIO_PARAMETERS_PYTHON || 'python3';
  const env = { ...process.env };
  if (!process.env.SCENARIO_PARAMETERS_PYTHON) env.PYTHONPATH = `${root}/python`;
  const child = spawnSync(python, [`${root}/test/python/probe_cases.py`], {
    cwd: root, env, input: JSON.stringify({ probes }), encoding: 'utf8', maxBuffer: 1 << 28,
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  return JSON.parse(child.stdout);
}
function assertSame(probes) {
  const py = runPython(probes);
  assert.equal(py.length, probes.length);
  const differ = probes.flatMap((probe, i) => {
    const js = runJs(probe);
    return JSON.stringify(js) === JSON.stringify(py[i]) ? [] : [{ probe: JSON.stringify(probe).slice(0, 300), js, py: py[i] }];
  });
  assert.equal(differ.length, 0, `${differ.length} of ${probes.length} probes differ, first: ${JSON.stringify(differ.slice(0, 3), null, 1)}`);
}
const num = x => wire(x);

// Rounding values: decimal ties (m + 0.5) / 10^d and one ulp either side, exact binary
// ties, tiny, negative and zero values. JavaScript computes the rounded decimal as
// q / 10^d in doubles, which is exact only while q < 2^53, so the probes stay there.
function roundingValues() {
  const values = new Set([0, -0, 5e-324, -5e-324, 1e-10, 1e-7, 4.9e-7, 5e-7, 0.1, 0.2, 0.3, 0.40625, 0.21875, 2.675,
    0.125, 0.375, 2.5, 3.5, -2.5, 27, 27.000049999999998, 1.0295, 1.0305, 1.4995, 1.5005, 0.0005, 0.0015, 0.0025, 1e15 + 0.5, 4503599627370495.5]);
  for (let d = 0; d <= 9; d++) {
    for (const m of [0, 1, 2, 3, 5, 7, 12, 25, 125, 2675, 4064, 4795, 21875, 40625]) {
      const x = (m + 0.5) / 10 ** d;
      for (const v of [x, -x, nextUp(x), nextDown(x)]) values.add(v);
    }
  }
  for (let e = -12; e < 12; e++) { values.add(2 ** e); values.add(3 * 2 ** e); values.add(-5 * 2 ** (e - 3)); }
  return [...values];
}

test('both references round and quantize every probe identically, bit for bit', () => {
  const probes = [];
  for (const v of roundingValues()) {
    for (let d = 0; d <= 9; d++) {
      if (Math.abs(v) * 10 ** d < 2 ** 53) probes.push(['round', [num(v), d]]);
      if (Math.abs(v) * 10 ** d < 1e27) probes.push(['quantize', [num(v), d]]);
    }
  }
  for (const v of [NaN, Infinity, -Infinity]) probes.push(['round', [num(v), 4]], ['quantize', [num(v), 3]]);
  assert.ok(probes.length > 4000);
  assertSame(probes);
});

test('half-even and half-up differ where the schema says they do', () => {
  assert.equal(roundHalfEvenBinary(0.40625, 4), 0.4062);
  assert.equal(roundHalfEvenBinary(0.21875, 4), 0.2188);
  assert.equal(roundHalfEvenBinary(2.5, 0), 2);
  assert.equal(roundHalfEvenBinary(-2.5, 0), -2);
  assert.equal(roundHalfEvenBinary(2.675, 2), 2.67); // binary value is below the tie
  assert.ok(Object.is(roundHalfEvenBinary(-1e-9, 4), 0));
  assert.equal(quantizeHalfUpDecimalText(2.5, 0), 3n);
  assert.equal(quantizeHalfUpDecimalText(-2.5, 0), -3n);
  assert.equal(quantizeHalfUpDecimalText(2.675, 2), 268n); // decimal text is the tie
  assert.equal(quantizeHalfUpDecimalText(-0.0005, 3), -1n);
  assert.equal(quantizeHalfUpDecimalText(-0, 3), 0n);
});

test('both references resolve extra inputs, decimals and command speeds identically', async () => {
  const parameters = await json('../specs/scenarios/walk-hallway/parameters.json');
  const cases = await json('../specs/scenarios/walk-hallway/parameter-cases.json');
  const base = cases.cases[0].inputs;
  const probes = cases.cases.map(item => ['resolve', [num(parameters), num(item.inputs)]]);
  const widths = [0.52, 0.282, 0.541, 0.6875, 1.0625, 0.6871, 1.0295, 1.0305, 0.0005, 0.0015, 1.4995, 1.5005, 0.12345,
    1e-7, 5e-5, 1e-300, 0, -0, -0.52, -1.0305, 1, 2, nextUp(0.6875), nextDown(0.6875), nextUp(1.0295), nextDown(1.0295),
    NaN, Infinity, -Infinity];
  for (const w of widths) {
    for (const robot_class of ['humanoid', 'quadruped']) {
      probes.push(['resolve', [num(parameters), num({ ...base, robot_class, robot_width: { value: w, unit: 'm' } })]]);
    }
    probes.push(['resolve', [num(parameters), num({ ...base, robot_width: w })]]);
  }
  for (const clear_width of [1.5, 1.13, 1.4, 0.001, 0, -0, -1.5, 3, 2.675, NaN]) {
    probes.push(['resolve', [num(parameters), num({ ...base, clear_width })]]);
  }
  for (const route_length of [5.5, 5.53125, 0, -0, -5.5, 1e-9, 1e300, 5.500025, 5.50005, 2.675, 6, Infinity]) {
    probes.push(['resolve', [num(parameters), num({ ...base, route_length })]]);
  }
  for (const robot_class of ['', 'Humanoid', 'wheeled', '__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    probes.push(['resolve', [num(parameters), num({ ...base, robot_class })]]);
  }
  for (const value of [0.5, 0, -0, -0.5, -1e-300, 5e-324, 1e-300, 1e-308, NaN, -Infinity, 1, 0.3, 0.1]) {
    const trial = structuredClone(parameters);
    trial.parameters.command_speed.value = value;
    for (const item of cases.cases.slice(0, 3)) probes.push(['resolve', [num(trial), num(item.inputs)]]);
  }
  for (let d = 0; d <= 9; d++) {
    const rounded = structuredClone(parameters);
    rounded.limits.lateral_limit.round.decimals = d;
    const quantized = structuredClone(parameters);
    quantized.preconditions.fits_width.quantize.decimals = d;
    for (const w of [0.6875, 1.0625, 0.6871, 0.541, 0.123456789]) {
      probes.push(['resolve', [num(rounded), num({ ...base, robot_width: { value: w, unit: 'm' } })]]);
    }
    for (const w of [1.0295, 1.0305, 1.03, 1.0315, 1.13]) {
      probes.push(['resolve', [num(quantized), num({ ...base, clear_width: 1.13, robot_width: { value: w, unit: 'm' } })]]);
    }
  }
  for (const expr of [{ op: 'div', args: [1, 0] }, { op: 'div', args: [-1, 0] }, { op: 'div', args: [0, 0] },
    { op: 'div', args: [-0, 1] }, { op: 'mul', args: [1e308, 10] }, { op: 'sub', args: [0.3, 0.1] }, { op: 'add', args: [0.1, 0.2] },
    { op: 'add', args: [1, 2, 3, 4] }, { op: 'sub', args: [10, 1, 2] }, { op: 'div', args: [1, 3] }, { op: 'mul', args: [-0, 5] },
    { op: 'pow', args: [2, 3] }, 7, 2.5, -0, { parameter: 'command_speed' }, { parameter: 'trials' }, { parameter: 'nope' }]) {
    probes.push(['evaluate', [num(expr), num(parameters)]]);
  }
  assertSame(probes);
});

test('command_speed <= 0 or NaN is the same ERROR in both references, even when no limit uses it', async () => {
  const parameters = await json('../specs/scenarios/walk-hallway/parameters.json');
  const cases = await json('../specs/scenarios/walk-hallway/parameter-cases.json');
  const unused = structuredClone(parameters);
  unused.limits.time_limit.expression = 30;
  for (const value of [0, -0, -0.5, -1e-300, NaN, -Infinity]) {
    for (const doc of [parameters, unused]) {
      const trial = structuredClone(doc);
      trial.parameters.command_speed.value = value;
      assert.throws(() => resolve(trial, cases.cases[0].inputs),
        error => error instanceof ScenarioParameterError && error.status === 'ERROR'
          && error.message === 'command_speed must be greater than 0', String(value));
    }
  }
  const probes = [0, -0, -0.5, -1e-300, NaN, -Infinity].map(value => {
    const trial = structuredClone(unused);
    trial.parameters.command_speed.value = value;
    return ['resolve', [num(trial), num(cases.cases[0].inputs)]];
  });
  assertSame(probes);
});

test('both references report the same problems for extra reference-error mutations', async () => {
  const parameters = await json('../specs/scenarios/walk-hallway/parameters.json');
  const probes = [];
  const mutate = edit => { const copy = structuredClone(parameters); edit(copy); probes.push(['reference_errors', [num(copy)]]); return copy; };
  const fits = p => p.preconditions.fits_width.condition.args[0].args[1];
  // Bare numbers under quantize, schema-valid. Values below 1e-4 are left out: Python
  // prints them in exponent form (5e-05) where JavaScript prints 0.00005.
  for (const v of [0.5, 2.5, -0.5, 0.1, 0.0001, 123.456, 2, -2, -0]) mutate(p => { fits(p).args[0] = v; });
  mutate(p => { p.parameters.wall_clearance.by = 'robot_width'; });
  mutate(p => { p.parameters.wall_clearance.by = 'nope'; });
  mutate(p => { p.limits.lateral_limit.expression.args[0].args[0] = { input: 'hallway_width' }; });
  mutate(p => { p.limits.fall_height.expression = { input: 'robot_class' }; });
  mutate(p => { p.limits.time_limit.expression.args[0].args[1] = { parameter: 'speed' }; });
  mutate(p => { p.limits.time_limit.expression.args[0].args[1] = { parameter: 'trials' }; });
  mutate(p => { p.preconditions.fits_width.condition.args[1] = { op: 'div', args: [{ input: 'clear_width' }, 1] }; });
  mutate(p => { p.checks[1].limit = 'lateral'; });
  mutate(p => { p.command.forward = { input: 'nope' }; });
  mutate(p => { p.command.sideways = { parameter: 'nope' }; });
  mutate(p => { p.checks[0].limit = 'x'; p.limits.fall_height.expression = { input: 'y' }; });
  mutate(p => { p.limits.fall_height.expression = null; });
  mutate(p => { p.limits.time_limit.expression = { op: 'pow', args: [2, 3] }; });
  mutate(p => { p.limits.time_limit.expression = { args: [2, 3] }; });
  mutate(p => { p.preconditions.fits_width.condition.op = 'eq'; });
  // Whole numbers (2, -2, -0) are allowed under quantize; every other mutation is a problem.
  probes.forEach(([, [doc]], i) => assert.equal(referenceErrors(decode(doc)).length > 0, ![6, 7, 8].includes(i), `mutation ${i}`));
  assertSame(probes);
});

// Routes: straight, L turning left, the same L turning right, a U, an obtuse and an acute turn.
const ROUTES = {
  hallway: { points: [[-3, 0, 0], [3, 0, 0]], exit: { points: [[3, -0.75, 0], [3, 0.75, 0]], reference: [3, 0, 0] } },
  left: { points: [[-3, 0, 0], [0, 0, 0], [0, 3, 0]], exit: { points: [[-0.75, 3, 0], [0.75, 3, 0]], reference: [0, 3, 0] } },
  right: { points: [[-3, 0, 0], [0, 0, 0], [0, -3, 0]], exit: { points: [[0.75, -3, 0], [-0.75, -3, 0]], reference: [0, -3, 0] } },
  u: { points: [[-3, 0, 0], [0, 0, 0], [0, 3, 0], [-3, 3, 0]], exit: { points: [[-3, 2.25, 0], [-3, 3.75, 0]], reference: [-3, 3, 0] } },
  noReference: { points: [[-3, 0, 0], [3, 0, 0]], exit: { points: [[3, -0.75, 0], [3, 0.75, 0]] } },
};
const GRID = [-4, -3, -1.5, -1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.5, 2.5, 3, 3.5, 4];
// Points whose nearest route point is a corner vertex give an irrational distance; the
// two references compute it with different hypot routines, so only exact cases are here.
const cornerWedge = (route, [x, y]) => (route === 'left' && x > 0 && y < 0) || (route === 'right' && x > 0 && y > 0)
  || (route === 'u' && x > 0 && (y < 0 || y > 3));

test('both references give identical route distances and crossings on extra routes and steps', () => {
  const probes = [];
  for (const [name, route] of Object.entries(ROUTES)) {
    for (const x of GRID) for (const y of GRID) {
      if (!cornerWedge(name, [x, y])) probes.push(['distance', [num(route.points), num([x, y, 0])]]);
    }
    for (const point of [[0.75, -1], [1, -0.75], [1.5, -2], [3, -4], [0.75, 1], [3, 4]]) {
      probes.push(['distance', [num(route.points), num([...point, 0])]]);
    }
    const steps = GRID.filter((_, i) => i % 2 === 0);
    for (const x0 of steps) for (const y0 of steps) for (const x1 of steps) for (const y1 of [-1, -0.75, 0, 0.75, 1, 3]) {
      probes.push(['crosses', [num([x0, y0, 0]), num([x1, y1, 0]), num(route.points), num(route.exit)]]);
    }
  }
  assertSame(probes);
});

// The sample rule on the straight route: p0 strictly before x = 3, and p1 at x >= 3
// with |y| <= 0.75. The meeting point is not tested. The L and right-turn routes must
// give the same answers for the same steps rotated into their exit frames.
const STEPS = [
  ['crosses inside the segment', [2.9, 0], [3.1, 0], true],
  ['starts exactly on the line', [3, 0], [3.2, 0], false],
  ['lands exactly on the line', [2.9, 0], [3, 0], true],
  ['steps back off the line', [3, 0], [2.9, 0], false],
  ['crosses again after stepping back', [2.9, 0], [3.1, 0], true],
  ['returns from past the line', [3.1, 0], [2.9, 0], false],
  ['zero-length step before the line', [2.9, 0], [2.9, 0], false],
  ['zero-length step on the line', [3, 0], [3, 0], false],
  ['zero-length step past the line', [3.1, 0], [3.1, 0], false],
  ['beyond the + endpoint', [2.9, 0.8], [3.1, 0.8], false],
  ['beyond the - endpoint', [2.9, -0.8], [3.1, -0.8], false],
  ['on the + endpoint', [2.9, 0.75], [3.1, 0.75], true],
  ['on the - endpoint', [2.9, -0.75], [3.1, -0.75], true],
  ['along the line', [3, -0.5], [3, 0.5], false],
  ['backward across the line', [3.1, 0.25], [2.9, 0.25], false],
  // Meeting point on the segment, second sample outside: does not cross.
  ['meeting point on the endpoint, second sample outside', [2.5, 0], [3.5, 1.5], false],
  ['meeting point inside, second sample outside', [2.9, 0.7], [3.5, 0.95], false],
  ['one centimetre step, second sample outside', [2.996, 0.7475], [3.006, 0.7505], false],
  // Meeting point outside the segment, second sample inside: does cross.
  ['meeting point outside, second sample inside', [2, 2], [4, 0], true],
  ['meeting point outside the band, second sample inside', [2.8, 0.9], [3.2, 0.7], true],
  ['one centimetre step, second sample inside', [2.996, 0.7525], [3.006, 0.7495], true],
];
const toLeft = ([x, y]) => [-y, x];
const toRight = ([x, y]) => [y, -x];

test('a step crosses the exit by the documented rule, the same on left and right turns', () => {
  for (const [name, p0, p1, expected] of STEPS) {
    assert.equal(crossesExit(p0, p1, ROUTES.hallway.points, ROUTES.hallway.exit), expected, name);
    assert.equal(crossesExit(toLeft(p0), toLeft(p1), ROUTES.left.points, ROUTES.left.exit), expected, `left: ${name}`);
    assert.equal(crossesExit(toRight(p0), toRight(p1), ROUTES.right.points, ROUTES.right.exit), expected, `right: ${name}`);
  }
  // A sequence that lands, steps back and crosses again has two crossing steps; the
  // measure takes the first one, so a consumer must stop at the first true step.
  const walk = [[2.9, 0], [3, 0], [2.95, 0], [3.05, 0], [3.2, 0]];
  assert.deepEqual(walk.slice(1).map((p, i) => crossesExit(walk[i], p, ROUTES.hallway.points, ROUTES.hallway.exit)),
    [true, false, true, false]);
  const probes = STEPS.flatMap(([, p0, p1]) => [['crosses', [num(p0), num(p1), num(ROUTES.hallway.points), num(ROUTES.hallway.exit)]],
    ['crosses', [num(toLeft(p0)), num(toLeft(p1)), num(ROUTES.left.points), num(ROUTES.left.exit)]],
    ['crosses', [num(toRight(p0)), num(toRight(p1)), num(ROUTES.right.points), num(ROUTES.right.exit)]]]);
  assertSame(probes);
});

test('route distance is |y| on the straight route, continuous round a corner and mirror-symmetric', () => {
  for (const x of [-10, -3, -1e-9, 0, 1.234, 3, 3.5, 10]) {
    for (const y of [-0.75, -0.49, -1e-6, 1e-6, 0.4795, 0.49, 0.609, 0.75, 2]) {
      assert.equal(distanceToRoute(ROUTES.hallway.points, [x, y, 0]), Math.abs(y), `${x}, ${y}`);
    }
    // Below a micrometre the foot point's rounding (about 4e-16 m) can show.
    for (const y of [-1e-9, 0, 1e-9]) assert.ok(Math.abs(distanceToRoute(ROUTES.hallway.points, [x, y, 0]) - Math.abs(y)) < 1e-15);
  }
  const radius = 0.3, steps = 4000;
  let previous = distanceToRoute(ROUTES.left.points, [radius, 0]), largest = 0;
  for (let i = 1; i <= steps; i++) {
    const angle = 2 * Math.PI * i / steps;
    const point = [radius * Math.cos(angle), radius * Math.sin(angle)];
    const here = distanceToRoute(ROUTES.left.points, point);
    largest = Math.max(largest, Math.abs(here - previous));
    previous = here;
    assert.equal(distanceToRoute(ROUTES.right.points, [point[0], -point[1]]), here, `mirror at step ${i}`);
    assert.ok(here <= radius + 1e-15);
  }
  assert.ok(largest <= 2 * Math.PI * radius / steps + 1e-12, `largest jump ${largest}`);
  // Outside the corner the distance is from the vertex, not from an extended leg.
  assert.equal(distanceToRoute(ROUTES.left.points, [0.75, -1]), 1.25);
  assert.equal(distanceToRoute(ROUTES.left.points, [1, 0]), 1);
  assert.equal(distanceToRoute(ROUTES.left.points, [0, -1]), 1);
  // Inside the corner it is from the nearer leg.
  assert.equal(distanceToRoute(ROUTES.left.points, [-0.5, 0.25]), 0.25);
  assert.equal(distanceToRoute(ROUTES.left.points, [-0.49, 0.49]), 0.49);
  // Outside, (a, -a) is measured from the vertex: a * √2, stricter than the
  // perpendicular distance a to either extended leg by up to √2.
  const a = 0.4;
  const fromVertex = distanceToRoute(ROUTES.left.points, [a, -a]);
  assert.equal(fromVertex, Math.sqrt(a * a + a * a));
  assert.ok(Math.abs(fromVertex / a - Math.SQRT2) < 1e-12);
});

// Probes that differed between the references at 4e673d3: distances measured from a
// corner vertex or along a diagonal leg (hypot routines differ in the last bit), rounding
// once q * 10^decimals passes 2^53, quantizing past 28 significant digits, bare numbers
// below 1e-4 in messages, and division by -0.
test('both references agree on corner, diagonal, large-value and message probes', () => {
  const probes = [];
  const diagonal = { points: [[0, 0, 0], [3, 3, 0]] };
  const obtuse = { points: [[-3, 0, 0], [0, 0, 0], [3, 1, 0]] };
  for (let i = 0; i <= 2000; i++) {
    const angle = 2 * Math.PI * i / 2000;
    for (const radius of [0.3, 0.49, 0.609]) {
      const point = [radius * Math.cos(angle), radius * Math.sin(angle), 0];
      for (const route of [ROUTES.left, ROUTES.right, ROUTES.u, diagonal, obtuse]) probes.push(['distance', [num(route.points), num(point)]]);
    }
  }
  probes.push(['distance', [num(ROUTES.left.points), num([0.0001225, -0.4899999846874998, 0])]]);
  for (const v of [123456789.12345678, 1e12 + 0.12345, 1e15 + 0.5, 4503599627370497, 1e21, 1.7976931348623157e308, -1e300]) {
    for (let d = 0; d <= 9; d++) probes.push(['round', [num(v), d]], ['quantize', [num(v), d]]);
  }
  assertSame(probes);
});

test('both references word bare numbers and division by -0 the same way', async () => {
  const parameters = await json('../specs/scenarios/walk-hallway/parameters.json');
  const probes = [];
  for (const v of [0.00005, 0.00001, 1e-7, 1.5e-10, 1.5e21 + 0.5]) {
    const copy = structuredClone(parameters);
    copy.preconditions.fits_width.condition.args[0].args[1].args[0] = v;
    probes.push(['reference_errors', [num(copy)]]);
  }
  probes.push(['evaluate', [num({ op: 'div', args: [1, -0] }), num(parameters)]]);
  probes.push(['evaluate', [num({ op: 'div', args: [-1, -0] }), num(parameters)]]);
  assertSame(probes);
});

// Schema-valid inputs that reach half-up quantizing past 2^53 units, and past the double
// range: robot-profile dimensions.width and configuration fall_base_height are any JSON
// number, world clear_width any positive number, and quantize decimals go up to 9. Both
// references must resolve them to the same exact result, never crash.
test('both references resolve huge schema-valid widths identically, at 3 and 9 decimals', async () => {
  const parameters = await json('../specs/scenarios/walk-hallway/parameters.json');
  const base = (await json('../specs/scenarios/walk-hallway/parameter-cases.json')).cases[0].inputs;
  const probes = [];
  for (const decimals of [3, 9]) {
    const doc = structuredClone(parameters);
    doc.preconditions.fits_width.quantize.decimals = decimals;
    for (const width of [9007199254.740993, 9007199254740.993, 1e25, 1.8e305, 1.7976931348623157e308]) {
      probes.push(['resolve', [num(doc), num({ ...base, robot_width: { value: width, unit: 'm' } })]]);
      probes.push(['resolve', [num(doc), num({ ...base, clear_width: width, robot_width: { value: width, unit: 'm' } })]]);
      probes.push(['resolve', [num(doc), num({ ...base, clear_width: width })]]);
    }
  }
  const results = probes.map(runJs);
  assert.ok(results.every(r => 'ok' in r || r.status === 'ERROR'), JSON.stringify(results.find(r => 'crash' in r)));
  assertSame(probes);
});

// Exit steps whose second sample sits on, or one or two ulps either side of, an exit
// endpoint or the reference, on straight, L, diagonal, obtuse and skewed-exit routes.
test('both references agree on exit steps one ulp around the segment ends', () => {
  const routes = [
    ROUTES.hallway, ROUTES.left,
    { points: [[0, 0, 0], [3, 3, 0]], exit: { points: [[3 - 0.53, 3 + 0.53, 0], [3 + 0.53, 3 - 0.53, 0]] } },
    { points: [[-3, 0, 0], [0, 0, 0], [3, 1, 0]], exit: { points: [[3.3, 0.1, 0], [2.7, 1.9, 0]], reference: [3, 1, 0] } },
    { points: [[-3, 0, 0], [3, 0, 0]], exit: { points: [[3.2, -0.75, 0], [2.8, 0.75, 0]], reference: [3, 0, 0] } },
  ];
  const step = (x, k) => { for (let i = 0; i < Math.abs(k); i++) x = k > 0 ? nextUp(x) : nextDown(x); return x; };
  const probes = [];
  for (const route of routes) {
    const [a, b] = route.exit.points;
    const ref = route.exit.reference ?? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0];
    const [l0, l1] = route.points.slice(-2);
    const n = Math.hypot(l1[0] - l0[0], l1[1] - l0[1]), u = [(l1[0] - l0[0]) / n, (l1[1] - l0[1]) / n];
    for (const end of [a, b, ref]) for (let f = -6; f <= 6; f++) for (const k of [-2, -1, 0, 1, 2]) for (const back of [1e-9, 0.01, 0.5]) {
      const p1 = [step(end[0] + f * 0.001 * u[1], k), step(end[1] - f * 0.001 * u[0], k), 0];
      const p0 = [p1[0] - back * u[0] + 0.03 * f * u[1], p1[1] - back * u[1] - 0.03 * f * u[0], 0];
      probes.push(['crosses', [num(p0), num(p1), num(route.points), num(route.exit)]]);
    }
  }
  assertSame(probes);
});

// Outside a corner the route distance is measured from the vertex. At the corner of the
// wall-clear region (perpendicular distance L to both extended legs) it is L / cos(φ/2)
// for a turn of φ: √2 at a right angle, less for gentler turns, more for sharper ones.
test('outside-corner strictness is 1 / cos(φ/2): √2 only at a right-angle turn', () => {
  const limit = 0.49;
  for (const [last, factor] of [[[0, 3], Math.SQRT2], [[3, 1], null], [[-2, 2], null]]) {
    const route = [[-3, 0, 0], [0, 0, 0], [...last, 0]];
    const n = Math.hypot(...last), u = [last[0] / n, last[1] / n];
    const phi = Math.acos(u[0]);
    const n2 = [u[1], -u[0]];
    const det = 0 * n2[1] - (-1) * n2[0];
    const corner = [(limit * n2[1] - limit * -1) / det, (0 * limit - n2[0] * limit) / det];
    const ratio = distanceToRoute(route, corner) / limit;
    assert.ok(Math.abs(ratio - 1 / Math.cos(phi / 2)) < 1e-12, `${last}: ${ratio}`);
    if (factor) assert.ok(Math.abs(ratio - factor) < 1e-12);
  }
  assert.ok(distanceToRoute([[-3, 0, 0], [0, 0, 0], [-2, 2, 0]], [1.183, -0.49]) / 0.49 > 2.6);
});
