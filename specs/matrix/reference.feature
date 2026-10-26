# SPDX-License-Identifier: CC-BY-4.0
Feature: Released pause executor compatibility
  Execution support is distinct from evidence integrity and capability outcome.

  Scenario Outline: Preserve each released execution coordinate
    Given catalog <catalog> with pause revision <revision>
    And released executor <executor> with fixture <fixture> observed at <elapsed> ms
    When execution support is checked before assessment
    Then execution compatibility is <compatibility>
    And the retained outcome is <outcome>
    And the original observation and digest are retained

    Examples:
      | catalog | revision | executor | fixture | elapsed | compatibility | outcome      |
      | v1.1.1  | 1.0.0    | v1.0.1   | 1.0.0   | 120     | COMPATIBLE    | PASS         |
      | v1.1.1  | 1.0.0    | v1.1.0   | 2.0.0   | 300     | COMPATIBLE    | PASS         |
      | v1.2.0  | 2.0.0    | v1.0.1   | 1.0.0   | 120     | INCOMPATIBLE  | INCOMPATIBLE |
      | v1.2.0  | 2.0.0    | v1.1.0   | 2.0.0   | 300     | COMPATIBLE    | FAIL         |
