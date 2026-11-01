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

  Scenario: Repeated trials are reported in full
    Given a walk-hallway run of <trials> seeded trials
    When the grading policy is applied
    Then the grade is PASS only if at least <required_passes> trials pass
    And every trial is listed with its seed, trial outcome and first failing metric

  Scenario: A robot that cannot meet the preconditions
    Given a robot whose width plus twice <wall_clearance> exceeds the hallway clear width
    When a run is requested
    Then the grade is UNSUPPORTED naming precondition "fits_width"
    And no trial is run
