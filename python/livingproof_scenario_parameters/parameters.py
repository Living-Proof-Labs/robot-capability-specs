# SPDX-License-Identifier: Apache-2.0
"""Resolve a livingproof-scenario-parameters/0.1 file.

Argument order matches ``tooling/scenario-parameters.mjs``:
``evaluate(expr, parameters, inputs)``, ``resolve(parameters, raw)``,
``resolve_input(name, spec, raw)``.
"""

import json
import math
from decimal import Decimal, ROUND_HALF_UP

_ARITHMETIC = {
    'add': lambda a, b: a + b,
    'sub': lambda a, b: a - b,
    'mul': lambda a, b: a * b,
}
_COMPARE = {
    'le': lambda a, b: a <= b,
    'lt': lambda a, b: a < b,
    'ge': lambda a, b: a >= b,
    'gt': lambda a, b: a > b,
}


class ScenarioParameterError(Exception):
    """A test-system error. ``status`` is ``ERROR``, never a robot grade."""

    def __init__(self, message):
        super().__init__(message)
        self.status = 'ERROR'


def _fail(message):
    raise ScenarioParameterError(message)


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _finite(value):
    return _is_number(value) and math.isfinite(value)


def _js_integer(value):
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    return isinstance(value, float) and math.isfinite(value) and value.is_integer()


def _js_number(value):
    if isinstance(value, float) and math.isnan(value):
        return 'NaN'
    if value == math.inf:
        return 'Infinity'
    if value == -math.inf:
        return '-Infinity'
    return str(value)


def _js_json(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False)


def _div(left, right):
    # JavaScript 1/0 is Infinity. Python raises, so the non-finite result is made here.
    if right == 0:
        if left > 0:
            return math.inf
        if left < 0:
            return -math.inf
        return math.nan
    return left / right


def round_half_even_binary(value, decimals):
    """Python ``round(value, decimals)``: half to even on the exact binary value.

    ``0.40625`` to 4 decimal places is ``0.4062``. ``0.21875`` is ``0.2188``.
    """
    if not _finite(value):
        _fail(f'cannot round a non-finite value {_js_number(value)}')
    result = round(float(value), decimals)
    if result == 0:
        return 0.0
    return float(result)


def quantize_half_up_decimal_text(value, decimals):
    """Whole units of ``10^-decimals``, half up from the shortest decimal text.

    This is ``Decimal(str(value)).quantize(..., ROUND_HALF_UP)``. With
    ``decimals`` 3 it is whole millimetres, so ``1.0295`` m is 1030 mm and
    ``1.0305`` m is 1031 mm. The result is an ``int``.
    """
    if not _finite(value):
        _fail(f'cannot quantize a non-finite value {_js_number(value)}')
    quantum = Decimal(1).scaleb(-int(decimals))
    quantized = Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP)
    return int(quantized.scaleb(int(decimals)))


def resolve_input(name, spec, raw):
    """Resolve one raw input against its declaration."""
    if raw is None:
        _fail(f'input {name} is missing')
    if spec['kind'] == 'category':
        if not isinstance(raw, str) or not raw:
            _fail(f'input {name} is not a category name')
        return raw
    value = raw
    if isinstance(raw, dict):
        if 'unit' not in raw or raw['unit'] != spec['unit']:
            shown = 'undefined' if 'unit' not in raw else _js_json(raw['unit'])
            _fail(f'input {name} has unit {shown}, expected {spec["unit"]}')
        value = raw.get('value')
    if not _finite(value):
        _fail(f'input {name} is not a finite number')
    return value


def _get_path(document, path):
    current = document
    for key in path.split('.'):
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def read_inputs(parameters, sources):
    """Read every input from ``sources`` (``world``, ``robot``, ``configuration``)."""
    documents = {
        'world': sources.get('world'),
        'robot-profile': sources.get('robot'),
        'configuration-profile': sources.get('configuration'),
    }
    raw = {}
    for name, spec in parameters['inputs'].items():
        if spec.get('rule') == 'route-length-from-start-to-exit':
            from livingproof_scenario_parameters.geometry import route_length
            raw[name] = route_length(sources.get('world'), parameters['places'])
        else:
            raw[name] = _get_path(documents[spec['source']], spec['path'])
    return raw


