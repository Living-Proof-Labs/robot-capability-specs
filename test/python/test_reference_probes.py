# SPDX-License-Identifier: Apache-2.0
"""Independent checks of the Python reference: v1.18.1 thresholds, stdlib-only imports,
command_speed <= 0, and the route geometry edge cases. test/reference-probes.test.mjs
runs the same probes through both references and compares them bit for bit."""

import ast
import copy
import json
import math
import sys
import unittest
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

import livingproof_scenario_parameters
from livingproof_scenario_parameters import ScenarioParameterError, crosses_exit, distance_to_route, resolve

ROOT = Path(__file__).resolve().parents[2]

# Robot widths as published, and the case that carries each one.
#   livingproof-unitree-g1 v1.0.3 robot.json   dimensions.width 0.52 m,  class humanoid
#   livingproof-unitree-go1 v1.0.2 robot.json  dimensions.width 0.282 m, class quadruped
#   livingproof-booster-t1 v1.0.3 robot.json   dimensions.width 0.541 m, class humanoid
ROBOT_WIDTHS = {
    'G1 width from livingproof-unitree-g1 robot.json': (0.52, 'humanoid'),
    'Go1 width from livingproof-unitree-go1 robot.json': (0.282, 'quadruped'),
    'T1 width from livingproof-booster-t1 robot.json': (0.541, 'humanoid'),
}
# capability-verifier v1.18.1 src/capability_verifier/hallway.py
V1_18_1_WALL_CLEARANCE = {'humanoid': 0.05, 'quadruped': 0.10}
V1_18_1_COMMAND_SPEED = 0.5


def load(path):
    return json.loads((ROOT / path).read_text())


