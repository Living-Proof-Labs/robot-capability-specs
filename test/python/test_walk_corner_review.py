# SPDX-License-Identifier: Apache-2.0
"""walk-corner time limit in the Python reference (#51): same 27 s for every robot, matching the JS reference."""

import copy
import json
import unittest
from pathlib import Path

from livingproof_scenario_parameters import ScenarioParameterError, resolve

ROOT = Path(__file__).resolve().parents[2]
CORNER = 'specs/scenarios/walk-corner/'


def load(path):
    return json.loads((ROOT / path).read_text())


class WalkCornerTimeLimitTest(unittest.TestCase):
    def setUp(self):
        self.parameters = load(CORNER + 'parameters.json')
        self.case = load(CORNER + 'parameter-cases.json')['cases'][0]

    def test_time_limit_is_the_same_for_every_robot(self):
        limits = set()
        for width in (0.2, 0.52, 1.4):
            for robot_class in ('humanoid', 'quadruped'):
                inputs = copy.deepcopy(self.case['inputs'])
                inputs['robot_width'] = {'value': width, 'unit': 'm'}
                inputs['robot_class'] = robot_class
                limits.add(resolve(self.parameters, inputs)['limits']['time_limit'])
        self.assertEqual(limits, {27})

    def test_time_limit_scales_with_route_and_speed(self):
        for route, speed, expected in ((5.5, 0.5, 27), (6.0, 0.5, 29), (5.5, 1.0, 16)):
            parameters = copy.deepcopy(self.parameters)
            parameters['parameters']['command_speed']['value'] = speed
            inputs = copy.deepcopy(self.case['inputs'])
            inputs['route_length'] = route
            self.assertEqual(resolve(parameters, inputs)['limits']['time_limit'], expected)

    def test_command_speed_zero_is_an_error(self):
        parameters = copy.deepcopy(self.parameters)
        parameters['parameters']['command_speed']['value'] = 0
        with self.assertRaises(ScenarioParameterError) as caught:
            resolve(parameters, self.case['inputs'])
        self.assertEqual(caught.exception.status, 'ERROR')


if __name__ == '__main__':
    unittest.main()
