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

Use upstream semantic-release with its official commit analyzer, release notes
generator, and GitHub publisher. Conventional Commits determine versions: fixes,
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
