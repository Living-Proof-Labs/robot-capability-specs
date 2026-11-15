// SPDX-License-Identifier: Apache-2.0
// walk-corner against hallway-corner 0.1.0 (#51 with livingproof-worlds#14): every place and limit the
// scenario uses is consistent with the world's walls, computed from the geometry rather than copied.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from '../tooling/scenario-parameters.mjs';

const json = async p => JSON.parse(await readFile(p, 'utf8'));
const WORLD = 'test/fixtures/worlds/hallway-corner-0.1.0.world.json';
const CORNER = 'specs/scenarios/walk-corner/';
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`);
const box = g => ({ x: [g.centre[0] - g.size[0] / 2, g.centre[0] + g.size[0] / 2], y: [g.centre[1] - g.size[1] / 2, g.centre[1] + g.size[1] / 2] });
const load = async () => {
  const world = await json(WORLD);
  return { world, p: await json(CORNER + 'parameters.json'), d: await json(CORNER + 'description.json'),
    places: Object.fromEntries(world.places.map(pl => [pl.name, pl])),
    walls: world.geometry.filter(g => g.role === 'wall').map(box) };
};
// Distance from point q to the segment a-b in the floor plane.
const segDist = (q, a, b) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
};
const routeDist = (q, pts) => Math.min(...pts.slice(1).map((b, i) => segDist(q, pts[i], b)));
const boxDist = (q, b) => Math.hypot(Math.max(b.x[0] - q[0], 0, q[0] - b.x[1]), Math.max(b.y[0] - q[1], 0, q[1] - b.y[1]));
const wallDist = (q, walls) => Math.min(...walls.map(b => boxDist(q, b)));

test('the route is two perpendicular legs down the middle of 1.50 m hallways, 5.5 m from spawn-entrance', async () => {
  const { world, p, d, places, walls } = await load();
  const [a, turn, b] = places[p.places.route].points;
  const legs = [[a, turn], [turn, b]].map(([u, v]) => [v[0] - u[0], v[1] - u[1]]);
  near(legs[0][0] * legs[1][0] + legs[0][1] * legs[1][1], 0, 'legs are perpendicular');
  // Every route sample is exactly half the clear width from the nearest wall, except the outside of the turn.
  for (const [u, v] of [[a, turn], [turn, b]]) {
    for (let i = 0; i <= 20; i++) {
      const q = [u[0] + (v[0] - u[0]) * i / 20, u[1] + (v[1] - u[1]) * i / 20];
      near(wallDist(q, walls), world.dimensions.clear_width / 2, `route point ${q} is mid-hallway`);
    }
  }
  const spawn = places[p.places.start];
  near(routeDist(spawn.position, [a, turn, b]), 0, 'spawn is on the route');
  near(Math.atan2(legs[0][1], legs[0][0]) * 180 / Math.PI, spawn.yaw_deg, 'spawn faces along the first leg');
  const length = Math.hypot(turn[0] - spawn.position[0], turn[1] - spawn.position[1]) + Math.hypot(b[0] - turn[0], b[1] - turn[1]);
  near(length, 5.5, 'route length from spawn-entrance');
  near(Math.hypot(...legs[0]) + Math.hypot(...legs[1]), d.world.dimensions.length.value, 'description length is the polyline');
  assert.match(d.world.description, /3\.00 m to the centre of the corner square, then 3\.00 m to the exit/);
  near(Math.hypot(...legs[0]), 3, 'first leg'); near(Math.hypot(...legs[1]), 3, 'second leg');
  assert.deepEqual(places.entrance.reference, a, 'route starts at the entrance reference');
});

test('corner is the square where the hallways meet, and no path between the hallways can avoid it', async () => {
  const { world, p, places, walls } = await load();
  const c = places[p.places.through[0]];
  const w = world.dimensions.clear_width;
  const turn = places[p.places.route].points[1];
  near(c.x[1] - c.x[0], w, 'corner side x'); near(c.y[1] - c.y[0], w, 'corner side y');
  near((c.x[0] + c.x[1]) / 2, turn[0], 'corner centred on the turn x'); near((c.y[0] + c.y[1]) / 2, turn[1], 'corner centred on the turn y');
  // Each corner of the square is either on the face of a wall or the inner wall corner: it fills the junction.
  for (const q of [[c.x[0], c.y[0]], [c.x[1], c.y[0]], [c.x[1], c.y[1]], [c.x[0], c.y[1]]]) near(wallDist(q, walls), 0, `corner ${q} touches a wall`);
  // Free floor outside the square splits into the first hallway (x < square) and the second (y > square), which
  // do not touch: sample a grid of free points and check none is adjacent across the split.
  const free = q => wallDist(q, walls) > 0 && q[0] >= -3 && q[1] <= 3 && q[0] <= 0.75 && q[1] >= -0.75;
  const inSquare = q => q[0] >= c.x[0] && q[0] <= c.x[1] && q[1] >= c.y[0] && q[1] <= c.y[1];
  // Integer centimetre grid so the square's boundary is sampled exactly; 4-neighbour steps of 5 cm.
  const step = 5;
  for (let i = -300; i <= 75; i += step) for (let j = -75; j <= 300; j += step) {
    const q = [i / 100, j / 100];
    if (!free(q) || inSquare(q)) continue;
    const first = q[0] < c.x[0];
    for (const [di, dj] of [[step, 0], [0, step]]) {
      const r = [(i + di) / 100, (j + dj) / 100];
      if (free(r) && !inSquare(r)) assert.equal(r[0] < c.x[0], first, `${q} and ${r} would bypass the corner`);
    }
  }
});

test('the exit segment, the exit limit and the lateral limits match the walls for G1, Go1 and T1', async () => {
  const { world, p, places, walls } = await load();
  const exit = places[p.places.exit];
  const pts = places[p.places.route].points;
  assert.deepEqual(exit.reference, pts.at(-1), 'exit reference is the last route point');
  const [e0, e1] = exit.points;
  const cases = (await json(CORNER + 'parameter-cases.json')).cases.filter(c => !c.expect.error);
  for (const c of cases) {
    const r = resolve(p, c.inputs);
    near(Math.hypot(e1[0] - e0[0], e1[1] - e0[1]), 2 * r.limits.exit_segment, `${c.name}: exit segment`);
    if (!r.preconditions.fits_width) continue;
    const half = c.inputs.robot_width.value / 2;
    // In a straight leg, a centre at the lateral limit puts the robot's side exactly on the wall.
    for (const [q, leg] of [[[-1.5, r.limits.lateral_limit], 'first leg'], [[-r.limits.lateral_limit, 1.5], 'second leg']]) {
      near(wallDist(q, walls), half, `${c.name}: side touches the wall at the limit in the ${leg}`);
    }
    // Cutting the inside of the turn as far as the limit allows still clears the inner wall corner.
    const cut = [-r.limits.lateral_limit, r.limits.lateral_limit];
    near(routeDist(cut, pts), r.limits.lateral_limit, `${c.name}: inside cut at the limit`);
    assert.ok(wallDist(cut, walls) > half, `${c.name}: the inside cut clears the inner corner`);
    // Overshooting the outside at the limit (measured from the turn point) is at least half the width from the walls.
    const out = [r.limits.lateral_limit / Math.SQRT2, -r.limits.lateral_limit / Math.SQRT2];
    near(routeDist(out, pts), r.limits.lateral_limit, `${c.name}: outside overshoot is measured from the turn point`);
    assert.ok(wallDist(out, walls) >= half, `${c.name}: the route limit is no looser than the walls on the outside`);
  }
});
