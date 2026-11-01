#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Compare two livingproof-world-result/0.2 records (for example MuJoCo and Gazebo).
// Usage: node tooling/compare-results.mjs one/result.json other/result.json [--json]
// Columns follow each record's engine field (MuJoCo first, then Gazebo), never argument order.
// Grade PASS only if both records are valid and every required quantity passes in both.
// Exit 0: PASS; 1: FAIL; 3: UNSUPPORTED (either record); 4: INVALID (schema error, missing
// required quantity or inconsistent record); 2: usage or unreadable file.
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

export const ENGINE_ORDER = ['mujoco', 'gazebo'];
export const EXIT = { PASS: 0, FAIL: 1, USAGE: 2, UNSUPPORTED: 3, INVALID: 4 };

function rank(record) {
  const i = ENGINE_ORDER.indexOf(String(record?.engine?.name).toLowerCase());
  return i === -1 ? ENGINE_ORDER.length : i;
}

/** Order two records by engine (MuJoCo, then Gazebo, then others by name); stable otherwise. */
export function orderByEngine(x, y) {
  const swap = rank(y) < rank(x) || (rank(x) === rank(y) && rank(x) === ENGINE_ORDER.length &&
    String(y.engine.name) < String(x.engine.name));
  return swap ? [y, x] : [x, y];
}

/**
 * Join two records on quantity name with columns ordered by engine.
 * difference = first engine's measured - second engine's (MuJoCo - Gazebo).
 */
export function compare(x, y) {
  const [first, second] = orderByEngine(x, y);
  const engines = [first, second].map(r => r?.engine?.name ?? 'unknown');
  const errors = [...check(first, engines[0]), ...check(second, engines[1])];
  if (errors.length) return { grade: 'INVALID', engines, errors, rows: [] };
  const unsupported = [first, second].filter(r => r.status === 'UNSUPPORTED').map(r => `${r.engine.name}: ${r.feature}`);
  if (unsupported.length) return { grade: 'UNSUPPORTED', engines, errors, unsupported, rows: [] };
  const maps = [first, second].map(r => new Map(r.quantities.map(q => [q.name, q])));
  const required = new Set(QUANTITIES.required.map(q => q.name));
  const names = [...new Set([...maps[0].keys(), ...maps[1].keys()])];
  const rows = names.map(name => {
    const [q1, q2] = maps.map(m => m.get(name));
    const v1 = q1 ? q1.measured : null, v2 = q2 ? q2.measured : null;
    return {
      name,
      required: required.has(name),
      canonical: (q1 ?? q2).canonical,
      [engines[0]]: { measured: v1, deviation: q1 ? q1.deviation : null, pass: q1 ? q1.pass : null },
      [engines[1]]: { measured: v2, deviation: q2 ? q2.deviation : null, pass: q2 ? q2.pass : null },
      difference: v1 === null || v2 === null ? null : v1 - v2,
    };
  });
  const failed = rows.filter(r => r.required && !(r[engines[0]].pass && r[engines[1]].pass)).map(r => r.name);
  return { grade: failed.length ? 'FAIL' : 'PASS', engines, errors, failed, rows };
}

function fmt(v) { return v === null || v === undefined ? '-' : typeof v === 'number' ? Number(v.toPrecision(6)).toString() : String(v); }

function main(argv) {
  const json = argv.includes('--json');
  const files = argv.filter(x => x !== '--json');
  if (files.length !== 2) { console.error('usage: compare-results.mjs one.json other.json [--json]'); return EXIT.USAGE; }
  let records;
  try { records = files.map(f => JSON.parse(readFileSync(f, 'utf8'))); }
  catch (e) { console.error(`cannot read result: ${e.message}`); return EXIT.USAGE; }
  const result = compare(...records);
  const [e1, e2] = result.engines;
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    result.errors.forEach(e => console.error(e));
    if (result.rows.length) {
      console.log(`| quantity | canonical | ${e1} | ${e1} deviation | ${e2} | ${e2} deviation | ${e1} - ${e2} | ${e1} pass | ${e2} pass |`);
      console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |');
      for (const r of result.rows) {
        console.log(`| ${r.name} | ${fmt(r.canonical)} | ${fmt(r[e1].measured)} | ${fmt(r[e1].deviation)} | ${fmt(r[e2].measured)} | ${fmt(r[e2].deviation)} | ${fmt(r.difference)} | ${fmt(r[e1].pass)} | ${fmt(r[e2].pass)} |`);
      }
    }
    for (const u of result.unsupported ?? []) console.log(`UNSUPPORTED ${u}`);
    for (const f of result.failed ?? []) console.log(`FAILED ${f}`);
    console.log(`grade: ${result.grade}`);
  }
  return EXIT[result.grade];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
export { main };
