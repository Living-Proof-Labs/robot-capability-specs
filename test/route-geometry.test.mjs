// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crossesExit, distanceToRoute } from '../tooling/world-layout.mjs';

const CASES = 'specs/scenarios/route-geometry-cases.json';

// Closed forms of the place terms for the two routes in the case file.
// Straight hallway-open: the route is the x axis, so distance is |y|, and a
// forward step crosses at x >= 3 with |y| <= 0.75 at the meeting point.
function hallwayCrosses(p0, p1) {
  if (!(p0[0] < 3 && p1[0] >= 3)) return false;
  const t = (3 - p0[0]) / (p1[0] - p0[0]);
  const y = p0[1] + t * (p1[1] - p0[1]);
  return Math.abs(y) <= 0.75;
}

// L-shaped route: first leg is y = 0 for x <= 0, last leg is x = 0 for y >= 0.
function lDistance(point) {
  const [x, y] = point;
  const first = x <= 0 ? Math.abs(y) : Math.hypot(x, y);
  const last = y >= 0 ? Math.abs(x) : Math.hypot(x, y);
  return Math.min(first, last);
}

function lCrosses(p0, p1) {
  if (!(p0[1] < 3 && p1[1] >= 3)) return false;
  const t = (3 - p0[1]) / (p1[1] - p0[1]);
  const x = p0[0] + t * (p1[0] - p0[0]);
  return Math.abs(x) <= 0.75;
}

test('route geometry cases match the place terms in both closed form and the reference', async () => {
  const doc = JSON.parse(await readFile(CASES, 'utf8'));
  assert.equal(doc.format, 'livingproof-route-geometry-cases/0.1');
  assert.deepEqual(doc.cases.map(c => c.name), ['hallway-open passage-centreline', 'L-shaped route']);
  const straight = doc.cases[0], corner = doc.cases[1];
  assert.ok(straight.distances.some(q => /\|y\|/.test(q.name)));
  assert.ok(straight.crossings.some(q => q.name.includes('tie')));
  assert.ok(corner.distances.some(q => q.name.includes('endpoint')));
  assert.ok(corner.distances.some(q => q.name.includes('tie')));
  for (const query of straight.distances) {
    assert.equal(query.distance, Math.abs(query.point[1]), query.name);
    assert.equal(distanceToRoute(straight.route, query.point), query.distance, query.name);
  }
  for (const query of straight.crossings) {
    assert.equal(query.crosses, hallwayCrosses(query.p0, query.p1), query.name);
    assert.equal(crossesExit(query.p0, query.p1, straight.route, straight.exit), query.crosses, query.name);
  }
  for (const query of corner.distances) {
    assert.equal(query.distance, lDistance(query.point), query.name);
    assert.equal(distanceToRoute(corner.route, query.point), query.distance, query.name);
  }
  for (const query of corner.crossings) {
    assert.equal(query.crosses, lCrosses(query.p0, query.p1), query.name);
    assert.equal(crossesExit(query.p0, query.p1, corner.route, corner.exit), query.crosses, query.name);
  }
});
