<!-- SPDX-License-Identifier: Apache-2.0 -->

# Working in this repository

## Shared working guidelines

Read and apply the Living Proof Labs baseline at the published version
`v6.0.0`:
https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v6.0.0/AGENTS.md

Fetch and read that file through authorized tools before relying on it. Read
relevant linked procedures at the same version. A link does not load instructions.
If the pin is unavailable, report the exact reference and failure; continue only
independent work covered by available instructions. Do not substitute `main` or
`latest`. A local copy must be verified against the selected tag before use.

## Local additions

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for draft PRs, release conventions,
  maintainer approval, and validation evidence.
- Use Docker, Git, and Task; the tooling image supplies Node.js 24 and npm.
  Run `task verify` (container build, checks, and tests); individual commands are `task setup`, `task check`,
  and `task test`. Use native provider CLIs when authenticated appropriately.
- Keep robot adapters and proprietary SDK code outside this catalog. Preserve
  the path-specific licenses in [LICENSE.md](LICENSE.md).

## Local overrides

- The shared rule permits routine authorized merges without a human review gate.
  This repository's contribution procedure requires maintainer approval to merge
  or activate release automation; honor that approval requirement.

Container override: host Task now delegates to the tooling Docker image. Inside
that image use `task -t Taskfile.runtime.yml`; no host Node runtime is required.

## Documentation ownership

Apply the released [documentation recipe](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v6.0.0/docs/documentation-recipe.md)
and [ownership decision](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v6.0.0/docs/documentation-ownership.md).
Root owns organization vision/discovery; shared standards remain in guidelines;
this repository owns capability requirements, acceptance semantics and revisions.
Current rendered manual/root/source-directory links are bounded navigation
exceptions to version pinning, not permission to float executable dependencies,
guidance, workflows or examples. Until the guidelines manual is verified, use
released source links. No established private security-reporting route is claimed.
