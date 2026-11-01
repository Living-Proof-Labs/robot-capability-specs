// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, compare, expectedPass, EXIT, QUANTITIES, SCHEMA } from '../tooling/compare-results.mjs';

// Hand-written fixtures hold a few quantities per kind; complete() adds every other
// required name as a synthetic pass so records are complete without a 1000-line file.
const DIR = 'test/fixtures/hallway-results/';
function complete(record) {
  const have = new Set(record.quantities.map(q => q.name));
  if (record.status !== 'UNSUPPORTED') {
    for (const { name, kind, unit, comparison } of QUANTITIES.required) {
      if (!have.has(name)) {
        record.quantities.push({ name, kind, unit, comparison, canonical: 0, measured: 0, deviation: 0,
          tolerance: 0, pass: true, method: 'synthetic test filler' });
      }
    }
  }
  return record;
}
const raw = async (name = 'mujoco') => JSON.parse(await readFile(DIR + name + '.json', 'utf8'));
const load = async (name = 'mujoco') => complete(await raw(name));
const cli = (...args) => spawnSync(process.execPath, ['tooling/compare-results.mjs', ...args], { encoding: 'utf8' });
async function tmpFile(record) {
  const path = join(await mkdtemp(join(tmpdir(), 'result-')), 'result.json');
  await writeFile(path, JSON.stringify(record));
  return path;
}

test('result schema is livingproof-world-result/0.2 published next to hallways.md', () => {
  assert.equal(SCHEMA.properties.format.const, 'livingproof-world-result/0.2');
  assert.equal(SCHEMA.title, 'livingproof-world-result/0.2');
  assert.match(SCHEMA.$id, /robot-capability-specs\/specs\/worlds\/hallway-result\.schema\.json$/);
});

test('hand-written fixtures are small, valid and complete once filled', async () => {
  for (const name of ['mujoco', 'gazebo', 'gazebo-fail', 'gazebo-unsupported', 'mujoco-unsupported']) {
    const r = await raw(name);
    assert.ok(r.quantities.length <= 10, name);
    assert.deepEqual(check(complete(r)), [], name);
  }
  const kinds = new Set((await raw()).quantities.map(q => q.kind));
  assert.deepEqual([...kinds].sort(), ['collision', 'dimension', 'drive', 'frame', 'place']);
});

test('PASS grade lists each engine value, deviation and MuJoCo minus Gazebo', async () => {
  const result = compare(await load('mujoco'), await load('gazebo'));
  assert.equal(result.grade, 'PASS');
  assert.deepEqual(result.engines, ['mujoco', 'gazebo']);
  const row = result.rows.find(r => r.name === 'collision/floor/penetration');
  assert.deepEqual(row.mujoco, { measured: 0.0043, deviation: 0.0043, pass: true });
  assert.deepEqual(row.gazebo, { measured: 0.006, deviation: 0.006, pass: true });
  assert.ok(Math.abs(row.difference - (0.0043 - 0.006)) < 1e-12);
  assert.equal(result.rows.find(r => r.name === 'place/spawn-exit/yaw').gazebo.deviation, 0.1);
});

test('columns follow the engine field, not argument order', async () => {
  const a = compare(await load('mujoco'), await load('gazebo'));
  const b = compare(await load('gazebo'), await load('mujoco'));
  assert.deepEqual(b.engines, ['mujoco', 'gazebo']);
  assert.deepEqual(b.rows, a.rows);
  const run = cli(await tmpFile(await load('gazebo')), await tmpFile(await load('mujoco')));
  assert.equal(run.status, EXIT.PASS, run.stderr);
  assert.match(run.stdout, /^\| quantity \| canonical \| mujoco \| mujoco deviation \| gazebo \| gazebo deviation \| mujoco - gazebo \| mujoco pass \| gazebo pass \|$/m);
  assert.match(run.stdout, /^\| collision\/floor\/penetration \| 0 \| 0\.0043 \| 0\.0043 \| 0\.006 \| 0\.006 \| -0\.0017 \| true \| true \|$/m);
  assert.match(run.stdout, /^grade: PASS$/m);
});

