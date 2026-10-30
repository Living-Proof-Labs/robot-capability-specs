# SPDX-License-Identifier: CC-BY-4.0
@hallway_fixture
Feature: Hallway fixture consumer matrix
  The selected hallway fixture retains its own closed-geometry and collision expectations.

  Scenario Outline: A consumer loads a selected hallway fixture
    Given hallway fixture <fixture> at content version "0.1.0"
    And simulator <simulator> with a versioned adapter
    When the consumer loads the selected fixture
    Then it uses the canonical hallway dimensions and frame
    And it applies the hallway floor and four-wall surface expectations

    Examples:
      | fixture       | simulator |
      | hallway-short | MuJoCo    |
      | hallway-short | Gazebo    |
      | hallway-long  | MuJoCo    |
      | hallway-long  | Gazebo    |

  Scenario Outline: A consumer records hallway conformance evidence
    Given hallway fixture <fixture> at content version "0.1.0"
    And simulator <simulator> with a versioned adapter
    When a verifier evaluates hallway geometry, reset, and floor and wall collision evidence
    Then the record includes hallway-required visuals and machine-readable results
    And it identifies the hallway fixture, world contract, and adapter versions

    Examples:
      | fixture       | simulator |
      | hallway-short | MuJoCo    |
      | hallway-short | Gazebo    |
      | hallway-long  | MuJoCo    |
      | hallway-long  | Gazebo    |
