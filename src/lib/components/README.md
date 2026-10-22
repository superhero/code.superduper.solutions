# Shared interface controls

Reusable Svelte controls live here. `editor/` owns the CodeMirror component and
settings page and recursive file-tree components; `App.svelte` composes repository
navigation and history. Owned [UI primitives](ui/README.md) provide Button and Sheet.
`resources/` presents the browser resource dashboard and bounded SVG chart;
its collectors live in [`$lib/resources`](../resources/README.md).
[assistant/](assistant/README.md) presents AI conversations and saved connections
in the shared dock/overlay with buffered text updates.
[vault/](vault/README.md) owns guarded value management as the Vault main page,
selected through the header's Page dropdown.
[Startup progress](loading/README.md) presents actual loading stages with the
shared responsive animations and reduced-motion compositions.
`HintButton.svelte` supplies accessible, noninteractive tooltip composition and
`MaterialIcon.svelte` renders the bundled Material Symbols font.
The tooltip root disables hoverable content so its floating layer cannot intercept
nearby controls. Explanations still open on trigger hover or keyboard focus.
An optional `rightLabel` pairs a left explanation with a right tooltip around the
same trigger. The pair shares visibility, dismissal, palette and reduced-motion
behavior. Its bubbles fit the available viewport space; anchor measurements are
read only when the pair opens. Resizing or scrolling dismisses the tooltips.
`passive` renders a focusable span instead of a button, retaining tooltip hover
and focus events without button attributes or click/press handlers. Callers own
its accessible role and name. Plain tooltip text uses 90% size, normal weight
and 60% opacity without changing the icon's appearance.
`FileIcon.svelte` shares filename detection between the file tree and open tabs.
It renders bundled monochrome Devicon glyphs in the surrounding text color,
with Material Symbols as the fallback. Icons are decorative; filenames supply
the accessible names. Folder and action icons still use `MaterialIcon`.
Square JavaScript, TypeScript, npm, Fortran, and WebAssembly badges render at
87.5% size within the unchanged icon slot, keeping filenames aligned with other
file types.

`NavigationDropdown.svelte` uses Bits UI radio menu items for repository/page/branch
choices, selected checkmarks, and optional actions. Its menu and file context
menus share the semantic colors, focus styles, and transitions in `ui/menu.css`.
File tabs use the same context primitive with split-view actions; file and folder
rename/delete actions remain in the explorer. `editor/SplitEditor.svelte` hosts a
pane’s owned CodeMirror instance, applying its active file settings and loading
through the repository service. Each pane has its own ordered tabs and file
positions; switching tabs retains the editor instance. Application composition owns writes and workspace history.
The application owns selection so a failed repository change keeps the actual
repository checked. Actions can hand focus to a sheet or directory picker.
Left-click and right-click open the same anchored dropdown; right-click suppresses
the browser menu and does not select a different value or open the sidebar menu.

Preserve accessible names, forwarded props, disabled behavior, focus semantics,
and reduced-motion handling. A tooltip supplements a control's purpose and
must not hide its accessible name. Use semantic theme roles from
[app.css](../../app.css) rather than direct palette values.

Review the [interface decision](../../../docs/adr/svelte-interface.md) before
changing shared behavior. Adapt existing primitives before introducing an
equivalent dependency or component.
