# SPDX-License-Identifier: CC-BY-4.0
@hallway_fixture
Feature: Open hallway fixture
  One open hallway, with no doors, loaded by MuJoCo and Gazebo consumers.
  Equivalent geometry does not imply identical physics. No robot or controller is involved.

  Scenario Outline: An integrator selects the open hallway by name and version
    Given hallway fixture "hallway-open" at content version "0.1.0"
    And simulator <simulator> with a versioned adapter
    When the integrator selects the fixture by configuration only
    Then the consumer loads it without simulator code changes
    And an unknown fixture identifier or version is reported, not substituted

    Examples:
      | simulator |
      | MuJoCo    |
      | Gazebo    |

  Scenario Outline: A consumer reports the named places in the world frame
    Given hallway fixture "hallway-open" at content version "0.1.0"
    And simulator <simulator> with a versioned adapter
    When the consumer reports the entrance, exit, passage, passage-centreline, and spawn places
    Then each place matches the canonical world-frame values within 0.01 m and 0.5 degrees

    Examples:
      | simulator |
      | MuJoCo    |
      | Gazebo    |

  Scenario: A verifier compares MuJoCo and Gazebo
    Given hallway fixture "hallway-open" at content version "0.1.0" loaded in MuJoCo and in Gazebo
    When a verifier runs the dimension, named-place, floor, side-wall, and open-end checks in each engine
    Then each engine is within tolerance of the canonical values
    And a cross-engine comparison lists each quantity's canonical value, both measured values, and their difference

  Scenario: A reviewer inspects both engines' evidence
    Given a completed MuJoCo and Gazebo evaluation of "hallway-open" at content version "0.1.0"
    When a reviewer opens the review record
    Then it shows an overhead and an entrance-view screenshot from each engine and the test results
    And it identifies the fixture version, world contract revision, catalog version, and adapter versions

  Scenario Outline: A consumer cannot load a declared feature
    Given hallway fixture "hallway-open" declares a feature that simulator <simulator> cannot load
    When the consumer loads the fixture
    Then it returns UNSUPPORTED naming the fixture, version, and feature
    And it does not report a pass with the feature ignored

    Examples:
      | simulator |
      | MuJoCo    |
      | Gazebo    |
