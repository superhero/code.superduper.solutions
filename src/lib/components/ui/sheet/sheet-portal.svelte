<!--
Derived portions: shadcn-svelte (MIT); see ../LICENSE.shadcn-svelte.
Project modifications:
Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS.
-->
<script lang="ts">
	import { Dialog as SheetPrimitive } from "bits-ui";

	let { ...restProps }: SheetPrimitive.PortalProps = $props();
</script>

<SheetPrimitive.Portal {...restProps} />
