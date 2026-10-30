# SPDX-License-Identifier: CC-BY-4.0
@world_contract
Feature: Versioned world contract
  A world contract defines selection and evidence independently of geometry or consumer implementation.

  Scenario: A consumer selects a versioned world
    Given a world fixture identifier and immutable content version
    When a consumer resolves the selected fixture through its world-content interface
    Then it uses the selected fixture declaration or reports it as unsupported
    And it does not silently substitute world content

  Scenario: A scenario author uses selected-fixture conventions
    Given a selected fixture with declared metric frame and placement conventions
    When a scenario author records a pose or probe request
    Then the request uses the selected fixture's declared frame and permitted region
    And an unsupported placement is reported clearly

  Scenario: A verifier evaluates selected-fixture evidence
    Given a selected fixture with declared geometry, surfaces, reset, and collision expectations
    When a verifier evaluates a consumer record
    Then it assesses the declared expectations and retained evidence
    And it keeps world conformance separate from system behavior

  Scenario: A reviewer inspects retained conformance results
    Given a completed world-conformance evaluation
    When a reviewer opens its result
    Then the result identifies the fixture, contract, consumer, and evidence digests
    And missing or unsupported evidence is reported clearly
