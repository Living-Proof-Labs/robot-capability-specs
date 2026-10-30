# SPDX-License-Identifier: CC-BY-4.0
@proposed_world_contract
Feature: Proposed closed hallway world contract
  World conformance is separate from robot locomotion and simulator-specific implementation.

  Scenario Outline: A simulator adapter records proposed cross-engine world evidence
    Given proposed world fixture <world> at content version "0.1.0"
    And simulator <simulator> with an independently versioned adapter
    When the adapter evaluates geometry, frame, closed-wall collision, reset, and retained visual evidence
    Then the fixture has <width> m clear interior width and <length> m clear interior length
    And the floor and four enclosing walls have no door, entrance, exit, or navigation-goal semantics
    And the world frame and collision requirements use the proposed contract tolerances
    And retained evidence identifies the world, specification, and adapter versions
    And the result does not claim robot locomotion or exact physics or pixel equality

    Examples:
      | world         | simulator | width | length |
      | hallway-short | MuJoCo    | 1.50  | 5.00   |
      | hallway-short | Gazebo    | 1.50  | 5.00   |
      | hallway-long  | MuJoCo    | 2.00  | 10.00  |
      | hallway-long  | Gazebo    | 2.00  | 10.00  |

  Scenario Outline: Unsupported world-contract features fail clearly
    Given simulator <simulator> with an independently versioned adapter
    When the adapter is asked for unsupported feature <feature>
    Then it returns a clear unsupported or invalid-evidence result naming <feature>
    And it does not report world conformance as PASS

    Examples:
      | simulator | feature                  |
      | MuJoCo    | required evidence format |
      | Gazebo    | requested world fixture  |
