# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@pages-live
Feature: The published Pages application matches its reviewed static distribution
  Scenario: The Pages editor starts securely and offers its corresponding source
    Given the published Pages editor is open
    Then Pages serves the browser isolation headers
    And the editor offers the deployed corresponding source archive

  Scenario: Every published asset retains its reviewed bytes
    Then the published Pages assets match the deployment manifest

  Scenario: Large optional packages install from Pages without an application backend
    Given the published Pages editor is open
    When I install the published split formatter and language packages
    Then the installed split packages retain the deployment checksums
