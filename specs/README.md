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

The [proposed world contract](worlds/README.md) defines two closed hallway
fixtures and proposed independent MuJoCo/Gazebo evidence expectations. It is
authored and parser-validated only: it neither creates a world library nor
reports an engine or robot result.
