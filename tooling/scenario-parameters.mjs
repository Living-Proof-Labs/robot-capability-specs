// SPDX-License-Identifier: Apache-2.0
// Reference evaluator for livingproof-scenario-parameters/0.1
// (specs/scenarios/scenario-parameters.schema.json). It resolves a parameter file's limits and
// preconditions from input values, with the rounding and fixed-resolution rules the schema
// states, and checks that every reference in the file names something real. Every failure is
// a ScenarioParameterError with status ERROR: a test-system error, never a robot grade.
import { routeLength } from './world-layout.mjs';

export class ScenarioParameterError extends Error {
  constructor(message) {
    super(message);
    this.status = 'ERROR';
  }
}
const fail = message => { throw new ScenarioParameterError(message); };

// Exact value of a finite double as sign * mantissa * 2^exponent, with BigInt mantissa.
function exactBinary(x) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const hi = view.getUint32(0), lo = view.getUint32(4);
  const sign = hi >>> 31 ? -1n : 1n;
  const biased = (hi >>> 20) & 0x7ff;
  let mantissa = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  if (biased) mantissa |= 1n << 52n;
  return { sign, mantissa, exponent: (biased || 1) - 1075 };
}

// half-even-binary: Python's round(x, decimals) on IEEE 754 doubles. The exact binary value is
// rounded to the nearest multiple of 10^-decimals, ties to even, and the result is the double
// nearest that decimal. 0.40625 -> 0.4062, 0.21875 -> 0.2188 (Number.toFixed gives 0.4063).
export function roundHalfEvenBinary(x, decimals) {
  if (!Number.isFinite(x)) fail(`cannot round a non-finite value ${x}`);
  const { sign, mantissa, exponent } = exactBinary(x);
  const scale = 10n ** BigInt(decimals);
  let num = mantissa * scale, den = 1n;
  if (exponent >= 0) num <<= BigInt(exponent); else den <<= BigInt(-exponent);
  let q = num / den;
  const twice = 2n * (num - q * den);
  if (twice > den || (twice === den && q % 2n === 1n)) q += 1n;
  const result = Number(sign * q) / Number(scale);
  return Object.is(result, -0) ? 0 : result;
}

// half-up-decimal-text: whole number of 10^-decimals units, rounding half up from the shortest
// decimal text of x (Python Decimal(str(x)).quantize(..., ROUND_HALF_UP)). Returns a BigInt.
export function quantizeHalfUpDecimalText(x, decimals) {
  if (!Number.isFinite(x)) fail(`cannot quantize a non-finite value ${x}`);
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(x));
  if (!m) fail(`cannot read ${x} as a decimal`);
  const [, neg, int, frac = '', exp = '0'] = m;
  const digits = BigInt(int + frac);
  const shift = Number(exp) - frac.length + decimals; // value * 10^decimals = digits * 10^shift
  let units;
  if (shift >= 0) units = digits * 10n ** BigInt(shift);
  else {
    const den = 10n ** BigInt(-shift);
    units = digits / den;
    if (2n * (digits % den) >= den) units += 1n; // half up, away from zero
  }
  return neg ? -units : units;
}

const ARITHMETIC = { add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => a / b };
const COMPARE = { le: (a, b) => a <= b, lt: (a, b) => a < b, ge: (a, b) => a >= b, gt: (a, b) => a > b };

function getPath(doc, path) {
  return path.split('.').reduce((o, k) => (o != null && typeof o === 'object' ? o[k] : undefined), doc);
}

// Resolve one raw input value against its declaration.
export function resolveInput(name, spec, raw) {
  if (raw === undefined || raw === null) fail(`input ${name} is missing`);
  if (spec.kind === 'category') {
    if (typeof raw !== 'string' || !raw) fail(`input ${name} is not a category name`);
    return raw;
  }
  let value = raw;
  if (typeof raw === 'object') {
    if (raw.unit !== spec.unit) fail(`input ${name} has unit ${JSON.stringify(raw.unit)}, expected ${spec.unit}`);
    value = raw.value;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`input ${name} is not a finite number`);
  return value;
}

// Read every input from its source documents. world is the world description.
export function readInputs(params, { world, robot, configuration }) {
  const docs = { world, 'robot-profile': robot, 'configuration-profile': configuration };
  const raw = {};
  for (const [name, spec] of Object.entries(params.inputs)) {
    if (spec.rule === 'route-length-from-start-to-exit') raw[name] = routeLength(world, params.places);
    else raw[name] = getPath(docs[spec.source], spec.path);
  }
  return raw;
}

function parameterValue(params, name, inputs) {
  const p = params.parameters[name];
  if (p && typeof p.value === 'number') return p.value;
  if (p && p.by && p.values) {
    const key = inputs[p.by];
    if (!Object.hasOwn(p.values, key)) fail(`no ${name} for ${p.by} ${JSON.stringify(key)}`);
    return p.values[key];
  }
  return fail(`parameter ${name} is not numeric`);
}

function numericInput(params, name, inputs) {
  const spec = params.inputs[name];
  if (!spec || spec.kind !== 'quantity') fail(`input ${name} is not a quantity input`);
  return inputs[name];
}

export function evaluate(expr, params, inputs) {
  if (typeof expr === 'number') return expr;
  if ('input' in expr) return numericInput(params, expr.input, inputs);
  if ('parameter' in expr) return parameterValue(params, expr.parameter, inputs);
  const op = ARITHMETIC[expr.op] ?? fail(`unknown operator ${expr.op}`);
  const value = expr.args.map(a => evaluate(a, params, inputs)).reduce(op);
  if (!Number.isFinite(value)) fail(`expression gives a non-finite value ${value}`);
  return value;
}