test('FAIL grade when any required quantity fails in either record, exit 1', async () => {
  const result = compare(await load('gazebo-fail'), await load('mujoco'));
  assert.equal(result.grade, 'FAIL');
  assert.deepEqual(result.failed, ['collision/wall+y/max_speed']);
  for (const order of [['mujoco', 'gazebo-fail'], ['gazebo-fail', 'mujoco']]) {
    const run = cli(...await Promise.all(order.map(async n => tmpFile(await load(n)))));
    assert.equal(run.status, EXIT.FAIL);
    assert.match(run.stdout, /^FAILED collision\/wall\+y\/max_speed$/m);
    assert.match(run.stdout, /^grade: FAIL$/m);
  }
});

test('UNSUPPORTED on either side gives an UNSUPPORTED grade and a non-zero exit', async () => {
  for (const [x, y] of [['mujoco-unsupported', 'gazebo'], ['mujoco', 'gazebo-unsupported'], ['gazebo-unsupported', 'mujoco']]) {
    const result = compare(await load(x), await load(y));
    assert.equal(result.grade, 'UNSUPPORTED', `${x} ${y}`);
    const run = cli(await tmpFile(await load(x)), await tmpFile(await load(y)));
    assert.equal(run.status, EXIT.UNSUPPORTED);
    assert.match(run.stdout, /^UNSUPPORTED (mujoco|gazebo): geometry 'wall-left' type 'cylinder'$/m);
  }
  assert.notEqual(EXIT.UNSUPPORTED, 0);
});

test('CLI exits non-zero on a schema error or a missing required quantity', async () => {
  const good = await tmpFile(await load('gazebo'));
  const bad = await load();
  bad.adapter.version = bad.adapter.commit;
  let run = cli(await tmpFile(bad), good);
  assert.equal(run.status, EXIT.INVALID);
  assert.match(run.stderr, /mujoco: schema: \/adapter\/version must match pattern/);
  const missing = await load();
  missing.quantities = missing.quantities.filter(q => q.name !== 'clear_width');
  run = cli(good, await tmpFile(missing));
  assert.equal(run.status, EXIT.INVALID);
  assert.match(run.stderr, /mujoco: missing required quantity clear_width/);
  assert.match(run.stdout, /^grade: INVALID$/m);
  assert.equal(cli(good).status, EXIT.USAGE);
});

const negative = [
  ['adapter.version as a 40-character SHA', r => { r.adapter.version = r.adapter.commit; }, /\/adapter\/version must match pattern/],
  ['adapter.commit as a short SHA', r => { r.adapter.commit = '696d960'; }, /\/adapter\/commit/],
  ['adapter.commit missing', r => { delete r.adapter.commit; }, /must have required property 'commit'/],
  ['unknown adapter.provenance', r => { r.adapter.provenance = 'checkout'; }, /\/adapter\/provenance must be equal to one of the allowed values/],
  ['old 0.1 format', r => { r.format = 'livingproof-world-result/0.1'; }, /\/format must be equal to constant/],
  ['fixture as a string', r => { r.fixture = 'hallway-open'; }, /\/fixture must be object/],
  ['UNSUPPORTED without feature', r => { r.status = 'UNSUPPORTED'; }, /must have required property 'feature'/],
  ['quantity without comparison', r => { delete r.quantities[0].comparison; }, /must have required property 'comparison'/],
  ['unknown comparison', r => { r.quantities[0].comparison = 'speed_limit'; }, /comparison must be equal to one of the allowed values/],
  ['old open_end name', r => { r.quantities.find(q => q.name === 'collision/open_end/+x/final_x').name = 'collision/open_end/+2.80/final_x'; }, /missing required quantity collision\/open_end\/\+x\/final_x/],
  ['wrong comparison for a required name', r => { r.quantities.find(q => q.name === 'collision/wall+y/max_speed').comparison = 'within'; }, /max_speed comparison is within, expected at_most/],
  ['pass disagrees with comparison', r => { const q = r.quantities.find(x => x.name === 'clear_width'); q.measured = 1.6; q.deviation = 0.1; }, /clear_width pass is true but within gives false/],
  ['duplicate quantity', r => { r.quantities.push(structuredClone(r.quantities[0])); }, /duplicate quantity clear_width/],
];
for (const [name, edit, pattern] of negative) {
  test(`rejects ${name}`, async () => {
    const r = await load();
    edit(r);
    const errors = check(r);
    assert.ok(errors.some(e => pattern.test(e)), errors.join('\n'));
  });
}

