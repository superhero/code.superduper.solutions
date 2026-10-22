<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  let { variant }: { variant: "typesetter" | "brackets" | "stack" } = $props();
</script>

<div class="drawing" style:--loader-cycle={variant === "typesetter" ? "5.95s" : variant === "brackets" ? "6s" : "4.03s"} aria-hidden="true">
  {#if variant === "typesetter"}
    <div class="typesetter">
      {#each [78, 108, 62, 92] as width, i}
        <div class="code-line" style={`--row:${i}; --width:${width}px; --indent:${i === 1 || i === 2 ? 14 : 0}px`}>
          <span class="number-space"></span>
          <span class="written"><i></i><i></i><i></i></span>
        </div>
      {/each}
      <span class="caret"></span>
    </div>
  {:else if variant === "brackets"}
    <svg class="brackets" width="190" height="105" viewBox="0 0 190 105">
      <path class="ghost" d="M56 23H43V82H56 M134 23H147V82H134" />
      <path class="bracket left" pathLength="1" d="M56 23H43V82H56" />
      <path class="bracket right" pathLength="1" d="M134 82H147V23H134" />
      {#each [0, 1, 2] as i}
        <path class="insert" style={`--row:${i}`} pathLength="1" d={`M69 ${39 + i * 14} H${i === 1 ? 111 : 121}`} />
      {/each}
    </svg>
  {:else}
    <div class="stack">
      {#each [0, 1, 2, 3, 4] as i}
        <div class="shelf" style={`--row:${i}`}><span></span><i></i></div>
      {/each}
      <span class="datum"></span>
    </div>
  {/if}
</div>

<style>
  .drawing { width: 190px; height: 105px; display: grid; place-items: center; }
  .typesetter { width: 166px; height: 80px; position: relative; }
  .code-line { height: 20px; display: flex; align-items: center; gap: calc(12px + var(--indent)); }
  .number-space { width: 15px; }
  .written { width: var(--width); display: flex; gap: 5px; clip-path: inset(0 100% 0 0); }
  .written i { height: 3px; width: 29%; background: currentColor; border-radius: 1px; }
  .written i:first-child { width: 19%; background: var(--loader-accent); }
  .written i:last-child { flex: 1; opacity: .5; }
  .written { animation: type-first var(--loader-cycle, 5.4s) steps(9, end) infinite; }
  .code-line:nth-child(2) .written { animation-name: type-second; }
  .code-line:nth-child(3) .written { animation-name: type-third; }
  .code-line:nth-child(4) .written { animation-name: type-fourth; }
  .caret { position: absolute; width: 2px; height: 12px; left: 27px; top: 4px;
    background: var(--loader-accent); animation: type-caret var(--loader-cycle, 5.4s) linear infinite; }
  @keyframes type-first {
    0.000000% { clip-path: inset(0 100.000000% 0 0); }
    0.000000% { clip-path: inset(0 100.000000% 0 0); }
    7.058823% { clip-path: inset(0); }
    79.831933% { clip-path: inset(0); }
    84.873950% { clip-path: inset(0 100.000000% 0 0); }
    100.000000% { clip-path: inset(0 100.000000% 0 0); }
  }
  @keyframes type-second {
    0.000000% { clip-path: inset(0 100.000000% 0 0); }
    8.067226% { clip-path: inset(0 100.000000% 0 0); }
    15.630252% { clip-path: inset(0); }
    79.831933% { clip-path: inset(0); }
    84.873950% { clip-path: inset(0 100.000000% 0 0); }
    100.000000% { clip-path: inset(0 100.000000% 0 0); }
  }
  @keyframes type-third {
    0.000000% { clip-path: inset(0 100.000000% 0 0); }
    16.638655% { clip-path: inset(0 100.000000% 0 0); }
    24.201681% { clip-path: inset(0); }
    79.831933% { clip-path: inset(0); }
    84.873950% { clip-path: inset(0 100.000000% 0 0); }
    100.000000% { clip-path: inset(0 100.000000% 0 0); }
  }
  @keyframes type-fourth {
    0.000000% { clip-path: inset(0 100.000000% 0 0); }
    25.210084% { clip-path: inset(0 100.000000% 0 0); }
    32.773109% { clip-path: inset(0); }
    79.831933% { clip-path: inset(0); }
    84.873950% { clip-path: inset(0 100.000000% 0 0); }
    100.000000% { clip-path: inset(0 100.000000% 0 0); }
  }
  @keyframes type-caret {
    0.000000% { transform: translate(0, 0); opacity: 0; }
    0.000000% { transform: translate(0, 0); opacity: 1; }
    7.058823% { transform: translate(78px, 0); opacity: 1; }
    8.067226% { transform: translate(14px, 20px); }
    15.630252% { transform: translate(122px, 20px); }
    16.638655% { transform: translate(14px, 40px); }
    24.201681% { transform: translate(76px, 40px); }
    25.210084% { transform: translate(0, 60px); }
    32.773109% { transform: translate(92px, 60px); opacity: 1; }
    79.831933% { transform: translate(92px, 60px); opacity: 1; }
    81.848739% { transform: translate(92px, 60px); opacity: 0; }
    100.000000% { transform: translate(92px, 60px); opacity: 0; }
  }
  .brackets { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: square; }
  .ghost { opacity: .12; stroke-width: 1; }
  .bracket { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw-bracket var(--loader-cycle, 5.4s) ease-in-out infinite; }
  .right { animation-name: draw-right; }
  .insert { stroke: var(--loader-accent); stroke-dasharray: 1; stroke-dashoffset: 1;
    animation: draw-first-line var(--loader-cycle, 5.4s) ease-in-out infinite; }
  .insert:nth-of-type(5) { animation-name: draw-second-line; }
  .insert:nth-of-type(6) { animation-name: draw-third-line; }
  @keyframes draw-bracket {
    0.000000% { stroke-dashoffset: 1; opacity: 1; }
    8.333333% { stroke-dashoffset: 1; opacity: 1; }
    17.333333% { stroke-dashoffset: 0; opacity: 1; }
    72.500000% { stroke-dashoffset: 0; opacity: 1; }
    77.500000% { stroke-dashoffset: 0; opacity: 0; }
    100.000000% { stroke-dashoffset: 0; opacity: 0; }
  }
  @keyframes draw-right {
    0.000000% { stroke-dashoffset: 1; opacity: 1; }
    48.500000% { stroke-dashoffset: 1; opacity: 1; }
    57.500000% { stroke-dashoffset: 0; opacity: 1; }
    72.500000% { stroke-dashoffset: 0; opacity: 1; }
    77.500000% { stroke-dashoffset: 0; opacity: 0; }
    100.000000% { stroke-dashoffset: 0; opacity: 0; }
  }
  @keyframes draw-first-line {
    0.000000% { stroke-dashoffset: 1; opacity: 1; }
    25.666667% { stroke-dashoffset: 1; opacity: 1; }
    30.166667% { stroke-dashoffset: 0; opacity: 1; }
    72.500000% { stroke-dashoffset: 0; opacity: 1; }
    77.500000% { stroke-dashoffset: 0; opacity: 0; }
    100.000000% { stroke-dashoffset: 0; opacity: 0; }
  }
  @keyframes draw-second-line {
    0.000000% { stroke-dashoffset: 1; opacity: 1; }
    30.666667% { stroke-dashoffset: 1; opacity: 1; }
    35.166667% { stroke-dashoffset: 0; opacity: 1; }
    72.500000% { stroke-dashoffset: 0; opacity: 1; }
    77.500000% { stroke-dashoffset: 0; opacity: 0; }
    100.000000% { stroke-dashoffset: 0; opacity: 0; }
  }
  @keyframes draw-third-line {
    0.000000% { stroke-dashoffset: 1; opacity: 1; }
    35.666667% { stroke-dashoffset: 1; opacity: 1; }
    40.166667% { stroke-dashoffset: 0; opacity: 1; }
    72.500000% { stroke-dashoffset: 0; opacity: 1; }
    77.500000% { stroke-dashoffset: 0; opacity: 0; }
    100.000000% { stroke-dashoffset: 0; opacity: 0; }
  }
  .stack { width: 110px; height: 81px; position: relative; }
  .shelf { position: absolute; top: calc(var(--row) * 15px); width: 110px; height: 8px;
    display: flex; align-items: center; gap: 9px; transform: translate(-48px, 18px); opacity: 0;
    animation: file-shelf-first var(--loader-cycle, 5.4s) cubic-bezier(.25,.7,.25,1) infinite; }
  .shelf:nth-child(2) { animation-name: file-shelf-second; }
  .shelf:nth-child(3) { animation-name: file-shelf-third; }
  .shelf:nth-child(4) { animation-name: file-shelf-fourth; }
  .shelf:nth-child(5) { animation-name: file-shelf-fifth; }
  .shelf span { width: 4px; height: 8px; background: var(--loader-accent); }
  .shelf i { height: 5px; flex: 1; background: currentColor; opacity: .75; }
  .datum { position: absolute; bottom: 0; left: 0; width: 110px; height: 1px; background: currentColor; opacity: .2; }
  /* Enter bottom-to-top, then leave top-to-bottom within the same cycle. */
  @keyframes file-shelf-first {
    0.000000% { transform: translate(-48px, 18px); opacity: 0; }
    3.722084% { transform: translate(-48px, 18px); opacity: 0; }
    33.498760% { transform: translate(-48px, 18px); opacity: 0; }
    40.942928% { transform: translate(0, 0); opacity: 1; }
    73.200993% { transform: translate(0, 0); opacity: 1; }
    79.156327% { transform: translate(32px, -18px); opacity: 0; }
    100.000000% { transform: translate(32px, -18px); opacity: 0; }
  }
  @keyframes file-shelf-second {
    0.000000% { transform: translate(-48px, 18px); opacity: 0; }
    3.722084% { transform: translate(-48px, 18px); opacity: 0; }
    26.054591% { transform: translate(-48px, 18px); opacity: 0; }
    33.498760% { transform: translate(0, 0); opacity: 1; }
    78.411911% { transform: translate(0, 0); opacity: 1; }
    84.367246% { transform: translate(32px, -18px); opacity: 0; }
    100.000000% { transform: translate(32px, -18px); opacity: 0; }
  }
  @keyframes file-shelf-third {
    0.000000% { transform: translate(-48px, 18px); opacity: 0; }
    3.722084% { transform: translate(-48px, 18px); opacity: 0; }
    18.610422% { transform: translate(-48px, 18px); opacity: 0; }
    26.054591% { transform: translate(0, 0); opacity: 1; }
    83.622829% { transform: translate(0, 0); opacity: 1; }
    89.578164% { transform: translate(32px, -18px); opacity: 0; }
    100.000000% { transform: translate(32px, -18px); opacity: 0; }
  }
  @keyframes file-shelf-fourth {
    0.000000% { transform: translate(-48px, 18px); opacity: 0; }
    3.722084% { transform: translate(-48px, 18px); opacity: 0; }
    11.166253% { transform: translate(-48px, 18px); opacity: 0; }
    18.610422% { transform: translate(0, 0); opacity: 1; }
    88.833747% { transform: translate(0, 0); opacity: 1; }
    94.789082% { transform: translate(32px, -18px); opacity: 0; }
    100.000000% { transform: translate(32px, -18px); opacity: 0; }
  }
  @keyframes file-shelf-fifth {
    0.000000% { transform: translate(-48px, 18px); opacity: 0; }
    3.722084% { transform: translate(-48px, 18px); opacity: 0; }
    11.166253% { transform: translate(0, 0); opacity: 1; }
    94.044666% { transform: translate(0, 0); opacity: 1; }
    100.000000% { transform: translate(32px, -18px); opacity: 0; }
  }
  .drawing * { animation-play-state: var(--loader-play-state, running); }
  @media (prefers-reduced-motion: reduce) {
    .written { clip-path: inset(0); }.caret { display: none; }
    .bracket, .insert { stroke-dashoffset: 0; }.shelf { transform: none; opacity: 1; }
  }
</style>
