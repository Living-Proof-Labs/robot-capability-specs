# SPDX-License-Identifier: CC-BY-4.0
@proposed_world_contract
Feature: Proposed closed hallway world contract
  World conformance is separate from robot locomotion and simulator-specific implementation.

  Scenario Outline: An integrator selects a versioned world fixture
    Given proposed world fixture <world> at content version "0.1.0"
    And simulator <simulator> with an independently versioned adapter
    When an integrator selects the declared fixture content
    Then the adapter resolves the canonical fixture definition without an engine-specific world code change
    And the floor and four enclosing walls have no door, entrance, exit, or navigation-goal semantics

    Examples:
      | world         | simulator |
      | hallway-short | MuJoCo    |
      | hallway-short | Gazebo    |
      | hallway-long  | MuJoCo    |
      | hallway-long  | Gazebo    |

  Scenario Outline: A scenario author uses canonical coordinates
    Given proposed world fixture <world> at content version "0.1.0"
    When a scenario author reads the canonical fixture definition
    Then the author uses the declared origin, right-handed axes, and pose convention
    And the author uses the declared horizontal allowed region for an entity reference point
    And a floor spawn and a collision-probe centre pose are recorded separately

    Examples:
      | world         |
      | hallway-short |
      | hallway-long  |

  Scenario Outline: A verifier evaluates bounded world-conformance evidence
    Given proposed world fixture <world> at content version "0.1.0"
    And simulator <simulator> with an independently versioned adapter
    When a verifier reviews geometry, frame, reset, and bounded floor and wall collision evidence
    Then it applies the proposed contract tolerances to the canonical fixture definition
    And it records gravity, contacts, and non-teleport probe drive conditions
    And it does not assess robot locomotion or require exact physics or pixel equality

    Examples:
      | world         | simulator |
      | hallway-short | MuJoCo    |
      | hallway-short | Gazebo    |
      | hallway-long  | MuJoCo    |
      | hallway-long  | Gazebo    |

  Scenario Outline: A reviewer inspects retained conformance results
    Given proposed world fixture <world> at content version "0.1.0"
    And simulator <simulator> with an independently versioned adapter
    When a reviewer opens a rendered conformance result
    Then it includes interior and overhead visuals and machine-readable evidence
    And it identifies the world, specification, and adapter versions and commits
    And it reports unsupported or invalid evidence clearly rather than PASS

    Examples:
      | world         | simulator |
      | hallway-short | MuJoCo    |
      | hallway-short | Gazebo    |
      | hallway-long  | MuJoCo    |
      | hallway-long  | Gazebo    |

  Scenario Outline: Unsupported world-contract features fail clearly
    Given simulator <simulator> with an independently versioned adapter
    When the adapter is asked for unsupported feature <feature>
    Then it returns a clear unsupported or invalid-evidence result naming <feature>
    And it does not report world conformance as PASS

    Examples:
      | simulator | feature                  |
      | MuJoCo    | required evidence format |
      | Gazebo    | requested world fixture  |
