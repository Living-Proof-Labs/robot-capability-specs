# Robot capability specifications

**[Start here: documentation](https://docs.livingprooflabs.com/robot-capability-specs/)**

An open Living Proof Labs catalog of granular robot abilities, operating conditions,
and acceptance criteria, independent of any robot implementation.

The catalog provides versioned, document-only capability contracts and Gherkin
scenarios. Start with the [pause and verifier reference contracts](specs/v1/README.md)
and their [five fixture scenarios](specs/v1/reference.feature). There is no universal
schema or robot adapter here; runtime implementations belong in separate repositories.
See the [scope](specs/README.md) and [roadmap issue drafts](docs/issues/roadmap.md).

The [world contract](specs/worlds/README.md) defines versioned world selection
and conformance evidence independently of geometry and consumers. The
[open hallway fixture](specs/worlds/hallways.md) defines one door-free hallway
with named places and a MuJoCo/Gazebo matrix. This catalog contains their specifications
and parser checks, not world assets or engine execution.

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

Read the [authoring guide](docs/authoring.md) and [manual preview instructions](docs/verification.md).
The published manual follows the current main branch; its Documentation version
page identifies the exact source revision.

## Collaboration and mirrors

Shared collaboration and engineering procedures belong to
[collaboration-guidelines v6.0.0](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v6.0.0/docs/collaboration.md).
[AGENTS.md](AGENTS.md) adopts that baseline; [CONTRIBUTING.md](CONTRIBUTING.md)
retains this catalog's additions and maintainer-approval override.

The public anonymous [GitLab pull mirror](https://gitlab.com/living-proof-labs/robot-capability-specs)
had full canonical ref parity verified on **2026-10-24**. Its downstream-only
`provider/gitlab-ci` and `provider/gitlab-ci-pilot` branches start from canonical
source bases and contain no CI implementation commits. GitLab-hosted CI and release
execution remain unverified, with an account identity gate unresolved. Git mirroring
does not copy hosted release objects. This dated observation does not establish
ongoing synchronization or end-to-end GitLab support; see the
[GitHub support issue](https://github.com/Living-Proof-Labs/collaboration-guidelines/issues/6).

## Development

Install [Task](https://taskfile.dev/docs/installation), Git, and Docker with
Compose. The tooling image supplies Node.js 24 and locked dependencies; host
project runtimes are not required. CI installs Task 3.54.0. Then run:

```sh
task verify
task preview
```

Individual commands are `task setup` (build tooling), `task check` (syntax
and whitespace), and `task test` (tests). `task verify` builds and runs checks
and tests. Inside the prepared image use `task -t Taskfile.runtime.yml verify`.
See the released [developer interface](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v6.0.0/docs/developer-interface.md)
for shared tooling conventions. The manual generates its Tasks reference from
this repository's actual host and prepared-environment Taskfiles.

`artifacts/preview.json` identifies the exact checked-out commit. It is not a stable
release or a prediction of the next release version. Tooling is private to this
repository; no npm package is published.

## Releases

Shared [release policy](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v6.0.0/CONTRIBUTING.md#release-from-main)
and the separately pinned [v2.0.3 release implementation](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v2.0.3/docs/releases.md)
remain canonical; see [ADR 0002](docs/adr/0002-shared-release-workflow.md).
The working-guidelines update does not upgrade the release workflow.

Catalog tags version the complete bundle; capability revisions identify individual
contracts. Criteria changes that invalidate previously valid evidence or consumers
are breaking; additive abilities are features and meaning-preserving clarifications
are patches. Parsed Gherkin is not runtime execution evidence. Documentation
commit identity is separate from both catalog tags and contract revisions.

See [ADR 0001](docs/adr/0001-catalog-releases.md). Publishing is enabled on `main` after passing tests. Set repository variable
`RELEASES_ENABLED=false` to pause it; unset or `true` enables publishing. CI-only run
versions/downstream outputs remain a separate follow-up.

## Licensing

Original specification content under `specs/` is CC BY 4.0. Original tooling and
project documentation elsewhere are Apache-2.0. See [LICENSE.md](LICENSE.md) for
precise scope and attribution. Dependency and license texts retain their own terms.

## Execution compatibility matrix

See the [four released execution examples](specs/matrix/README.md) for the
500 ms and 250 ms contracts crossed with two released fixture executors. Execution
incompatibility is distinct from a capability failure or insufficient evidence.
The Gherkin here is parser-tested; runtime tests belong in capability-verifier.

The tooling now runs in Docker: use `task verify` and `task preview` on the host,
or `task -t Taskfile.runtime.yml verify` inside the prepared image. Host Node/npm
are no longer required. The image installs locked dependencies and Task 3.54.0.
`artifacts/tests.xml` retains individual expectation checks. When an existing
provider requires its CA bundle, `HOST_BUILD_CA_FILE` passes that existing file
as a temporary build secret without changing host trust or disabling TLS.