def _parameter_value(parameters, name, inputs):
    parameter = parameters['parameters'].get(name)
    if isinstance(parameter, dict) and _is_number(parameter.get('value')):
        if name == 'command_speed' and not parameter['value'] > 0:
            _fail('command_speed must be greater than 0')
        return parameter['value']
    if isinstance(parameter, dict) and parameter.get('by') and isinstance(parameter.get('values'), dict):
        key = inputs[parameter['by']]
        if key not in parameter['values']:
            _fail(f'no {name} for {parameter["by"]} {_js_json(key)}')
        return parameter['values'][key]
    _fail(f'parameter {name} is not numeric')


def _numeric_input(parameters, name, inputs):
    spec = parameters['inputs'].get(name)
    if not spec or spec.get('kind') != 'quantity':
        _fail(f'input {name} is not a quantity input')
    return inputs[name]


def evaluate(expr, parameters, inputs):
    """Evaluate one expression. Same argument order as the JavaScript reference."""
    if _is_number(expr):
        return expr
    if not isinstance(expr, dict):
        _fail('not an expression')
    if 'input' in expr:
        return _numeric_input(parameters, expr['input'], inputs)
    if 'parameter' in expr:
        return _parameter_value(parameters, expr['parameter'], inputs)
    if expr.get('op') not in _ARITHMETIC and expr.get('op') != 'div':
        shown = 'undefined' if 'op' not in expr else ('null' if expr['op'] is None else expr['op'])
        _fail(f'unknown operator {shown}')
    operation = _div if expr['op'] == 'div' else _ARITHMETIC[expr['op']]
    args = [evaluate(arg, parameters, inputs) for arg in expr.get('args', [])]
    value = args[0]
    for arg in args[1:]:
        value = operation(value, arg)
    if not _finite(value):
        _fail(f'expression gives a non-finite value {_js_number(value)}')
    return value


def _evaluate_quantized(expr, parameters, inputs, decimals):
    if _is_number(expr):
        if not _js_integer(expr):
            _fail(f'bare number {expr} under quantize must be an integer')
        return {'units': int(expr), 'quantity': False}
    if isinstance(expr, dict) and ('input' in expr or 'parameter' in expr):
        return {
            'units': quantize_half_up_decimal_text(evaluate(expr, parameters, inputs), decimals),
            'quantity': True,
        }
    args = [_evaluate_quantized(arg, parameters, inputs, decimals) for arg in expr['args']]
    total = args[0]
    for other in args[1:]:
        if expr['op'] == 'mul':
            if total['quantity'] and other['quantity']:
                _fail('quantize allows mul by a bare integer only')
            total = {
                'units': total['units'] * other['units'],
                'quantity': total['quantity'] or other['quantity'],
            }
        elif expr['op'] in ('add', 'sub'):
            if total['quantity'] != other['quantity']:
                _fail(f'quantize cannot {expr["op"]} a quantity and a bare number')
            units = total['units'] + other['units'] if expr['op'] == 'add' else total['units'] - other['units']
            total = {'units': units, 'quantity': total['quantity']}
        else:
            _fail(f'quantize does not allow {expr["op"]}')
    return total


def _evaluate_condition(precondition, parameters, inputs):
    operation = precondition['condition']['op']
    compare = _COMPARE.get(operation)
    if compare is None:
        _fail(f'unknown comparison {operation}')
    args = precondition['condition']['args']
    if precondition.get('quantize'):
        decimals = precondition['quantize']['decimals']
        quantized = [_evaluate_quantized(arg, parameters, inputs, decimals) for arg in args]
        return compare(quantized[0]['units'], quantized[1]['units'])
    values = [evaluate(arg, parameters, inputs) for arg in args]
    return compare(values[0], values[1])


