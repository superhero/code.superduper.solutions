# Sheet

Import the namespace from `$lib/components/ui/sheet/index.js`. Compose Root,
Content, Title, and Description; exports also include `Sheet*` aliases. Bits UI
Dialog supplies modal behavior, while these wrappers own local styling.

Root exposes bindable `open`. Content creates a portal, overlay, and close
control, accepts `side` (right by default), and forwards content props/ref.
`showClose={false}` allows a consumer to place its own close control in a header.
Provide a meaningful Title and Description even when visually hidden. No editor
navigation or other product consumer is implied by this reusable component.

Content/overlay follow presence attributes, including interrupted transitions.
Preserve `data-slot` and `data-side`, RTL-aware transforms, keyboard/focus
behavior, and reduced motion. Verify concrete close/focus behavior when a
product feature adopts the sheet. See [UI ownership](../README.md).

`Pane` provides a bindable `open`, `label`, and `docked` composition. Docked panes
animate a shared flex boundary with the main view and clip their content at that
edge. Their content keeps its target width while entering. They are named
regions: the surrounding workspace stays interactive. On
compact layouts the same content uses the right-hand modal Sheet, filling the
viewport with focus trapping and Escape dismissal. The caller decides when its
available space can accommodate a dock. Both forms restore the opening control's
focus, preserve reduced motion, and use the supplied `data-pane-heading` as their
initial focus target. Content state belongs to the caller so resizing does not
discard a form draft.
An optional `width` supplies the dock's width in pixels. The optional `divider`
snippet sits outside the slide's clip, allowing an owned resize control to
straddle the boundary without letting animated content paint over its neighbor.
The divider receives the motion state so resizing can wait until entry finishes.
The caller owns width limits, preview/cancellation, and persistence. The short
bidirectional transition can reverse when a user toggles the pane quickly.
