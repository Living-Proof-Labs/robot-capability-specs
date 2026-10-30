<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# World contract, revision 0.1.0

Copyright 2026 Living Proof Labs contributors. [CC BY 4.0](../../LICENSES/CC-BY-4.0.txt).

This document defines the contract between versioned world content, a consumer,
and conformance evidence. It does not prescribe a robot, controller, transport,
simulator, world geometry, or runtime implementation.

## Versioned world selection

A world fixture is selected by its immutable identifier and content version. Its
definition declares the coordinate frame, geometry and surfaces, placement or
probe regions, reset state, and conformance expectations needed by consumers.
Consumers resolve that declaration through their world-content interface; the
same fixture declaration can be consumed by different implementations.

All declared distances use metres. Each fixture declares a right-handed frame,
origin, axes, pose representation, and any permitted placement region. A consumer
must preserve those declarations or report a clear unsupported or invalid-evidence
result. It must not silently substitute a different fixture or placement.

## User stories and BDD traceability

| Story | Expected outcome | BDD scenario |
| --- | --- | --- |
| As an integrator, I want to select a versioned world without changing consumer-specific world content, so that one declared fixture can be used by more than one consumer. | The consumer resolves the selected identifier and version through its declared world-content interface. | `A consumer selects a versioned world` |
| As a scenario author, I want declared coordinate and placement conventions, so that a scenario has an unambiguous frame and pose. | The scenario uses the selected fixture's declared frame and permitted placement region. | `A scenario author uses selected-fixture conventions` |
| As a verifier, I want measurable fixture expectations, so that I can assess world conformance separately from system behavior. | The verifier checks the selected fixture's declared geometry, surfaces, reset, and collision expectations. | `A verifier evaluates selected-fixture evidence` |
| As a reviewer, I want retained results with provenance, so that I can inspect what was evaluated. | The result identifies the selected fixture, contract, consumer, and retained evidence. | `A reviewer inspects retained conformance results` |
| As a verifier, I want an unsupported world feature to fail clearly, so that no consumer silently ignores part of a fixture. | The consumer reports the unsupported feature by name and the record is not a pass. | `A consumer meets an unsupported world feature` |

The [open hallway fixture](hallways.md) and [hallway examples](hallways.feature)
are one selected fixture and consumer matrix; they do not constrain other worlds.

## Named places

A fixture may declare named places in its own frame: points, line segments,
regions, polylines, and poses. Consumers and scenarios refer to a place by name
and fixture version, never by re-deriving its coordinates in consumer code.

## Unsupported features

When a consumer cannot represent a declared feature (for example a geometric
primitive, surface property, or named-place type its engine cannot load), it
must stop with an `UNSUPPORTED` result naming the fixture, version, and feature.
It must not drop, approximate, or substitute the feature and then report a pass.

## Conformance evidence

A conformance record identifies the catalog version and commit, world contract
revision, fixture identifier and content version, consumer version and commit,
execution environment, and evidence paths with digests. It retains the selected
fixture's declared geometry/frame measurements, reset result, collision result,
and required rendered or machine-readable outputs.

Fixture-specific collision expectations declare the target surfaces, probe shape,
initial pose, gravity/contact settings where applicable, permitted drive method,
sampling, measurement method, and tolerance. A consumer returns an unsupported
or invalid-evidence result when it cannot meet a declared expectation. Results
from distinct consumers need not have identical physics trajectories, contact
forces, timestamps, or rendered pixels. Equivalent geometry does not imply
identical physics.

## Status

This contract and its Gherkin examples are authored and parser-validated in this
catalog. World assets, consumer adapters, engine execution, and measured
conformance records are not implemented here. World data will live in a separate
`livingproof-worlds` repository; simulator adapters live in their own consumers.
