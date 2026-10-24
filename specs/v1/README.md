<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Reference contracts, revision 1.0.0

Copyright 2026 Living Proof Labs contributors. [CC BY 4.0](../../LICENSES/CC-BY-4.0.txt).
Catalog release tags identify the complete bundle; each contract below is revision
1.0.0. These are fixture demonstration contracts, not robot safety certification.
Runtime adapters, bindings and evaluators belong outside this catalog.

## pause (1.0.0)

Precondition: an active motion request in the declared fixture system. The runner
records requested and observed states, elapsed milliseconds, and whether motion
is inhibited. PASS requires requested=paused, observed=paused, elapsed_ms in
[0, 500], and motion_inhibited=true. The inhibition criterion is mandatory for
this demonstration. A false value fails even when other evaluators approve.
Missing, malformed, non-finite or negative measurements are insufficient evidence.
A pause does not specify an emergency stop. Emergency stop is not universally
power removal: the correct behavior depends on the system and risk assessment.
Stand/rest are potential future examples, not implemented capabilities here.

## execute-spec (1.0.0)

Select an immutable catalog version and capability revision. A runner collects
fixture evidence without grading it. Record the fixture identity and system
version, runner version, evidence content digest and selected spec. Unknown
capabilities or unreadable evidence must not produce a passing report.

## assess-evidence (1.0.0)

Evaluators independently produce PASS, FAIL or INSUFFICIENT_EVIDENCE, with identity,
version, rationale and mandatory flag. The deterministic pause evaluator is
mandatory. A mock AI evaluator is a labeled deterministic fixture, with no model
or external service; a human assessment fixture is a recorded assessment, not a
live human review. Retain every assessment rather than only its aggregate.

## report-results (1.0.0)

Policy `all-required-v1` requires exactly one assessment from each declared member:
`pause-rules`, `mock-ai`, `human-fixture`. Any FAIL yields FAIL; in particular a
mandatory failure cannot be averaged away. Otherwise any missing, duplicate,
invalid or insufficient assessment yields INSUFFICIENT_EVIDENCE. Only all PASS
can yield PASS. No weights or implicit majority votes apply.

Report catalog tag, capability/revision, fixture system/version, simulator
platform/version (null when not applicable), runner/evaluator/policy versions,
evidence digest, individual rationales and final status. CI test output and JUnit
are the report surface; expected negative fixtures are successful tests only when
the verifier correctly rejects or marks them insufficient. No dashboard required.
