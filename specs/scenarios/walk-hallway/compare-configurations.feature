# SPDX-License-Identifier: CC-BY-4.0
@walk_hallway @compare_configurations
Feature: Compare configuration profiles on one robot
  The robot, world, simulator, scenario and seeds stay fixed; only the selected configuration profile changes.

  Scenario Outline: Each configuration profile walks the same robot
    Given world "hallway-open" at its pinned version in simulator "MuJoCo"
    And robot "unitree-g1" at its pinned model
    And the run manifest selects configuration profile <configuration> with its sha256
    And the trial seeds are <seeds>
    When the controller is commanded to walk forward at <command_speed>
    Then the run's grade is PASS only if at least <required_passes> of <trials> trials pass

    Examples:
      | configuration |
      | stock         |
      | playground    |

  Scenario: The comparison shows both configurations
    Given completed runs for robot "unitree-g1" with configuration profiles "stock" and "playground"
    And their run manifests differ only in the configuration profile
    When the comparison is reported
    Then it shows each configuration's passed trials, pass rate and grade
    And it shows both configurations even if one has grade FAIL or ERROR
    And it names the better configuration by <comparison_rule>, or "no clear winner"

  Scenario: A configuration that is not offered
    Given robot "unitree-g1" whose robot profile does not offer configuration profile "vendor-x"
    When a run is requested with configuration profile "vendor-x"
    Then the grade is UNSUPPORTED naming precondition "configuration_offered"
    And no trial is run
