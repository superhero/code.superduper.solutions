# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@language-engines @npm-types-browser
Feature: Explicit community type libraries
  Scenario: The common shortlist installs declarations and their dependencies for offline completion
    Given the "typescript" language intelligence repository is imported
    And the public npm type registry has deterministic declaration packages
    When I install and activate its language engine
    Then common type packages are offered without querying npm
    When I install the "@types/express" npm declarations
    Then the "@types/express" declarations provide an offline editor completion
    And installed npm declaration licenses appear in shared notices

  Scenario: npm search adds a package outside the shortlist without showing deprecated stubs
    Given the "typescript" language intelligence repository is imported
    And the public npm type registry has deterministic declaration packages
    When I install and activate its language engine
    And I search npm for "@types/cookie"
    Then the npm search offers cookie declarations without deprecated stubs
    When I install the "@types/cookie" npm declarations
    Then the "@types/cookie" declarations provide an offline editor completion

  Scenario: Modified npm archives cannot create an installation or enable a library
    Given the "typescript" language intelligence repository is imported
    And the public npm type registry has deterministic declaration packages
    And npm serves a modified React archive
    When I install and activate its language engine
    And I attempt to install React declarations
    Then React declarations stay uninstalled and disabled after the integrity error

  Scenario: npm library choices inherit and their packages support verified offline export and import
    Given the "typescript" language intelligence repository is imported
    And the public npm type registry has deterministic declaration packages
    When I install and activate its language engine
    And I install the "@types/react" npm declarations
    Then npm declaration activation is scoped and its export can be reimported offline
    And the "@types/react" declarations provide an offline editor completion
