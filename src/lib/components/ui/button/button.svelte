<!--
Derived portions: shadcn-svelte (MIT); see ../LICENSE.shadcn-svelte.
Project modifications:
Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS.
-->
<script lang="ts" module>
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
	import { type VariantProps, tv } from "tailwind-variants";

	export const buttonVariants = tv({
		base: "border-0 outline-none aria-invalid:bg-[var(--color-error-background)] aria-invalid:text-[color:var(--color-error-foreground)] inline-flex shrink-0 items-center justify-center gap-2 rounded-[4px] text-sm font-medium whitespace-nowrap disabled:pointer-events-none aria-disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground [--control-hover-foreground:var(--color-primary-hover-foreground)]",
				destructive:
					"bg-destructive text-primary-foreground [--control-hover-foreground:var(--color-primary-hover-foreground)]",
				outline:
					"bg-background",
				secondary: "bg-secondary text-secondary-foreground",
				ghost: "",
				link: "text-accent underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4 py-2 has-[svg]:px-3",
				sm: "h-8 gap-1.5 rounded-[4px] px-3 has-[svg]:px-2.5",
				lg: "h-10 rounded-[4px] px-6 has-[svg]:px-4",
				icon: "size-9",
				"icon-sm": "size-8",
				"icon-lg": "size-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
	export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
			tooltip?: string;
			tooltipSide?: "top" | "bottom" | "left" | "right";
			tooltipRight?: string | undefined;
			tooltipPlain?: boolean;
		};
</script>

<script lang="ts">
	import HintButton from "$lib/components/HintButton.svelte";
	import { mergeProps } from "bits-ui";
	let {
		class: className,
		variant = "default",
		size = "default",
		ref = $bindable(null),
		href = undefined,
		type = "button",
		disabled,
		tooltip,
		tooltipSide = "top",
		tooltipRight,
		tooltipPlain = false,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#snippet control(triggerProps: Record<string, unknown> = {})}
	{#if href}
		<a
			{...mergeProps(triggerProps, restProps)}
			bind:this={ref}
			data-slot="button"
			class={cn(buttonVariants({ variant, size }), className)}
			href={disabled ? undefined : href}
			aria-disabled={disabled}
			role={disabled ? "link" : undefined}
			tabindex={disabled ? -1 : undefined}
		>
			<span class="button-content">{@render children?.()}</span>
		</a>
	{:else}
		<button
			{...mergeProps(triggerProps, restProps)}
			bind:this={ref}
			data-slot="button"
			class={cn(buttonVariants({ variant, size }), tooltip && "disabled:pointer-events-auto", className)}
			{type}
			{disabled}
		>
			<span class="button-content">{@render children?.()}</span>
		</button>
	{/if}
{/snippet}

{#if tooltip}
	<HintButton label={tooltip} {tooltipSide} rightLabel={tooltipRight} plain={tooltipPlain} labelAsName={false} {...(restProps.id ? { id: restProps.id } : {})}>
		{#snippet child({ props })}
			{@render control(props)}
		{/snippet}
	</HintButton>
{:else}
	{@render control()}
{/if}
