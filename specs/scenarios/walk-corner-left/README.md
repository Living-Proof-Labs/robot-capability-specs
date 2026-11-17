<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Walk around the left corner, scenario 0.2.0

Copyright 2026 Living Proof Labs contributors. [CC BY 4.0](../../../LICENSES/CC-BY-4.0.txt).

The robot walks down one hallway, turns left at the corner, and reaches the end of the
next hallway. It uses the controller in its selected configuration profile to
walk the corner hallway world `hallway-corner` from `spawn-west`, through
`corner`, to `end-north`. This is one step harder than
[walk the open hallway](../walk-hallway/README.md): the route is the same
length, and the turn is the only change. The scenario is robot-neutral: robots,
configurations and simulators are the only literals, and every number is a
named parameter resolved from acceptance and the robot and configuration
profiles. Formats are defined in
[robot and configuration profiles](../../robots/README.md); terms in the
[glossary](../../../docs/glossary.md).

## Stories

| Story | Scenario |
| --- | --- |
| As a robot maker, I want my robot walked around a standard corner with its own published controller, so that I can show it turns in a narrow passage without touching the walls or falling. | `A robot walks around the left corner` |
| As a verifier, I want the corner judged against each robot's own size and configuration, so that a humanoid and a quadruped are held to fair, declared thresholds. | `A robot walks around the left corner` |
| As a reader of a report, I want turning the corner to be its own step, so that "never reached the corner" and "turned the corner but drifted" are different results. | `The verifier assesses each trial with the corner evaluators` |
| As a robot maker, I want my robot to reach the exit its own way, with joystick steering, a mission or anything else my adapter implements, so that the corner tests the outcome, not one shared way of driving. | `The adapter drives the robot its own way` |
| As a reviewer, I want every trial reported, including failures and test-system errors, with versions, so that a run grade is honest and reproducible. | `Repeated trials are reported in full` |
| As a verifier, I want a robot that cannot fit, or whose adapter does not declare this scenario, reported as `UNSUPPORTED` before it runs, so that a non-result is never shown as a pass or a failure. | `A robot that cannot meet the preconditions` |

Examples: [walk-corner-left.feature](walk-corner-left.feature).

## Metrics

| Metric | Unit | Definition | Judged |
| --- | --- | --- | --- |
| `reached_exit` | true or false | The base origin crosses `end-north` | Must be true |
| `time_to_exit` | s | First time the base crosses `end-north` | At most `time_limit` |
| `corner_entered` | s | First time the base is inside `corner`, no later than the exit crossing | Must be present |
| `wall_contacts` | list | Each contact between any robot body and any wall, with its wall, start and end time (s) and depth (m) | Must be empty |
| `min_base_height` | m | Lowest base height above the floor | At least `fall_height` |
| `max_route_distance` | m | Largest distance of the base from `route-forward` | At most `lateral_limit` |

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
| `corner-exit-reached` | `exit_time` (s, absent if never crossed) | absent or later than `time_limit` | Acceptance |
| `corner-turned` | `corner_entered` (s, absent if never entered) | absent, or later than the exit crossing | World place `corner` |
| `corner-route-limit` | `max_route_distance` (m, with its time) | greater than `lateral_limit` | World clear width and robot profile `width` |
| `corner-wall-contact` | `wall_contacts` (list; each with wall, start and end time, and depth) | the list is not empty | None; contact is real-geometry signed distance at or below zero |
| `corner-fall` | `min_base_height` (m, with its time) | less than `fall_height` | Configuration profile `locomotion.fall_base_height` |

An absent `exit_time` or `corner_entered` because the robot never got there is
a `FAIL`; a missing or malformed observation record is a test-system `ERROR`.
Each rationale names the check, the time and the margin, for example
`route 0.62 m > 0.49 m at 10.1 s` (illustrative numbers only, not measured).

## Acceptance

| Parameter | Value | Source |
| --- | --- | --- |
| `command_speed` | 0.5 m/s | The reference speed the time limit assumes, shared with walk-hallway. Nothing is sent at this speed: the adapter chooses how fast to go. |
| `time_limit` | 2 × route length ÷ `command_speed` + 5 s | Route length 5.5 m |
| `fall_height` | `locomotion.fall_base_height` | Selected configuration profile |
| `wall_clearance` | 0.05 m humanoid, 0.10 m quadruped | Robot class |
| `lateral_limit` | clear width ÷ 2 − robot width ÷ 2 | World and robot profile |
| `trials` | 1 | Default. Further identical trials show repeatability. A failed trial is not retried. |
| Start | exact nominal pose at `spawn-west` | A different start, such as a spawn offset of +5 cm, is a declared comparison change. |

