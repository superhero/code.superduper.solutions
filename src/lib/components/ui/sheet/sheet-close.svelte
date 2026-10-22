<!--
Derived portions: shadcn-svelte (MIT); see ../LICENSE.shadcn-svelte.
Project modifications:
Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS.
-->
<script lang="ts">
	import { Dialog as SheetPrimitive } from "bits-ui";

	let { ref = $bindable(null), ...restProps }: SheetPrimitive.CloseProps = $props();
</script>

<SheetPrimitive.Close bind:ref data-slot="sheet-close" {...restProps} />
