# Startup progress

`LoadingGallery.svelte` presents the nine actual startup stages from
[`startup-progress.ts`](../../startup-progress.ts). Stage titles remain available to screen readers and slide up with a brief
overshoot on hover or keyboard focus, then drop away on exit. Their two-digit stage numbers slide in separately from the left on hover
or focus. Unfinished pane backgrounds use 25% opacity, rising to 50% on hover
or focus. Ready and skipped panes fade to 100% in readiness order, taking 160ms
each; the next fade waits for the preceding fade to finish. Each drawing authors its own CSS timeline with holds between complete actions;
there is no shared timer that freezes animation midway through movement. Actual operation boundaries
drive progress; animation cycles never advance it. Caption space stays reserved
so drawings do not shift as
text fades into place. One polite live summary announces the current work.

Opening local storage uses a stationary database symbol whose three layers
light up from bottom to top, hold, then dim together. Its filled
[Material Symbols Rounded database](https://raw.githubusercontent.com/google/material-design-icons/master/symbols/web/database/materialsymbolsrounded/database_fill1_24px.svg)
contours are split into separate paths without changing their shape. The
[Apache 2.0 notice](../../../assets/fonts/Material-Symbols-Apache-2.0.txt) is already bundled with the interface icons.
Reading files and folders uses the indented rows revealed one at a time,
like reading a directory listing. Both retain the shared animation rhythm;
their visual sequences do not simulate operation completion.

Opening repository uses a twelve-second cycle with a longer closed hold,
then opens sideways with four folded-corner documents
rising straight upward in a fixed landscape orientation, without opacity fades.
They emerge from behind the folder and leave through the top of a clipped viewport.
Reduced motion keeps the folder open with a stationary document.

Reading Git history steps through fifteen commits from beginning to end. The graph
moves downward in 240ms slides with symmetric ease-in-out, holding each arrival
for 80ms after a 400ms lead-in. Center dots fade in over 120ms to fill on arrival, hold for 180ms, and
fade out over 180ms independently of movement. Main stays on the left, the second branch
splits from main, and the third splits from the second; neither merges back.
Chronological rows are uniformly 30px apart across all branches, including both
branch openings. Two main commits occur while the second branch is active;
lanes pause as other lanes advance, so their gaps can span multiple rows.
The third branch splits after more second-branch work and continues beyond its
parent's final commit. Each line stops at its final commit: the second ends first,
the third next, then two more commits on main finish the sequence, balancing
the three main commits at the beginning. The final commit's center stays filled
through its 2.8-second hold, then fades with the graph as the 8.9-second loop resets. A ring draws around the final commit during
the extended completed hold.
Soft edge fades frame the graph. Its 1px frame uses the foreground-lightened
border color at each corner, fading to transparent at each side's midpoint.
Those midpoints reveal the actual pane background, following its hover and
completion fades exactly. The experimental frame shadow is removed. Reduced motion
shows a stationary three-lane graph with one steady filled center dot.

Preparing the editor builds a small code pane: monochrome indented lines appear
in order, then the current line and cursor become ready. Reduced
motion shows the completed pane with a steady cursor.

The header shows `code.` above `A HEADLESS BROWSER IDE`. `Loading...` and its
animated dots sit in the footer. The `code.` wordmark matches the Loading label's
typography at 90% of its font size at every viewport width and height.
The numbered animations use a 3-second cycle in a three-by-three desktop
grid, except the repository folder's 6-second and commit reader's 5.16-second cycles;
the loading dots use their own 2.4-second sequence. When the viewport is
900px wide or narrower, or 480px high or shorter, two columns follow
running stages and upcoming work. Narrow screens use two rows below 700px
height, three rows from 700px, and four rows from 900px. Wider screens above
480px height show all nine in three columns, scaling drawings down as height
shrinks. CSS selects the row count before
JavaScript loads as well as during resizing.
Compact cards also show only stage titles. Drawings scale to available space
and the loader never scrolls.
Reduced-motion users receive still compositions.

The same Svelte gallery is rendered into the initial HTML by the build adapter,
including its animation CSS. SVG viewports fit the drawings without JavaScript.
The browser attaches live progress to those existing elements so animations
continue through startup. The application
remains inert until storage, repository state, preferences, and the editor's
restored position are ready and all nine pane fades have finished, then the loader
dismisses automatically. Reduced motion skips the fade duration. Failures bypass
the presentation queue so errors cannot trap the application behind the loader. Development
can explicitly keep it visible with `?loaders=1` or `VITE_LOADING_GALLERY=true`
for design work; `?editor=1` always uses normal dismissal.

Applying preferences highlights each station and its moving token with the
same foreground used by the middle text segment in Reading files and folders. Passed stations stay in the shared green loader
accent until all four reset together at the end of the cycle.

The database pauses between its three layer fills and collective fade. Brackets
pause after the left bracket, the three-line group, the right bracket, and fade.
Typing starts immediately, holds the completed text for 2.8 seconds, and
pauses after clearing. Shelf sequences begin after a 150ms pause, hold the full stack for 1.3 seconds,
and repeat with the same brief pause after emptying. The pipeline holds between its four stations and final reset.
The completed editor holds longer, while the folding panels pause before and
after each complete wave. Original movement durations remain unchanged.
