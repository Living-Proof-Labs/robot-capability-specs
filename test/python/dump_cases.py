# SPDX-License-Identifier: Apache-2.0
"""Print Python reference results as JSON for the JavaScript parity test."""

import copy
import json
import sys
from pathlib import Path

from livingproof_scenario_parameters import (
    ScenarioParameterError,
    crosses_exit,
    distance_to_route,
    evaluate,
    quantize_half_up_decimal_text,
    reference_errors,
    resolve,
    round_half_even_binary,
    route_length,
)

ROOT = Path(__file__).resolve().parents[2]


def load(path):
    return json.loads((ROOT / path).read_text())


def parameter_result(parameters, raw):
    try:
        result = resolve(parameters, raw)
    except ScenarioParameterError as error:
        return {'status': error.status, 'message': str(error)}
    return {
        'status': 'ok',
        'limits': result['limits'],
        'preconditions': result['preconditions'],
        'inputs': result['inputs'],
    }


def main():
    probe = json.loads(sys.stdin.read() or '{}')
    parameters = load('specs/scenarios/walk-hallway/parameters.json')
    cases = load('specs/scenarios/walk-hallway/parameter-cases.json')
    geometry = load('specs/scenarios/route-geometry-cases.json')
    sample = cases['cases'][0]['inputs']
    out = {
        'parameters': [
            {'name': case['name'], **parameter_result(parameters, case['inputs'])}
            for case in cases['cases']
        ],
        'geometry': [
            {
                'name': case['name'],
                'distances': [distance_to_route(case['route'], query['point']) for query in case['distances']],
                'crossings': [
                    crosses_exit(query['p0'], query['p1'], case['route'], case['exit'])
                    for query in case['crossings']
                ],
            }
            for case in geometry['cases']
        ],
        'route_length': [],
    }
    hallway = load('test/fixtures/worlds/hallway-open-0.1.0.world.json')
    corner = load('test/fixtures/worlds/l-shaped.world.json')
    out['route_length'] = [
        {'name': 'hallway-open', 'length': route_length(hallway, parameters['places'])},
        {'name': 'l-shaped', 'length': route_length(corner, {'start': 'spawn-entrance', 'route': 'route-centreline'})},
    ]
    speed = []
    for value in (0, -0.5):
        trial = copy.deepcopy(parameters)
        trial['parameters']['command_speed']['value'] = value
        speed.append({'value': value, **parameter_result(trial, sample)})
    out['speed'] = speed
    try:
        evaluate({'op': 'div', 'args': [1, 0]}, parameters, {})
        out['divide_by_zero'] = None
    except ScenarioParameterError as error:
        out['divide_by_zero'] = {'status': error.status, 'message': str(error)}
    rounding = probe.get('rounding') or {}
    out['rounding'] = {
        'half_even': [round_half_even_binary(value, decimals) for value, decimals in rounding.get('half_even', [])],
        'half_up': [quantize_half_up_decimal_text(value, decimals) for value, decimals in rounding.get('half_up', [])],
    }
    out['mutations'] = {
        name: reference_errors(document) for name, document in (probe.get('mutations') or {}).items()
    }
    json.dump(out, sys.stdout)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
