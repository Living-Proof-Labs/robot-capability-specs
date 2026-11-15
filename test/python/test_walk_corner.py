# SPDX-License-Identifier: Apache-2.0
"""walk-corner parameters and the route follower in the Python reference (specs #40)."""

import copy
import json
import math
import unittest
from pathlib import Path

from livingproof_scenario_parameters import (
    ScenarioParameterError,
    follow_route,
    point_along_route,
    read_inputs,
    reference_errors,
    resolve,
    route_length,
)

ROOT = Path(__file__).resolve().parents[2]
CORNER = 'specs/scenarios/walk-corner/'


def load(path):
    return json.loads((ROOT / path).read_text())


class WalkCornerTest(unittest.TestCase):
    def setUp(self):
        self.parameters = load(CORNER + 'parameters.json')
        self.world = load('test/fixtures/worlds/hallway-corner-0.1.0.world.json')

    def test_clean_parameter_file_has_no_reference_errors(self):
        self.assertEqual(reference_errors(self.parameters), [])

    def test_route_length_on_hallway_corner_is_5_5(self):
        self.assertEqual(route_length(self.world, self.parameters['places']), 5.5)

    def test_every_parameter_case(self):
        cases = load(CORNER + 'parameter-cases.json')
        for case in cases['cases']:
            with self.subTest(case['name']):
                if case['expect'].get('error'):
                    with self.assertRaises(ScenarioParameterError) as caught:
                        resolve(self.parameters, case['inputs'])
                    self.assertEqual(caught.exception.status, 'ERROR')
                    continue
                result = resolve(self.parameters, case['inputs'])
                self.assertEqual(result['limits'], case['expect']['limits'])
                self.assertEqual(result['preconditions'], case['expect']['preconditions'])

    def test_read_inputs_from_hallway_corner_and_the_g1_example(self):
        robot = load('specs/robots/examples/unitree-g1/robot.json')
        configuration = load('specs/robots/examples/unitree-g1/configurations/playground.json')
        raw = read_inputs(self.parameters, {'world': self.world, 'robot': robot, 'configuration': configuration})
        result = resolve(self.parameters, raw)
        self.assertEqual(result['inputs']['route_length'], 5.5)
        self.assertEqual(result['limits']['time_limit'], 27)

    def test_reference_errors_for_a_bad_follower(self):
        bad = copy.deepcopy(self.parameters)
        bad['command']['turn_rate']['rule'] = 'stanley'
        bad['command']['turn_rate']['max_turn_rate']['value'] = 0
        errors = reference_errors(bad)
        self.assertIn('command.turn_rate: route-follower needs rule pure-pursuit-v1, got stanley', errors)
        self.assertIn('command.turn_rate.max_turn_rate must be greater than 0', errors)
        with self.assertRaises(ScenarioParameterError):
            resolve(bad, load(CORNER + 'parameter-cases.json')['cases'][0]['inputs'])


class RouteFollowerTest(unittest.TestCase):
    def test_route_follower_cases(self):
        doc = load('specs/scenarios/route-follower-cases.json')
        self.assertEqual(doc['format'], 'livingproof-route-follower-cases/0.1')
        follower = doc['follower']
        for case in doc['cases']:
            for step in case['steps']:
                with self.subTest(f"{case['name']}: {step['name']}"):
                    got = follow_route(
                        case['route'], step['base'], step['yaw_deg'] * math.pi / 180,
                        follower['forward'], follower['lookahead'], follower['max_turn_rate'],
                        follower['sideways'],
                    )
                    for index, want in enumerate(step['command']):
                        if want == 0:
                            self.assertEqual(got[index], 0)
                            self.assertEqual(math.copysign(1, got[index]), 1.0)
                        else:
                            self.assertLessEqual(abs(got[index] - want), doc['tolerance'])

    def test_straight_route_on_the_route_is_exactly_the_constant_command(self):
        route = [[-3, 0, 0], [3, 0, 0]]
        for x in (-2.5, -1.0, 0.0, 2.9):
            self.assertEqual(follow_route(route, [x, 0, 0], 0.0, 0.5, 0.75, 1.0), [0.5, 0.0, 0.0])

    def test_point_along_route(self):
        route = [[-3, 0, 0], [0, 0, 0], [0, 3, 0]]
        self.assertEqual(point_along_route(route, 0), (-3, 0))
        self.assertEqual(point_along_route(route, 3.75), (0, 0.75))
        self.assertEqual(point_along_route(route, 6.5), (0, 3.5))
        self.assertEqual(point_along_route(route, -1), (-3, 0))

    def test_bad_follower_values_are_errors(self):
        route = [[-3, 0, 0], [0, 0, 0], [0, 3, 0]]
        with self.assertRaises(ScenarioParameterError):
            follow_route(route, [0, 0], 0.0, 0.5, 0.0, 1.0)
        with self.assertRaises(ScenarioParameterError):
            follow_route(route, [0, 0], 0.0, 0.5, 0.75, 0.0)


if __name__ == '__main__':
    unittest.main()