// Exact evaluation on whole units of 10^-decimals: { units: BigInt, quantity: boolean }.
function evaluateQuantized(expr, params, inputs, decimals) {
  if (typeof expr === 'number') {
    if (!Number.isInteger(expr)) fail(`bare number ${expr} under quantize must be an integer`);
    return { units: BigInt(expr), quantity: false };
  }
  if ('input' in expr || 'parameter' in expr) {
    return { units: quantizeHalfUpDecimalText(evaluate(expr, params, inputs), decimals), quantity: true };
  }
  const args = expr.args.map(a => evaluateQuantized(a, params, inputs, decimals));
  return args.reduce((a, b) => {
    if (expr.op === 'mul') {
      if (a.quantity && b.quantity) fail('quantize allows mul by a bare integer only');
      return { units: a.units * b.units, quantity: a.quantity || b.quantity };
    }
    if (expr.op === 'add' || expr.op === 'sub') {
      if (a.quantity !== b.quantity) fail(`quantize cannot ${expr.op} a quantity and a bare number`);
      return { units: expr.op === 'add' ? a.units + b.units : a.units - b.units, quantity: a.quantity };
    }
    return fail(`quantize does not allow ${expr.op}`);
  });
}

export function evaluateCondition(pre, params, inputs) {
  const { op, args } = pre.condition;
  const compare = COMPARE[op] ?? fail(`unknown comparison ${op}`);
  if (pre.quantize) {
    const [a, b] = args.map(x => evaluateQuantized(x, params, inputs, pre.quantize.decimals));
    return compare(a.units, b.units);
  }
  const [a, b] = args.map(x => evaluate(x, params, inputs));
  return compare(a, b);
}

// Resolve every limit and precondition. raw holds input values as read from their sources.
export function resolve(params, raw) {
  const problems = referenceErrors(params);
  if (problems.length) fail(problems.join('; '));
  const inputs = Object.fromEntries(Object.entries(params.inputs).map(([n, s]) => [n, resolveInput(n, s, raw[n])]));
  for (const [name, p] of Object.entries(params.parameters)) {
    if (p.by) parameterValue(params, name, inputs); // an unknown class is an ERROR up front
  }
  const limits = {};
  for (const [name, l] of Object.entries(params.limits)) {
    const v = evaluate(l.expression, params, inputs);
    limits[name] = l.round ? roundHalfEvenBinary(v, l.round.decimals) : v;
  }
  const preconditions = {};
  for (const [name, pre] of Object.entries(params.preconditions)) preconditions[name] = evaluateCondition(pre, params, inputs);
  return { inputs, limits, preconditions };
}

// Every reference must name something real: inputs, numeric parameters, category selectors and
// limits named by checks. Returns a list of problems; empty when the file is consistent.
export function referenceErrors(params) {
  const errors = [];
  const inputs = params.inputs ?? {}, parameters = params.parameters ?? {}, limits = params.limits ?? {};
  for (const [name, p] of Object.entries(parameters)) {
    if (p && p.by !== undefined) {
      if (inputs[p.by]?.kind !== 'category') errors.push(`parameters.${name}.by names ${p.by}, which is not a category input`);
    }
  }
  const numeric = name => {
    const p = parameters[name];
    return p && (typeof p.value === 'number' || (p.by !== undefined && p.values && typeof p.values === 'object'));
  };
  const walk = (expr, where, quantized) => {
    if (typeof expr === 'number') {
      if (quantized && !Number.isInteger(expr)) errors.push(`${where}: bare number ${expr} under quantize must be an integer`);
      return;
    }
    if (expr === null || typeof expr !== 'object') return errors.push(`${where}: not an expression`);
    if ('input' in expr) {
      if (!Object.hasOwn(inputs, expr.input)) errors.push(`${where}: unknown input ${expr.input}`);
      else if (inputs[expr.input].kind !== 'quantity') errors.push(`${where}: input ${expr.input} is not a quantity`);
      return;
    }
    if ('parameter' in expr) {
      if (!Object.hasOwn(parameters, expr.parameter)) errors.push(`${where}: unknown parameter ${expr.parameter}`);
      else if (!numeric(expr.parameter)) errors.push(`${where}: parameter ${expr.parameter} is not numeric`);
      return;
    }
    if (!(expr.op in ARITHMETIC)) errors.push(`${where}: unknown operator ${expr.op}`);
    if (quantized && expr.op === 'div') errors.push(`${where}: quantize does not allow div`);
    (expr.args ?? []).forEach((a, i) => walk(a, `${where}.args[${i}]`, quantized));
  };
  for (const key of ['forward', 'sideways', 'turn_rate']) if (params.command?.[key] !== undefined) walk(params.command[key], `command.${key}`, false);
  for (const [name, l] of Object.entries(limits)) walk(l.expression, `limits.${name}.expression`, false);
  for (const [name, pre] of Object.entries(params.preconditions ?? {})) {
    if (!(pre.condition?.op in COMPARE)) errors.push(`preconditions.${name}: unknown comparison ${pre.condition?.op}`);
    (pre.condition?.args ?? []).forEach((a, i) => walk(a, `preconditions.${name}.condition.args[${i}]`, Boolean(pre.quantize)));
  }
  (params.checks ?? []).forEach((c, i) => {
    if (c.limit !== undefined && !Object.hasOwn(limits, c.limit)) errors.push(`checks[${i}].limit names no limit: ${c.limit}`);
  });
  return errors;
}
