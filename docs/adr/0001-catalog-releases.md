# ADR 0001: Upstream semantic-release for catalog releases

Status: upstream approach, standard batching and release activation approved.
Use upstream initial version 1.0.0. License scope approved.

## Decision

Implementation ownership moves to the versioned shared workflow in
[ADR 0002](0002-shared-release-workflow.md); the policy below remains applicable.

Use semantic-release with its official `@semantic-release/commit-analyzer`,
`@semantic-release/release-notes-generator`, and `@semantic-release/github` plugins.
The notes generator uses Conventional Changelog. The shared workflow owns the locked installation and runs after consumer checks;
no consumer-local release engine or configuration is needed.

Release notes are generated for the GitHub release body. Do not commit a generated
changelog or version bump, or create a redundant Markdown notes attachment. No
`@semantic-release/changelog`, `@semantic-release/git`, or npm publisher is configured.
There is no custom commit ledger, release manifest, or fallback version calculation.
The release's Git tag identifies the source commit; consumers can resolve that tag
to its exact SHA. package.json describes private development tooling, not the
catalog's current release version.

The only release-policy extensions are explicit patch rules for documentation and
maintenance types, and visible notes sections for those types. A breaking rule
prevents custom patch rules from overriding breaking-change severity. The lockfile
pins preset 8 because the installed notes generator uses changelog-writer 8;
preset 10 requires writer 9. Upgrade compatible dependencies together.

| Changes since previous release | Result after 1.2.3 |
| --- | --- |
| fix, perf | 1.2.4 |
| docs, chore, build, ci, test, refactor, style, revert | 1.2.4 |
| feat | 1.3.0 |
| any supported type with `!` or `BREAKING CHANGE:` footer | 2.0.0 |
| mixed classified changes | Highest required bump |
| no relevant commits, or a fully reverted pair | No release, following upstream filtering |

Use Conventional Commit titles and preserve breaking markers in final squash
messages. Unknown or malformed messages do not receive an invented patch release.
Complete documentation during PR review. Tooling interface removals and changes
that invalidate existing specification consumers/evidence are breaking; additive
abilities are features; meaning-preserving clarifications are patches. Detailed
per-contract revision semantics remain later work.

## Merge lifecycle, initial version and CI

The intent is to release merged mainline work, not every individual commit.
Standard semantic-release behavior is accepted: multiple accumulated merges can
share one release at a tested mainline head. Notes summarize classified changes;
they need not enumerate every Git commit. Reverted pairs may be filtered out.
No serialized per-commit or per-merge release queue is added.

First stable catalog release uses upstream's `1.0.0`. This versions the
catalog and does not claim a mature universal schema. Do not silently seed 0.x tags. Under standard SemVer, a breaking bump
from 0.x promotes to 1.0.0; no custom reduced breaking-change rule is implemented.
CI run identities and downstream outputs are a separate follow-up, not a reason
to override semantic-release's stable version calculation.

PR/branch verification has read-only contents access. Stable publication accepts
only main push/manual runs, runs when `RELEASES_ENABLED` is unset or `true`, and repeats tests on
the exact checkout before publishing. The runtime token needs `contents: write`;
issue/PR comments and labels are disabled. No PAT, package token, or security-setting
change is required. Activation was explicitly authorized; `RELEASES_ENABLED=false`
remains an operational off switch. The enable-by-default change is reviewed through
the same PR because this connector cannot set repository variables.

One release job runs at a time without canceling an active job. Pending runs may
be coalesced; obsolete heads can be skipped by semantic-release. A failed final
head needs repair and a rerun. A successful retry with no new changes produces no
new version. Never move, delete, or reuse a release tag. Protection settings remain
separate owner decisions.

Git tag creation and GitHub release publication are not atomic. If a tag was pushed
but publication failed, inspect the tag and release before retrying: a normal rerun
may see the tag and skip publication. With maintainer authorization, recover the
missing GitHub release using notes generated from the exact tag and prior-release
range. Do not retag or overwrite conflicting evidence. Live recovery/permissions
must be validated before activation; local tests cannot prove GitHub behavior.

## Sources

- [semantic-release configuration](https://semantic-release.org/usage/configuration/)
- [Commit analyzer and release rules](https://github.com/semantic-release/commit-analyzer)
- [Release notes generator](https://github.com/semantic-release/release-notes-generator)
- [GitHub release publisher](https://github.com/semantic-release/github)
- [Conventional Changelog](https://github.com/conventional-changelog/conventional-changelog)
