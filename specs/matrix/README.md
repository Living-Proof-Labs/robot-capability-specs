<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Released pause execution compatibility examples

Copyright 2026 Living Proof Labs contributors. [CC BY 4.0](../../LICENSES/CC-BY-4.0.txt).

These examples explain existing released contracts; they introduce no new pause
criteria or observation schema. They are fixture demonstrations, not robot safety
certification. A supported executor and an intact observation are separate facts.

| Catalog | Pause revision | Limit | Released executor v1.0.1 / fixture 1.0.0 | Released executor v1.1.0 / fixture 2.0.0 |
| --- | --- | --- | --- | --- |
| [v1.1.1](https://github.com/Living-Proof-Labs/robot-capability-specs/tree/v1.1.1) | 1.0.0 | 500 ms | 120 ms: PASS | 300 ms: PASS |
| [v1.2.0](https://github.com/Living-Proof-Labs/robot-capability-specs/tree/v1.2.0) | 2.0.0 | 250 ms | INCOMPATIBLE execution | 300 ms: FAIL |

The released [v1.0.1 executor](https://github.com/Living-Proof-Labs/capability-verifier/tree/v1.0.1)
implements revision 1 only. Its 120 ms observation remains valid evidence, but
calling that executor for revision 2 would apply the wrong limit. The matrix
adapter checks declared execution support before evaluation and retains the
observation without inventing a failed capability assessment.

The released [v1.1.0 executor](https://github.com/Living-Proof-Labs/capability-verifier/tree/v1.1.0)
adds strict revision evaluation and a genuinely different 300 ms observation.
It evaluates that observation under both released contracts. Both contracts use
the same observation fields; this example does not claim schema incompatibility.
Missing elapsed time stays INSUFFICIENT_EVIDENCE, while false motion inhibition
stays FAIL. Those controls are separate from the four matrix coordinates.

Portable records retain catalog tag and resolved commit, capability revision,
fixture identity/version and source tag/commit/path, released executor version,
subject system version, environment and Python version, run identifier, relative
evidence paths and SHA-256 digests. Compatibility describes execution support;
evidence integrity describes retained bytes; assessments describe capability
observations. None substitutes for another. Keep every coordinate separate and
never derive a single overall capability grade from this matrix.

The accompanying Gherkin is explanatory and parser-tested here. Actual execution,
portable records and expectation tests are available in
[capability-verifier v1.2.0](https://github.com/Living-Proof-Labs/capability-verifier/tree/v1.2.0),
released from commit `b5bab777978c81e03f52ab98c082158816a72975`.
Run `task matrix` and `task matrix:report` from that released checkout.
The temporary feature-branch exception has ended; the adapter and all its matrix
inputs use published version tags.
