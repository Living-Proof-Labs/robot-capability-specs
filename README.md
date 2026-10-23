# Robot capability specifications

An open Living Proof Labs catalog of granular robot abilities, operating conditions,
and acceptance criteria, independent of any robot implementation.

The first deliverable is **catalog versioning and release evidence**. There is no
universal schema, executable evaluator, or robot adapter yet. Future adapters for
ANYmal and Unitree variants belong in separate repositories. See the
[scope](specs/README.md) and [roadmap issue drafts](docs/issues/roadmap.md).

## Development

Use Node.js 24.10 or newer in the 24.x line:

```sh
npm ci --ignore-scripts
npm test
npm run preview
```

`artifacts/preview.json` identifies the exact checked-out commit. It is not a stable
release or a prediction of the next release version. Tooling is private to this
repository; no npm package is published.

## Releases

The proposed policy uses SemVer and Conventional Commits, with semantic-release
handling version selection, tags, and GitHub releases. `fix`, documentation, and
maintenance changes increment patch; `feat` increments minor; `!` or a
`BREAKING CHANGE:` footer increments major. First release: `1.0.0` of the catalog,
not a claim of schema maturity. Release notes include every commit and an attached
`release.json` maps the release version and all included commits to full Git SHAs.

A release names a tested **push head**: batched commits share that release version.
This provides per-commit coverage, not a distinct stable release for each commit.
See [ADR 0001](docs/adr/0001-catalog-releases.md), including the explicit granularity
tradeoff and recovery procedure. Automation is inert until approval and the
`RELEASES_ENABLED=true` repository variable are both in place. This foundation
must first be reviewed as a draft PR; do not merge or activate it without approval.

## Licensing

Original specification content under `specs/` is CC BY 4.0. Original tooling and
project documentation elsewhere are Apache-2.0. See [LICENSE.md](LICENSE.md) for
precise scope and attribution. Dependency and license texts retain their own terms.
