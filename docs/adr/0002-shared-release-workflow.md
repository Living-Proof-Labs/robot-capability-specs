# ADR 0002: Adopt the released shared workflow

Status: accepted. On 2026-10-24, unauthenticated HTTPS retrieval of the released
workflow and a credential-free Git tag lookup confirmed public source access.
The source was private when the draft was prepared; migration waited for the owner
to make it public. No credentials or access settings were changed by this migration.

Use the reusable workflow at:

`Living-Proof-Labs/collaboration-guidelines/.github/workflows/semantic-release.yml@v2.0.0`

Verified resolved commit: `a1b3425b9bce95252de9ba516b5008b1bfbeb78f`.
Use the version tag in the reference; retain the SHA as verification evidence.
Published tags must never be retargeted. Adopt updates through a PR after checking
the release notes, diff, and consumer validation. Moving branches or major aliases
are not substitutes. Third-party Actions keep their existing reviewed security pins.

The released workflow exposes boolean input `dry-run` (default false) and outputs
`published`, `version`, `git-tag`, and `release-url`. `published` is a string;
no release returns false and empty version/tag/URL. Dry runs still require source
and repository access and are not PR previews. Downstream jobs can use
`needs.release.outputs.version`; CI run identity remains a separate future concern.
See the [versioned contract](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v2.0.0/docs/releases.md).

The consumer verifies the triggering checkout with `task verify` first. The release
job has `needs: verify`, retains the main-only trigger and RELEASES_ENABLED off
switch, and requests only the existing contents-write permission. The shared
workflow receives GitHub's existing caller token automatically; no inherited
secrets, PAT or extra permission is configured. The source checks out the caller's
exact triggering commit with full history and serializes publication per caller.
Its bundled Action, configuration and lockfile resolve at the called revision.

Remove the consumer's duplicated release configuration, semantic-release/preset/
semver dependencies and release-engine/policy tests. The released source owns those
contracts and tests, including docs/maintenance patch rules and breaking precedence.
Keep consumer title and exact-SHA preview validation, plus caller boundary tests.
Local checks cannot prove reusable-workflow access or a successful hosted release.

The migration must not recreate or move existing release tags:

- v1.0.0: `4902238ff9817c5aa130964c87cfa4bab36854e7`
- v1.0.1: `411b8e2752dad592d7ae6493aad66156d650135e`

After source visibility is verified, run hosted consumer checks before merge, then
verify the post-merge generated release and tag. Keep generated notes in GitHub
Releases, without tracked changelogs or version-bump commits. ADR 0001's accepted
release semantics remain; this changes ownership of machinery, not that policy.
