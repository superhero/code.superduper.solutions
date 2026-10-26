# Dialog

Import the namespace from `$lib/components/ui/dialog`. Installed Bits UI Dialog
supplies Root, Trigger, Close, Portal, Title and Description, including modal
focus trapping, accessible naming, Escape dismissal and focus restoration.
Owned Content and Header supply the editor's semantic colors and spacing.

Content is centered, inset at least 16px from the viewport, and scrolls when its
contents exceed the available height. A 2px border uses the palette's first
background color (`--color-background`). A 2px outline with a 4px offset uses the
second header's background (`--color-toolbar-background`). A second 4px outline
with no offset uses the line-number divider's color:
`color-mix(in srgb, var(--color-surface) 20%, var(--color-background))`.
Its frame keeps both outlines outside the scrolling content. There is no shadow.
Buttons use the shared foreground-only hover behavior, retaining their background.
Entry and exit fade for 120ms without changing position; reduced motion disables
the transition. Content forwards props and a bindable ref, and accepts portal
props and `showClose`. Its close control uses the shared Button.

Use this composition for modal forms and confirmations. Provide Title inside
Header, adding Description when useful. Workspace side panes continue using Sheet.
