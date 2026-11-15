# SPDX-License-Identifier: CC-BY-4.0
@walk_corner
Feature: Walk around the corner
  The robot walks down one hallway, turns the corner, and reaches the end of the next hallway.
  One run is one or more identical trials under the run manifest. The default is one trial at the exact nominal pose.

  Scenario Outline: A robot walks around the corner
    Given world "hallway-corner" at its pinned version in simulator <simulator>
    And robot <robot> with configuration profile <configuration>
    And the robot stands at the exact nominal pose "spawn-entrance" facing along "route-centreline"
    When the runner commands the README parameter command_speed and steers along "route-centreline" with rule "pure-pursuit-v1"
    Then the base enters "exit" within the README parameter time_limit
    And the base passes through "corner" before it enters "exit"
    And the base stays within the README parameter lateral_limit of "route-centreline"
    And no robot body touches a wall
    And the base height stays at or above the README parameter fall_height, the selected configuration profile's locomotion.fall_base_height

    Examples:
      | simulator | robot       | configuration |
      | MuJoCo    | unitree-g1  | playground    |
      | MuJoCo    | unitree-go1 | playground    |
      | MuJoCo    | booster-t1  | playground    |

  Scenario Outline: The verifier assesses each trial with the corner evaluators
    Given the observations of one walk-corner trial
    And thresholds resolved from the robot profile and the selected configuration profile
    When evaluator "<evaluator>" assesses observation "<observation>"
    Then the assessment is FAIL when the observation <rule> <threshold>
    And a missing or malformed observation is a test-system ERROR on the trial
    And the rationale names the check, the time and the margin

    Examples:
      | evaluator           | observation        | rule                    | threshold     |
      | corner-exit-reached | exit_time          | is absent or later than | time_limit    |
      | corner-turned       | corner_entered     | is absent or later than | the exit time |
      | corner-route-limit  | max_route_distance | is greater than         | lateral_limit |
      | corner-wall-contact | wall_contacts      | lists any contact       | an empty list |
      | corner-fall         | min_base_height    | is less than            | fall_height   |

  Scenario: A base that cuts the corner short of the corner square
    Given a walk-corner trial whose base reaches "exit" without ever being inside "corner"
    When evaluator "corner-turned" assesses the trial
    Then the assessment is FAIL naming "corner"

  Scenario: A trial passes only when every corner evaluator passes
    Given the five corner assessments of one trial
    When policy "all-required-v1" is applied
    Then any FAIL makes the trial FAIL even when another observation is missing
    And the missing observation is still reported as a test-system ERROR on the trial

  Scenario: The runner steers along the route
    Given the base on a straight leg of "route-centreline" and facing along it
    When the runner computes the command with rule "pure-pursuit-v1"
    Then the command is exactly the README parameter command_speed forward, zero sideways and zero turn rate
    And the turn rate never exceeds the README parameter max_turn_rate in either direction

  Scenario Outline: A grading policy turns trial outcomes into the run grade
    Given a walk-corner run of <trials> identical trials at the nominal start
    And <passed> of those trials have outcome PASS and <failed> have outcome FAIL
    And <errors> trials are test-system ERROR and did not complete
    When the grading policy is applied to the completed trials
    Then the run grade is <grade>
    And each ERROR is reported on the job and on the trial and is never a robot grade
    And if no trial completes the run is not evaluated and the grade is INSUFFICIENT_EVIDENCE

    Examples:
      | trials | passed | failed | errors | grade                 |
      | 1      | 1      | 0      | 0      | PASS                  |
      | 1      | 0      | 1      | 0      | FAIL                  |
      | 1      | 0      | 0      | 1      | INSUFFICIENT_EVIDENCE |

  Scenario: Repeated trials are reported in full
    Given a walk-corner run of identical trials under one fixed setup
    When the run is reported
    Then every trial is listed with its outcome and its first failing metric
    And a test-system ERROR is reported on the job and on the trial and is excluded from the run grade

  Scenario Outline: A robot that cannot meet the preconditions
    Given a robot whose <unmet>
    When a walk-corner run is requested
    Then the grade is UNSUPPORTED naming precondition "<precondition>"
    And no trial is run

    Examples:
      | precondition   | unmet                                                              |
      | fits_width     | width plus twice its wall_clearance is more than the clear width   |
      | turn_interface | selected configuration profile does not accept a turn-rate command |
