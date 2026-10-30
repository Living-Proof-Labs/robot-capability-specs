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
  assert.equal(examples.length, 4);
  assert.ok(examples.every(e => !/hallway|MuJoCo|Gazebo|0\.1\.0/.test(e)));
});

test('hallway examples cover two fixtures in two simulator consumers', async () => {
  const source = await readFile('specs/worlds/hallways.feature', 'utf8');
  const messages = generateMessages(source, 'specs/worlds/hallways.feature', SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN, {
    newId: IdGenerator.incrementing(), includeGherkinDocument: true, includePickles: true,
  });
  assert.deepEqual(messages.filter(m => m.parseError), []);
  const examples = messages.filter(m => m.pickle).map(m => m.pickle.steps.map(s => s.text).join('\n'));
  assert.equal(examples.length, 8);
  for (const world of ['hallway-short', 'hallway-long']) {
    for (const simulator of ['MuJoCo', 'Gazebo']) {
      assert.equal(examples.filter(e => e.includes(world) && e.includes(simulator)).length, 2);
    }
  }
});
