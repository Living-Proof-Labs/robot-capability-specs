<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# World contract, revision 0.3.0

Copyright 2026 Living Proof Labs contributors. [CC BY 4.0](../../LICENSES/CC-BY-4.0.txt).

This document defines the contract between versioned world content, a consumer,
and conformance evidence. It does not prescribe a robot, controller, transport,
simulator, world geometry, or runtime implementation.

## Versioned world selection

A world is selected by its immutable identifier and content version. Its
definition declares the coordinate frame, geometry and surfaces, placement or
probe regions, reset state, and conformance expectations needed by consumers.
Consumers resolve that declaration through their world-content interface; the
same world declaration can be consumed by different implementations.

All declared distances use metres. Each world declares a right-handed frame,
origin, axes, pose representation, and any permitted placement region. A consumer
must preserve those declarations or report a clear unsupported or invalid-evidence
result. It must not silently substitute a different world or placement.

## User stories and BDD traceability

| Story | Expected outcome | BDD scenario |
| --- | --- | --- |
| As an integrator, I want to select a versioned world without changing consumer-specific world content, so that one declared world can be used by more than one consumer. | The consumer resolves the selected identifier and version through its declared world-content interface. | `A consumer selects a versioned world` |
| As a scenario author, I want declared coordinate and placement conventions, so that a scenario has an unambiguous frame and pose. | The scenario uses the selected world's declared frame and permitted placement region. | `A scenario author uses selected-fixture conventions` |
| As a verifier, I want measurable world expectations, so that I can assess world conformance separately from system behavior. | The verifier checks the selected world's declared geometry, surfaces, reset, and collision expectations. | `A verifier evaluates selected-fixture evidence` |
| As a reviewer, I want retained results with provenance, so that I can inspect what was evaluated. | The result identifies the selected world, contract, consumer, and retained evidence. | `A reviewer inspects retained conformance results` |
| As a verifier, I want an unsupported world feature to fail clearly, so that no consumer silently ignores part of a world. | The consumer reports the unsupported feature by name and the record is not a pass. | `A consumer meets an unsupported world feature` |

The [open hallway world](hallways.md) and [hallway examples](hallways.feature)
are one selected world and consumer matrix; they do not constrain other worlds.

## Named places

A world may declare named places in its own frame: points, line segments,
regions, polylines, and poses. Consumers and scenarios refer to a place by name
and world version, never by re-deriving its coordinates in consumer code.

## Any layout

Revision 0.3.0 adds a layout contract for scenarios that need more than a
straight hallway. A world conforms to it when it meets
[world-layout.schema.json](world-layout.schema.json) (`livingproof-world-layout/0.1`)
and these rules, which a schema cannot express:

- Every floor and wall is an axis-aligned box: a centre and a size, with no
  rotation. Walls may form any layout, such as two hallways meeting at a corner.
  No two boxes overlap, though they may touch.
- Each floor's top surface is at `z = 0` and it is `floor_thickness` thick.
  Each wall rises from `z = 0` to `wall_height` and is `wall_thickness` thick
  across its thin side.
- `entrance` and `exit` are segments on the floor that span `clear_width`, with
  their reference point at the midpoint.
- The route is a polyline on the floor with at least 2 points and no repeated
  point. It starts at the `entrance` reference point, ends at the `exit`
  reference point, and stays at least `clear_width ÷ 2` from every wall, so it
  runs down the middle of each hallway.
- `spawn-entrance` is a pose on the route, facing along the route leg it lies on.

Distances are compared within the world's `tolerances.distance_m` and angles
within `tolerances.angle_deg`.

A scenario names its route polyline in its
[parameter file](../scenarios/walk-hallway/parameters.json) and measures
`route_length` along it, from the point nearest the start pose to the exit.
Worlds written for this layout revision name the route `route-centreline`.
`hallway-open` 0.1.0 predates that name. Its route is `passage-centreline`, and
it conforms unchanged: its released bytes are tested against this contract,
with a route length of 5.5 m.

## Unsupported features

When a consumer cannot represent a declared feature (for example a geometric
primitive, surface property, or named-place type its engine cannot load), it
must stop with an `UNSUPPORTED` result naming the world, version, and feature.
It must not drop, approximate, or substitute the feature and then report a pass.

## Conformance evidence

A conformance record identifies the catalog version and commit, world contract
revision, world identifier and content version, consumer version and commit,
execution environment, and evidence paths with digests. It retains the selected
world's declared geometry/frame measurements, reset result, collision result,
and required rendered or machine-readable outputs.

World-specific collision expectations declare the target surfaces, probe shape,
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
[Living-Proof-Labs/livingproof-worlds](https://github.com/Living-Proof-Labs/livingproof-worlds) repository; simulator adapters live in their own consumers.
