# SPDX-License-Identifier: CC-BY-4.0
@reference_v1
Feature: Evidence-based capability verification
  Scenario Outline: Pause evidence is assessed without hiding negative results
    Given the pause fixture "<fixture>"
    When the runner collects evidence and all evaluators assess it
    Then the policy result is "<result>"
    And the report retains assessments and version provenance

    Examples:
      | fixture      | result                |
      | pass         | PASS                  |
      | fail         | FAIL                  |
      | insufficient | INSUFFICIENT_EVIDENCE |

  Scenario: A mandatory failure cannot be averaged away
    Given the pause fixture "fail"
    When the runner collects evidence and all evaluators assess it
    Then the policy result is "FAIL"
    And the advisory assessments both pass

  Scenario: A missing evaluator cannot silently pass
    Given the pause fixture "pass"
    When the human assessment is unavailable
    Then the policy result is "INSUFFICIENT_EVIDENCE"
