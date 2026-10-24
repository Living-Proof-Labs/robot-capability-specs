# Roadmap issue drafts

Create these in GitHub when repository access and publication are approved. This
file is a planning draft, not a record of remotely created issues.

## 1. Establish catalog versions and release notes for every merged change

Problem: capability references must identify a reproducible catalog snapshot and
explain every change, including documentation and maintenance.

Acceptance criteria:

- [ ] Approve ADR 0001: first release 1.0.0 and tested push-head releases with complete
  per-commit coverage. If unique stable versions per commit are required instead,
  resolve that explicitly before activation.
- [ ] Review this implementation in a draft PR; authorize merge separately.
- [ ] Prove fix, feat, breaking (`!` and footer), docs-only, maintenance, unknown
  messages, and mixed batches select the documented severity and retain note coverage.
- [ ] Prove release manifest version/tag/full head SHA and every included commit
  match the Git source; successful retries never move or duplicate tags.
- [ ] Prove failed tests do not publish, and PR/fork/feature branch execution cannot
  invoke the privileged release job. Previews identify exact source commits.
- [ ] In the authorized repository, exercise batched pushes, pending-run coalescing,
  stale runs, and a failed final head; verify eventual commit coverage after recovery.
- [ ] Rehearse partial tag/release/asset failure recovery without moving tags.
- [ ] Verify only scoped runtime `contents: write` is needed; approve any protections
  and activation independently. No package publication.
- [ ] Merge/activate only after explicit approval and record the first release URL
  and its machine-readable evidence in this issue.

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
