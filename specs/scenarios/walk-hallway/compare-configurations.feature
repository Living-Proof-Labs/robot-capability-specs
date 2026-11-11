# SPDX-License-Identifier: CC-BY-4.0
@walk_hallway @compare_configurations
Feature: Compare configuration profiles on one robot
  The robot, world, placement, simulator and scenario stay fixed. Only the selected configuration profile changes.
  A comparison is never graded. Each run keeps its own grade.

  Scenario Outline: Each configuration profile walks the same robot
    Given world "hallway-open" at its pinned version in simulator "MuJoCo"
    And robot "unitree-g1" at its pinned model
    And the run manifest selects configuration profile <configuration> with its sha256
    And every trial starts at the exact nominal pose named by the world
    When the controller is commanded to walk forward at the README parameter command_speed
    Then the grading policy turns that run's trial outcomes into its grade

    Examples:
      | configuration |
      | stock         |
      | playground    |

  Scenario: The comparison shows both configurations
    Given completed runs for robot "unitree-g1" with configuration profiles "stock" and "playground"
    And their run manifests differ only in the configuration profile
    When the comparison is reported
    Then it shows each run's trial outcomes and grade
    And it shows both configurations even if one has grade FAIL or ERROR
    And the comparison itself is never graded

  Scenario: A configuration that is not offered
    Given robot "unitree-g1" whose robot profile does not offer configuration profile "vendor-x"
    When a run is requested with configuration profile "vendor-x"
    Then the grade is UNSUPPORTED naming precondition "configuration_offered"
    And no trial is run
