// SPDX-License-Identifier: Apache-2.0
// Geometric rules of the world layout contract (specs/worlds/README.md, "Any layout")
// that JSON Schema cannot express, and the route measures a scenario reads from a world.
// Reference implementation for the catalog tests; consumers may implement the same rules.
const EPS = 1e-9;
const SPAWN_CLEARANCE = 0.25; // m, every pose place from every wall

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = a => Math.hypot(a[0], a[1]);

// Nearest point on segment a-b to p, in the floor plane: [distance, fraction along a-b].
function nearestOnLeg(p, a, b) {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab)));
  return [len(sub(p, [a[0] + t * ab[0], a[1] + t * ab[1]])), t];
}

// Distance in the floor plane from point p to an axis-aligned box footprint (0 inside).
function pointToBox(p, box) {
  const dx = Math.max(Math.abs(p[0] - box.centre[0]) - box.size[0] / 2, 0);
  const dy = Math.max(Math.abs(p[1] - box.centre[1]) - box.size[1] / 2, 0);
  return Math.hypot(dx, dy);
}

function legsCross(a, b, c, d) {
  const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// Distance in the floor plane from leg a-b to a box footprint.
function legToBox(a, b, box) {
  const [cx, cy] = box.centre, [hx, hy] = [box.size[0] / 2, box.size[1] / 2];
  const corners = [[cx - hx, cy - hy], [cx + hx, cy - hy], [cx + hx, cy + hy], [cx - hx, cy + hy]];
  if (pointToBox(a, box) === 0 || pointToBox(b, box) === 0) return 0;
  for (let i = 0; i < 4; i++) if (legsCross(a, b, corners[i], corners[(i + 1) % 4])) return 0;
  return Math.min(pointToBox(a, box), pointToBox(b, box), ...corners.map(c => nearestOnLeg(c, a, b)[0]));
}

export function routeLegs(route) {
  return route.points.slice(1).map((b, i) => [route.points[i], b]);
}

// Distance along the route from its first point to the point nearest p.
export function stationOf(route, p) {
  let best = [Infinity, 0], walked = 0;
  for (const [a, b] of routeLegs(route)) {
    const [dist, t] = nearestOnLeg(p, a, b);
    if (dist < best[0] - EPS) best = [dist, walked + t * len(sub(b, a))];
    walked += len(sub(b, a));
  }
  return { distance: best[0], station: best[1], length: walked };
}

// route_length: from the point on the route nearest the start pose to the route's last point,
// which the layout contract places at the exit reference point.
export function routeLength(world, { start, route }) {
  const places = Object.fromEntries(world.places.map(p => [p.name, p]));
  const s = stationOf(places[route], places[start].position);
  return s.length - s.station;
}

export function layoutErrors(world, { route: routeName }) {
  const errors = [];
  const d = world.dimensions, tol = world.tolerances.distance_m, angTol = world.tolerances.angle_deg;
  const names = [...world.geometry, ...world.places].map(x => x.name);
  if (new Set(names).size !== names.length) return ['names: geometry and place names must be unique'];
  const walls = world.geometry.filter(g => g.role === 'wall');
  for (const g of world.geometry) {
    const [, , cz] = g.centre, [sx, sy, sz] = g.size;
    if (g.role === 'floor' && (Math.abs(cz + sz / 2) > EPS || Math.abs(sz - d.floor_thickness) > EPS)) {
      errors.push(`${g.name}: floor top must be z = 0 with thickness floor_thickness`);
    }
    if (g.role === 'wall') {
      if (Math.abs(cz - sz / 2) > EPS || Math.abs(sz - d.wall_height) > EPS) errors.push(`${g.name}: wall must rise from z = 0 to wall_height`);
      if (Math.abs(Math.min(sx, sy) - d.wall_thickness) > EPS) errors.push(`${g.name}: wall must be wall_thickness thick`);
    }
  }
  const boxes = world.geometry;
  for (let i = 0; i < boxes.length; i++) {
    for (const b of boxes.slice(i + 1)) {
      const a = boxes[i];
      const overlap = [0, 1, 2].map(k => Math.min(a.centre[k] + a.size[k] / 2, b.centre[k] + b.size[k] / 2) -
        Math.max(a.centre[k] - a.size[k] / 2, b.centre[k] - b.size[k] / 2));
      if (overlap.every(o => o > EPS)) errors.push(`${a.name} overlaps ${b.name}`);
    }
  }
  const places = Object.fromEntries(world.places.map(p => [p.name, p]));
  for (const name of ['entrance', 'exit']) {
    const p = places[name];
    if (!p) { errors.push(`${name}: missing`); continue; }
    const [a, b] = p.points;
    if ([a, b, p.reference].some(q => Math.abs(q[2]) > EPS)) errors.push(`${name}: must lie on the floor, z = 0`);
    if (Math.abs(len(sub(b, a)) - d.clear_width) > EPS) errors.push(`${name}: must span the clear width`);
    if (len(sub(p.reference, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) > EPS) errors.push(`${name}: reference must be the midpoint`);
  }
  const route = places[routeName];
  if (!route || route.type !== 'polyline') return [...errors, `${routeName}: route polyline missing`];
  if (route.points.length < 2) return [...errors, `${routeName}: route needs at least 2 points`];
  if (route.points.some(q => Math.abs(q[2]) > EPS)) errors.push(`${routeName}: must lie on the floor, z = 0`);
  for (const [a, b] of routeLegs(route)) if (len(sub(b, a)) <= EPS) errors.push(`${routeName}: repeated point`);
  if (places.entrance && len(sub(route.points[0], places.entrance.reference)) > tol) errors.push(`${routeName}: must start at the entrance reference`);
  if (places.exit && len(sub(route.points.at(-1), places.exit.reference)) > tol) errors.push(`${routeName}: must end at the exit reference`);
  for (const w of walls) {
    for (const [a, b] of routeLegs(route)) {
      if (legToBox(a, b, w) < d.clear_width / 2 - tol) errors.push(`${routeName}: passes closer than clear_width / 2 to ${w.name}`);
    }
  }
  for (const p of world.places.filter(q => q.type === 'pose')) {
    if (Math.min(...walls.map(w => pointToBox(p.position, w))) < SPAWN_CLEARANCE - EPS) {
      errors.push(`${p.name}: closer than ${SPAWN_CLEARANCE} m to a wall`);
    }
  }
  const spawn = places['spawn-entrance'];
  if (spawn) {
    const s = stationOf(route, spawn.position);
    if (s.distance > tol) errors.push(`spawn-entrance: must lie on ${routeName}`);
    // Facing: the direction of the route leg that holds the spawn point.
    let walked = 0;
    for (const [a, b] of routeLegs(route)) {
      const l = len(sub(b, a));
      if (s.station <= walked + l + EPS) {
        const heading = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
        const diff = Math.abs(((spawn.yaw_deg - heading) % 360 + 540) % 360 - 180);
        if (diff > angTol) errors.push(`spawn-entrance: must face along ${routeName}`);
        break;
      }
      walked += l;
    }
  }
  return errors;
}
