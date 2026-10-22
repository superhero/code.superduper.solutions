<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { Tooltip } from "bits-ui";
  import { Button } from "$lib/components/ui/button/index.ts";
  import * as Sheet from "$lib/components/ui/sheet/index.ts";
  let activations = $state(0);
</script>

<Tooltip.Provider delayDuration={0}>
  <section aria-label="Isolated primitive fixtures" style="padding: 32px; display: grid; gap: 16px; justify-items: start;">
    <Button onclick={() => activations++}>Enabled action</Button>
    <Button disabled tooltip="Unavailable until a project is open" onclick={() => activations++}>Disabled action</Button>
    <Button href="#fixture-destination" disabled>Disabled destination</Button>
    <Button tooltip="Helpful action description">Described action</Button>
    <output aria-label="Action count">{activations}</output>
    <Sheet.Root>
      <Sheet.Trigger>Open fixture panel</Sheet.Trigger>
      <Sheet.Content>
        <Sheet.Header>
          <Sheet.Title>Fixture panel</Sheet.Title>
          <Sheet.Description>Test-only panel with standard keyboard behavior.</Sheet.Description>
        </Sheet.Header>
        <label>Fixture value <input aria-label="Fixture value" /></label>
        <Button>Panel action</Button>
      </Sheet.Content>
    </Sheet.Root>
  </section>
</Tooltip.Provider>