test('adapter.commit may be null and provenance is optional', async () => {
  const r = await load();
  r.adapter.commit = null;
  delete r.adapter.provenance;
  assert.deepEqual(check(r), []);
  r.adapter.provenance = 'package';
  assert.deepEqual(check(r), []);
});

test('settled_bottom_z is optional and reset/* names are reserved, not required', async () => {
  const r = await load();
  r.quantities = r.quantities.filter(q => q.name !== 'collision/floor/settled_bottom_z');
  assert.deepEqual(check(r), []);
  assert.deepEqual(QUANTITIES.optional.map(q => q.name), ['collision/floor/settled_bottom_z']);
  assert.deepEqual(QUANTITIES.reserved_prefixes, ['reset/']);
  assert.ok(!QUANTITIES.required.some(q => q.name.startsWith('reset/')));
});

test('one at_most rule covers the speed cap and the penetration limits', () => {
  const atMost = QUANTITIES.required.filter(q => q.comparison === 'at_most').map(q => q.name).sort();
  assert.deepEqual(atMost, [
    'collision/floor/penetration', 'collision/wall+y/max_speed', 'collision/wall+y/surface_past_inner_face',
    'collision/wall-y/max_speed', 'collision/wall-y/surface_past_inner_face',
  ]);
  assert.equal(expectedPass({ comparison: 'at_most', canonical: 0.25, tolerance: 0, measured: 0.2328 }), true);
  assert.equal(expectedPass({ comparison: 'at_most', canonical: 0.25, tolerance: 0, measured: 0.26 }), false);
  assert.equal(expectedPass({ comparison: 'within', canonical: 2.8, tolerance: 0.01, measured: 2.7986 }), true);
});

test('UNSUPPORTED records validate with fixture as an object and compare without rows', async () => {
  const r = await load();
  Object.assign(r, { status: 'UNSUPPORTED', feature: "geometry 'wall-left' type 'cylinder'", quantities: [] });
  assert.deepEqual(check(r), []);
  const result = compare(r, await load('gazebo'));
  assert.equal(result.grade, 'UNSUPPORTED');
  assert.deepEqual(result.unsupported, ["mujoco: geometry 'wall-left' type 'cylinder'"]);
});

test('probe parameters are machine-readable and match hallways.md prose', async () => {
  const probe = JSON.parse(await readFile('specs/worlds/hallway-probe.json', 'utf8'));
  assert.equal(probe.probe.radius_m, 0.10);
  assert.deepEqual(probe.probe.joints, ['slide-x', 'slide-y', 'slide-z']);
  assert.equal(probe.probe.rotation, false);
  assert.equal(probe.probe.friction, 0.1);
  assert.equal(probe.probe.max_speed_m_per_s, 0.25);
  assert.equal(probe.sampling_hz, 500);
  assert.equal(probe.checks.floor.start_z_m, 0.75);
  assert.equal(probe.checks.wall.drive_s, 5);
  assert.equal(probe.checks.open_end.drive_s, 16);
  assert.equal(probe.probe.density_kg_per_m3, 1000);
  assert.ok(Math.abs(probe.probe.mass_kg - 1000 * 4 / 3 * Math.PI * 0.1 ** 3) < 1e-4);
  assert.deepEqual(probe.gravity_m_per_s2, [0, 0, -9.81]);
  assert.equal(probe.checks.floor.settle_s, 2);
  assert.equal(probe.checks.wall.settle_s, 1.5);
  assert.equal(probe.checks.open_end.settle_s, 1.5);
  assert.match(probe.probe.controller, /engine-specific/);
  assert.deepEqual(probe.checks.open_end.targets_x_m, [2.8, -2.8]);
  const doc = (await readFile('specs/worlds/hallways.md', 'utf8')).replace(/\s+/g, ' ');
  for (const text of ['three slide joints', 'no rotation', 'friction is 0.1', '500 Hz', '5 s', '16 s',
    '[hallway-result.schema.json](hallway-result.schema.json)', '[hallway-quantities.json](hallway-quantities.json)',
    '[hallway-probe.json](hallway-probe.json)', 'tooling/compare-results.mjs',
    '1000 kg/m³', '9.81 m/s²', '2.0 s settle', 'settles for 1.5 s', 'left to each engine',
    'MuJoCo-minus-Gazebo difference', 'not the argument order', 'exits 0 for `PASS`, 1 for `FAIL`, 3 when either record is `UNSUPPORTED`']) {
    assert.ok(doc.includes(text), text);
  }
});
