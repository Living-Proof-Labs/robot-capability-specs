// SPDX-License-Identifier: Apache-2.0
// Scenario support (#51): an undeclared scenario is UNSUPPORTED before any trial, never FAIL and never PASS.
// The catalog's executable parts are the robot manifest schema and the scenario READMEs and Gherkin, so this
// test drives a manifest matrix through the schema and checks every normative text states the same rule.
// grade() is the README rule written as code, so consumers (#52) can reuse the matrix as conformance cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

const json = async p => JSON.parse(await readFile(p, 'utf8'));
const text = p => readFile(p, 'utf8');
const manifestValidator = async () => new Ajv2020({ allErrors: true, strict: true, strictRequired: false })
  .compile(await json('specs/robots/robot-manifest.schema.json'));
const SCENARIOS = 'specs/scenarios/';

// The preconditions a scenario README lists in its "Preconditions, checked before any trial" sentence.
async function readmePreconditions(id) {
  const readme = await text(`${SCENARIOS}${id}/README.md`);
  const at = readme.indexOf('Preconditions, checked before any trial');
  assert.ok(at >= 0, `${id} README lists its preconditions`);
  const sentence = readme.slice(at, readme.indexOf('\n\n', at));
  return [...sentence.matchAll(/`([a-z_]+)`/g)].map(m => m[1]).filter(n => n !== 'wall_clearance' && n !== 'scenarios' && n !== 'UNSUPPORTED' && n !== id);
}

// The README rule as code. valid: the manifest passed the schema. outcome: the trial outcome if a trial ran.
function grade({ valid, manifest, scenario, requiresDeclaration, outcome }) {
  if (!valid) return 'ERROR'; // invalid data is never read as supported or unsupported
  if (requiresDeclaration && !(manifest.scenarios ?? []).includes(scenario)) return 'UNSUPPORTED';
  return outcome; // the declaration is not evidence: the grade comes from the trials
}

const MATRIX = [
  // name, scenarios value (undefined: absent), schema-valid, declares walk-corner
  ['no scenarios list', undefined, true, false],
  ['an empty list', [], true, false],
  ['a list that omits walk-corner', ['walk-hallway'], true, false],
  ['an unknown id (typo)', ['walk-cornr'], true, false],
  ['an id for a scenario the catalog does not have yet', ['climb-stairs'], true, false],
  ['walk-corner declared', ['walk-corner'], true, true],
  ['both declared', ['walk-hallway', 'walk-corner'], true, true],
  ['a duplicate id', ['walk-corner', 'walk-corner'], false, null],
  ['a bare string', 'walk-corner', false, null],
  ['an object', { 'walk-corner': true }, false, null],
  ['null', null, false, null],
  ['a number item', [1], false, null],
  ['a null item', [null], false, null],
  ['a nested list', [['walk-corner']], false, null],
  ['upper case', ['Walk-Corner'], false, null],
  ['an underscore', ['walk_corner'], false, null],
  ['an empty id', [''], false, null],
  ['a leading space', [' walk-corner'], false, null],
];

test('scenario support matrix: undeclared is UNSUPPORTED, invalid is ERROR, declared is graded by its trials', async () => {
  const validate = await manifestValidator();
  const base = await json('specs/robots/examples/manifests/unitree-g1.json');
  const requiresDeclaration = (await readmePreconditions('walk-corner')).includes('scenario_supported');
  assert.equal(requiresDeclaration, true, 'walk-corner lists scenario_supported');
  for (const [name, scenarios, valid, declares] of MATRIX) {
    const manifest = structuredClone(base);
    if (scenarios === undefined) delete manifest.scenarios; else manifest.scenarios = scenarios;
    assert.equal(validate(manifest), valid, `${name}: schema ${valid ? 'accepts' : 'rejects'} it`);
    for (const outcome of ['PASS', 'FAIL']) {
      const g = grade({ valid, manifest, scenario: 'walk-corner', requiresDeclaration, outcome });
      if (!valid) assert.equal(g, 'ERROR', `${name}: an invalid manifest is a test-system ERROR`);
      else if (declares) assert.equal(g, outcome, `${name}: a declared robot keeps its trial outcome ${outcome}`);
      else {
        assert.equal(g, 'UNSUPPORTED', `${name}: undeclared`);
        assert.notEqual(g, 'FAIL'); assert.notEqual(g, 'PASS');
      }
    }
  }
});

