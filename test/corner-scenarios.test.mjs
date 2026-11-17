// SPDX-License-Identifier: Apache-2.0
// Catalog conformance only: synthetic traces do not establish robot support or PASS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import {generateMessages} from '@cucumber/gherkin';
import {IdGenerator, SourceMediaType} from '@cucumber/messages';
import {resolve, referenceErrors} from '../tooling/scenario-parameters.mjs';
import {traversalErrors, routeLength, crossesExit} from '../tooling/world-layout.mjs';
const json = p => JSON.parse(readFileSync(p,'utf8'));
const worldPath = 'test/fixtures/worlds/hallway-corner-0.2.0.world.json';
const manifestPath = 'test/fixtures/worlds/hallway-corner-0.2.0.release.json';
const world = json(worldPath);
const old = json('specs/scenarios/walk-corner/parameters.json');
const oldDescription = json('specs/scenarios/walk-corner/description.json');
const oldCases = json('specs/scenarios/walk-corner/parameter-cases.json');
const directions = ['left', 'right'];
const place = (w,n) => w.places.find(p=>p.name===n);
const schema = name => new Ajv2020({allErrors:true,strict:true,strictRequired:false}).compile(json(`specs/scenarios/scenario-${name}.schema.json`));
const parameterSchema = schema('parameters'), descriptionSchema = schema('description');
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');

// Assert the author-selected tuple, not merely that independently named places exist.
function assertSelection(parameters, w, direction) {
  assert.deepEqual(parameters.world,{id:w.id,content_version:w.content_version});
  assert.deepEqual(traversalErrors(w),[]);
  const traversal=w.traversals.find(t=>t.name===(direction==='left'?'forward':'reverse'));
  assert.deepEqual(parameters.places,{start:traversal.start,route:traversal.route,exit:traversal.finish,through:['corner']});
  assert.equal(place(w,parameters.places.start).type,'pose');
  assert.equal(place(w,parameters.places.exit).type,'segment');
  assert.equal(place(w,parameters.places.route).type,'polyline');
  assert.equal(place(w,parameters.places.through[0]).type,'region');
}

// The schema's passes-through-places rule, applied to synthetic conformance samples.
function enteredBeforeExit(samples, region, points, finish) {
  const crossing=samples.findIndex((p,i)=>i>0 && crossesExit(samples[i-1],p,points,finish));
  return crossing>=0 && samples.slice(0,crossing+1).some(p=>p[0]>=region.x[0] && p[0]<=region.x[1] && p[1]>=region.y[0] && p[1]<=region.y[1]);
}

