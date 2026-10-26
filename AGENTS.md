<!-- SPDX-License-Identifier: Apache-2.0 -->

# Working in this repository

## Shared working guidelines

Read and apply the Living Proof Labs baseline at the published version
`v4.1.0`:
https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v4.1.0/AGENTS.md

Fetch and read that file through authorized tools before relying on it. Read
relevant linked procedures at the same version. A link does not load instructions.
If the pin is unavailable, report the exact reference and failure; continue only
independent work covered by available instructions. Do not substitute `main` or
`latest`. A local copy must be verified against the selected tag before use.

## Local additions

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for draft PRs, release conventions,
  maintainer approval, and validation evidence.
- Use Node.js 24.10+ in the 24.x line, npm, Git, and Task. Run `task verify`
  (setup, checks, and tests); individual commands are `task setup`, `task check`,
  and `task test`. Use native provider CLIs when authenticated appropriately.
- Keep robot adapters and proprietary SDK code outside this catalog. Preserve
  the path-specific licenses in [LICENSE.md](LICENSE.md).

## Local overrides

- The shared rule permits routine authorized merges without a human review gate.
  This repository's contribution procedure requires maintainer approval to merge
  or activate release automation; honor that approval requirement.

Container override: host Task now delegates to the tooling Docker image. Inside
that image use `task -t Taskfile.runtime.yml`; no host Node runtime is required.
