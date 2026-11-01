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
      | hallway-wall-contact  | wall_contacts   | lists any contact        | no contact    |
      | hallway-fall          | min_base_height | is less than             | fall_height   |

  Scenario: A trial passes only when every hallway evaluator passes
    Given the four hallway assessments of one trial
    When policy "all-required-v1" is applied
    Then any FAIL makes the trial FAIL
    And any INSUFFICIENT_EVIDENCE without a FAIL makes the trial INSUFFICIENT_EVIDENCE

  Scenario: Trials are aggregated as k of N with a Wilson interval
    Given <trials> trial results of one configuration
    When the trial results are aggregated
    Then the result reports passed trials k of N with its Wilson 95% interval
    And the grade is PASS only if at least <required_passes> trials pass

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
