// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateMessages } from '@cucumber/gherkin';
import { IdGenerator, SourceMediaType } from '@cucumber/messages';

test('reference Gherkin parses into five executable examples', async () => {
  const source = await readFile('specs/v1/reference.feature', 'utf8');
  const messages = generateMessages(source, 'specs/v1/reference.feature', SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN, {
    newId: IdGenerator.incrementing(), includeGherkinDocument: true, includePickles: true,
  });
  assert.deepEqual(messages.filter(m => m.parseError), []);
  assert.equal(messages.filter(m => m.pickle).length, 5);
});

test('reference documents have license notices and clean whitespace', async () => {
  for (const file of ['specs/v1/README.md', 'specs/v1/reference.feature']) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /SPDX-License-Identifier: CC-BY-4.0/);
    assert.ok(source.endsWith('\n'));
    assert.doesNotMatch(source, /\t| +$/m);
  }
});

test('strict pause revision has four distinct boundary examples', async () => {
  const source = await readFile('specs/v2/reference.feature', 'utf8');
  const messages = generateMessages(source, 'specs/v2/reference.feature', SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN, {
    newId: IdGenerator.incrementing(), includeGherkinDocument: true, includePickles: true,
  });
  assert.deepEqual(messages.filter(m => m.parseError), []);
  assert.equal(messages.filter(m => m.pickle).length, 4);
  const contract = await readFile('specs/v2/README.md', 'utf8');
  assert.match(contract, /250 milliseconds/);
  assert.match(contract, /revision `2.0.0`/);
});

test('released execution matrix parses four distinct coordinates', async () => {
  const source = await readFile('specs/matrix/reference.feature', 'utf8');
  const messages = generateMessages(source, 'specs/matrix/reference.feature', SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN, {
    newId: IdGenerator.incrementing(), includeGherkinDocument: true, includePickles: true,
  });
  assert.deepEqual(messages.filter(m => m.parseError), []);
  const examples = messages.filter(m => m.pickle).map(m => m.pickle.steps.map(s => s.text));
  assert.equal(examples.length, 4);
  assert.equal(new Set(examples.map(e => e.slice(0, 2).join('\n'))).size, 4);
  assert.equal(examples.filter(e => e.includes('the retained outcome is PASS')).length, 2);
  assert.equal(examples.filter(e => e.includes('the retained outcome is FAIL')).length, 1);
  assert.equal(examples.filter(e => e.includes('execution compatibility is INCOMPATIBLE')).length, 1);
});

test('world contract has generic selection and evidence scenarios', async () => {
  const source = await readFile('specs/worlds/reference.feature', 'utf8');
  const messages = generateMessages(source, 'specs/worlds/reference.feature', SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN, {
    newId: IdGenerator.incrementing(), includeGherkinDocument: true, includePickles: true,
  });
  assert.deepEqual(messages.filter(m => m.parseError), []);
  const examples = messages.filter(m => m.pickle).map(m => m.pickle.steps.map(s => s.text).join('\n'));
  assert.equal(examples.length, 5);
  assert.ok(examples.some(e => /unsupported/.test(e)));
  assert.ok(examples.every(e => !/hallway|MuJoCo|Gazebo|0\.1\.0/.test(e)));
});

test('open hallway examples cover five stories in both simulators', async () => {
  const source = await readFile('specs/worlds/hallways.feature', 'utf8');
  const messages = generateMessages(source, 'specs/worlds/hallways.feature', SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN, {
    newId: IdGenerator.incrementing(), includeGherkinDocument: true, includePickles: true,
  });
  assert.deepEqual(messages.filter(m => m.parseError), []);
  const doc = messages.find(m => m.gherkinDocument).gherkinDocument;
  assert.equal(doc.feature.children.length, 5);
  const examples = messages.filter(m => m.pickle).map(m => m.pickle.steps.map(s => s.text).join('\n'));
  assert.equal(examples.length, 8);
  assert.ok(examples.every(e => e.includes('"hallway-open"')));
  assert.doesNotMatch(source, /door(?!s?\b)|hallway-short|hallway-long|room/i);
  for (const simulator of ['MuJoCo', 'Gazebo']) {
    assert.ok(examples.filter(e => e.includes(simulator)).length >= 5);
  }
  assert.ok(examples.some(e => e.includes('cross-engine comparison')));
  assert.ok(examples.some(e => e.includes('UNSUPPORTED')));
});

test('open hallway contract declares named places, tolerances and scope limits', async () => {
  const doc = await readFile('specs/worlds/hallways.md', 'utf8');
  for (const place of ['entrance', 'exit', 'passage', 'passage-centreline', 'spawn-entrance', 'spawn-centre', 'spawn-exit']) {
    assert.match(doc, new RegExp('\\| `' + place + '` \\|'));
  }
  assert.match(doc, /right-handed and metre-based/);
  assert.match(doc, /within 0\.01 m/);
  assert.match(doc, /0\.5 degrees/);
  assert.match(doc, /0\.10 m-radius non-robot sphere/);
  assert.match(doc, /Equivalent geometry does not imply identical physics/);
  assert.match(doc, /no robot, controller/);
  assert.match(doc, /later story/);
  assert.match(doc, /Living-Proof-Labs\/livingproof-worlds/);
  const feature = await readFile('specs/worlds/hallways.feature', 'utf8');
  const scenarios = [...feature.matchAll(/^  Scenario(?: Outline)?: (.+)$/gm)].map(m => m[1]);
  const rows = [...doc.matchAll(/^\| As an? (.+?), I want .+?, so that .+? \| .+? \| `(.+?)` \|$/gm)];
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(r => r[2]), scenarios);
  for (const r of rows) assert.ok(['integrator', 'scenario author', 'verifier', 'reviewer'].includes(r[1]));
  assert.doesNotMatch(doc, /hallway-short|hallway-long/);
});