for (const direction of directions) {
  const id=`walk-corner-${direction}`, dir=`specs/scenarios/${id}/`;
  const p=json(dir+'parameters.json'), d=json(dir+'description.json'), cases=json(dir+'parameter-cases.json');
  test(`${id}: identity, schema, released provenance and real place selection agree`,()=>{
    assert.ok(parameterSchema(p),JSON.stringify(parameterSchema.errors));
    assert.ok(descriptionSchema(d),JSON.stringify(descriptionSchema.errors));
    assert.deepEqual(p.scenario,d.scenario);
    assert.equal(p.scenario.id,id);
    assert.equal(p.scenario.revision,direction==='left'?'0.2.0':'0.1.0');
    assert.match(d.mission.title,new RegExp(direction));
    assert.equal(d.world.content_version,world.content_version);
    assert.deepEqual(referenceErrors(p),[]);
    assertSelection(p,world,direction);
    const source=json(dir+'world-source.json');
    assert.equal(source.tag,'v1.4.0');
    assert.equal(source.commit,'971b39ee845a18c50da627a7410d22e3b98171f9');
    assert.equal(source.path,'worlds/hallway-corner/0.2.0/world.json');
    assert.equal(source.sha256,'f398f2705e630750f7b7ef3035ba4b5aed076de1f417165e58540e973150678e');
    assert.equal(source.sha256,digest(worldPath));
    assert.equal(source.manifest_sha256,digest(manifestPath));
    assert.equal(json(manifestPath).files['world.json'],digest(worldPath));
    const releasedOld=json('test/fixtures/worlds/hallway-corner-0.1.0.world.json');
    assert.deepEqual(world.geometry,releasedOld.geometry);
    assert.deepEqual(world.dimensions,releasedOld.dimensions);
  });
  test(`${id}: acceptance, evaluator vocabulary, rounding and trial policy stay identical`,()=>{
    for(const key of ['format','parameters','inputs','limits','preconditions','checks']) assert.deepEqual(p[key],old[key],key);
    assert.equal('command' in p,false);
    assert.deepEqual(d.parameters,oldDescription.parameters);
    assert.deepEqual(d.limits,oldDescription.limits);
    assert.equal(d.mission.grading,oldDescription.mission.grading);
    assert.deepEqual(cases.cases,oldCases.cases);
    for(const c of cases.cases) {
      if(c.expect.error) {assert.throws(()=>resolve(p,c.inputs));continue;}
      assert.deepEqual(resolve(p,c.inputs),resolve(old,c.inputs),c.name);
    }
  });
  test(`${id}: heading, turn sign, route order, corner and finish crossing`,()=>{
    const route=place(world,p.places.route), spawn=place(world,p.places.start), finish=place(world,p.places.exit);
    const [a,b,c]=route.points;
    const first=[b[0]-a[0],b[1]-a[1]], last=[c[0]-b[0],c[1]-b[1]];
    assert.equal(Math.sign(first[0]*last[1]-first[1]*last[0]),direction==='left'?1:-1);
    assert.equal(spawn.yaw_deg,direction==='left'?0:-90);
    assert.equal(routeLength(world,p.places),5.5);
    assert.deepEqual(c,finish.reference);
    const unit=last.map(v=>v/Math.hypot(...last));
    const before=[c[0]-unit[0]*.1,c[1]-unit[1]*.1,0], after=[c[0]+unit[0]*.1,c[1]+unit[1]*.1,0];
    assert.ok(crossesExit(before,after,route.points,finish));
    assert.equal(crossesExit(after,before,route.points,finish),false);
    const region=place(world,'corner');
    assert.ok(enteredBeforeExit([spawn.position,b,before,after],region,route.points,finish));
    assert.equal(enteredBeforeExit([spawn.position,before,after],region,route.points,finish),false,'skipped corner is not a pass');
    assert.equal(enteredBeforeExit([spawn.position,before,after,b],region,route.points,finish),false,'corner after finish is too late');
  });
  test(`${id}: rejects wrong finish, mixed direction, invalid places and skipped-corner route`,()=>{
    for(const [key,value] of [['exit',p.places.exit==='end-north'?'end-west':'end-north'],['start',p.places.start==='spawn-west'?'spawn-north':'spawn-west'],['route','missing'],['through',['missing']]]) {
      const bad=structuredClone(p);bad.places[key]=value;
      assert.throws(()=>assertSelection(bad,world,direction));
    }
    const badWorld=structuredClone(world);place(badWorld,p.places.route).points.splice(1,1);
    assert.throws(()=>assertSelection(p,badWorld,direction));
    assert.match(traversalErrors(badWorld).join('\n'),/closer than/);
  });
  test(`${id}: Gherkin parses and declares support for the exact new identity`,()=>{
    const path=dir+id+'.feature', text=readFileSync(path,'utf8');
    const messages=generateMessages(text,path,SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN,{newId:IdGenerator.incrementing(),includeGherkinDocument:true,includePickles:true});
    assert.deepEqual(messages.filter(m=>m.parseError),[]);
    assert.ok(messages.some(m=>m.pickle));
    assert.ok(text.includes(`scenario "${id}"`));
    assert.ok(text.includes(`"${p.places.start}"`));
    assert.ok(text.includes(`"${p.places.exit}"`));
    assert.ok(text.includes(`"${p.places.route}"`));
  });
}

test('left and right share exact world provenance and opposite ordered routes',()=>{
  const left=json('specs/scenarios/walk-corner-left/parameters.json');
  const right=json('specs/scenarios/walk-corner-right/parameters.json');
  assert.deepEqual(left.world,right.world);
  assert.deepEqual(json('specs/scenarios/walk-corner-left/world-source.json'),json('specs/scenarios/walk-corner-right/world-source.json'));
  assert.deepEqual(place(world,left.places.route).points,[...place(world,right.places.route).points].reverse());
  assert.notEqual(left.scenario.id,right.scenario.id);
  assert.notEqual(left.places.start,right.places.start);
  assert.notEqual(left.places.exit,right.places.exit);
  for(const key of ['parameters','inputs','limits','preconditions','checks']) assert.deepEqual(left[key],right[key]);
  const readme=readFileSync('specs/scenarios/walk-corner-right/README.md','utf8');
  assert.match(readme,/A passing left\s+trial is not evidence of a passing right trial/);
});
