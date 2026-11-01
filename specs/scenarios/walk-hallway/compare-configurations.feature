# SPDX-License-Identifier: CC-BY-4.0
@walk_hallway @compare_configurations
Feature: Compare configuration profiles on one robot
  The robot, world, simulator, scenario and seeds stay fixed; only the selected configuration profile changes.

  Scenario Outline: Each configuration profile walks the same robot
    Given world "hallway-open" at its pinned version in simulator "MuJoCo"
    And robot "unitree-g1" at its pinned model
    And the run manifest selects configuration profile <configuration> with its sha256
    And the trial seeds are 1 to 20
    When the controller is commanded to walk forward at the README parameter command_speed
    Then the run's grade is PASS only if at least 18 of 20 trials pass

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
    And it ranks them by grade (PASS above INSUFFICIENT_EVIDENCE above FAIL above ERROR), then passed trials, then the Wilson 95% lower bound; configurations equal on all three share a rank and are listed alphabetically

  Scenario Outline: Configurations are ranked and the comparison summary line is worded by the comparison rule
    Given 20 planned trials per configuration and 18 required passes
    And configuration "stock" has grade <stock_grade> with <stock_passed> passed, Wilson 95% <stock_wilson>
    And configuration "playground" has grade <playground_grade> with <playground_passed> passed, Wilson 95% <playground_wilson>
    When the comparison is reported
    Then "stock" is ranked <stock_rank> and "playground" is ranked <playground_rank>
    And the comparison summary line reads <summary>

    Examples:
      | stock_grade           | stock_passed | stock_wilson     | playground_grade | playground_passed | playground_wilson | stock_rank | playground_rank | summary |
      | PASS                  | 19           | 0.7639 to 0.9911 | FAIL             | 13                | 0.4329 to 0.8188  | 1          | 2               | "🏆 stock is the only configuration that clears 18/20" |
      | PASS                  | 20           | 0.8389 to 1.0000 | PASS             | 18                | 0.6990 to 0.9721  | 1          | 2               | "2 configurations clear 18/20; no statistically clear winner" |
      | FAIL                  | 12           | 0.3866 to 0.7812 | FAIL             | 13                | 0.4329 to 0.8188  | 2          | 1               | "No configuration clears 18/20. Closest: playground, not significantly ahead" |
      | FAIL                  | 17           | 0.6396 to 0.9476 | FAIL             | 5                 | 0.1119 to 0.4687  | 1          | 2               | "No configuration clears 18/20. Closest: stock, ahead of the rest but short of the bar" |
      | INSUFFICIENT_EVIDENCE | 17           | 0.6396 to 0.9476 | FAIL             | 17                | 0.6396 to 0.9476  | 1          | 2               | "No configuration clears 18/20. Closest: stock, not significantly ahead" |
      | FAIL                  | 15           | 0.5313 to 0.8881 | FAIL             | 15                | 0.5313 to 0.8881  | =1         | =1              | "No configuration clears 18/20. Closest: playground and stock, tied" |

  Scenario: A configuration that is not offered
    Given robot "unitree-g1" whose robot profile does not offer configuration profile "vendor-x"
    When a run is requested with configuration profile "vendor-x"
    Then the grade is UNSUPPORTED naming precondition "configuration_offered"
    And no trial is run
