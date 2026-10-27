<!-- SPDX-License-Identifier: Apache-2.0 -->
# Verify the catalog manual

## Initial inventory and gaps

Issue [#14](https://github.com/Living-Proof-Labs/robot-capability-specs/issues/14)
starts from Markdown contracts for revisions 1 and 2, four execution matrix
coordinates, and 13 explanatory Gherkin examples. Existing tests parse examples,
check selected document text, validate preview identity and guard the release
caller. They do not execute capability assessments. There is no universal schema,
CLI or runtime in this repository; no command or API reference is invented.

The initial gaps were no browsable manual, no authoring entry point, no manual
artifact or browser checks, and no development-container configuration. This
change adopts the shared working baseline from v4.1.0 to
[v5.0.0](https://github.com/Living-Proof-Labs/collaboration-guidelines/tree/v5.0.0),
resolved to `dd4b0391a9a66fa7944f6655aac57c67d3f8c002`. The separately pinned
v2.0.3 release workflow remains unchanged. No local `.agents/skills` exist.

## Bounded feature inventory

| Scenario identity | Observable expectation | Automated evidence |
| --- | --- | --- |
| `sources` | Markdown prose and Gherkin match authoritative files; exact revision and dirty state visible | manual JUnit |
| `links` | Every local page, asset and fragment resolves | manual JUnit |
| `navigation` | Desktop and mobile users reach versioned contracts | manual JUnit and screenshots |
| `search` | Searching for inhibition opens a matching contract | manual JUnit |
| `themes` | System preference and manual light/dark controls change readable surfaces | manual JUnit and screenshots |
| `version` | Development identity and canonical project path are explicit | manual JUnit |

The inventory covers the new manual, not all catalog behavior. Gherkin parsing
is reported separately in catalog JUnit. Runtime verdicts, physical robots,
external-link availability, non-Chromium browsers and live deployment remain
outside the offline automated claim. No line-coverage percentage is claimed.

## Reproduce and inspect

On a Linux host with Docker Compose and Task 3.54.0:

```sh
task setup
task verify
task preview
```

`task docs` builds only the manual; `task test:docs` builds and tests it.
The development container reuses the same Dockerfile. Inside it run
`task -t Taskfile.runtime.yml verify`; do not invoke the host wrapper.
Python 3.11 in the image supplies Zensical 0.0.73 and Playwright 1.64.1 from the
hash-locked requirements. Node dependencies retain their existing lock.

Download the CI preview artifact (retained for **14 days**) and extract it.
Serve `manual/html` with an ordinary local HTTP server, for example:

```sh
python3 -m http.server 8000 --directory manual/html --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/`. Search needs HTTP; opening files directly is not
supported. Read Documentation version, follow Revision 1 and Revision 2, open
an examples page and its original Gherkin download, search for `inhibition`,
open a result, and cycle themes at desktop and mobile widths. The automated
browser serves at `/robot-capability-specs/` to test the deployment base path.

CI retains catalog and manual JUnit, screenshots, source hashes and HTML after
failures when available. The Actions summary must show individual cases and
matching emitted/ingested counts; a report upload alone is not completion.
A failed test must retain its nonzero exit status. Independent review must repeat
these checks on the downloaded artifact and post evidence using the pinned
[review procedure](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v5.0.0/docs/independent-review.md).

Pages settings are enabled; deployment, live navigation and the README's
verified live-manual link remain pending; see [the activation plan](../.github/PAGES.md).
Do not treat the configured canonical URL as a deployed-site claim.
