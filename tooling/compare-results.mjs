#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Compare two livingproof-world-result/0.2 records (for example MuJoCo and Gazebo).
// Usage: node tooling/compare-results.mjs A/result.json B/result.json [--json]
// Exit 0: both valid and complete (per-quantity passes are reported, not enforced);
// 1: a schema error, a missing required quantity or an inconsistent record; 2: usage.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const here = new URL('../specs/worlds/', import.meta.url);
export const SCHEMA = JSON.parse(readFileSync(new URL('hallway-result.schema.json', here), 'utf8'));
export const QUANTITIES = JSON.parse(readFileSync(new URL('hallway-quantities.json', here), 'utf8'));

const validateSchema = new Ajv2020({ allErrors: true, strict: true, strictRequired: false }).compile(SCHEMA);

export function expectedPass(q) {
  if (q.measured === null) return false;
  return q.comparison === 'at_most'
    ? q.measured <= q.canonical + q.tolerance
    : Math.abs(q.measured - q.canonical) <= q.tolerance;
}

/** Return a list of error strings for one record; empty means valid and complete. */
export function check(record, label = 'record') {
  if (!validateSchema(record)) {
    return validateSchema.errors.map(e => `${label}: schema: ${e.instancePath || '/'} ${e.message}`);
  }
  const errors = [];
  if (record.status === 'UNSUPPORTED') return errors;
  const byName = new Map();
  for (const q of record.quantities) {
    if (byName.has(q.name)) errors.push(`${label}: duplicate quantity ${q.name}`);
    byName.set(q.name, q);
  }
  for (const want of QUANTITIES.required) {
    const q = byName.get(want.name);
    if (!q) { errors.push(`${label}: missing required quantity ${want.name}`); continue; }
    for (const key of ['kind', 'unit', 'comparison']) {
      if (q[key] !== want[key]) errors.push(`${label}: ${want.name} ${key} is ${q[key]}, expected ${want[key]}`);
    }
  }
  for (const q of record.quantities) {
    if (q.pass !== expectedPass(q)) errors.push(`${label}: ${q.name} pass is ${q.pass} but ${q.comparison} gives ${expectedPass(q)}`);
  }
  const allPass = record.quantities.every(q => q.pass);
  if ((record.status === 'PASS') !== allPass) errors.push(`${label}: status ${record.status} disagrees with quantity passes`);
  return errors;
}

/** Join two valid records on quantity name. */
export function compare(a, b) {
  const errors = [...check(a, 'A'), ...check(b, 'B')];
  if (errors.length) return { ok: false, errors, rows: [] };
  if (a.status === 'UNSUPPORTED' || b.status === 'UNSUPPORTED') {
    return { ok: true, errors, rows: [], unsupported: [a, b].filter(r => r.status === 'UNSUPPORTED').map(r => `${r.engine.name}: ${r.feature}`) };
  }
  const mapA = new Map(a.quantities.map(q => [q.name, q]));
  const mapB = new Map(b.quantities.map(q => [q.name, q]));
  const names = [...new Set([...mapA.keys(), ...mapB.keys()])];
  const rows = names.map(name => {
    const qa = mapA.get(name), qb = mapB.get(name);
    const va = qa ? qa.measured : null, vb = qb ? qb.measured : null;
    return {
      name,
      canonical: (qa ?? qb).canonical,
      a: va, b: vb,
      difference: va === null || vb === null ? null : vb - va,
      pass_a: qa ? qa.pass : null,
      pass_b: qb ? qb.pass : null,
    };
  });
  return { ok: true, errors, rows, a: a.engine.name, b: b.engine.name };
}

function fmt(v) { return v === null ? '-' : typeof v === 'number' ? Number(v.toPrecision(6)).toString() : String(v); }

function main(argv) {
  const json = argv.includes('--json');
  const files = argv.filter(x => x !== '--json');
  if (files.length !== 2) { console.error('usage: compare-results.mjs A.json B.json [--json]'); return 2; }
  let records;
  try { records = files.map(f => JSON.parse(readFileSync(f, 'utf8'))); }
  catch (e) { console.error(`cannot read result: ${e.message}`); return 1; }
  const result = compare(...records);
  if (json) console.log(JSON.stringify(result, null, 2));
  else if (!result.ok) result.errors.forEach(e => console.error(e));
  else {
    console.log(`| quantity | canonical | A (${result.a}) | B (${result.b}) | B - A | pass A | pass B |`);
    console.log('| --- | ---: | ---: | ---: | ---: | --- | --- |');
    for (const r of result.rows) console.log(`| ${r.name} | ${fmt(r.canonical)} | ${fmt(r.a)} | ${fmt(r.b)} | ${fmt(r.difference)} | ${fmt(r.pass_a)} | ${fmt(r.pass_b)} |`);
    for (const u of result.unsupported ?? []) console.log(`UNSUPPORTED ${u}`);
  }
  return result.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
export { main };