test('UNSUPPORTED cannot hide a failure: a robot that declares walk-corner and fails is FAIL', async () => {
  const feature = await text(`${SCENARIOS}walk-corner/walk-corner.feature`);
  // The walk itself is only for a robot whose manifest lists walk-corner, and its grading table has a FAIL row.
  assert.match(feature, /whose robot manifest lists scenario "walk-corner"\n/);
  assert.match(feature, /\| 1\s+\| 0\s+\| 1\s+\| 0\s+\| FAIL\s+\|/);
  assert.match(feature, /Then any FAIL makes the trial FAIL/);
  // The precondition outline is the only place UNSUPPORTED is produced, and it runs no trial.
  const outline = feature.slice(feature.indexOf('Scenario Outline: A robot that cannot meet the preconditions'));
  assert.match(outline, /Then the grade is UNSUPPORTED naming precondition "<precondition>"\n\s+And no trial is run/);
  assert.match(outline, /\| scenario_supported \| robot manifest does not list scenario "walk-corner"\s+\|/);
  assert.equal((feature.match(/UNSUPPORTED/g) ?? []).length, 1, 'UNSUPPORTED appears only in the precondition outline');
  const robots = await text('specs/robots/README.md');
  assert.ok(robots.includes('The list is a declaration, not evidence: the run grade still comes from the\ntrials.'));
});

test('every normative text states the same scenario support rule', async () => {
  const robots = await text('specs/robots/README.md');
  const section = robots.slice(robots.indexOf('## Scenario support'));
  for (const phrase of ['A scenario the list does not name, or a manifest with no `scenarios` list',
    'the run grade `UNSUPPORTED` naming `scenario_supported`', 'No trial runs', 'never a `FAIL`']) {
    assert.ok(section.replace(/\s+/g, ' ').includes(phrase.replace(/\s+/g, ' ')), phrase);
  }
  const manifestSchema = await json('specs/robots/robot-manifest.schema.json');
  assert.equal(manifestSchema.required.includes('scenarios'), false);
  assert.match(manifestSchema.properties.scenarios.description, /when this list is absent, is UNSUPPORTED before any trial, never a FAIL/);
  assert.equal(manifestSchema.properties.scenarios.uniqueItems, true);
  const corner = await text(`${SCENARIOS}walk-corner/README.md`);
  assert.match(corner.replace(/\s+/g, ' '), /Otherwise the run is `UNSUPPORTED` naming `scenario_supported`, before any trial and never a `FAIL`/);
  const glossary = await text('docs/glossary.md');
  assert.match(glossary, /\*\*`UNSUPPORTED`\*\* \| A declared precondition cannot be met, decided before any trial\. Names the precondition\. Never a pass\./);
});

test('a scenario with no command requires the declaration, and walk-hallway keeps running without it until #52', async () => {
  for (const id of (await readdir(SCENARIOS, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name)) {
    const p = await json(`${SCENARIOS}${id}/parameters.json`);
    const pre = await readmePreconditions(id);
    if (!('command' in p)) {
      assert.ok(pre.includes('scenario_supported'), `${id} has no command, so only a declaring adapter can drive it`);
      assert.equal(pre.includes('velocity_interface'), false, `${id} sends no velocity command`);
      const feature = await text(`${SCENARIOS}${id}/${id}.feature`);
      assert.match(feature, /\| scenario_supported \|/, `${id} Gherkin has the scenario_supported example`);
    }
  }
  // Backward compatibility until #52: walk-hallway does not list the precondition, and no example manifest declares.
  assert.equal((await readmePreconditions('walk-hallway')).includes('scenario_supported'), false);
  assert.ok('command' in (await json(`${SCENARIOS}walk-hallway/parameters.json`)));
  const validate = await manifestValidator();
  for (const name of await readdir('specs/robots/examples/manifests/')) {
    const m = await json('specs/robots/examples/manifests/' + name);
    assert.equal('scenarios' in m, false, name);
    assert.ok(validate(m), name);
    assert.equal(grade({ valid: true, manifest: m, scenario: 'walk-hallway', requiresDeclaration: false, outcome: 'PASS' }), 'PASS');
    assert.equal(grade({ valid: true, manifest: m, scenario: 'walk-corner', requiresDeclaration: true, outcome: 'PASS' }), 'UNSUPPORTED');
  }
});
