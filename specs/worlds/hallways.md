<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Hallway fixture definitions, revision 0.1.0

Copyright 2026 Living Proof Labs contributors. [CC BY 4.0](../../LICENSES/CC-BY-4.0.txt).

This fixture family applies the [world contract](README.md) to two closed
rectangular hallway worlds. `hallway` is the semantic name. Each fixture has a
floor and four enclosing walls, no entrances, exits, doors, doorway semantics,
or navigation goal, and an open top for visualization.

## Canonical dimensions

All values are metres. Clear interior width and length are distances between
opposing inner wall faces. Exterior dimensions include both wall thicknesses.
Wall height is measured from the floor top surface to the wall top.

| Fixture and content version | Clear interior width | Clear interior length | Wall height | Wall thickness | Exterior width × length |
| --- | ---: | ---: | ---: | ---: | ---: |
| `hallway-short` / `0.1.0` | 1.50 m | 5.00 m | 2.50 m | 0.15 m | 1.80 m × 5.30 m |
| `hallway-long` / `0.1.0` | 2.00 m | 10.00 m | 2.50 m | 0.15 m | 2.30 m × 10.30 m |

The floor covers the complete interior footprint. Its construction thickness and
material properties are consumer choices unless they affect retained evidence.

## Frame, placement, and reset

The hallway frame is right-handed and metre-based. The origin is the centre of
the floor top surface; `+x` follows clear interior length, `+y` clear interior
width, and `+z` upward. Inner end-wall faces are at `x = ±length/2`; inner
side-wall faces are at `y = ±width/2`. A pose is position `(x, y, z)` in this
frame plus a right-handed orientation; yaw is positive about `+z`.

The allowed horizontal region for an entity reference point has at least 0.25 m
clearance from every inner wall face: `x = [-2.25, 2.25]`, `y = [-0.50, 0.50]`
for `hallway-short`, and `x = [-4.75, 4.75]`, `y = [-0.75, 0.75]` for
`hallway-long`. A floor-spawned entity records its ground-contact point at
`z = 0`. A collision probe records its centre pose, collision shape, and
clearance separately. Reset restores the fixture geometry, frame, and initial
world state and removes transient entities.

## Hallway conformance expectations

Measured clear width, clear length, wall height, wall thickness, and origin must
agree with the canonical dimensions and frame within 0.01 m. Measured frame axes
must agree within 0.5 degrees.

Collision evidence uses a 0.10 m-radius non-robot sphere. With gravity and
contacts enabled, release it from rest with its centre at `z = 0.75 m` to assess
the floor. Then drive it normally, without teleporting and at no more than
0.25 m/s, toward each of the four walls from declared centre poses in the allowed
horizontal region. It must not emerge below the floor or outside the closed
interior; penetration beyond a floor top surface or inner wall face may not
exceed 0.01 m. Retained evidence records gravity/contact settings, drive method,
sampling rate, and measurement method.

Retain at least one interior visual, one overhead visual, and machine-readable
geometry/frame/collision/reset results. These expectations apply only to this
hallway fixture family.