def resolve(parameters, raw):
    """Resolve every input, limit and precondition. ``raw`` holds values as read from their sources."""
    problems = reference_errors(parameters)
    if problems:
        _fail('; '.join(problems))
    inputs = {
        name: resolve_input(name, spec, raw.get(name) if isinstance(raw, dict) else None)
        for name, spec in parameters['inputs'].items()
    }
    for name, parameter in parameters['parameters'].items():
        if isinstance(parameter, dict) and (parameter.get('by') or name == 'command_speed'):
            _parameter_value(parameters, name, inputs)
    limits = {}
    for name, limit in parameters['limits'].items():
        value = evaluate(limit['expression'], parameters, inputs)
        if limit.get('round'):
            value = round_half_even_binary(value, limit['round']['decimals'])
        limits[name] = value
    preconditions = {
        name: _evaluate_condition(precondition, parameters, inputs)
        for name, precondition in parameters['preconditions'].items()
    }
    return {'inputs': inputs, 'limits': limits, 'preconditions': preconditions}


def _shown_operator(expr):
    if 'op' not in expr:
        return 'undefined'
    if expr['op'] is None:
        return 'null'
    return expr['op']


def reference_errors(parameters):
    """Problems in references. Empty when every name in the file points at something real."""
    errors = []
    inputs = parameters.get('inputs') or {}
    parameters_table = parameters.get('parameters') or {}
    limits = parameters.get('limits') or {}

    for name, parameter in parameters_table.items():
        if isinstance(parameter, dict) and 'by' in parameter:
            named = inputs.get(parameter['by'])
            if not isinstance(named, dict) or named.get('kind') != 'category':
                errors.append(f'parameters.{name}.by names {parameter["by"]}, which is not a category input')

    def numeric(name):
        parameter = parameters_table.get(name)
        if not isinstance(parameter, dict):
            return False
        if _is_number(parameter.get('value')):
            return True
        return 'by' in parameter and isinstance(parameter.get('values'), dict)

    def walk(expr, where, quantized):
        if _is_number(expr):
            if quantized and not _js_integer(expr):
                errors.append(f'{where}: bare number {expr} under quantize must be an integer')
            return
        if not isinstance(expr, dict):
            errors.append(f'{where}: not an expression')
            return
        if 'input' in expr:
            if expr['input'] not in inputs:
                errors.append(f'{where}: unknown input {expr["input"]}')
            elif inputs[expr['input']].get('kind') != 'quantity':
                errors.append(f'{where}: input {expr["input"]} is not a quantity')
            return
        if 'parameter' in expr:
            if expr['parameter'] not in parameters_table:
                errors.append(f'{where}: unknown parameter {expr["parameter"]}')
            elif not numeric(expr['parameter']):
                errors.append(f'{where}: parameter {expr["parameter"]} is not numeric')
            return
        if expr.get('op') not in _ARITHMETIC and expr.get('op') != 'div':
            errors.append(f'{where}: unknown operator {_shown_operator(expr)}')
        if quantized and expr.get('op') == 'div':
            errors.append(f'{where}: quantize does not allow div')
        for index, arg in enumerate(expr.get('args') or []):
            walk(arg, f'{where}.args[{index}]', quantized)

    command = parameters.get('command') or {}
    for key in ('forward', 'sideways', 'turn_rate'):
        if key in command:
            walk(command[key], f'command.{key}', False)
    for name, limit in limits.items():
        expression = limit.get('expression') if isinstance(limit, dict) else None
        walk(expression, f'limits.{name}.expression', False)
    for name, precondition in (parameters.get('preconditions') or {}).items():
        condition = precondition.get('condition') if isinstance(precondition, dict) else None
        if not isinstance(condition, dict) or condition.get('op') not in _COMPARE:
            if not isinstance(condition, dict) or 'op' not in condition:
                shown = 'undefined'
            elif condition.get('op') is None:
                shown = 'null'
            else:
                shown = condition['op']
            errors.append(f'preconditions.{name}: unknown comparison {shown}')
        args = condition.get('args') if isinstance(condition, dict) and condition.get('args') is not None else []
        quantized = bool(isinstance(precondition, dict) and precondition.get('quantize'))
        for index, arg in enumerate(args):
            walk(arg, f'preconditions.{name}.condition.args[{index}]', quantized)
    for index, check in enumerate(parameters.get('checks') or []):
        if isinstance(check, dict) and 'limit' in check and check['limit'] not in limits:
            errors.append(f'checks[{index}].limit names no limit: {check["limit"]}')
    return errors
