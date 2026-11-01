// SPDX-License-Identifier: Apache-2.0
// Validate robot manifests against specs/robots/robot-manifest.schema.json.
// Usage: node tooling/validate-manifests.mjs [manifest.json ...] (default: the examples)
import { readFile, readdir } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

const root = new URL('../', import.meta.url);
const json = async url => JSON.parse(await readFile(url, 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: true, strictRequired: false })
  .compile(await json(new URL('specs/robots/robot-manifest.schema.json', root)));
const examples = new URL('specs/robots/examples/manifests/', root);
const files = process.argv.length > 2
  ? process.argv.slice(2).map(p => new URL(p, `file://${process.cwd()}/`))
  : (await readdir(examples)).filter(n => n.endsWith('.json')).sort().map(n => new URL(n, examples));
let failed = 0;
for (const file of files) {
  const ok = validate(await json(file));
  failed += !ok;
  console.log(`${ok ? 'valid' : 'INVALID'} ${file.pathname}${ok ? '' : ' ' + JSON.stringify(validate.errors)}`);
}
process.exit(failed ? 1 : 0);
