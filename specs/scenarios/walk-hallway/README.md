<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Walk the open hallway, scenario 0.1.0

Copyright 2026 Living Proof Labs contributors. [CC BY 4.0](../../../LICENSES/CC-BY-4.0.txt).

A robot uses the controller in its selected configuration profile to walk the
[open hallway world](../../worlds/hallways.md) from `spawn-entrance` to `exit`.
The scenario is robot-neutral: robots, configurations and simulators are the
only literals, and every number is a named parameter resolved from acceptance
and the robot and configuration profiles. Formats are defined in
[robot and configuration profiles](../../robots/README.md); terms in the
[glossary](../../../docs/glossary.md).

## Stories

| Story | Scenario |
| --- | --- |
| As a robot maker, I want my robot walked through a standard hallway with its own published controller, so that I can show it walks a narrow passage without touching the walls or falling. | `A robot walks the open hallway` |
| As a verifier, I want the scenario judged against each robot's own size and configuration, so that a humanoid and a quadruped are held to fair, declared thresholds. | `A robot walks the open hallway` |
| As a reviewer, I want every trial reported, including failures, with seeds and versions, so that a pass rate is honest and reproducible. | `Repeated trials are reported in full` |
| As a verifier, I want a robot that cannot fit reported as `UNSUPPORTED` before it runs, so that a non-result is never shown as a pass or a failure. | `A robot that cannot meet the preconditions` |
| As a robotics team, I want the same G1 walked with each configuration profile, so that evidence shows which pluggable controller is better. | `Each configuration profile walks the same robot` |
| As a reviewer, I want both configurations shown even when one fails, so that a weak controller is visible rather than dropped. | `The comparison shows both configurations` |
| As a verifier, I want a configuration the robot does not offer reported as `UNSUPPORTED`, so that a missing profile is never shown as a failed walk. | `A configuration that is not offered` |

Examples: [walk-hallway.feature](walk-hallway.feature) and
[compare-configurations.feature](compare-configurations.feature).

## Metrics

| Metric | Unit | Definition | Judged |
| --- | --- | --- | --- |
| `reached_exit` | true or false | The base origin crosses `exit` | Must be true |
| `time_to_exit` | s | First time the base crosses `exit` | At most `time_limit` |
| `wall_contacts` | list | Each contact between any robot body and either side wall, with its wall, start and end time (s) and depth (m) | Must be empty |
| `min_base_height` | m | Lowest base height above the floor | At least `fall_height` |
| `max_abs_lateral` | m | Largest sideways distance of the base from the centreline | At most `lateral_limit` |

Metrics are evaluated from the recorded trajectory and contact log, not inside
the controller loop.

## Evaluators

The simulator emits observations only; it does not grade. The capability
verifier assesses each trial with these evaluators, then applies
`all-required-v1` per trial and aggregates trials as k of N with a Wilson 95%
interval.

| Evaluator | Observation | FAIL when | Threshold source |
| --- | --- | --- | --- |
| `hallway-exit-reached` | `exit_time` (s, absent if never crossed) | absent or later than `time_limit` | Acceptance |
| `hallway-lateral-limit` | `max_abs_lateral` (m, with its time) | greater than `lateral_limit` | World clear width and robot profile `width` |
| `hallway-wall-contact` | `wall_contacts` (list; each with wall, start and end time, and depth) | the list is not empty | None; contact is real-geometry signed distance at or below zero |
| `hallway-fall` | `min_base_height` (m, with its time) | less than `fall_height` | Configuration profile `locomotion.fall_base_height` |

A missing or malformed observation gives `INSUFFICIENT_EVIDENCE`. Each
rationale names the check, the time and the margin, for example
`lateral 0.62 m > 0.49 m at 10.1 s` (illustrative numbers only, not measured).

## Acceptance

| Parameter | Value | Source |
| --- | --- | --- |
| `command_speed` | 0.5 m/s | Shared, so robots and configurations are comparable |
| `time_limit` | 2 × route length ÷ `command_speed` + 5 s | Route length 5.5 m |
| `fall_height` | `locomotion.fall_base_height` | Selected configuration profile |
| `wall_clearance` | 0.05 m humanoid, 0.10 m quadruped | Robot class |
| `lateral_limit` | clear width ÷ 2 − robot width ÷ 2 | World and robot profile |
| `trials` | 20, seeds 1 to 20 | No retries |
| `required_passes` | 18 | Grade `PASS` when at least 18 of 20 trials pass |

Preconditions, checked before any trial and giving `UNSUPPORTED` when unmet:
`fits_width` (robot width + 2 × `wall_clearance` ≤ clear width),
`configuration_offered`, `velocity_interface` and `simulator_declared`.

## The G1 and its pluggable controller

The Unitree G1 robot profile offers two configuration profiles. The robot model
is the same in both; selecting a profile is the feature toggle.

| Configuration profile | Controller | Publisher |
| --- | --- | --- |
| `stock` | rl_gym `motion.pt` | Unitree Robotics |
| `playground` | MuJoCo Playground `g1_policy.onnx` | Google DeepMind |

Both runs use the same world, simulator, seeds and command speed; their run
manifests differ only in `configuration` and `run_id`. The comparison reports
each run's passed trials, pass rate and grade, always showing both.

Example comparison, **illustrative numbers only, not measured**:

| Configuration | Passed of 20 | Grade | Failing seeds |
| --- | ---: | --- | --- |
| `stock` | 9 (illustrative) | `FAIL` | 11 seeds, mostly falls (illustrative) |
| `playground` | 19 (illustrative) | `PASS` | 1 seed, time limit (illustrative) |

The comparison ranks configurations by grade (`PASS` > `INSUFFICIENT_EVIDENCE` > `FAIL` >
`ERROR`; `UNSUPPORTED` and `INCOMPATIBLE` are listed unranked), then passed trials, then
the Wilson 95% lower bound. Configurations equal on all three share a rank and are listed
alphabetically. If exactly one configuration has grade `PASS`, it is the winner. If several
do, the summary reads 'no statistically clear winner' unless the top `PASS` interval's
lower bound exceeds the upper bound of every other `PASS`. If none passes, the top-ranked
configuration is named 'closest', 'ahead of the rest' when its interval does not overlap
the second-ranked one's, otherwise 'not significantly ahead'. A configuration that falls
is a valid `FAIL`, reported and not retried.

## Description text

[description.json](description.json) carries the human-readable mission and world
text for this revision, the acceptance parameters above and the rule for each limit
resolved per robot (`lateral_limit`, the exit segment, `fall_height` and `fits_width`),
in the [`livingproof-scenario-description/0.1`](../scenario-description.schema.json)
format. It is text only and changes no acceptance rule; this README stays normative.
The verifier passes it through into the bundle with the inputs it used and each
unrounded resolved value, so a report renders mission, world and limits without
computing them.

## Status

The stories and Gherkin examples are parser-validated in this catalog. Runners,
recordings and the evaluator live in the simulator and robot repositories.
