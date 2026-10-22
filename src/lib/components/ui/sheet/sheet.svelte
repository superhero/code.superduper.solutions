<!--
Derived portions: shadcn-svelte (MIT); see ../LICENSE.shadcn-svelte.
Project modifications:
Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS.
-->
<script lang="ts">
	import { Dialog as SheetPrimitive } from "bits-ui";

	let { open = $bindable(false), ...restProps }: SheetPrimitive.RootProps = $props();
</script>

<SheetPrimitive.Root bind:open {...restProps} />
