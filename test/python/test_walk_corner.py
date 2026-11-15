# SPDX-License-Identifier: Apache-2.0
"""walk-corner parameters in the Python reference (specs #40). The scenario has no command."""

import copy
import json
import unittest
from pathlib import Path

from livingproof_scenario_parameters import (
    ScenarioParameterError,
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

    def test_clean_parameter_file_has_no_command_and_no_reference_errors(self):
        self.assertNotIn('command', self.parameters)
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

    def test_walk_hallway_without_its_command_still_resolves_the_same(self):
        hallway = load('specs/scenarios/walk-hallway/parameters.json')
        bare = copy.deepcopy(hallway)
        del bare['command']
        self.assertEqual(reference_errors(bare), [])
        inputs = load('specs/scenarios/walk-hallway/parameter-cases.json')['cases'][0]['inputs']
        self.assertEqual(resolve(bare, inputs)['limits'], resolve(hallway, inputs)['limits'])


if __name__ == '__main__':
    unittest.main()