def v1_18_1_millimetres(metres):
    return int((Decimal(str(metres)) * 1000).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def v1_18_1(inputs):
    """hallway.thresholds() and hallway.fits_width() as written in capability-verifier v1.18.1."""
    width = inputs['robot_width']['value']
    fall = inputs['fall_base_height']['value']
    clearance = V1_18_1_WALL_CLEARANCE[inputs['robot_class']]
    limits = {
        'time_limit': round(2 * inputs['route_length'] / V1_18_1_COMMAND_SPEED + 5, 4),
        'lateral_limit': round(inputs['clear_width'] / 2 - width / 2, 4),
        'exit_segment': round(inputs['clear_width'] / 2, 4),
        'fall_height': fall,
    }
    fits = v1_18_1_millimetres(width) + 2 * v1_18_1_millimetres(clearance) <= v1_18_1_millimetres(inputs['clear_width'])
    return limits, fits


class V1181Thresholds(unittest.TestCase):
    def setUp(self):
        self.params = load('specs/scenarios/walk-hallway/parameters.json')
        self.cases = load('specs/scenarios/walk-hallway/parameter-cases.json')['cases']

    def test_every_case_matches_the_v1_18_1_formulas(self):
        self.assertEqual(len(self.cases), 20)
        graded = 0
        for case in self.cases:
            with self.subTest(case['name']):
                if 'error' in case['expect']:
                    with self.assertRaises(ScenarioParameterError):
                        resolve(self.params, case['inputs'])
                    continue
                limits, fits = v1_18_1(case['inputs'])
                result = resolve(self.params, case['inputs'])
                self.assertEqual(result['limits'], limits)
                self.assertEqual(result['preconditions']['fits_width'], fits)
                self.assertEqual((limits, fits), (case['expect']['limits'], case['expect']['preconditions']['fits_width']))
                graded += 1
        self.assertEqual(graded, 14)

    def test_robot_cases_use_the_published_widths(self):
        named = {case['name']: case for case in self.cases}
        for name, (width, robot_class) in ROBOT_WIDTHS.items():
            with self.subTest(name):
                inputs = named[name]['inputs']
                self.assertEqual(inputs['robot_width'], {'value': width, 'unit': 'm'})
                self.assertEqual(inputs['robot_class'], robot_class)
                self.assertEqual((inputs['route_length'], inputs['clear_width']), (5.5, 1.5))
        lateral = {name: named[name]['expect']['limits']['lateral_limit'] for name in ROBOT_WIDTHS}
        self.assertEqual(list(lateral.values()), [0.49, 0.609, 0.4795])


class StandardLibraryOnly(unittest.TestCase):
    def test_package_imports_only_the_standard_library(self):
        package = Path(livingproof_scenario_parameters.__file__).parent
        found = []
        for path in sorted(package.rglob('*.py')):
            for node in ast.walk(ast.parse(path.read_text())):
                if isinstance(node, ast.Import):
                    found += [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom):
                    self.assertEqual(node.level, 0, f'{path.name}: relative import')
                    found.append(node.module)
        outside = sorted({name for name in found
                          if name.split('.')[0] not in sys.stdlib_module_names
                          and name.split('.')[0] != 'livingproof_scenario_parameters'})
        self.assertEqual(outside, [])
        self.assertTrue(found)


class CommandSpeed(unittest.TestCase):
    def test_command_speed_not_above_zero_is_an_error_even_when_unused(self):
        params = load('specs/scenarios/walk-hallway/parameters.json')
        sample = load('specs/scenarios/walk-hallway/parameter-cases.json')['cases'][0]['inputs']
        unused = copy.deepcopy(params)
        unused['limits']['time_limit']['expression'] = 30
        for document in (params, unused):
            for value in (0, -0.0, -0.5, -1e-300, math.nan, -math.inf):
                with self.subTest(value=value, used=document is params):
                    trial = copy.deepcopy(document)
                    trial['parameters']['command_speed']['value'] = value
                    with self.assertRaises(ScenarioParameterError) as caught:
                        resolve(trial, sample)
                    self.assertEqual(caught.exception.status, 'ERROR')
                    self.assertEqual(str(caught.exception), 'command_speed must be greater than 0')


class LargeValues(unittest.TestCase):
    def test_large_values_resolve_or_fail_as_scenario_errors(self):
        params = load('specs/scenarios/walk-hallway/parameters.json')
        sample = load('specs/scenarios/walk-hallway/parameter-cases.json')['cases'][0]['inputs']
        for width in (1e300, 1.7e308, 10 ** 30):
            with self.subTest(width=width):
                result = resolve(params, dict(sample, robot_width={'value': width, 'unit': 'm'}))
                self.assertFalse(result['preconditions']['fits_width'])
        with self.assertRaises(ScenarioParameterError) as caught:
            resolve(params, dict(sample, route_length=10 ** 400))
        self.assertEqual(str(caught.exception), 'input route_length is not a finite number')
        # JSON integers past 2^53 are held as the nearest double, as JavaScript holds them.
        self.assertEqual(resolve(params, dict(sample, route_length=2 ** 53 + 1))['inputs']['route_length'], 2.0 ** 53)


class Quantize(unittest.TestCase):
    def test_a_whole_float_under_quantize_is_the_same_as_the_integer(self):
        params = load('specs/scenarios/walk-hallway/parameters.json')
        cases = load('specs/scenarios/walk-hallway/parameter-cases.json')['cases']
        trial = copy.deepcopy(params)
        trial['preconditions']['fits_width']['condition']['args'][0]['args'][1]['args'][0] = 2.0
        self.assertEqual(livingproof_scenario_parameters.reference_errors(trial), [])
        for case in cases:
            if 'error' not in case['expect']:
                self.assertEqual(resolve(trial, case['inputs']), resolve(params, case['inputs']), case['name'])


HALLWAY = [[-3, 0, 0], [3, 0, 0]]
HALLWAY_EXIT = {'points': [[3, -0.75, 0], [3, 0.75, 0]], 'reference': [3, 0, 0]}
LEFT = [[-3, 0, 0], [0, 0, 0], [0, 3, 0]]
LEFT_EXIT = {'points': [[-0.75, 3, 0], [0.75, 3, 0]], 'reference': [0, 3, 0]}
RIGHT = [[-3, 0, 0], [0, 0, 0], [0, -3, 0]]
RIGHT_EXIT = {'points': [[0.75, -3, 0], [-0.75, -3, 0]], 'reference': [0, -3, 0]}
STEPS = [
    ('crosses inside the segment', (2.9, 0), (3.1, 0), True),
    ('starts exactly on the line', (3, 0), (3.2, 0), False),
    ('lands exactly on the line', (2.9, 0), (3, 0), True),
    ('steps back off the line', (3, 0), (2.9, 0), False),
    ('crosses again after stepping back', (2.9, 0), (3.1, 0), True),
    ('returns from past the line', (3.1, 0), (2.9, 0), False),
    ('zero-length step before the line', (2.9, 0), (2.9, 0), False),
    ('zero-length step on the line', (3, 0), (3, 0), False),
    ('zero-length step past the line', (3.1, 0), (3.1, 0), False),
    ('beyond the + endpoint', (2.9, 0.8), (3.1, 0.8), False),
    ('beyond the - endpoint', (2.9, -0.8), (3.1, -0.8), False),
    ('on the + endpoint', (2.9, 0.75), (3.1, 0.75), True),
    ('on the - endpoint', (2.9, -0.75), (3.1, -0.75), True),
    ('along the line', (3, -0.5), (3, 0.5), False),
    ('backward across the line', (3.1, 0.25), (2.9, 0.25), False),
    # Meeting point on the segment, second sample outside: does not cross.
    ('meeting point on the endpoint, second sample outside', (2.5, 0), (3.5, 1.5), False),
    ('meeting point inside, second sample outside', (2.9, 0.7), (3.5, 0.95), False),
    ('one centimetre step, second sample outside', (2.996, 0.7475), (3.006, 0.7505), False),
    # Meeting point outside the segment, second sample inside: does cross.
    ('meeting point outside, second sample inside', (2, 2), (4, 0), True),
    ('meeting point outside the band, second sample inside', (2.8, 0.9), (3.2, 0.7), True),
    ('one centimetre step, second sample inside', (2.996, 0.7525), (3.006, 0.7495), True),
]


def to_left(point):
    return [-point[1], point[0]]


def to_right(point):
    return [point[1], -point[0]]


class RouteGeometryEdges(unittest.TestCase):
    def test_step_rule_is_the_same_on_straight_left_and_right_routes(self):
        for name, p0, p1, expected in STEPS:
            with self.subTest(name):
                self.assertIs(crosses_exit(list(p0), list(p1), HALLWAY, HALLWAY_EXIT), expected)
                self.assertIs(crosses_exit(to_left(p0), to_left(p1), LEFT, LEFT_EXIT), expected)
                self.assertIs(crosses_exit(to_right(p0), to_right(p1), RIGHT, RIGHT_EXIT), expected)

    def test_land_step_back_and_cross_again_gives_two_crossing_steps(self):
        walk = [(2.9, 0), (3, 0), (2.95, 0), (3.05, 0), (3.2, 0)]
        steps = [crosses_exit(walk[i], walk[i + 1], HALLWAY, HALLWAY_EXIT) for i in range(len(walk) - 1)]
        self.assertEqual(steps, [True, False, True, False])

    def test_distance_is_continuous_round_the_corner_and_mirror_symmetric(self):
        radius, steps = 0.3, 4000
        previous, largest = distance_to_route(LEFT, [radius, 0]), 0.0
        for i in range(1, steps + 1):
            angle = 2 * math.pi * i / steps
            point = [radius * math.cos(angle), radius * math.sin(angle)]
            here = distance_to_route(LEFT, point)
            largest = max(largest, abs(here - previous))
            previous = here
            self.assertEqual(distance_to_route(RIGHT, [point[0], -point[1]]), here)
            self.assertLessEqual(here, radius + 1e-15)
        self.assertLessEqual(largest, 2 * math.pi * radius / steps + 1e-12)

    def test_corner_distances(self):
        self.assertEqual(distance_to_route(LEFT, [0.75, -1]), 1.25)  # outside: from the vertex
        self.assertEqual(distance_to_route(LEFT, [1, 0]), 1)
        self.assertEqual(distance_to_route(LEFT, [0, -1]), 1)
        self.assertEqual(distance_to_route(LEFT, [-0.5, 0.25]), 0.25)  # inside: from the nearer leg
        self.assertEqual(distance_to_route(LEFT, [-0.49, 0.49]), 0.49)
        # Outside, (a, -a) is measured from the vertex: a * sqrt(2).
        offset = 0.4
        from_vertex = distance_to_route(LEFT, [offset, -offset])
        self.assertEqual(from_vertex, math.sqrt(offset * offset + offset * offset))
        self.assertAlmostEqual(from_vertex / offset, math.sqrt(2))
        for x in (-10, -3, 0, 1.234, 3, 10):
            for y in (-0.75, -0.49, 0.4795, 0.49, 0.609, 0.75, 2):
                self.assertEqual(distance_to_route(HALLWAY, [x, y, 0]), abs(y))


if __name__ == '__main__':
    unittest.main()
