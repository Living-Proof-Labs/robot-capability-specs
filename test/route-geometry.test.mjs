// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crossesExit, distanceToRoute } from '../tooling/world-layout.mjs';

const CASES = 'specs/scenarios/route-geometry-cases.json';

// Closed forms of the place terms for the two routes in the case file.
// Straight hallway-open: the route is the x axis, so distance is |y|, and a
// forward step crosses at x >= 3 with |y| <= 0.75 at the second sample.
function hallwayCrosses(p0, p1) {
  if (!(p0[0] < 3 && p1[0] >= 3)) return false;
  return Math.abs(p1[1]) <= 0.75;
}

// The rejected meeting-point reading, kept so a case can prove the two disagree.
function hallwayMeeting(p0, p1) {
  if (!(p0[0] < 3 && p1[0] >= 3)) return false;
  const t = (3 - p0[0]) / (p1[0] - p0[0]);
  return Math.abs(p0[1] + t * (p1[1] - p0[1])) <= 0.75;
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
  return Math.abs(p1[0]) <= 0.75;
}

function lMeeting(p0, p1) {
  if (!(p0[1] < 3 && p1[1] >= 3)) return false;
  const t = (3 - p0[1]) / (p1[1] - p0[1]);
  return Math.abs(p0[0] + t * (p1[0] - p0[0])) <= 0.75;
}

test('route geometry cases match the place terms in both closed form and the reference', async () => {
  const doc = JSON.parse(await readFile(CASES, 'utf8'));
  assert.equal(doc.format, 'livingproof-route-geometry-cases/0.1');
  assert.deepEqual(doc.cases.map(c => c.name), ['hallway-open passage-centreline', 'L-shaped route']);
  const straight = doc.cases[0], corner = doc.cases[1];
  assert.ok(straight.distances.some(q => /\|y\|/.test(q.name)));
  assert.ok(straight.crossings.some(q => q.name.includes('second sample is outside')));
  assert.ok(straight.crossings.some(q => q.name.includes('second sample is inside')));
  assert.ok(corner.distances.some(q => q.name.includes('endpoint')));
  assert.ok(corner.distances.some(q => q.name.includes('tie')));
  const outsideCorner = corner.distances.find(q => q.point[0] === 0.5 && q.point[1] === 0.5);
  assert.equal(outsideCorner.name, 'outside the corner, nearer the last leg');
  assert.equal(outsideCorner.distance, 0.5);
  assert.ok(corner.crossings.some(q => q.name.includes('second sample is outside')));
  assert.ok(corner.crossings.some(q => q.name.includes('second sample is inside')));
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
  // Where the case names the meeting point, that reading must disagree with the
  // second-sample result: inside at the meeting and outside at p1, or the reverse.
  const disagreed = [];
  for (const query of straight.crossings) {
    if (!/meeting point|one centimetre/.test(query.name)) continue;
    assert.notEqual(hallwayMeeting(query.p0, query.p1), query.crosses, query.name);
    disagreed.push(query.crosses);
  }
  for (const query of corner.crossings) {
    if (!query.name.includes('meeting point')) continue;
    assert.notEqual(lMeeting(query.p0, query.p1), query.crosses, query.name);
    disagreed.push(query.crosses);
  }
  assert.ok(disagreed.includes(true), 'a step whose meeting point is outside the segment still crosses');
  assert.ok(disagreed.includes(false), 'a step whose meeting point is inside the segment does not cross');
});

test('hallway-open crossing equals x >= 3 with |y| <= 0.75 at the second sample', async () => {
  const doc = JSON.parse(await readFile(CASES, 'utf8'));
  const straight = doc.cases[0];
  const xs = [-1, 0, 2, 2.5, 2.8, 2.9, 2.996, 3, 3.006, 3.1, 3.2, 3.5, 4];
  const ys = [-1.5, -1, -0.8, -0.75, -0.5, 0, 0.5, 0.7, 0.7475, 0.7495, 0.75, 0.7505, 0.7525, 0.8, 0.9, 0.95, 1, 1.5, 2];
  for (const x0 of xs) for (const y0 of ys) for (const x1 of xs) for (const y1 of ys) {
    const expected = x0 < 3 && x1 >= 3 && Math.abs(y1) <= 0.75;
    const p0 = [x0, y0, 0], p1 = [x1, y1, 0];
    assert.equal(crossesExit(p0, p1, straight.route, straight.exit), expected, `${x0},${y0} -> ${x1},${y1}`);
  }
});
