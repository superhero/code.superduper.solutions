# Svelte interface and shared controls

> [!IMPORTANT]
> Build the editor in Svelte with owned shared primitives, local assets, and semantic theme roles.

## Foundation

Svelte 5, strict TypeScript, Vite, and Tailwind form the interface foundation.
Owned Button and Sheet components use Bits UI behavior; adapt those components
before creating equivalent controls. Shared class and prop utilities keep
composition consistent. An owned Svelte component integrates the official
CodeMirror packages directly. Settings reconfigure extensions without replacing
the editor on each keystroke or losing its selection.

Operations' additional Modal, Disclosure, Reveal, JSON-view, and field-selection
widgets are reusable references, not automatically part of the foundation.
Adapt them with their behavior and styling when a concrete editor interface
needs them; do not misclassify all such widgets as OpenAPI-specific.

The repository navigator uses owned recursive Svelte file-tree components,
adapting the Operations tree interaction pattern. Installed Bits UI does not
provide a tree primitive. Keep hierarchy construction separate from rendering,
and distinguish keyboard focus, folder expansion, and explicit file activation.
Use the [ARIA tree view pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/)
for hierarchy and keyboard behavior. Opening a repository does not open a file.

## Theme and assets

Each palette supplies thirteen color slots in `src/palette.css`. The original six
interface colors retain their reversed tone mapping in dark mode. Slots 7–13
provide theme-specific syntax accents with light/dark variants. Components consume semantic roles
from `src/app.css`, not hard-coded palette values or per-component mode rules.
The Operations palette catalog is shared; workflow-specific styling is not. Four
values are adjusted for surface contrast, and foreground roles use endpoint pairs.
Montserrat, Rationale, and Material Symbols Rounded are bundled locally with
their notices. These remain the offline interface defaults. JetBrains Mono is
also bundled with its OFL notice as the offline editor default at 13px. Geomini is bundled as the interface default
with variable weights 200–800 and its OFL notice. The editor also offers
Google Fonts monospace families, and the interface offers sans-serif and monospace
families through the same controls: selecting one loads only that family through
Google’s CSS API. An explicit Install action saves its font files and license
in a separate browser IndexedDB store. Installed families load locally first;
unavailable remote families fall back to system monospace. Font choices remain
normal personal/repository preferences; installation is device-local state.

## Adopted interaction requirements

The original palette catalog had primary, tooltip, and surface contrast gaps.
The editor uses corrected shared roles and palette values; browser checks measure
the actual role pairs in every palette and both modes. New controls and syntax
colors still require review rather than inheriting a blanket claim.

Interface surfaces, text, borders and hover states use exact palette colors;
blending does not create extra interface shades. Syntax highlighting has seven
base semantic accents from the extended theme. Operators use the new slot 13
exactly; Bonfire deliberately keeps its requested deep plum in dark mode rather
than lightening it for contrast. JS/TS globals reuse the function/type
accent. Enclosing bindings mix 75% string accent and 25% foreground in sRGB;
runtime imported names use a 50/50 mix of global and parent colors. These add no
palette slots or generated hues. Browser checks enforce the shared global color,
both mix formulas and text contrast without recoloring the six original roles.
Those six accents' lightness may be corrected to meet text contrast on
both editor surfaces; the editor background retains the selected palette.
These are default recipes, exposed in Settings' Editor colors pane. Users can
map each syntax role, selection and active line to palette slots, theme accents,
shared surfaces or earlier roles, with optional two-source mixes. Explicit palette
choices stay exact. Restrict references to earlier roles to prevent cycles and
validate stored sources rather than accepting arbitrary CSS. Color mappings and
selection opacity inherit by role from personal defaults to repository overrides,
participate in each settings scope's Undo/Redo, and update open views without
editing source files. They are appearance preferences, outside file overrides.
Transparency is reserved for effects such as
shadows, control fills, backdrops, scroll fades, canvas decoration and transitions.
Page backgrounds remain solid beneath animated lines.