Preconditions, checked before any trial and giving `UNSUPPORTED` when unmet:
`fits_width` (robot width + 2 × `wall_clearance` ≤ clear width),
`configuration_offered`, `scenario_supported` (the robot manifest's
`scenarios` list names `walk-corner-left`; see
[Scenario support](../../robots/README.md#scenario-support)) and
`simulator_declared`.

## The world

The scenario runs in `hallway-corner` content version 0.2.0 from
[livingproof-worlds](https://github.com/Living-Proof-Labs/livingproof-worlds).
It meets the [world contract](../../worlds/README.md) neutral endpoint traversal rules and
provides what this scenario needs:

- two straight hallways with the same 1.50 m clear width, 2.50 m wall height
  and 0.15 m wall thickness as `hallway-open`, meeting at a right angle, with
  every wall an axis-aligned box;
- `end-west` and `end-north` segments across the open ends;
- `spawn-west`, a pose on the route facing along it;
- `corner`, the region where the two hallways meet, with sides the clear width;
- `route-forward`, a polyline of three points down the middle of both
  hallways, from the entrance to the turn point to the exit.

Its route length from `spawn-west` is 5.5 m, the same as `hallway-open`,
so `time_limit` is the same 27 s.

## How the robot is driven

This scenario states only the outcome. It has no command: the runner does not
send the robot a velocity or a steering rule. The robot adapter drives the
robot from `spawn-west` its own way, for example velocity commands with its
own steering, a mission or waypoint interface, or a planner. It may read the
world's places, including `route-forward`. The checks judge only what the
robot does: whether it passes through `corner` before it reaches `end-north` within
`time_limit`, stays within `lateral_limit` of the route, touches no wall, and
stays upright.

`route-forward` is the reference path for evaluation, not a path the robot
is told to follow. An adapter runs this scenario only when its robot manifest
lists `walk-corner-left` in `scenarios`. Otherwise the run is `UNSUPPORTED`
naming `scenario_supported`, before any trial and never a `FAIL`. The run
manifest pins the adapter commit and configuration profile, so how the robot
was driven is reproducible.

## Parameter file

[parameters.json](parameters.json) states the acceptance above in the
[`livingproof-scenario-parameters/0.1`](../scenario-parameters.schema.json)
format, with no `command`, so a verifier and an evaluator compute limits from
one file instead of keeping their own copy of each formula. It names the places used in the world
(`spawn-west`, `end-north`, the route `route-forward`, and `corner` as a place
to pass through), the shared parameters and the trial rule, and writes each limit and precondition as
an expression over named inputs. The inputs, rounding, fit check and place terms
are the same as walk-hallway's: `route_length` is measured along the route
from the point on it nearest the start pose, limits round to 4 decimal places
the way Python's `round()` does, and `fits_width` compares whole millimetres.

- **Passing through `corner`.** The base passes through `corner` at the first
  sample at which the base origin is inside the region, boundaries included.
  That sample must be no later than the exit crossing sample.
- **Distance from the route.** Cutting the inside of the corner is measured
  from the nearer leg. Overshooting the outside is measured from the turn
  point, so at this right-angle corner the limit is stricter than the walls by
  up to √2, as [route-geometry-cases.json](../route-geometry-cases.json)
  records for the same L-shaped route.
- **The exit.** The exit counts at the first sample on or past the exit line,
  measured along the route's last leg (`+y` here), with the base origin within
  half the segment's length of the exit reference point.

[parameter-cases.json](parameter-cases.json) lists conformance cases for the
G1, Go1 and T1 widths and the fit edges. The reference implementations,
`tooling/scenario-parameters.mjs` and `tooling/world-layout.mjs`, and the Python package
`livingproof_scenario_parameters` pass every case. This README stays normative,
and the files must agree with it.

## Description text

[description.json](description.json) carries the human-readable mission and world
text for this revision, the acceptance parameters above and the rule for each limit
resolved per robot (`lateral_limit`, the exit segment, `fall_height` and `fits_width`),
in the [`livingproof-scenario-description/0.1`](../scenario-description.schema.json)
format. Its success criteria are in journey order, and each starts with its card
label: Turns the corner, Stays on the route, Clears the walls, Stays upright and
Reaches the exit in time. It is text only and changes no acceptance rule; this
README stays normative.

## Migration and support

This is the active left identity `walk-corner-left` revision 0.2.0. It replaces
`walk-corner` revision 0.1.0 for new definitions, a breaking identity and world
selection change. The old [scenario source](../walk-corner/README.md) is retained
unchanged solely for historical consumers and evidence. Do not relabel old runs
or infer support for the new identity from support for `walk-corner`.

Use `hallway-corner` content 0.2.0 from
[livingproof-worlds v1.4.0](https://github.com/Living-Proof-Labs/livingproof-worlds/releases/tag/v1.4.0),
commit `971b39ee845a18c50da627a7410d22e3b98171f9`. Its `forward` traversal binds
`spawn-west`, `route-forward` and `end-north`: west arm → corner → north arm.
The spawn yaw is 0 degrees, facing inward. [world-source.json](world-source.json)
records the released source and checksums; it is authoring provenance, not an
additional run-selection authority. The parameter format retains the key `exit`
for the selected finish segment. The reference route is not a steering command.

Limits, input formulas, evaluator ids, rounding, trial policy and grading remain
identical to historical `walk-corner`. Only identity, world selection, place
references and explanatory text change. The same six floor/wall boxes are reused.

Robot owners must test their adapter on world format 0.3 with the selected
places, then declare the exact new scenario id in their released robot manifest.
Existing published robot declarations are evidence, not editable examples of
support. Until declared, `scenario_supported` yields `UNSUPPORTED` before a trial.
Verification owners must update the manifest-owned definition to released specs,
world and adapter tags, matching description and parameter paths and the new
identity. Verifier capability/format support must be established separately.
No verification locks or verifier catalog entries are changed here.

## Status

Catalog tests cover schema, selected traversal geometry and acceptance parity.
Gherkin examples are conformance examples, not executed robot results. Adapter
support, simulator execution and robot success remain downstream dependencies.
No robot PASS is claimed.
