# SPDX-License-Identifier: Apache-2.0
"""Run probe operations through the Python reference for test/reference-probes.test.mjs.

Reads ``{"probes": [[op, args], ...]}`` on stdin. Numbers travel as IEEE 754 bit
patterns (``{"f64": "<16 hex digits>"}``) both ways, so -0.0, NaN, infinities and the
last bit of every result survive the trip and the comparison is exact.
"""

import json
import struct
import sys

from livingproof_scenario_parameters import (
    ScenarioParameterError,
    crosses_exit,
    distance_to_route,
    evaluate,
    quantize_half_up_decimal_text,
    reference_errors,
    resolve,
    round_half_even_binary,
)


def decode(value):
    if isinstance(value, dict):
        if set(value) == {'f64'}:
            return struct.unpack('>d', bytes.fromhex(value['f64']))[0]
        return {key: decode(item) for key, item in value.items()}
    if isinstance(value, list):
        return [decode(item) for item in value]
    return value


def encode(value):
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        return {'f64': struct.pack('>d', float(value)).hex()}
    if isinstance(value, dict):
        return {key: encode(item) for key, item in value.items()}
    return [encode(item) for item in value]


OPERATIONS = {
    'round': lambda value, decimals: round_half_even_binary(value, int(decimals)),
    'quantize': lambda value, decimals: str(quantize_half_up_decimal_text(value, int(decimals))),
    'resolve': resolve,
    'evaluate': lambda expr, parameters: evaluate(expr, parameters, {}),
    'reference_errors': reference_errors,
    'distance': distance_to_route,
    'crosses': crosses_exit,
}


def run(operation, args):
    try:
        return {'ok': encode(OPERATIONS[operation](*decode(args)))}
    except ScenarioParameterError as error:
        return {'status': error.status, 'message': str(error)}
    except Exception as error:  # a crash is a result too: the other language must match it
        return {'crash': type(error).__name__}


def main():
    probes = json.loads(sys.stdin.read())['probes']
    json.dump([run(operation, args) for operation, args in probes], sys.stdout)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
