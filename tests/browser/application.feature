# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Browser application foundation
  Scenario: The production application mounts its accessible editor shell
    Then the page has its application title and an accessible editor shell

  Scenario: The built page embeds its runtime and only permits declared icon requests
    Then the application makes no runtime asset requests
    And the production document is cross-origin isolated

  Scenario: Browser icon metadata preserves the SVG with stable raster fallbacks
    Then the page declares stable raster fallbacks and retains its embedded SVG icon
    And the application makes no runtime asset requests

  Scenario Outline: The <filename> compatibility export has a crawlable URL
    Then the hosted favicon "<filename>" is available as "<type>"
    Examples:
      | filename             | type                   |
      | favicon.svg          | image/svg+xml          |
      | favicon.ico          | image/x-icon           |
      | favicon.png          | image/png              |
      | favicon.bmp          | image/bmp              |
      | favicon.gif          | image/gif              |
      | favicon.jpg          | image/jpeg             |
      | favicon.ppm          | image/x-portable-pixmap |
      | favicon.tiff         | image/tiff             |
      | apple-touch-icon.png | image/png              |

  Scenario Outline: Chromium renders the <filename> browser icon
    Then Chromium decodes favicon "<filename>" as <width> by <height> pixels
    Examples:
      | filename             | width | height |
      | favicon.svg          | 64    | 64     |
      | favicon.ico          | 48    | 48     |
      | favicon.png          | 96    | 96     |
      | apple-touch-icon.png | 180   | 180    |

  Scenario Outline: The editor fills narrow and wide viewports
    When the browser viewport is <width> by <height> pixels
    Then the editor fills the viewport without horizontal overflow
    Examples:
      | width | height |
      | 320   | 640    |
      | 390   | 844    |
      | 1280  | 900    |
      | 1920  | 1080   |

  Scenario Outline: Local font faces load without a network dependency
    Then the bundled "<family>" font can be loaded by the browser
    And the application makes no runtime asset requests
    Examples:
      | family                   |
      | Montserrat               |
      | Rationale                |
      | Material Symbols Rounded |

  Scenario: Production does not register development tooling
    Then production contains no development overlay or toolbar runtime

  Scenario Outline: Both appearance modes map the page to the shared palette
    When the document uses the "<mode>" appearance mode
    Then the page background and foreground match the active semantic colors
    Examples:
      | mode  |
      | light |
      | dark  |
