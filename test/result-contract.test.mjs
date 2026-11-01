// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, compare, expectedPass, QUANTITIES, SCHEMA } from '../tooling/compare-results.mjs';

const FIXTURE = 'test/fixtures/mujoco-hallway-open-0.1.0.result.json';
const load = async () => JSON.parse(await readFile(FIXTURE, 'utf8'));
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

test('converted MuJoCo hallway result is valid and complete', async () => {
  assert.deepEqual(check(await load()), []);
});

test('compare reports A, B, difference and each pass per quantity', async () => {
  const a = await load();
  const b = structuredClone(a);
  b.engine = { name: 'gazebo', version: '8.9.0' };
  const q = b.quantities.find(x => x.name === 'collision/floor/penetration');
  q.measured = 0.006; q.deviation = 0.006;
  const result = compare(a, b);
  assert.equal(result.ok, true);
  const row = result.rows.find(r => r.name === 'collision/floor/penetration');
  assert.equal(row.a, a.quantities.find(x => x.name === row.name).measured);
  assert.equal(row.b, 0.006);
  assert.ok(Math.abs(row.difference - (0.006 - row.a)) < 1e-12);
  assert.equal(row.pass_a, true);
  assert.equal(row.pass_b, true);
  assert.equal(result.rows.length, a.quantities.length);
});

test('CLI prints a table and exits 0 for two valid results', () => {
  const run = cli(FIXTURE, FIXTURE);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /\| collision\/open_end\/\+x\/final_x \| 2\.8 \|/);
});

test('CLI exits non-zero on a schema error or a missing required quantity', async () => {
  const bad = await load();
  bad.adapter.version = bad.adapter.commit;
  let run = cli(FIXTURE, await tmpFile(bad));
  assert.equal(run.status, 1);
  assert.match(run.stderr, /B: schema: \/adapter\/version must match pattern/);
  const missing = await load();
  missing.quantities = missing.quantities.filter(q => q.name !== 'clear_width');
  run = cli(await tmpFile(missing), FIXTURE);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /A: missing required quantity clear_width/);
  assert.equal(cli(FIXTURE).status, 2);
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
  const result = compare(await load(), r);
  assert.equal(result.ok, true);
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
  assert.deepEqual(probe.checks.open_end.targets_x_m, [2.8, -2.8]);
  const doc = (await readFile('specs/worlds/hallways.md', 'utf8')).replace(/\s+/g, ' ');
  for (const text of ['three slide joints', 'no rotation', 'friction is 0.1', '500 Hz', '5 s', '16 s',
    '[hallway-result.schema.json](hallway-result.schema.json)', '[hallway-quantities.json](hallway-quantities.json)',
    '[hallway-probe.json](hallway-probe.json)', 'tooling/compare-results.mjs']) {
    assert.ok(doc.includes(text), text);
  }
});
