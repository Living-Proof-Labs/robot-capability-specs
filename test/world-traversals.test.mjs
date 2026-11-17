// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { layoutErrors, traversalErrors, routeLength } from '../tooling/world-layout.mjs';
const json = p => JSON.parse(readFileSync(p, 'utf8'));
const good = json('test/fixtures/worlds/hallway-corner-0.2.0.draft.json');
const old = json('test/fixtures/worlds/hallway-corner-0.1.0.world.json');
const validate = new Ajv2020({allErrors:true, strict:true, strictRequired:false}).compile(json('specs/worlds/world-traversals.schema.json'));
const place = (w,n) => w.places.find(p => p.name === n);
test('one unchanged physical corner has two ordered inward traversals', () => {
  assert.ok(validate(good), JSON.stringify(validate.errors));
  assert.deepEqual(traversalErrors(good), []);
  assert.deepEqual(good.geometry, old.geometry);
  assert.deepEqual(good.dimensions, old.dimensions);
  assert.deepEqual(place(good,'route-reverse').points, [...place(good,'route-forward').points].reverse());
  assert.equal(place(good,'spawn-west').yaw_deg,0);
  assert.equal(place(good,'spawn-north').yaw_deg,-90);
  for (const t of good.traversals) {
    assert.equal(routeLength(good,t),5.5);
    assert.deepEqual(place(good,t.route).points[0],place(good,t.from).reference);
    assert.deepEqual(place(good,t.route).points.at(-1),place(good,t.finish).reference);
  }
});
for (const key of ['from','start','route','finish']) {
  test(`reject missing or wrong-type ${key} references`, () => {
    for (const value of ['absent','corner']) {
      const w=structuredClone(good); w.traversals[0][key]=value;
      assert.match(traversalErrors(w).join('\n'),new RegExp(`${key} must reference`));
    }
    const w=structuredClone(good); delete w.traversals[0][key];
    assert.equal(validate(w),false);
  });
}
const cases = [
  [w=>{w.traversals[0].finish='end-west';},/distinct/],
  [w=>{w.traversals[1].route='route-forward';},/must start|must end/],
  [w=>{w.traversals[0].start='spawn-north';},/first route leg|face along/],
  [w=>{place(w,'spawn-north').yaw_deg=90;},/face along/],
  [w=>{place(w,'spawn-west').position[2]=1;},/floor/],
  [w=>{place(w,'spawn-west').position=[0,1,0];},/first route leg/],
  [w=>{place(w,'spawn-west').position=[-3,0,0];},/first route leg/],
  [w=>{place(w,'spawn-west').position[1]=0.1;},/must lie on/],
  [w=>{place(w,'route-forward').points[1]=[-3,0,0];},/repeated/],
  [w=>{place(w,'route-forward').points.splice(1,1);},/closer than/],
  [w=>{place(w,'end-west').points=[[-3.75,0,0],[-2.25,0,0]];},/perpendicular/],
  [w=>{w.traversals[1].name='forward';},/unique/],
  [w=>{w.places.push(structuredClone(w.places[0]));},/unique/],
];
for (const [i,[mutate,pattern]] of cases.entries()) test(`reject inconsistent traversal ${i}`,()=>{
  const w=structuredClone(good); mutate(w);
  assert.match(traversalErrors(w).join('\n'),pattern);
});
test('closed traversal shape rejects unknown semantics',()=>{
  for (const mutate of [w=>{w.traversals=[];},w=>{w.traversals[0].reverse=true;},w=>{delete w.traversals;}]) {
    const w=structuredClone(good); mutate(w); assert.equal(validate(w),false);
  }
});

for (const direction of ['forward', 'reverse']) {
  for (const offset of [0, 0.5e-9]) {
    test(`reject non-adjacent repeated vertex in ${direction}, offset ${offset}`, () => {
      const w = structuredClone(good);
      const points = [[-3,0,0],[0,0,0],[-1,0,0],[offset,0,0],[0,3,0]];
      const traversal = w.traversals.find(t => t.name === direction);
      place(w, traversal.route).points = direction === 'forward' ? points : points.reverse();
      assert.ok(validate(w), JSON.stringify(validate.errors));
      assert.deepEqual(layoutErrors(w, traversal), [`${traversal.route}: repeated point`]);
      assert.match(traversalErrors(w).join('\n'), /repeated point/);
    });
  }
}
