// SPDX-License-Identifier: Apache-2.0
import { describe } from 'node:test';
import { readdir } from 'node:fs/promises';
describe('Catalog checks', async () => {
  for (const name of (await readdir(new URL('../test/', import.meta.url))).filter(n => n.endsWith('.test.mjs')).sort()) {
    await import(new URL('../test/' + name, import.meta.url));
  }
});
