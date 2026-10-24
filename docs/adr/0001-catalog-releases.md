# ADR 0001: Catalog releases with complete commit evidence

Status: proposed; review and activation approval required. License scope approved.

## Decision and scope

Use semantic-release 25 with the official commit analyzer, Conventional Commits
preset, notes generator, and GitHub publisher. A small local plugin delegates
severity/notes to those tools, adds a patch floor for unclassified commits, and
writes complete commit evidence. It does not implement a version/tag engine.
No npm publisher, version-file commits, or automatic release PR is configured.
The lockfile pins dependencies; preset 8 is intentional because preset 10 needs
changelog-writer 9 while the installed official notes plugin uses writer 8.

The catalog begins at **1.0.0**, including when the first commit is documentation.
This versions the published catalog snapshot, not a universal schema or robot
safety guarantee. There is no 0.x stable phase or reduced breaking-change rule:
if a 0.x tag were deliberately introduced later, breaking changes still promote
to 1.0.0 under normal SemVer. Do not seed 0.x tags to work around this policy.
Per-contract revisions are a separate future decision.

| Commits since previous release | Result after 1.2.3 | Notes |
| --- | --- | --- |
| fix, perf | 1.2.4 | All included |
| docs only | 1.2.4 | All included |
| chore/build/ci/test/refactor/style/revert | 1.2.4 | All included |
| feat | 1.3.0 | All included |
| any type with `!` or `BREAKING CHANGE:` footer | 2.0.0 | Breaking summary and ledger |
| mixture | Highest required bump | Every commit in ledger |
| unclassified historical/merge message | Patch floor | Every commit in ledger |
| no commits since tag | No new version | Existing evidence retained |

A malformed breaking message cannot be inferred; review and PR title validation
remain essential. Commit-and-revert pairs may be omitted from conventional summary
sections but remain in the complete ledger and still cause a patch release.

## Meaning of “every commit”

Every mainline change must be discoverable in a release's notes and JSON commit
ledger. Stable SemVer tags identify tested push heads; multiple commits in one
push or a coalesced queue **share** one release version. Intermediate trees do not
receive stable tags and are not individually claimed as tested. A failed earlier
CI run may be covered by a later fixed and tested head. Each preview independently
identifies its source as `0.0.0-preview.<full-sha>`; previews are CI artifacts, not
stable GitHub releases.

This interpretation must be accepted before activation. A strict requirement for
one distinct stable version per mainline commit needs serialized replay and testing
of each intermediate tree, a durable queue, and partial-publication recovery.
Standard semantic-release is a push-head tool; pretending its default gives
commit-by-commit releases would be incorrect. Prefer coverage over a custom release
orchestration service at this stage. release-please is a mature alternative but
normally adds a release PR/merge step and batches changes; that is not the requested
immediate automated workflow. Neither default silently satisfies this policy.

## Execution, authority, and concurrency

PR and feature-branch workflows have `contents: read`, no release secret, and no
`pull_request_target` trigger. The release workflow only accepts `main` push or
manual dispatch on `main`, is gated by `RELEASES_ENABLED=true`, and repeats tests
on the exact checkout before publishing. It never checks out or downloads PR code
in a privileged downstream workflow. The runtime `GITHUB_TOKEN` is exposed only
to the release step; `contents: write` is required for tags/releases/assets. Issue
and PR commenting/labeling are disabled, so those write permissions are unnecessary.
No PAT, npm token, OIDC identity, or org security change is required by this patch.

One release job runs at a time (`cancel-in-progress: false`). GitHub's default
concurrency queue may replace pending runs; later runs cover accumulated changes.
Ordering is not guaranteed. semantic-release checks remote branch state and may
skip an obsolete checkout. A canceled last pending job or failed final head needs
an operator rerun on current main after tests pass. No claim of exactly-once or
unbounded automatic retries is made. Never force-push main or move/delete/reuse
release tags. Branch/tag protection and immutable release settings are recommended
owner decisions, not silently configured by this implementation.

Before activation, an authorized maintainer must approve this ADR and merge,
confirm the repository token can write contents, establish the desired main/tag
protections and required checks, then set `RELEASES_ENABLED=true`. Organization
policy may deny writes: stop and ask the owner rather than creating broader tokens.
The initial draft PR and current patch remain unmerged/inactive until authorized.

## Evidence and failures

Each successful GitHub release contains human notes plus `release.json` with
`formatVersion`, `version`, `gitTag`, exact `gitHead`, and all included commit
hashes/subjects. The source of truth is the tag's full SHA and attached manifest,
not package.json (the tooling package intentionally has no release version).
Artifacts are generated in prepare before tagging; CI uploads available evidence
even if publishing fails. No moving "latest" tag is created by this project.

- Test or pre-tag failure: no release is attempted/created; fix and rerun current main.
- Successful retry with no changes: semantic-release returns no new release and does
  not move a tag (tested locally).
- Tag pushed but GitHub release or asset upload failed: **not an atomic transaction**.
  A normal retry can see the tag and skip publication; do not assume it repairs
  missing evidence. Pause activation while investigating. Inspect remote tags and
  GitHub releases first; match the CI evidence manifest's gitHead to the existing
  tag using `git rev-parse <tag>^{commit}`. With explicit maintainer authorization,
  finish the missing release/assets for that existing tag using the preserved notes
  and JSON; never retag or overwrite conflicting evidence. If the artifact expired,
  regenerate notes/manifest from the exact tag and previous tag range in an isolated
  checkout and review before uploading. This recovery remains manual.
- An uncertain network result must be inspected before retrying. Keep subsequent
  publication paused until partial releases are reconciled.

Live permission, protected-tag, concurrent Actions, and GitHub recovery behavior
must be validated in the approved repository. Local tests cover the actual engine
against disposable Git remotes, severity/notes, batching, exact tags, and clean retries.

## Official sources checked 2026-10-23

- [semantic-release configuration](https://semantic-release.org/usage/configuration/)
  and [GitHub Actions recipe](https://semantic-release.org/recipes/ci-configurations/github-actions/)
- [Commit analyzer rules](https://github.com/semantic-release/commit-analyzer)
- [Release notes generator](https://github.com/semantic-release/release-notes-generator)
- [GitHub publisher options/permissions](https://github.com/semantic-release/github)
- [release-please manifest/release PR design](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md)
- [GitHub Actions concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
