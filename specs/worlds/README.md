<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Proposed world contract, revision 0.1.0

Copyright 2026 Living Proof Labs contributors. [CC BY 4.0](../../LICENSES/CC-BY-4.0.txt).

This is a proposed, document-only contract for small reusable worlds. It defines
world content and cross-engine evidence separately from robot locomotion,
controllers, and adapters. It is not an implemented world, simulator test, or
building-code standard. `livingproof-worlds` is the proposed future library; it
is not created by this contract. `livingproof-sim-mujoco` and
`livingproof-sim-gazebo` are the intended independent consumers. Robot adapters
come later. The older Cursor-built `unitree-foxglove-sdk` may inform discussion
but is disposable proof/reference material and must never become a runtime
dependency.

## Fixture definitions

The semantic fixture name is `hallway`, although each fixture is a closed
rectangle rather than a navigable corridor. It has a floor and four enclosing
walls. It has no entrances, exits, doors, doorway semantics, or navigation exit
goal. The top is open for visualization and inspection.

All values are metres. The following proposed values are centralized here;
examples and consumer evidence must refer to these fixture identifiers rather
than restating different dimensions.

| Fixture and proposed content version | Clear interior width | Clear interior length | Wall height | Wall thickness | Exterior width × length |
| --- | ---: | ---: | ---: | ---: | ---: |
| `hallway-short` / `0.1.0` | 1.50 m | 5.00 m | 2.50 m | 0.15 m | 1.80 m × 5.30 m |
| `hallway-long` / `0.1.0` | 2.00 m | 10.00 m | 2.50 m | 0.15 m | 2.30 m × 10.30 m |

Clear interior width and length are the distances between opposing inner wall
faces. Exterior dimensions include both wall thicknesses. Wall height is measured
from the floor top surface at `z = 0` to the wall top. The floor must cover the
entire interior footprint; its construction thickness and material properties are
engine choices that must be declared if they affect evidence.

## Coordinates, poses, and reset

Use a right-handed, metre-based world frame: the origin is at the centre of the
floor top surface, `+x` follows clear interior length, `+y` follows clear interior
width, and `+z` points upward. Inner end-wall faces are at `x = ±length/2`; inner
side-wall faces are at `y = ±width/2`. A pose is position `(x, y, z)` in that
frame plus a right-handed orientation; yaw is positive about `+z`. State the
orientation representation in retained evidence, but do not change these axes.

The valid spawn/probe region is on the floor with a ground-contact point at
`z = 0`, any yaw, and at least 0.25 m horizontal clearance from every inner wall
face. Thus it is `x = [-2.25, 2.25]`, `y = [-0.50, 0.50]` for `hallway-short`,
and `x = [-4.75, 4.75]`, `y = [-0.75, 0.75]` for `hallway-long`. Consumers must
reject or clearly report a requested spawn or probe outside that region rather
than silently relocating it. Reset must remove transient entities and restore the
declared fixture geometry, frame, and initial world state; it does not require
bitwise-identical physics trajectories across engines.

## Proposed conformance criteria and evidence

A simulator adapter can claim this proposed contract only when it supplies
evidence for geometry, frame, collision, reset, and rendering. These are
illustrative acceptance criteria, not reported passes:

- Measured clear width, clear length, wall height, wall thickness, and declared
  origin must each agree with this contract within 0.01 m. Measured frame axes
  must agree within 0.5 degrees.
- A declared non-robot collision probe with a 0.10 m spherical radius and centre
  height of 0.50 m must be driven normally toward each wall from the valid probe
  region. It must not emerge outside the closed interior; no more than 0.01 m
  penetration beyond an inner wall face is permitted. The probe, drive method,
  sampling rate, and measurement method belong in the adapter evidence.
- Reset evidence must show that the fixture identifier, dimensions, frame, and
  empty transient-entity set are restored. It must not infer robot locomotion
  capability from a world reset or collision observation.
- Retain at least one interior visual and one overhead visual plus machine-readable
  geometry/frame/collision/reset results. Retained records must identify catalog
  version and commit, world contract revision, fixture content version, adapter
  version and commit, simulator name/version, and evidence paths with digests.

Exact physics trajectories, contact forces, timestamps, renderer pixels, and
camera images need not match between MuJoCo and Gazebo. Each engine must meet its
own evidence criteria. An unsupported fixture, feature, or evidence format is
not a pass: the adapter must return a clear unsupported or invalid-evidence
result that names the missing capability.

## Acceptance status and traceability

This contract and its BDD examples are **authored and parser-validated** in this
catalog. Engine-specific tests, world-library assets, simulator adapters, robot
locomotion tests, and measured conformance results are **not implemented** here.
The traceability path is: this contract revision → a future versioned
`livingproof-worlds` fixture → an independent versioned simulator adapter →
retained evidence. Verification remains separate from world content: MuJoCo and
Gazebo consumers must not rely on a shared simulator test framework.

The BDD matrix in [the accompanying examples](reference.feature) crosses the two
fixtures with the two intended simulators. It defines expected evidence coverage,
not a claim that any matrix coordinate has run.
