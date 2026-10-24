# Robot capability specifications

An open Living Proof Labs catalog of granular robot abilities, operating conditions,
and acceptance criteria, independent of any robot implementation.

The catalog provides versioned, document-only capability contracts and Gherkin
scenarios. Start with the [pause and verifier reference contracts](specs/v1/README.md)
and their [five fixture scenarios](specs/v1/reference.feature). There is no universal
schema or robot adapter here; runtime implementations belong in separate repositories.
See the [scope](specs/README.md) and [roadmap issue drafts](docs/issues/roadmap.md).

To execute the thin reference demo, follow
[capability-verifier v1.0.1](https://github.com/Living-Proof-Labs/capability-verifier/tree/v1.0.1).
With Git, Docker Compose v2 and Task 3.54.0 installed, and Docker running:

```sh
git clone --branch v1.0.1 https://github.com/Living-Proof-Labs/capability-verifier.git
cd capability-verifier
task demo
```

That released verifier consumes catalog **v1.1.0** with commit and content-hash
verification. It does not automatically consume newer catalog releases.
[View its 26-test report](https://github.com/Living-Proof-Labs/capability-verifier/runs/120847135184).
Passing expectation tests include correctly detected FAIL and INSUFFICIENT_EVIDENCE
fixture verdicts; they are not robot safety certification. The catalog's capability checks cover
document formatting and Gherkin parsing, not runtime robot behavior.

## Collaboration and mirrors

GitHub is the canonical product origin. Follow the shared
["Fork em all!" collaboration guide](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v2.0.3/docs/collaboration.md)
at `v2.0.3` for clones, faithful mirrors, intentional forks, upstream contributions,
and release identity. [AGENTS.md](AGENTS.md) adopts that version's working baseline;
[CONTRIBUTING.md](CONTRIBUTING.md) adds this catalog's process.

The public anonymous [GitLab pull mirror](https://gitlab.com/living-proof-labs/robot-capability-specs)
had full canonical ref parity verified on **2026-10-24**. Its downstream-only
`provider/gitlab-ci` and `provider/gitlab-ci-pilot` branches start from canonical
source bases and contain no CI implementation commits. GitLab-hosted CI and release
execution remain unverified, with an account identity gate unresolved. Git mirroring
does not copy hosted release objects. This dated observation does not establish
ongoing synchronization or end-to-end GitLab support; see the
[GitHub support issue](https://github.com/Living-Proof-Labs/collaboration-guidelines/issues/6).

## Development

Install [Task](https://taskfile.dev/docs/installation), Git, and Node.js 24.10+
in the 24.x line (including npm) in your environment. CI installs Task 3.54.0.
Task installs this project's locked development tools; it does not install a new
system runtime or credentials. Then run:

```sh
task verify
npm run preview
```

Individual commands are `task setup` (locked dependencies), `task check` (syntax
and whitespace), and `task test` (tests). `task verify` runs them sequentially.
Use native `git`, `gh`, or the appropriate provider CLI for repository operations;
Task standardizes project commands rather than wrapping provider authentication.
Release orchestration remains in the versioned shared Actions workflow, not a
local Task publish command. Consumer checks retain title and preview validation;
release-engine tests and dependencies are owned by the shared source.

`artifacts/preview.json` identifies the exact checked-out commit. It is not a stable
release or a prediction of the next release version. Tooling is private to this
repository; no npm package is published.

## Releases

Use the [shared semantic-release workflow](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v2.0.3/docs/releases.md)
at `v2.0.3`, with upstream official plugins; see
[ADR 0002](docs/adr/0002-shared-release-workflow.md). Conventional Commits determine versions: fixes,
documentation and maintenance changes increment patch; features increment minor;
`!` or a `BREAKING CHANGE:` footer increments major. The first stable catalog release uses upstream
`1.0.0`.

Merged mainline changes trigger the standard release process. Accumulated merges
may share a release; upstream filtering can omit reverted pairs and unclassified
messages. Complete documentation in the PR before merging. Generated notes belong
in the GitHub release body, not a committed changelog or version-bump commit.
The release tag identifies the exact source commit. No custom ledger or release
manifest is generated.

See [ADR 0001](docs/adr/0001-catalog-releases.md). Publishing is enabled on `main` after passing tests. Set repository variable
`RELEASES_ENABLED=false` to pause it; unset or `true` enables publishing. CI-only run
versions/downstream outputs remain a separate follow-up.

## Licensing

Original specification content under `specs/` is CC BY 4.0. Original tooling and
project documentation elsewhere are Apache-2.0. See [LICENSE.md](LICENSE.md) for
precise scope and attribution. Dependency and license texts retain their own terms.
