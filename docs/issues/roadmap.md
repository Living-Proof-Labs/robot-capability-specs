# Roadmap issue drafts

Create these in GitHub when repository access and publication are approved. This
file is a planning draft, not a record of remotely created issues.

## 1. Establish catalog versions and generated GitHub release notes

Use upstream semantic-release for merged mainline work. Multiple accumulated
merges may share a release. This replaces the earlier per-commit coverage goal.

Acceptance criteria:

- [x] Use the upstream initial stable catalog version, 1.0.0.
- [ ] Test fixes, features, breaking changes, documentation-only and maintenance
  changes with the official analyzer and notes generator; retain breaking precedence.
- [ ] Preserve upstream batch, unknown-message, revert-filtering and retry behavior.
- [ ] Generate notes in the GitHub release body; do not commit a changelog, version
  bump, custom ledger or redundant generated notes file.
- [ ] Verify immutable tags identify the tested source SHA.
- [ ] Verify failed tests and PR/fork/branch runs cannot publish stable releases.
- [ ] Keep CI-only unique run versions/downstream outputs as a small separate follow-up.
- [ ] Validate live permissions and partial-publication recovery before separately
  recording the activated release; no package publication or broader credentials.

## 2. Define one minimal capability contract and its evaluation policies

After issue 1: use one small ability to agree on identity, conditions, acceptance
criteria and retained evidence. Cover deterministic checks, anchored subjective
rubrics, and multi-evaluator quorum/weights/voting/ties/abstention/error policies.
Define inconclusive outcomes explicitly. Decide per-contract semantic revisions
separately from catalog versions. Accept through examples and counterexamples,
not a speculative universal schema.

## 3. Identify external adapter and execution boundaries

After a contract exists: identify needs for separate ANYmal and Unitree variant
adapters, simulators and alternate Git providers. Record interfaces and evidence
requirements through issues before creating external repositories. No proprietary
SDK code or robot-specific dependencies enter the core catalog.
