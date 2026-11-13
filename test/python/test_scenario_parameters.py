# SPDX-License-Identifier: Apache-2.0
"""Conformance tests for the Python scenario-parameter reference."""

import copy
import hashlib
import json
import math
import unittest
from pathlib import Path

from livingproof_scenario_parameters import (
    ScenarioParameterError,
    crosses_exit,
    distance_to_route,
    evaluate,
    quantize_half_up_decimal_text,
    read_inputs,
    reference_errors,
    resolve,
    resolve_input,
    round_half_even_binary,
    route_length,
)

ROOT = Path(__file__).resolve().parents[2]
PARAMETERS_SHA256 = '9226aa6bc0e577863bdc210514e7e7c3a7edc32f49c4f7b46aa7249837f08b3d'
CASES_SHA256 = '4697196d94df5d7d6aba8059d48d732137a67fcefcde990cd937efa5ad2d44e4'
ERROR_MESSAGES = {
    'Robot width in centimetres is an ERROR': 'input robot_width has unit "cm", expected m',
    'Fall height without a unit is an ERROR': 'input fall_base_height has unit undefined, expected m',
    'A robot class with no wall clearance is an ERROR': 'no wall_clearance for robot_class "wheeled"',
    'A missing robot width is an ERROR': 'input robot_width is missing',
    'A robot width that is not a number is an ERROR': 'input robot_width is not a finite number',
    'A missing robot class is an ERROR': 'input robot_class is missing',
}


def load(path):
    return json.loads((ROOT / path).read_text())


def hallway_crosses(p0, p1):
    """Forward step on the straight route: x >= 3 with |y| <= 0.75 at the second sample."""
    if not (p0[0] < 3 <= p1[0]):
        return False
    return abs(p1[1]) <= 0.75


def hallway_meeting(p0, p1):
    """Rejected reading: the lateral test at the interpolated meeting point."""
    if not (p0[0] < 3 <= p1[0]):
        return False
    fraction = (3 - p0[0]) / (p1[0] - p0[0])
    y = p0[1] + fraction * (p1[1] - p0[1])
    return abs(y) <= 0.75


def l_distance(point):
    """L route: y = 0 for x <= 0, and x = 0 for y >= 0."""
    x, y = point[0], point[1]
    first = abs(y) if x <= 0 else math.hypot(x, y)
    last = abs(x) if y >= 0 else math.hypot(x, y)
    return min(first, last)


def l_crosses(p0, p1):
    """Forward step on the L route: y >= 3 with |x| <= 0.75 at the second sample."""
    if not (p0[1] < 3 <= p1[1]):
        return False
    return abs(p1[0]) <= 0.75


def l_meeting(p0, p1):
    """Rejected reading: the lateral test at the interpolated meeting point."""
    if not (p0[1] < 3 <= p1[1]):
        return False
    fraction = (3 - p0[1]) / (p1[1] - p0[1])
    x = p0[0] + fraction * (p1[0] - p0[0])
    return abs(x) <= 0.75


class ScenarioParameterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.params = load('specs/scenarios/walk-hallway/parameters.json')
        cls.cases = load('specs/scenarios/walk-hallway/parameter-cases.json')['cases']
        cls.geometry = load('specs/scenarios/route-geometry-cases.json')
        cls.sample = cls.cases[0]['inputs']

    def test_all_20_parameter_cases_including_6_errors(self):
        self.assertEqual(len(self.cases), 20)
        errors = [case for case in self.cases if case['expect'].get('error')]
        self.assertEqual(len(errors), 6)
        for case in self.cases:
            if case['expect'].get('error'):
                with self.assertRaises(ScenarioParameterError, msg=case['name']) as caught:
                    resolve(self.params, case['inputs'])
                self.assertEqual(caught.exception.status, 'ERROR', case['name'])
                self.assertEqual(str(caught.exception), ERROR_MESSAGES[case['name']], case['name'])
                continue
            result = resolve(self.params, case['inputs'])
            self.assertEqual(result['limits'], case['expect']['limits'], case['name'])
            self.assertEqual(result['preconditions'], case['expect']['preconditions'], case['name'])

    def test_rounding_tie_half_even_and_millimetre_half_up(self):
        self.assertEqual(round_half_even_binary(0.40625, 4), 0.4062)
        self.assertEqual(round_half_even_binary(0.21875, 4), 0.2188)
        self.assertEqual(round_half_even_binary(2.675, 2), 2.67)
        self.assertEqual(round_half_even_binary(-0.40625, 4), -0.4062)
        self.assertEqual(quantize_half_up_decimal_text(1.0295, 3), 1030)
        self.assertEqual(quantize_half_up_decimal_text(1.0305, 3), 1031)
        self.assertEqual(quantize_half_up_decimal_text(-0.0005, 3), -1)
        # Whole-millimetre comparison holds where the raw floats do not.
        self.assertFalse(1.03 + 2 * 0.05 <= 1.13)
        self.assertFalse(1.3 + 2 * 0.05 <= 1.4)
        exact = next(case for case in self.cases if case['name'].startswith('Exact fit in millimetres: 1.03'))
        result = resolve(self.params, exact['inputs'])
        self.assertTrue(result['preconditions']['fits_width'])
        self.assertEqual(result['limits']['lateral_limit'], 0.05)

    def test_command_speed_not_positive_is_error(self):
        for value in (0, -0.5):
            trial = copy.deepcopy(self.params)
            trial['parameters']['command_speed']['value'] = value
            with self.assertRaises(ScenarioParameterError) as caught:
                resolve(trial, self.sample)
            self.assertEqual(caught.exception.status, 'ERROR')
            self.assertEqual(str(caught.exception), 'command_speed must be greater than 0')

    def test_non_finite_result_is_error(self):
        with self.assertRaises(ScenarioParameterError) as caught:
            evaluate({'op': 'div', 'args': [1, 0]}, self.params, {})
        self.assertEqual(caught.exception.status, 'ERROR')
        self.assertEqual(str(caught.exception), 'expression gives a non-finite value Infinity')
        raw = dict(self.sample)
        raw['route_length'] = math.inf
        with self.assertRaises(ScenarioParameterError) as caught:
            resolve(self.params, raw)
        self.assertEqual(caught.exception.status, 'ERROR')
        self.assertIn('not a finite number', str(caught.exception))

    def test_quantity_resolves_to_value_and_unit_must_match(self):
        spec = self.params['inputs']['robot_width']
        self.assertEqual(resolve_input('robot_width', spec, {'value': 0.52, 'unit': 'm'}), 0.52)
        self.assertEqual(resolve_input('robot_width', spec, 0.52), 0.52)
        with self.assertRaises(ScenarioParameterError) as caught:
            resolve_input('robot_width', spec, {'value': 52, 'unit': 'cm'})
        self.assertEqual(caught.exception.status, 'ERROR')
        self.assertEqual(str(caught.exception), 'input robot_width has unit "cm", expected m')

    def test_reference_errors_by_not_category(self):
        self._assert_rule(lambda p: p['parameters']['wall_clearance'].__setitem__('by', 'robot_width'),
                          'not a category input')

    def test_reference_errors_bare_number_under_quantize(self):
        def edit(p):
            p['preconditions']['fits_width']['condition']['args'][0]['args'][1]['args'][0] = 0.5
        self._assert_rule(edit, 'bare number 0.5 under quantize must be an integer')

    def test_reference_errors_not_an_expression(self):
        self._assert_rule(lambda p: p['limits']['fall_height'].__setitem__('expression', None),
                          'not an expression')

    def test_reference_errors_unknown_input(self):
        def edit(p):
            p['limits']['lateral_limit']['expression']['args'][0]['args'][0] = {'input': 'hallway_width'}
        self._assert_rule(edit, 'unknown input hallway_width')

    def test_reference_errors_input_not_quantity(self):
        self._assert_rule(lambda p: p['limits']['fall_height'].__setitem__('expression', {'input': 'robot_class'}),
                          'robot_class is not a quantity')

    def test_reference_errors_unknown_parameter(self):
        def edit(p):
            p['limits']['time_limit']['expression']['args'][0]['args'][1] = {'parameter': 'speed'}
        self._assert_rule(edit, 'unknown parameter speed')

    def test_reference_errors_parameter_not_numeric(self):
        def edit(p):
            p['limits']['time_limit']['expression']['args'][0]['args'][1] = {'parameter': 'trials'}
        self._assert_rule(edit, 'parameter trials is not numeric')

    def test_reference_errors_unknown_operator(self):
        self._assert_rule(lambda p: p['limits']['time_limit'].__setitem__('expression', {'op': 'pow', 'args': [2, 3]}),
                          'unknown operator pow')

    def test_reference_errors_quantize_div(self):
        def edit(p):
            p['preconditions']['fits_width']['condition']['args'][1] = {
                'op': 'div', 'args': [{'input': 'clear_width'}, 1],
            }
        self._assert_rule(edit, 'quantize does not allow div')

    def test_reference_errors_unknown_comparison(self):
        self._assert_rule(lambda p: p['preconditions']['fits_width']['condition'].__setitem__('op', 'eq'),
                          'unknown comparison eq')

    def test_reference_errors_check_limit(self):
        self._assert_rule(lambda p: p['checks'][1].__setitem__('limit', 'lateral'),
                          'checks[1].limit names no limit: lateral')

    def test_reference_errors_command_reference(self):
        self._assert_rule(lambda p: p['command'].__setitem__('forward', {'input': 'nope'}),
                          'command.forward: unknown input nope')

    def test_quantize_rejects_multiplying_two_quantities(self):
        def edit(p):
            p['preconditions']['fits_width']['condition']['args'][0]['args'][1]['args'][0] = {'input': 'robot_width'}
        trial = self._mutated(edit)
        self.assertEqual(reference_errors(trial), [])
        with self.assertRaises(ScenarioParameterError) as caught:
            resolve(trial, self.sample)
        self.assertIn('mul by a bare integer only', str(caught.exception))
        self.assertEqual(caught.exception.status, 'ERROR')

    def test_geometry_cases_match_closed_forms(self):
        self.assertEqual(self.geometry['format'], 'livingproof-route-geometry-cases/0.1')
        straight, corner = self.geometry['cases']
        self.assertEqual(straight['name'], 'hallway-open passage-centreline')
        self.assertEqual(corner['name'], 'L-shaped route')
        self.assertTrue(any('endpoint' in query['name'] for query in straight['distances']))
        self.assertTrue(any('second sample is outside' in query['name'] for query in straight['crossings']))
        self.assertTrue(any('second sample is inside' in query['name'] for query in straight['crossings']))
        self.assertTrue(any('tie' in query['name'] for query in corner['distances']))
        outside = next(query for query in corner['distances'] if query['point'][:2] == [0.5, 0.5])
        self.assertEqual(outside['name'], 'outside the corner, nearer the last leg')
        self.assertEqual(outside['distance'], 0.5)
        self.assertTrue(any('second sample is outside' in query['name'] for query in corner['crossings']))
        self.assertTrue(any('second sample is inside' in query['name'] for query in corner['crossings']))
        for query in straight['distances']:
            self.assertEqual(query['distance'], abs(query['point'][1]), query['name'])
            self.assertEqual(distance_to_route(straight['route'], query['point']), query['distance'], query['name'])
        for query in straight['crossings']:
            self.assertEqual(query['crosses'], hallway_crosses(query['p0'], query['p1']), query['name'])
            self.assertEqual(crosses_exit(query['p0'], query['p1'], straight['route'], straight['exit']),
                             query['crosses'], query['name'])
        for query in corner['distances']:
            self.assertEqual(query['distance'], l_distance(query['point']), query['name'])
            self.assertEqual(distance_to_route(corner['route'], query['point']), query['distance'], query['name'])
        for query in corner['crossings']:
            self.assertEqual(query['crosses'], l_crosses(query['p0'], query['p1']), query['name'])
            self.assertEqual(crosses_exit(query['p0'], query['p1'], corner['route'], corner['exit']),
                             query['crosses'], query['name'])
        # The meeting-point reading must disagree, both ways, on the named cases.
        disagreed = []
        for query in straight['crossings']:
            if 'meeting point' not in query['name'] and 'one centimetre' not in query['name']:
                continue
            self.assertNotEqual(hallway_meeting(query['p0'], query['p1']), query['crosses'], query['name'])
            disagreed.append(query['crosses'])
        for query in corner['crossings']:
            if 'meeting point' not in query['name']:
                continue
            self.assertNotEqual(l_meeting(query['p0'], query['p1']), query['crosses'], query['name'])
            disagreed.append(query['crosses'])
        self.assertIn(True, disagreed)
        self.assertIn(False, disagreed)

    def test_hallway_open_crossing_is_the_second_sample(self):
        straight = self.geometry['cases'][0]
        xs = [-1, 0, 2, 2.5, 2.8, 2.9, 2.996, 3, 3.006, 3.1, 3.2, 3.5, 4]
        ys = [-1.5, -1, -0.8, -0.75, -0.5, 0, 0.5, 0.7, 0.7475, 0.7495, 0.75,
              0.7505, 0.7525, 0.8, 0.9, 0.95, 1, 1.5, 2]
        for x0 in xs:
            for y0 in ys:
                for x1 in xs:
                    for y1 in ys:
                        expected = x0 < 3 <= x1 and abs(y1) <= 0.75
                        got = crosses_exit([x0, y0, 0], [x1, y1, 0], straight['route'], straight['exit'])
                        self.assertEqual(got, expected, f'{x0},{y0} -> {x1},{y1}')

    def test_route_length_matches_hallway_open_and_the_l_shape(self):
        hallway = load('test/fixtures/worlds/hallway-open-0.1.0.world.json')
        corner = load('test/fixtures/worlds/l-shaped.world.json')
        self.assertEqual(route_length(hallway, self.params['places']), 5.5)
        self.assertEqual(route_length(corner, {'start': 'spawn-entrance', 'route': 'route-centreline'}), 5.5)

    def test_read_inputs_from_the_g1_example(self):
        world = load('test/fixtures/worlds/hallway-open-0.1.0.world.json')
        robot = load('specs/robots/examples/unitree-g1/robot.json')
        for name in ('stock', 'playground'):
            configuration = load(f'specs/robots/examples/unitree-g1/configurations/{name}.json')
            raw = read_inputs(self.params, {'world': world, 'robot': robot, 'configuration': configuration})
            self.assertEqual(raw['robot_width'], robot['dimensions']['width'])
            result = resolve(self.params, raw)
            self.assertEqual(result['inputs']['robot_width'], 0.45)
            self.assertEqual(result['inputs']['route_length'], 5.5)
            self.assertEqual(result['limits']['lateral_limit'], 0.525)
            self.assertTrue(result['preconditions']['fits_width'])

    def test_parameter_files_are_the_v2_1_0_bytes(self):
        self.assertEqual(hashlib.sha256((ROOT / 'specs/scenarios/walk-hallway/parameters.json').read_bytes()).hexdigest(),
                         PARAMETERS_SHA256)
        self.assertEqual(hashlib.sha256((ROOT / 'specs/scenarios/walk-hallway/parameter-cases.json').read_bytes()).hexdigest(),
                         CASES_SHA256)

    def test_clean_parameter_file_has_no_reference_errors(self):
        self.assertEqual(reference_errors(self.params), [])

    def test_package_is_stdlib_only_for_python_3_10(self):
        text = (ROOT / 'python/pyproject.toml').read_text()
        self.assertIn('requires-python = ">=3.10"', text)
        self.assertIn('dependencies = []', text)

    def _mutated(self, edit):
        trial = copy.deepcopy(self.params)
        edit(trial)
        return trial

    def _assert_rule(self, edit, text):
        trial = self._mutated(edit)
        errors = reference_errors(trial)
        self.assertTrue(any(text in item for item in errors), errors)
        with self.assertRaises(ScenarioParameterError) as caught:
            resolve(trial, self.sample)
        self.assertEqual(caught.exception.status, 'ERROR')
        self.assertIn(text, str(caught.exception))


if __name__ == '__main__':
    unittest.main()
