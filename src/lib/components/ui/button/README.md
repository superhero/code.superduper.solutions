# Button

Import `Button` from `$lib/components/ui/button/index.js`. The entry also exports
`Root`, `buttonVariants`, and public variant/size/prop types.

`href` selects an anchor; otherwise the component renders a native button with
`type="button"` by default. `disabled` disables the button or removes the
anchor's destination/tab stop. `tooltip` composes `HintButton` without replacing
the control's accessible name. Refs, attributes, and caller classes pass through.
`tooltipRight` adds a second tooltip to the right of the icon and places the main
`tooltip` to its left. Both share the same hover/focus and dismissal lifecycle.
`tooltipSide` selects the single tooltip side (top by default).
`tooltipPlain` opts into foreground text at 90% size, normal weight and 60% opacity
on the main background without a frame or pointer. Spacing and interaction stay the same.
Other tooltips keep their fill and typography.

Keep `data-slot="button"` and the content wrapper aligned with shared styles.
Use explicit `type="submit"` in forms and accessible names for icon-only
content. Preserve native disabled behavior, semantic focus/error styling, and
reduced-motion handling when adding variants. See [UI ownership](../README.md).
Hover uses the first background color at 50% opacity (`--color-hover-background`),
while preserving size. Text and icons use the fourth palette
color (`--color-hover-foreground`) in both modes. Filled primary/destructive
buttons use the same color through `--color-primary-hover-foreground`. Disabled
controls retain their colors; selected and keyboard-focus states remain distinct.
Containers marked `data-hover="foreground"` keep each control's existing
background on hover while applying the shared foreground color. Explicit
component hover styles must follow that policy too; keyboard focus retains its fill.
