<!-- SPDX-License-Identifier: Apache-2.0 -->
# Contributing

Use the released [shared contribution and release rules](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v6.0.0/CONTRIBUTING.md),
[developer interface](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v6.0.0/docs/developer-interface.md),
and [independent review procedure](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v6.0.0/docs/independent-review.md).
[AGENTS.md](AGENTS.md) records this repository's explicit adoption and overrides.

## Catalog additions and override

Start with a [catalog issue](https://github.com/Living-Proof-Labs/robot-capability-specs/issues)
describing the requirement and observable acceptance criteria. Open a draft PR,
link the issue, and include test evidence. **Do not merge or activate release
automation without maintainer approval.** This is an explicit local override.

Follow the [authoring guide](docs/authoring.md). Criteria changes that invalidate
previously valid consumers or evidence are breaking; meaning-preserving
clarifications are patches, and additive abilities are features. Preserve the
separate contract revisions and catalog bundle identity.

Run `task verify` on the Docker/Task host, or
`task -t Taskfile.runtime.yml verify` inside the prepared image. The manual's
Tasks reference is generated from those actual definitions. PRs have no release
token; catalog publication remains in the separately pinned v2.0.3 workflow.

Contribute only work you have the right to publish. Preserve
[path-specific licenses and attribution](LICENSE.md): specifications are CC BY 4.0,
while original tooling and project documentation are Apache-2.0. Keep credentials,
private datasets, proprietary SDKs and robot adapters outside this catalog.