Normal text and placeholders target at least 4.5:1 contrast. Hover foregrounds
match the second header's background: `palette-3` in dark mode and `palette-4` in
light mode. This accent choice does not guarantee the text contrast target
against every control surface.
Required, selected and error states also use text, icons or structure.
Validate every palette in both modes, correcting palette values or shared roles
rather than adding mode-specific exceptions. Checks cover reversal, replacement
palettes, role bindings and contrast without duplicating shipped hex values.

Primary/destructive and Settings buttons follow the same hover foreground role.
Buttons inside the second header keep their normal foreground and indicate hover
with their existing background fill. Controls retain their size
on hover and focus, including after resizing and inside portal panels. Keyboard
focus remains visible through focus indicators. Disabled controls remain fully
opaque, use native disabled semantics, and do not activate on hover. Interface
transitions respect reduced-motion preferences.

Layout regions, cards, sheets, tabs and form controls use spacing and surface
colors without borders or outlines. Keyboard focus uses palette fills and text
colors, including menus, tree rows and inline renaming; invalid states retain
their error text and semantic attributes. Shared CSS covers portalled controls
as well as the application shell. Borders and focus/match outlines belong only
inside CodeMirror. Tree connectors, graph nodes and loading illustrations are
drawn content rather than control frames.

The first header contains repository context, the Editor/History/Settings tabs
and persistence status. The second contains left-aligned undo/redo actions and
branch label; open-file tabs follow it. There is no separate fourth toolbar.
The file-action header uses the third foreground (`tone-4`) as its background
and the first background (`tone-1`) for text and icons.

Local Git review uses a right-hand pane shared by the editor and History.
When the available workspace fits both panes, Git occupies its own layout space
and leaves the explorer and workbench usable. When space is insufficient, the
shared Sheet provides a modal covering the entire viewport. Sliding content is
clipped to the dock so it cannot cover the explorer. Layout changes preserve
the operation and draft; opening transitions never replay on staging or editing.
Docked entry and exit animate the shared layout boundary, so the main view moves
with Git rather than jumping to its final size ahead of the pane. Git's form
retains its target width throughout the short, reversible motion. Reduced motion
applies the layout immediately.

File and folder names in the tree, and open-file tabs, expose a Bits UI context
menu through right-click or the keyboard menu key. Change name edits the basename
inline; deletion confirms the captured target and folder contents where relevant.
Neither action implicitly selects or opens a different file or expands a folder.
Folder renames preserve existing expansion and update descendant open tabs.
Mutations flush pending edits and retain Git-backed undo, with a whole folder
rename or deletion represented by one revision.
File-tab close controls affect open views only. They flush pending writes before
closing, retain the view after a save failure, and leave the repository files
and source history untouched. Closing the active tab selects its right neighbor
or the last tab to its left; closing the final tab shows the welcome view.
The file menu uses the second foreground (`tone-5`) as its background and the
second background (`tone-2`) for text and icons. Hovered or keyboard-highlighted
items use the first foreground (`tone-6`) as their background and the first
background (`tone-1`) for text and icons, an exception to ordinary button hover.

Preserve accessible names, native disabled behavior, bindable refs, forwarded
props, keyboard operation, modal focus behavior, and reduced-motion handling.
These requirements apply to shared controls as they enter the editor. Packaging
checks alone do not establish accessibility: verify actual controls and their
palette combinations in the browser.

## Packaging and development

Vite serves local development at the project's stable strict origin. Production
JavaScript, CSS, fonts, and workers are embedded in the HTML artifact.
Hosting headers and generated favicon compatibility files accompany that page.
The canonical project SVG lives in `src/assets` and uses an explicit `?inline`
HTML reference; public ICO/PNG fallbacks provide ordinary hosted icon URLs.
Generate compatibility formats from that source and verify freshness before
building, rather than maintaining independent artwork copies. The
[asset guide](../../src/assets/README.md) owns sizes, formats and provenance;
the [build guide](../../build/README.md) owns the 11-file distribution contract.
Development overlay and toolbar integrations are excluded from production.
