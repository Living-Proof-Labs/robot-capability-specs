# SPDX-License-Identifier: CC-BY-4.0
@walk_hallway
Feature: Walk the open hallway
  A robot uses the controller in its selected configuration profile to walk from the entrance to the exit.

  Scenario Outline: A robot walks the open hallway
    Given world "hallway-open" at its pinned version in simulator <simulator>
    And robot <robot> with configuration profile <configuration>
    And the robot stands at "spawn-entrance" facing the exit
    When the controller is commanded to walk forward at <command_speed>
    Then the robot's base crosses "exit" within <time_limit>
    And no robot body touches either side wall
    And the base height never drops below <fall_height>
    And the base stays within <lateral_limit> of the centreline

    Examples:
      | simulator | robot       | configuration |
      | MuJoCo    | unitree-g1  | playground    |
      | MuJoCo    | unitree-go1 | playground    |
      | MuJoCo    | booster-t1  | playground    |

  Scenario Outline: The verifier assesses each trial with the hallway evaluators
    Given the observations of one walk-hallway trial
    And thresholds resolved from the robot profile and the selected configuration profile
    When evaluator "<evaluator>" assesses observation "<observation>"
    Then the assessment is FAIL when the observation <rule> <threshold>
    And a missing or malformed observation gives INSUFFICIENT_EVIDENCE
    And the rationale names the check, the time and the margin

    Examples:
      | evaluator             | observation     | rule                     | threshold     |
      | hallway-exit-reached  | exit_time       | is absent or later than  | time_limit    |
      | hallway-lateral-limit | max_abs_lateral | is greater than          | lateral_limit |
      | hallway-wall-contact  | wall_contacts   | lists any contact        | an empty list |
      | hallway-fall          | min_base_height | is less than             | fall_height   |

  Scenario: A trial passes only when every hallway evaluator passes
    Given the four hallway assessments of one trial
    When policy "all-required-v1" is applied
    Then any FAIL makes the trial FAIL
    And any INSUFFICIENT_EVIDENCE without a FAIL makes the trial INSUFFICIENT_EVIDENCE

  Scenario Outline: Trials are aggregated as k of N with a Wilson interval
    Given <trials> trial results of one configuration, of which <passed> pass
    When the trial results are aggregated
    Then the result reports <passed> of <trials> with Wilson 95% interval <wilson_95>
    And the grade is <grade> because at least <required_passes> trials must pass

    Examples:
      | trials | passed | required_passes | wilson_95        | grade |
      | 20     | 20     | 18              | 0.8389 to 1.0000 | PASS  |
      | 20     | 18     | 18              | 0.6990 to 0.9721 | PASS  |
      | 20     | 17     | 18              | 0.6396 to 0.9476 | FAIL  |
      | 20     | 12     | 18              | 0.3866 to 0.7812 | FAIL  |

  Scenario Outline: Repeated trials are reported in full
    Given a walk-hallway run of <trials> seeded trials, of which <passed> pass
    When the grading policy is applied
    Then the grade is <grade> because at least <required_passes> trials must pass
    And all <trials> trials are listed with their seed, trial outcome and first failing metric

    Examples:
      | trials | passed | required_passes | grade |
      | 20     | 20     | 18              | PASS  |
      | 20     | 18     | 18              | PASS  |
      | 20     | 17     | 18              | FAIL  |
      | 20     | 0      | 18              | FAIL  |

  Scenario Outline: A robot that cannot meet the preconditions
    Given a <robot_class> robot of width <width_m> metres, so wall_clearance is <wall_clearance_m> metres
    And the hallway clear width is <clear_width_m> metres
    When a run is requested
    Then the grade is UNSUPPORTED naming precondition "fits_width"
    And no trial is run

    Examples:
      | robot_class | width_m | wall_clearance_m | clear_width_m |
      | humanoid    | 1.41  | 0.05             | 1.5         |
      | quadruped   | 1.31  | 0.10             | 1.5         |

  Scenario Outline: A robot that meets fits_width is run
    Given a <robot_class> robot of width <width_m> metres, so wall_clearance is <wall_clearance_m> metres
    And the hallway clear width is <clear_width_m> metres
    When a run is requested
    Then precondition "fits_width" is met and the planned trials run

    Examples:
      | robot_class | width_m | wall_clearance_m | clear_width_m |
      | humanoid    | 0.52  | 0.05             | 1.5         |
      | humanoid    | 1.40  | 0.05             | 1.5         |
      | quadruped   | 0.282 | 0.10             | 1.5         |
