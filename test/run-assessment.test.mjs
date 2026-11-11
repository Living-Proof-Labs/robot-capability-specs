// SPDX-License-Identifier: Apache-2.0
// Legacy livingproof-run-assessment/0.1 bundle. These tests keep the seeded
// aggregation (k, n, required passes, Wilson interval, and a seed on each
// failure) that capability report v1.10.0 writes. Replacing that shape is
// separate work.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

const SCHEMA = 'specs/robots/run-assessment.schema.json';
const EXAMPLE = 'specs/robots/examples/unitree-g1/run-assessment-stock.json';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const validator = async () => new Ajv2020({ allErrors: true, strict: true, strictRequired: false }).compile(await json(SCHEMA));
const clone = value => structuredClone(value);

test('legacy livingproof-run-assessment/0.1: the G1 stock example validates and agrees with itself', async () => {
  const validate = await validator();
  const schema = await json(SCHEMA);
  const doc = await json(EXAMPLE);
  assert.match(schema.description, /Legacy livingproof-run-assessment\/0\.1/);
  assert.match(schema.description, /Wilson/);
  assert.match(schema.description, /seed/);
  assert.match(doc.$comment, /Legacy livingproof-run-assessment\/0\.1/);
  assert.ok(validate(doc), JSON.stringify(validate.errors));
  const [run] = doc.runs;
  assert.deepEqual(run.result_ids, doc.decisions.map(d => d.result_id));
  assert.equal(run.k, doc.decisions.filter(d => d.status === 'PASS').length);
  assert.deepEqual([run.k, run.n, run.required_passes, run.grade], [12, 20, 18, 'FAIL']);
  assert.deepEqual(run.failures, doc.decisions.flatMap(d => d.failures));
  assert.ok(run.interval.lower <= run.k / run.n && run.k / run.n <= run.interval.upper);
});

test('legacy livingproof-run-assessment/0.1: statuses, interval method and level are closed sets', async () => {
  const validate = await validator();
  const base = await json(EXAMPLE);
  const bad = [
    d => { d.runs[0].grade = 'MAYBE'; },
    d => { d.decisions[0].status = 'SKIPPED'; },
    d => { d.runs[0].interval.method = 'clopper-pearson'; },
    d => { d.runs[0].interval.level = 0.9; },
    d => { d.runs[0].interval.upper = 1.2; },
    d => { d.policy.version = 'v1'; },
    d => { d.format = 'livingproof-run-assessment/1.0'; },
    d => { d.runs[0].wilson95 = [0, 1]; },
    d => { d.decisions[0].assessor_types = ['robot']; },
    d => { delete d.runs[0].rationale; },
    d => { d.runs[0].result_ids = []; },
  ];
  for (const change of bad) {
    const doc = clone(base);
    change(doc);
    assert.equal(validate(doc), false, change.toString());
  }
});

test('legacy livingproof-run-assessment/0.1: a run without a usable plan and an incompatible run still validate', async () => {
  const validate = await validator();
  const doc = clone(await json(EXAMPLE));
  Object.assign(doc.runs[0], { required_passes: null, grade: 'INSUFFICIENT_EVIDENCE', rationale: 'No usable trial plan; N is the recorded count', run_id: null });
  assert.ok(validate(doc), JSON.stringify(validate.errors));
  doc.runs[0].grade = 'INCOMPATIBLE';
  doc.decisions[0] = { ...doc.decisions[0], status: 'INCOMPATIBLE', reason: 'Unsupported walk-hallway contract', failures: [] };
  assert.ok(validate(doc), JSON.stringify(validate.errors));
});

test('legacy livingproof-run-assessment/0.1: structured failures keep the reporter failure shape', async () => {
  const validate = await validator();
  const doc = clone(await json(EXAMPLE));
  const failing = doc.decisions.find(d => d.failures.length);
  assert.ok(failing, 'example carries at least one structured failure');
  failing.failures[0].extra = 1;
  assert.equal(validate(doc), false);
  delete failing.failures[0].extra;
  delete failing.failures[0].unit;
  assert.equal(validate(doc), false);
});
