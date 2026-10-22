# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@formatter-packages
Feature: Optional formatter installations stay local and explicit
  Scenario: Starting and browsing settings never downloads a formatter
    When I view the formatter installation settings
    Then all 38 formatters are offered without downloading their payloads

  Scenario: Installing Python support persists and works without the network
    Given a browser repository named "Offline Python" with an empty file "main.py"
    When I insert this syntax sample into the code document:
      """
      value={"answer":42}
      """
    And I view the formatter installation settings
    And I install the "Ruff" formatter package
    And I reload with all formatter downloads blocked
    And I switch to the Editor page
    And I format the current document
    Then the code document contains "value = {\"answer\": 42}\n" after persistence
    When I view the formatter installation settings
    And I remove the "Ruff" formatter package
    And I switch to the Editor page
    Then the format action is unavailable

  Scenario: Installed formatter licenses are available in shared notices
    When I view the formatter installation settings
    And I install the "JSON" formatter package
    Then the "JSON" formatter package is installed
    And the formatter license text is readable for "JSON"

  Scenario: A corrupt download never becomes an installation
    When I view the formatter installation settings
    And the next formatter download contains corrupt bytes
    And I attempt to install the "JSON" formatter package
    Then a formatter checksum error is displayed
    And the "JSON" formatter package is not installed
    When I dismiss the formatter download interception
    And I install the "JSON" formatter package
    Then the "JSON" formatter package is installed

  Scenario: Package imports are not exposed in settings
    When I view the formatter installation settings
    Then formatter package import controls are absent

  Scenario: Cancelled downloads leave no installation
    When I view the formatter installation settings
    And the next formatter download is held
    And I begin installing the "JSON" formatter package
    And I cancel the formatter download
    Then the "JSON" formatter package is not installed

  Scenario: Updates are explicit and a failed replacement preserves the old package
    When I view the formatter installation settings
    And I install the "JSON" formatter package
    And the installed JSON package belongs to an older application catalog
    Then the JSON formatter offers an update
    When the next formatter download contains corrupt bytes
    And I attempt to update the JSON formatter
    Then a formatter checksum error is displayed
    And the previous JSON formatter installation is preserved
    When I dismiss the formatter download interception
    And I update the JSON formatter
    Then the "JSON" formatter package is installed

  Scenario: Removing a formatter in another tab refreshes the installation list
    When I view the formatter installation settings
    And I install the "JSON" formatter package
    And I remove JSON formatting support from another tab
    Then the "JSON" formatter package is not installed

  Scenario: Markdown keeps fenced code unchanged when its provider is not installed
    Given the unformatted "Markdown with script" document fixture is imported
    When I format the current document
    Then the code document contains "```javascript\nconst value={answer:42}\n```\n" after persistence
    And no formatting error is displayed

  Scenario: Optional Roslyn formats C sharp offline and preserves undo and redo
    Given the unformatted "C#" document fixture is imported
    When I reload with all formatter downloads blocked
    And I format the current document
    Then the document matches the "C#" formatting fixture
    And the source Git history is unchanged
    When I undo the latest editor transaction
    Then the document still matches the unformatted "C#" fixture
    When I redo the latest editor transaction
    Then the document matches the "C#" formatting fixture
    When I view the formatter installation settings
    And I remove the "Roslyn" formatter package
    And I switch to the Editor page
    Then the format action is unavailable

  Scenario: Jupyter formats notebook cells offline as one undoable change
    Given Jupyter cell formatters are installed
    And the unformatted "Jupyter" document fixture is imported
    When I reload with all formatter downloads blocked
    And I format the current document
    Then the notebook cells are formatted while its metadata and outputs are preserved
    And the source Git history is unchanged
    When I undo the latest editor transaction
    Then the document still matches the unformatted "Jupyter" fixture
    When I redo the latest editor transaction
    Then the notebook cells are formatted while its metadata and outputs are preserved
    When I view the formatter installation settings
    And I remove the "Jupyter" formatter package
    And I switch to the Editor page
    Then the format action is unavailable

  Scenario: Jupyter leaves cells unchanged when their formatters are not installed
    Given the unformatted "Jupyter" document fixture is imported
    When I format the current document
    Then the document still matches the unformatted "Jupyter" fixture
    And the edit Git history is unchanged
    And the source Git history is unchanged
    And no notebook cell formatter is downloaded automatically
    And no formatting error is displayed

  Scenario: Invalid Jupyter notebook JSON leaves both Git histories intact
    Given the unformatted "Invalid notebook" document fixture is imported
    When I format the current document
    Then the formatter reports an actionable error
    And the document still matches the unformatted "Invalid notebook" fixture
    And the edit Git history is unchanged
    And the source Git history is unchanged

  Scenario: Legacy formatter installations survive the metadata index upgrade
    When I view the formatter installation settings
    And I install the "JSON" formatter package
    And I capture the installed "JSON" formatter package for storage migration
    And the exported JSON package is reopened from legacy installation storage
    Then the "JSON" formatter package is installed
    And the formatter license text is readable for "JSON"
