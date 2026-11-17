<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Scope of the capability catalog

Copyright 2026 Living Proof Labs contributors. Licensed under CC BY 4.0;
see [license scope and attribution](../LICENSE.md).

A capability describes an observable ability, its required conditions, and criteria
for accepting evidence. It does not prescribe a robot SDK, transport, controller,
or simulator. A future contract should state which evidence and evaluator versions
were used and distinguish failure from inconclusive or missing evidence.

Evaluation requirements to design through issues:

- Deterministic checks: measured inputs, units, tolerances, and explicit pass/fail rules.
- Subjective grading: an anchored rubric, grader identity/version, and retained rationale.
- Multiple evaluators: declared membership, quorum, weighting or voting rule,
  threshold, tie/abstention handling, and missing/error-result policy. No implicit
  majority vote or silent conversion of missing results to passing results.

These are design goals, not a normative schema or implemented grading runtime.
Catalog releases provide stable references now. Per-capability semantic revisions,
evidence formats, grader execution, and separate robot adapters are later work.

The [revision 1 reference contracts](v1/README.md) and
[Gherkin examples](v1/reference.feature) define a bounded fixture demonstration.
They do not establish a general robot certification schema.

The [world contract](worlds/README.md) defines versioned world selection and
conformance evidence without constraining world geometry or consumers. The
[open hallway world](worlds/hallways.md) defines one door-free hallway with
named places and its MuJoCo/Gazebo matrix. They are authored and parser-validated only;
this catalog contains neither world assets nor engine results.

Two scenarios use these contracts: [walk the open hallway](scenarios/walk-hallway/README.md)
and [walk around the left corner](scenarios/walk-corner-left/README.md), which turns at a
right angle between two hallways and states only the outcome, so each robot
adapter that [declares the scenario](robots/README.md#scenario-support) drives
its robot its own way. Each has a machine-readable parameter file in the
[scenario parameters format](scenarios/scenario-parameters.schema.json).

The active corner identity is `walk-corner-left` 0.2.0. Historical
[`walk-corner` 0.1.0](scenarios/walk-corner/README.md) remains frozen for prior
consumers and evidence; it is not an alias or a support declaration for the new id.
