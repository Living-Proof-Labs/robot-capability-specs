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
