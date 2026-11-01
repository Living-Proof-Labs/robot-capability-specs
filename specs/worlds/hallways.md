<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Open hallway fixture, revision 0.3.0

Copyright 2026 Living Proof Labs contributors. [CC BY 4.0](../../LICENSES/CC-BY-4.0.txt).

Document revision 0.3.0 versions this specification text (0.3.0 adds the shared
result contract and probe parameters). It is separate from
the fixture content version (`hallway-open` / `0.1.0`), which versions the world
data.

This document applies the [world contract](README.md) to one fixture:
`hallway-open`. It is a straight hallway with a floor and two side walls, open at
both ends, with no doors, rooms, end walls, or ceiling. It is engine-neutral:
the same declaration is meant to be loaded by MuJoCo and Gazebo consumers.

The world data for this fixture will live in a future
[Living-Proof-Labs/livingproof-worlds](https://github.com/Living-Proof-Labs/livingproof-worlds)
repository. This catalog holds only the specification and its examples.

## Scope

- There is no robot, controller, or navigation goal in this revision. The
  collision probe is a plain sphere.
- Equivalent geometry does not imply identical physics. Consumers must agree on
  dimensions, placements, and collision boundaries; contact forces, trajectories,
  timing, and rendered pixels may differ.
- "G1 walks from the entrance to the exit" is a later story. It will reuse the
  named places below but is not specified here.

## Canonical dimensions

All values are metres.

| Fixture / content version | Clear width | Length | Wall height | Wall thickness | Exterior width |
| --- | ---: | ---: | ---: | ---: | ---: |
| `hallway-open` / `0.1.0` | 1.50 m | 6.00 m | 2.50 m | 0.15 m | 1.80 m |

Clear width is the distance between the inner side-wall faces. Length is the
extent of the floor and both side walls along `+x`. Wall height is measured from
the floor top surface. The floor covers `x = [-3.00, 3.00]`, `y = [-0.90, 0.90]` and is 0.10 m
thick, with its top surface at `z = 0` and its underside at `z = -0.10`.

## Frame

The frame is right-handed and metre-based. The origin is the centre of the floor
top surface; `+x` runs along the hallway from entrance to exit, `+y` across it,
and `+z` upward. Inner side-wall faces are at `y = ±0.75`. The hallway ends are
the open planes `x = -3.00` and `x = 3.00`. A pose is position `(x, y, z)` plus
yaw in degrees, positive about `+z`.

## Named places

All places are in the world frame above, at floor level (`z = 0`) unless stated.

| Name | Type | Definition |
| --- | --- | --- |
| `entrance` | segment | From `(-3.00, -0.75, 0)` to `(-3.00, 0.75, 0)`; reference point `(-3.00, 0, 0)` |
| `exit` | segment | From `(3.00, -0.75, 0)` to `(3.00, 0.75, 0)`; reference point `(3.00, 0, 0)` |
| `passage` | region | `x = [-3.00, 3.00]`, `y = [-0.50, 0.50]` (0.25 m clearance from each side wall) |
| `passage-centreline` | polyline | `(-3.00, 0, 0)` → `(3.00, 0, 0)` |
| `spawn-entrance` | pose | `(-2.50, 0, 0)`, yaw 0° (facing the exit) |
| `spawn-centre` | pose | `(0, 0, 0)`, yaw 0° |
| `spawn-exit` | pose | `(2.50, 0, 0)`, yaw 180° (facing the entrance) |

Every spawn pose lies inside `passage` and on `passage-centreline`. A
floor-spawned entity records its ground-contact point at `z = 0`. Reset restores
the geometry, frame, and initial world state and removes transient entities.

## Conformance expectations

Measured clear width, length, wall height, wall thickness, floor thickness, origin, and every
named place must agree with the canonical values within 0.01 m. Frame axes and
spawn yaws must agree within 0.5 degrees.

Collision evidence uses a 0.10 m-radius non-robot sphere with gravity and
contacts enabled. The probe is the same in every engine
([hallway-probe.json](hallway-probe.json)): it is mounted on three slide joints
(x, y, z) with no rotation, so it slides rather than rolls; its friction is 0.1;
it is moved by speed control capped at 0.25 m/s, never teleported; and every
physics step is sampled at 500 Hz. Its density is 1000 kg/m³ (mass about
4.19 kg) and gravity is 9.81 m/s² along `-z`. Before the floor drop it is held
for a 2.0 s settle; before each wall and open-end drive it is reset to
`spawn-centre` and settles for 1.5 s. The speed controller's gain and force
(effort) limit are left to each engine and recorded in its result settings;
they are not part of this contract. These are demonstration choices for probing
collision boundaries, not a robot model.

1. **Floor:** release it from rest at `spawn-centre` with its centre at
   `z = 0.75 m`. It settles on the floor; penetration below the floor top
   surface may not exceed 0.01 m.
2. **Side walls:** from `spawn-centre`, drive it normally (no teleporting, at
   most 0.25 m/s) toward `+y` and then `-y`, for 5 s each. The sphere's surface must not pass
   an inner wall face by more than 0.01 m.
3. **Open ends:** from `spawn-centre`, drive it along `passage-centreline` to
   `x = ±2.80`, for up to 16 s each way. It contacts nothing but the floor, showing that no end wall or
   door exists.

Retained evidence records gravity/contact settings, drive method, sampling
rate, and measurement method.

## Cross-engine comparison

A verifier produces one comparison record per fixture version listing, for
each measured quantity (dimensions, named places, collision boundaries), the
canonical value, each engine's measured value, each engine's deviation, and the
MuJoCo-minus-Gazebo difference. The comparison passes only when every engine is
within tolerance of the canonical value; the pairwise difference is reported,
not used to hide a deviation.

## Result contract

Every engine writes one `livingproof-world-result/0.2` record per run, defined
by [hallway-result.schema.json](hallway-result.schema.json). It names the
fixture, the world-contract revision, the catalog tag and commit, the engine,
and the adapter (`adapter.version` is a semantic version, `adapter.commit` the
full 40-character commit or `null`, and the optional `adapter.provenance` is
`git` or `package`).

Each quantity carries its canonical value or target, the measured value, the
deviation, a tolerance and one comparison: `within` passes when
`|measured - canonical| <= tolerance`; `at_most` passes when
`measured <= canonical + tolerance` (used for penetration, distance past a wall
face and the 0.25 m/s speed cap). Open-end quantities are named
`collision/open_end/+x/…` and `collision/open_end/-x/…`, with the ±2.80 target in
`canonical`. The names every record must contain are listed in
[hallway-quantities.json](hallway-quantities.json);
`collision/floor/settled_bottom_z` is optional, and names under `reset/` are
reserved for the reset checks.

`node tooling/compare-results.mjs mujoco/result.json gazebo/result.json`
validates both records against the schema and the required names, then lists
each quantity's canonical value, each engine's measured value and deviation from
canonical, the MuJoCo-minus-Gazebo difference, and each engine's pass. Columns
follow each record's `engine.name` (MuJoCo first, then Gazebo), not the argument
order. The verdict is `PASS` only when every required quantity passes in both
records; the difference is reported, never used to hide a deviation. It exits 0
for `PASS`, 1 for `FAIL`, 3 when either record is `UNSUPPORTED`, 4 for a schema
error, a missing required quantity or an inconsistent record, and 2 for a usage
or read error.

## Reviewer evidence

Each engine run retains at least an overhead screenshot and a view from
`spawn-entrance` toward `exit`, machine-readable geometry/place/collision/reset
results, and the test results. Every record names the exact fixture identifier
and content version, the world-contract revision, the catalog version and
commit, and the consumer (engine and adapter) version and commit.

## User stories and BDD traceability

Stories follow the [world contract](README.md#user-stories-and-bdd-traceability)
format and personas. Each expected outcome is the acceptance criterion; each BDD
scenario names its scenario in [hallway examples](hallways.feature).

| Story | Expected outcome | BDD scenario |
| --- | --- | --- |
| As an integrator, I want to select a named, versioned hallway without changing simulator code, so that MuJoCo and Gazebo consumers load the same declared fixture. | Selecting `hallway-open` at `0.1.0` is configuration only; each consumer loads it without code changes; an unknown identifier or version is reported, not substituted. | `An integrator selects the open hallway by name and version` |
| As a scenario author, I want the entrance, exit, and passage declared in one world frame, so that a scenario has unambiguous places and poses. | Each consumer reports every named place in the world frame within 0.01 m and 0.5 degrees of the canonical table. | `A scenario author uses the declared hallway places` |
| As a verifier, I want to compare MuJoCo and Gazebo against the same declaration, so that I can show they loaded equivalent dimensions, placements, and collision boundaries. | Both engines pass the dimension, named-place, floor, side-wall, and open-end checks, and a cross-engine comparison lists each quantity's canonical value, measured values, and difference. | `A verifier compares MuJoCo and Gazebo hallway evidence` |
| As a reviewer, I want screenshots, test results, and exact versions from both engines, so that I can inspect what was evaluated. | The record shows the required screenshots and test results for each engine and identifies the fixture, world contract, catalog, and adapter versions. | `A reviewer inspects retained hallway results from both engines` |
| As a verifier, I want an unsupported hallway feature to fail clearly, so that no consumer silently ignores part of the fixture. | A consumer that cannot load a declared feature returns `UNSUPPORTED` naming the fixture, version, and feature, and never reports a pass with it ignored. | `A consumer meets an unsupported hallway feature` |
