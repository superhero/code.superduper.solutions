# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Readable editor palettes
  Scenario: Settings expose every shipped palette
    Then the palette selector offers every shipped palette exactly once

  Scenario Outline: The <palette> palette preserves readable roles in <mode> mode
    When the editor palette is "<palette>" in "<mode>" mode
    Then every editor text role has at least four and a half to one contrast
    And the Editor heading keeps readable text
    Examples:
      | palette | mode |
      | default | light |
      | default | dark |
      | sunset | light |
      | sunset | dark |
      | alpine | light |
      | alpine | dark |
      | obsidian | light |
      | obsidian | dark |
      | midnight-gold | light |
      | midnight-gold | dark |
      | neon | light |
      | neon | dark |
      | lantern | light |
      | lantern | dark |
      | spring | light |
      | spring | dark |
      | bonfire | light |
      | bonfire | dark |
      | harvest-moon | light |
      | harvest-moon | dark |
      | blue-horizon | light |
      | blue-horizon | dark |
      | golden-violet | light |
      | golden-violet | dark |
      | citrus | light |
      | citrus | dark |
      | sunflower | light |
      | sunflower | dark |
      | garden-dusk | light |
      | garden-dusk | dark |
      | autumn | light |
      | autumn | dark |
      | rainfall | light |
      | rainfall | dark |
      | graphite-study | light |
      | graphite-study | dark |
      | steel-and-mist | light |
      | steel-and-mist | dark |
      | carbon | light |
      | carbon | dark |
      | heritage-noir | light |
      | heritage-noir | dark |
