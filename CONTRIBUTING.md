# Contributing

Start with a GitHub issue describing the requirement and observable acceptance
criteria. Keep high-level decisions separate from implementation tasks. Open a
**draft PR**, link the issue, and include test evidence before requesting review.
Do not merge or activate release automation without maintainer approval.

Use a Conventional Commit PR title: `type(scope): description`, with optional
scope. Types: `feat`, `fix`, `perf`, `docs`, `chore`, `build`, `ci`, `test`,
`refactor`, `style`, `revert`. Use `!` for breaking changes and describe the
migration in the PR body; preserve any `BREAKING CHANGE:` footer in the final
squash commit. Prefer squash merging so the reviewed title becomes the mainline
commit. Maintainers must check the final merge message, not just the branch title.

Run `npm ci --ignore-scripts` and `npm test`. CI publishes only a preview artifact
for feature branches and PRs. PR code has no release token. Changes to criteria
that invalidate previously valid consumers or evidence are breaking; clarifications
that preserve meaning are patches. Additive abilities are features. Per-contract
revision semantics are deferred until the contract design is agreed.

Contribute only work you have the right to publish. Follow the path-specific
license in LICENSE.md. Do not include credentials, private datasets, or proprietary
robot SDK/adapter code.
