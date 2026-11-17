# SPDX-License-Identifier: Apache-2.0
"""The installed Python reference consumes active corner data without a new algorithm."""
import json
import unittest
from pathlib import Path
from livingproof_scenario_parameters import ScenarioParameterError, resolve, route_length

ROOT = Path(__file__).resolve().parents[2]
def load(path):
    return json.loads((ROOT / path).read_text())

class CornerDirectionsTest(unittest.TestCase):
    def test_active_corner_acceptance_matches_historical_corner(self):
        old = load('specs/scenarios/walk-corner/parameters.json')
        world = load('test/fixtures/worlds/hallway-corner-0.2.0.world.json')
        for path in sorted((ROOT / 'specs/scenarios').glob('walk-corner-*/parameters.json')):
            parameters = json.loads(path.read_text())
            self.assertEqual(route_length(world, parameters['places']), 5.5)
            cases = json.loads(path.with_name('parameter-cases.json').read_text())
            for case in cases['cases']:
                with self.subTest(scenario=parameters['scenario']['id'], case=case['name']):
                    if case['expect'].get('error'):
                        with self.assertRaises(ScenarioParameterError):
                            resolve(parameters, case['inputs'])
                    else:
                        self.assertEqual(resolve(parameters, case['inputs']), resolve(old, case['inputs']))
