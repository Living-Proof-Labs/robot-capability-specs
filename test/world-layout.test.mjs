// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import { layoutErrors, routeLength } from '../tooling/world-layout.mjs';

const SCHEMA = 'specs/worlds/world-layout.schema.json';
const HALLWAY_OPEN = 'test/fixtures/worlds/hallway-open-0.1.0.world.json';
const L_SHAPED = 'test/fixtures/worlds/l-shaped.world.json';
// world.json of hallway-open 0.1.0 as listed in livingproof-worlds v1.1.8 release.json.
const HALLWAY_OPEN_SHA256 = 'd60bb8aa6a72c8403fb6674cc9d803962c1484bc3e163527988e8c57ccec775c';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const validator = async () =>
  new Ajv2020({ allErrors: true, strict: true, strictRequired: false }).compile(await json(SCHEMA));

test('world layout schema is versioned and the contract names it', async () => {
  const schema = await json(SCHEMA);
  assert.equal(schema.title, 'livingproof-world-layout/0.1');
  assert.equal(typeof (await validator()), 'function');
  const readme = await readFile('specs/worlds/README.md', 'utf8');
  assert.match(readme, /^## Any layout$/m);
  assert.match(readme, /\[world-layout\.schema\.json\]\(world-layout\.schema\.json\)/);
  assert.match(readme, /`route-centreline`/);
  assert.match(readme, /at least 0\.25 m from every wall/);
  assert.match(readme, /`\+z` up/);
});

test('hallway-open 0.1.0 conforms to the layout contract unchanged', async () => {
  const bytes = await readFile(HALLWAY_OPEN);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), HALLWAY_OPEN_SHA256);
  const world = JSON.parse(bytes);
  const validate = await validator();
  assert.ok(validate(world), JSON.stringify(validate.errors));
  const { places } = await json('specs/scenarios/walk-hallway/parameters.json');
  assert.deepEqual(layoutErrors(world, places), []);
  assert.equal(routeLength(world, places), 5.5);
});

test('a synthetic L-shaped world conforms, so the contract is not tied to a straight hallway', async () => {
  const world = await json(L_SHAPED);
  const validate = await validator();
  assert.ok(validate(world), JSON.stringify(validate.errors));
  const places = { start: 'spawn-entrance', route: 'route-centreline' };
  assert.deepEqual(layoutErrors(world, places), []);
  assert.equal(routeLength(world, places), 5.5);
});

test('layout schema rejects a rotated wall, a missing place and a short route', async () => {
  const validate = await validator();
  const good = await json(L_SHAPED);
  const bad = [
    w => { w.geometry[2].yaw_deg = 45; },
    w => { w.geometry[2].type = 'cylinder'; },
    w => { w.places = w.places.filter(p => p.name !== 'exit'); },
    w => { w.places = w.places.filter(p => p.name !== 'spawn-entrance'); },
    w => { w.places = w.places.filter(p => p.type !== 'polyline'); },
    w => { w.places.find(p => p.type === 'polyline').points = [[-3, 0, 0]]; },
    w => { w.units = 'cm'; },
    w => { delete w.dimensions.clear_width; },
  ];
  for (const mutate of bad) {
    const w = structuredClone(good);
    mutate(w);
    assert.equal(validate(w), false, mutate.toString());
  }
});

test('layout rules reject overlaps, a route that cuts a wall and a misplaced start', async () => {
  const good = await json(L_SHAPED);
  const places = { start: 'spawn-entrance', route: 'route-centreline' };
  const route = w => w.places.find(p => p.name === 'route-centreline');
  const cases = [
    [w => { w.geometry[5].centre[1] = 1.875; w.geometry[5].size[1] = 2.25; }, /overlaps/],
    [w => { route(w).points = [[-3, 0, 0], [0, 3, 0]]; }, /closer than clear_width/],
    [w => { route(w).points.pop(); }, /must end at the exit/],
    [w => { w.places.find(p => p.name === 'spawn-entrance').position = [-2.5, 0.3, 0]; }, /must lie on/],
    [w => { w.places.find(p => p.name === 'spawn-entrance').yaw_deg = 90; }, /must face along/],
    [w => { w.places.find(p => p.name === 'exit').points[1] = [0.5, 3, 0]; }, /span the clear width/],
    [w => { w.geometry[3].size[2] = 2.0; }, /wall_height/],
    [w => { w.places.push({ name: 'spawn-wall', type: 'pose', position: [-2.0, 0.6, 0], yaw_deg: 0 }); }, /closer than 0\.25 m/],
    [w => { w.places.push({ name: 'entrance', type: 'pose', position: [0, 0, 0], yaw_deg: 0 }); }, /unique/],
  ];
  for (const [mutate, message] of cases) {
    const w = structuredClone(good);
    mutate(w);
    const errors = layoutErrors(w, places);
    assert.ok(errors.some(e => message.test(e)), `${mutate} gave ${JSON.stringify(errors)}`);
  }
  assert.deepEqual(layoutErrors(good, { start: 'spawn-entrance', route: 'missing' }), ['missing: route polyline missing']);
});
