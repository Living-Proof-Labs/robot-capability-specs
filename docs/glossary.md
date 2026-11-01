<!-- SPDX-License-Identifier: Apache-2.0 -->
# Glossary

Terms used across the catalog for robots, configurations and scenario runs.
They align with the concepts on the Living Proof Labs website; where a word had
two meanings, the choice made here is noted.

| Term | Meaning | Example |
| --- | --- | --- |
| **Robot** | One make and model as its maker publishes it: kinematics, geometry, mass, actuators and sensors. Living Proof Labs never changes it; it is pinned by source and sha256. | Unitree G1, model from `mujoco_menagerie` `unitree_g1` at a pinned commit |
| **Robot profile** | The machine-readable fact sheet for one robot, `robot.json` in the robot's repository: identity, class, dimensions, pinned model, the configuration profile names it offers and the simulators it declares. Facts, not thresholds. See the [robot profile format](../specs/robots/README.md). | `livingproof-unitree-g1/robot.json` |
| **Configuration profile** | A named, versioned configuration of one robot, owned by the robot's repository. It may differ from another profile by controller, PD or PID gains, limits or anything else. Specifications and run manifests refer only to its name, version and content sha256; the robot repository keeps each name matched to its details. The difference between two profiles explains a change. | `stock`, `playground` for the G1 |
| **Controller** | The published software, usually a learned policy, that turns commands and sensor readings into actuator commands. It is one property of a configuration profile. Living Proof Labs does not train or modify controllers. | Unitree rl_gym `motion.pt`; Google DeepMind Playground `g1_policy.onnx` |
| **Pluggable controller** | A robot whose controller can be changed by selecting a different configuration profile, with the robot, world, simulator, scenario and seeds unchanged. It is a property of the run setup, not a change to the robot. | The G1 with `stock` or `playground` |
| **Feature toggle** | Selecting a configuration profile for a run. It is the `configuration` field of the run manifest. Exactly one profile is selected per run. | `"configuration": {"name": "playground", ...}` |
| **World** | A versioned simulated environment with declared geometry and named places. Used for the hallway instead of *fixture*. | `hallway-open` 0.1.0 |
| **Fixture** | Recorded or hand-written input data used in place of a live system, for example a test record. Not used for worlds. | `test/fixtures/hallway-results/mujoco.json` |
| **Scenario** | One concrete situation that exercises a specification: starting state, what happens and what is observed. Robot-neutral; every number is a named parameter. | Walk `hallway-open` from `spawn-entrance` to `exit` |
| **Acceptance** | The part of a specification that says what is good enough: one rule per metric, written over robot and configuration profile fields, plus the trial policy. | Pass when at least 18 of 20 trials pass |
| **Grading policy** | The named rule that turns results into a grade. Used instead of *policy* for this meaning, so that *policy* in robotics keeps meaning a learned controller. | `all-required-v1` |
| **Run manifest** | The generated, never committed record of exactly what one run uses, written before the first trial: specification tag, scenario, world, simulator and adapter, robot repository commit, selected configuration profile name, version and sha256, resolved parameters and seeds. | `run-manifest.json` |
| **Trial** | One execution of the scenario with one seed. | Seed 7 |
| **Trial outcome** | The result of one trial: `PASS`, `FAIL` or `ERROR` (the simulator or controller crashed; counts as not passed). | Seed 7: `FAIL`, first failing metric `wall_contacts` |
| **Seed** | The integer that fixes a trial's random choices. The same seeds are used for every configuration being compared. | Seeds 1 to 20 |
| **Grade** | The result of applying a grading policy to a run, replacing the earlier word *verdict*. One of the five values below. | `PASS` |
| **`PASS`** | The acceptance rule is met. | At least 18 of 20 trials passed |
| **`FAIL`** | Trials ran and the acceptance rule is not met. A controller that falls is a valid `FAIL`. | 9 of 20 |
| **`INSUFFICIENT_EVIDENCE`** | Trials ran but required metrics or files are missing, or too many trials ended in `ERROR`. | No contact log |
| **`UNSUPPORTED`** | A declared precondition cannot be met, decided before any trial. Names the precondition. Never a pass. | `configuration_offered` |
| **`ERROR`** | The run could not be completed, for example the simulator failed to start. | Runner crash |
| **Comparison** | A report that sets two or more runs side by side when their manifests differ only in one declared field, such as the configuration profile. Each run keeps its own grade. | G1 `stock` against `playground` |

The world-result format keeps its existing `status` and `fixture` field names
for compatibility; prose uses *grade* and *world*.

## Partner robots

A partner's robot repository, its configuration profiles and its specifications
live downstream in the partner's own hosting, under their own licence. Only the
profile name, version and sha256 reach a run manifest, and the hash proves
exactly which configuration ran without the files being public.
