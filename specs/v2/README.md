<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Strict pause demonstration, revision 2.0.0

Copyright 2026 Living Proof Labs contributors. [CC BY 4.0](../../LICENSES/CC-BY-4.0.txt).

This opt-in revision preserves revision 1.0.0 unchanged. It requires the same
observations and assessments as [revision 1](../v1/README.md), but the elapsed
pause limit is **250 milliseconds**, inclusive, instead of 500 milliseconds.
A 300 millisecond observation passes revision 1 and fails revision 2. A 120
millisecond observation passes both; 250 passes revision 2 and 251 fails it.
Missing elapsed time remains insufficient evidence; false motion inhibition
still fails regardless of elapsed time. These are fixture demonstration
contracts, not safety certification or a recommendation for physical robots.

Consumers must select capability `pause`, revision `2.0.0` explicitly. Reports
must retain the catalog tag, contract revision, fixture version and environment.
Do not combine results from the two revisions into a single capability grade.
