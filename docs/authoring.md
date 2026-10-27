<!-- SPDX-License-Identifier: Apache-2.0 -->
# Author a capability contract

Start with [catalog scope](../specs/README.md), then read the
[revision 1 contract](../specs/v1/README.md) and its
[Gherkin examples](../specs/v1/reference.feature). Select an explicit catalog
release and capability revision when citing a contract. The
[compatibility matrix](../specs/matrix/README.md) explains why executor support
is separate from a capability verdict.

Propose changed criteria in an issue before adding a revision. State observable
preconditions, measurements and units, inclusive boundaries, mandatory assessments,
and how missing or invalid evidence is handled. Preserve existing revisions;
explain compatibility and add positive, negative and boundary examples alongside
the Markdown. Follow [contribution and release rules](../CONTRIBUTING.md).

Run `task verify` to parse the catalog examples and exercise the rendered manual.
Review the resulting manual under `artifacts/manual/html/` using the
[preview instructions](verification.md). These checks do not execute a robot,
certify safety, or validate a universal schema: none exists in this catalog.
Runtime execution belongs in the released verifier linked from the matrix.

For the command home and plugin concepts, see the related
[Living Proof manual](https://docs.livingprooflabs.com/livingproof/).
