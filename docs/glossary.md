<!-- SPDX-License-Identifier: Apache-2.0 -->
# Glossary

Terms used across the catalog for robots, configurations and scenario runs.
They align with the concepts on the Living Proof Labs website; where a word had
two meanings, the choice made here is noted.

Examples are illustrative. They are not pass bars. Each specification states
its own acceptance rule. A run defaults to one identical trial at the exact
nominal pose.

| Term | Meaning | Example |
| --- | --- | --- |
| **Robot** | One make and model as its maker publishes it: kinematics, geometry, mass, actuators and sensors. Living Proof Labs never changes it; it is pinned by source and sha256. | Unitree G1, model from `mujoco_menagerie` `unitree_g1` at a pinned commit |
| **Robot profile** | The machine-readable fact sheet for one robot, `robot.json` in the robot's repository: identity, class, dimensions, pinned model, the configuration profile names it offers and the simulators it declares. Facts, not thresholds. See the [robot profile format](../specs/robots/README.md). | `livingproof-unitree-g1/robot.json` |
| **Configuration profile** | A named, versioned configuration of one robot, owned by the robot's repository. It may differ from another profile by controller, PD or PID gains, limits or anything else. Specifications and run manifests refer only to its name, version and content sha256; the robot repository keeps each name matched to its details. The difference between two profiles explains a change. | `stock`, `playground` for the G1 |
| **Controller** | The published software, usually a learned policy, that turns commands and sensor readings into actuator commands. It is one property of a configuration profile. Living Proof Labs does not train or modify controllers. | Unitree rl_gym `motion.pt`; Google DeepMind Playground `g1_policy.onnx` |
| **Pluggable controller** | A robot whose controller can be changed by selecting a different configuration profile, with the robot, world, placement, simulator and scenario unchanged. It is a property of the run setup, and the robot stays as published. | The G1 with `stock` or `playground` |
| **Feature toggle** | Selecting a configuration profile for a run. It is the `configuration` field of the run manifest. Exactly one profile is selected per run. | `"configuration": {"name": "playground", ...}` |
| **World** | A versioned simulated environment with declared geometry and named places. Used for the hallway instead of *fixture*. | `hallway-open` 0.1.0 |
| **Fixture** | Recorded or hand-written input data used in place of a live system, for example a test record. Not used for worlds. | `test/fixtures/hallway-results/mujoco.json` |
| **Scenario** | What the robot attempts, under `specs/scenarios/<name>/`: starting state, what happens and what is observed. Robot-neutral; every number is a named parameter. | Walk `hallway-open` from `spawn-entrance` to `exit` |
| **Acceptance** | The part of a specification that says what is good enough: one rule per metric, written over robot and configuration profile fields, plus the grading policy for the run. | The default trial meets every metric rule |
| **Grading policy** | The named rule that turns completed trial outcomes into the run grade. A test-system `ERROR` is reported on the job and on the trial, is never a robot grade, and is never counted as a robot fail. If no trial completes because of test-system errors, the run is not evaluated and the grade is `INSUFFICIENT_EVIDENCE`. Used instead of *policy* for this meaning, so that *policy* in robotics keeps meaning a learned controller. | `all-required-v1` |
| **Run manifest** | The generated, never committed record of exactly what one run uses, written before the first trial: specification tag, scenario, world, simulator and adapter, robot repository commit, selected configuration profile name, version and sha256, and resolved parameters. Every trial in the run uses this fixed setup, including the nominal start pose. | `run-manifest.json` |
| **Run** | One scenario executed as one or more identical trials in sequence. The default is 1. Extra trials show repeatability. A grading policy turns the completed trial outcomes into the run grade. A test-system `ERROR` is reported on the job and on the trial and is never a robot grade. If no trial completes because of test-system errors, the run is not evaluated and the grade is `INSUFFICIENT_EVIDENCE`. In a deterministic simulator, repeats that disagree are a reproducibility finding about the test system. | One walk-hallway trial at the nominal pose |
| **Trial** | One execution of a scenario under the run manifest's fixed setup. Every trial in a run uses the same configuration, world, placement, simulator, version and deterministic start. | The default trial of walk-hallway |
| **Trial outcome** | The result of one completed trial. `PASS` or `FAIL` is the robot outcome. `ERROR` is a test-system status reported on that trial and on the job. It is never a robot grade and is never counted as a robot fail. | `FAIL`, first failing metric `wall_contacts` |
| **Grade** | The result of applying a grading policy to a run, replacing the earlier word *verdict*. One of `PASS`, `FAIL`, `INSUFFICIENT_EVIDENCE` and `UNSUPPORTED`. `ERROR` is not a grade. | `PASS` |
| **`PASS`** | The acceptance rule is met. | The default trial passed |
| **`FAIL`** | Trials ran and the acceptance rule is not met. A controller that falls is a valid `FAIL`. | The default trial fell |
| **`INSUFFICIENT_EVIDENCE`** | The run is not evaluated. Required metrics or files are missing, or no trial completes because of test-system errors. | No contact log; or 1 trial that is `ERROR` |
| **`UNSUPPORTED`** | A declared precondition cannot be met, decided before any trial. Names the precondition. Never a pass. | `configuration_offered` |
| **`ERROR`** | A test-system status, never a robot grade. The detail is reported on the job and on the trial. If no trial completes because of it, the run is not evaluated and the grade is `INSUFFICIENT_EVIDENCE`. | Simulator failed to start |
| **Comparison** | Runs of the same scenario that differ only in one declared intentional change: the robot, the configuration, the world or placement, the simulator, or the version. Each run keeps its own grade. The comparison is never graded. | G1 `stock` against `playground`; nominal spawn against a spawn offset of +5 cm |

The world-result format keeps its existing `status` and `fixture` field names
for compatibility; prose uses *grade* and *world*.

## Retired terms

**Seed** is retired. The start of a trial is the exact nominal pose named by the
world. Any variation in that start, such as a spawn offset of +5 cm, is a named,
declared comparison change.

## Partner robots

A partner's robot repository, its configuration profiles and its specifications
live downstream in the partner's own hosting, under their own licence. Only the
profile name, version and sha256 reach a run manifest, and the hash proves
exactly which configuration ran without the files being public.
