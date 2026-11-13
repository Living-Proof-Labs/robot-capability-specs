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
| As a reviewer, I want every trial reported, including failures and test-system errors, with versions, so that a run grade is honest and reproducible. | `Repeated trials are reported in full` |
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
`all-required-v1` to that trial. A grading policy turns the completed trial
outcomes into the run grade. The default run is one trial. `ERROR` is a
test-system status reported on the job and on the trial. It is never a robot
grade and is never counted as a robot fail. If no trial completes because of
test-system errors, the run is not evaluated and the grade is
`INSUFFICIENT_EVIDENCE`.

| Evaluator | Observation | FAIL when | Threshold source |
| --- | --- | --- | --- |
| `hallway-exit-reached` | `exit_time` (s, absent if never crossed) | absent or later than `time_limit` | Acceptance |
| `hallway-lateral-limit` | `max_abs_lateral` (m, with its time) | greater than `lateral_limit` | World clear width and robot profile `width` |
| `hallway-wall-contact` | `wall_contacts` (list; each with wall, start and end time, and depth) | the list is not empty | None; contact is real-geometry signed distance at or below zero |
| `hallway-fall` | `min_base_height` (m, with its time) | less than `fall_height` | Configuration profile `locomotion.fall_base_height` |

An absent `exit_time` because the robot never crossed is a `FAIL`; a missing or malformed observation record is a test-system `ERROR`.

A missing or malformed observation is a test-system `ERROR` on the trial. Each
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
| `trials` | 1 | Default. Further identical trials show repeatability. A failed trial is not retried. |
| Start | exact nominal pose at `spawn-entrance` | A different start, such as a spawn offset of +5 cm, is a declared comparison change. |

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

Both runs use the same world, placement, simulator and command speed; their run
manifests differ only in `configuration` and `run_id`. The comparison sets the
runs side by side and is never graded. Each run keeps its own grade. The
comparison reports each run's trial outcomes and grade, always showing both.

Example comparison, **illustrative numbers only, not measured**:

| Configuration | Run | Grade | Noted failure |
| --- | --- | --- | --- |
| `stock` | 1 trial (illustrative) | `FAIL` | fall (illustrative) |
| `playground` | 1 trial (illustrative) | `PASS` | none (illustrative) |

A configuration that falls is a valid `FAIL`, reported and not retried. In a
deterministic simulator, identical trials that disagree are a reproducibility
finding about the test system.

## Parameter file

[parameters.json](parameters.json) states the acceptance above in the
[`livingproof-scenario-parameters/0.1`](../scenario-parameters.schema.json)
format, so a verifier and an evaluator compute limits from one file instead of
keeping their own copy of each formula. It names the places used in the world
(`spawn-entrance`, `exit` and the route `passage-centreline`), the constant
`[command_speed, 0, 0]` command, the shared parameters and the trial rule, and
writes each limit and precondition as an expression over named inputs.

- **Inputs.** `route_length` is measured along the route from the point on it
  nearest the start pose to the route's last point, the exit reference point:
  5.5 m in `hallway-open` 0.1.0. A profile value such as `dimensions.width`
  resolves to its `value`, and its unit must be the declared unit. The robot
  class selects the wall clearance. A missing input, a wrong unit, an unknown
  class or a result that is not finite is a test-system `ERROR`.
- **Rounding.** `time_limit`, `lateral_limit` and `exit_segment` are rounded to
  4 decimal places the way Python's `round()` does, ties to even on the exact
  binary value, so 0.40625 gives 0.4062.
- **Fit.** `fits_width` compares whole millimetres: each value is rounded half
  up from its decimal text before adding, so 1.03 m + 2 × 0.05 m fits a 1.13 m
  hallway exactly.
- **Places, not axes.** The body point is the base origin at each recorded
  sample. The exit counts at the first sample on or past the exit line,
  measured along the route's last leg, with the base point within half the
  segment's length of the exit reference point. Distance from the route extends
  its first and last legs past their ends. Limits fail only when strictly
  exceeded. In `hallway-open` these are today's checks: `x ≥ 3.00` with
  `|y| ≤ 0.75`, and lateral `|y|`.

[parameter-cases.json](parameter-cases.json) lists conformance cases with
the values capability-verifier v1.18.1 resolves, including the ties and exact
fits. The catalog's reference evaluator,
`tooling/scenario-parameters.mjs`, passes
every case, and other implementations can run the same cases. This README stays
normative, and the files must agree with it.

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
