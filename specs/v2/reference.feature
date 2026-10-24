# SPDX-License-Identifier: CC-BY-4.0
@reference_v2
Feature: Strict pause evidence has an explicit tighter limit
  Scenario Outline: The strict pause limit is inclusive
    Given pause motion is inhibited with elapsed milliseconds <elapsed>
    When pause revision "2.0.0" is assessed
    Then the policy result is "<result>"

    Examples:
      | elapsed | result |
      | 120     | PASS   |
      | 250     | PASS   |
      | 251     | FAIL   |
      | 300     | FAIL   |
