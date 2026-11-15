# SPDX-License-Identifier: Apache-2.0
"""Reference resolver for livingproof-scenario-parameters/0.1.

This package matches ``tooling/scenario-parameters.mjs`` and the route measures
in ``tooling/world-layout.mjs``. A failure is a :class:`ScenarioParameterError`
with ``status == "ERROR"``: a test-system error, never a robot grade.

Install a released catalog tag, never a branch::

    pip install "git+https://github.com/Living-Proof-Labs/robot-capability-specs@vX.Y.Z#subdirectory=python"
"""

from livingproof_scenario_parameters.geometry import crosses_exit, distance_to_route, route_length
from livingproof_scenario_parameters.parameters import (
    ScenarioParameterError,
    evaluate,
    quantize_half_up_decimal_text,
    read_inputs,
    reference_errors,
    resolve,
    resolve_input,
    round_half_even_binary,
)

__all__ = [
    'ScenarioParameterError',
    'crosses_exit',
    'distance_to_route',
    'evaluate',
    'quantize_half_up_decimal_text',
    'read_inputs',
    'reference_errors',
    'resolve',
    'resolve_input',
    'round_half_even_binary',
    'route_length',
]
