<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# World contract, revision 0.1.0

Copyright 2026 Living Proof Labs contributors. [CC BY 4.0](../../LICENSES/CC-BY-4.0.txt).

This document-only contract defines small reusable worlds. It defines
world content and cross-engine evidence separately from robot locomotion,
controllers, and adapters. It is not an implemented world, simulator test, or
building-code standard. `livingproof-worlds` is the future library; it is not
created by this contract. `livingproof-sim-mujoco` and
`livingproof-sim-gazebo` are the intended independent consumers. Robot adapters
come later. The older Cursor-built `unitree-foxglove-sdk` may inform discussion
but is disposable proof/reference material and must never become a runtime
dependency.

## Fixture definitions

The semantic fixture name is `hallway`, although each fixture is a closed
rectangle rather than a navigable corridor. It has a floor and four enclosing
walls. It has no entrances, exits, doors, doorway semantics, or navigation exit
goal. The top is open for visualization and inspection.

All values are metres. The following values are canonical for this
contract. BDD examples and consumer evidence refer to fixture identifiers and
this table rather than duplicating dimensions.

| Fixture and content version | Clear interior width | Clear interior length | Wall height | Wall thickness | Exterior width × length |
| --- | ---: | ---: | ---: | ---: | ---: |
| `hallway-short` / `0.1.0` | 1.50 m | 5.00 m | 2.50 m | 0.15 m | 1.80 m × 5.30 m |
| `hallway-long` / `0.1.0` | 2.00 m | 10.00 m | 2.50 m | 0.15 m | 2.30 m × 10.30 m |

Clear interior width and length are the distances between opposing inner wall
faces. Exterior dimensions include both wall thicknesses. Wall height is measured
from the floor top surface at `z = 0` to the wall top. The floor must cover the
entire interior footprint; its construction thickness and material properties are
engine choices that must be declared if they affect evidence.

## User stories and BDD traceability

These stories keep world content, simulator integration, and verification
separate. Hallways are the first examples, not the only world shape this contract
can later describe.

| Story | Expected outcome | BDD scenario |
| --- | --- | --- |
| As an integrator, I want to select a versioned world fixture without changing engine-specific world code, so that the same declared content can be consumed by more than one simulator. | The adapter resolves the selected fixture content/version through its declared world-content interface. | `An integrator selects a versioned world fixture` |
| As a scenario author, I want consistent coordinates and valid placement rules, so that scenarios mean the same thing for every consumer. | The author receives the canonical axes, origin, and horizontal allowed region. | `A scenario author uses canonical coordinates` |
| As a verifier, I want bounded conformance evidence, so that I can distinguish geometry/frame/collision/reset evidence from robot ability. | The verifier evaluates declared world evidence, including floor and wall collision, without grading locomotion. | `A verifier evaluates bounded world-conformance evidence` |
| As a reviewer, I want rendered and machine-readable retained results with provenance, so that I can inspect an engine result and reproduce its identity. | The result includes required visuals, evidence records, and world/specification/adapter provenance. | `A reviewer inspects retained conformance results` |

## Coordinates, poses, placement, and reset

Use a right-handed, metre-based world frame: the origin is at the centre of the
floor top surface, `+x` follows clear interior length, `+y` follows clear interior
width, and `+z` points upward. Inner end-wall faces are at `x = ±length/2`; inner
side-wall faces are at `y = ±width/2`. A pose is position `(x, y, z)` in that
frame plus a right-handed orientation; yaw is positive about `+z`. State the
orientation representation in retained evidence, but do not change these axes.

The allowed horizontal region for an entity reference point is at least 0.25 m
from every inner wall face: `x = [-2.25, 2.25]`, `y = [-0.50, 0.50]` for
`hallway-short`, and `x = [-4.75, 4.75]`, `y = [-0.75, 0.75]` for
`hallway-long`. A floor-spawned entity records its ground-contact point at
`z = 0` and any yaw. A collision probe records its own centre pose, collision
shape, and clearance; it is not a ground-contact spawn. Consumers must reject or
clearly report a requested reference point outside the horizontal region rather
than silently relocating it. Reset must remove transient entities and restore the
declared fixture geometry, frame, and initial world state; it does not require
bitwise-identical physics trajectories across engines.

## Conformance criteria and evidence

A simulator adapter conforms to this contract only when it supplies
evidence for geometry, frame, collision, reset, and rendering. These are
acceptance criteria, not reported passes:

- Measured clear width, clear length, wall height, wall thickness, and declared
  origin must each agree with this contract within 0.01 m. Measured frame axes
  must agree within 0.5 degrees.
- Collision evidence uses a declared non-robot sphere with a 0.10 m radius.
  With gravity and contacts enabled, release it from rest with its centre at
  `z = 0.75 m` to demonstrate floor containment. Then drive it normally toward
  each wall from a declared centre pose in the allowed horizontal region, without
  teleporting it and at no more than 0.25 m/s. It must not emerge below the floor
  or outside the closed interior; no more than 0.01 m penetration beyond a floor
  top surface or inner wall face is permitted. The gravity setting, contact
  setting, drive method, sampling rate, and measurement method belong in the
  adapter evidence.
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
retained evidence. World content remains independent from a verifier. No common
runtime implementation is required across MuJoCo and Gazebo, although a later
shared verification utility is permitted if it preserves independent adapters and
engine-specific evidence.

The BDD matrix in [the accompanying examples](reference.feature) crosses the two
fixtures with the two intended simulators. It defines expected evidence coverage,
not a claim that any matrix coordinate has run.
