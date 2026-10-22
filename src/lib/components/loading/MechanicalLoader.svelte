<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  let { variant }: { variant: "storage" | "pipeline" | "folder" } = $props();
</script>

<div class="mechanical" style:--loader-cycle={variant === "storage" ? "5s" : variant === "pipeline" ? "7.65s" : "6s"} aria-hidden="true">
  {#if variant === "storage"}
    <svg viewBox="0 0 190 105" fill="none">
      <!-- Google Material Symbols Rounded database, Apache-2.0; see loading/README.md.
        Original contours are split into stationary layers for color animation. -->
      <g transform="translate(51 96.5) scale(.0916666667)">
        <path class="storage-layer layer-first" d="M480-520q150 0 255-47t105-113q0-66-105-113t-255-47q-150 0-255 47T120-680q0 66 105 113t255 47Z" />
        <path class="storage-layer layer-second" d="M480-420q41 0 102.5-8.5T701-456q57-19 98-49.5t41-74.5v100q0 44-41 74.5T701-356q-57 19-118.5 27.5T480-320q-41 0-102.5-8.5T259-356q-57-19-98-49.5T120-480v-100q0 44 41 74.5t98 49.5q57 19 118.5 27.5T480-420Z" />
        <path class="storage-layer layer-third" d="M480-220q41 0 102.5-8.5T701-256q57-19 98-49.5t41-74.5v100q0 44-41 74.5T701-156q-57 19-118.5 27.5T480-120q-41 0-102.5-8.5T259-156q-57-19-98-49.5T120-280v-100q0 44 41 74.5t98 49.5q57 19 118.5 27.5T480-220Z" />
      </g>
    </svg>
  {:else if variant === "pipeline"}
    <svg viewBox="0 0 190 105" fill="none">
      <path class="pipeline-rail" d="M7 71H183M29 54v17m44-17v17m44-17v17m44-17v17" />
      {#each [0, 1, 2, 3] as station}
        <g class="station" class:station-second={station === 1} class:station-third={station === 2} class:station-fourth={station === 3} transform={`translate(${16 + station * 44} 27)`}>
          <rect class="station-shell" width="26" height="26" rx="4" />
          {#if station === 0}
            <path d="M8 8h10M8 13h7M8 18h10" />
          {:else if station === 1}
            <path d="m10 8-5 5 5 5m6-10 5 5-5 5" />
          {:else if station === 2}
            <path d="M8 8h4v4H8zM15 15h4v4h-4zM16 8h3m-1.5-1.5v3M9.5 15v4" />
          {:else}
            <path d="m7 13 4 4 8-8" />
          {/if}
          <path class="station-light" d="M10-6h6" />
        </g>
      {/each}
      <rect class="pipeline-token" x="2" y="67" width="8" height="8" rx="2" />
      <path class="pipeline-output" d="M176 84h6m-3-3v6" />
    </svg>
  {:else}
    <svg viewBox="0 0 190 105" fill="none">
      <path class="folder-back" d="M51 80V29a4 4 0 0 1 4-4h23l9 9h48a4 4 0 0 1 4 4v42a4 4 0 0 1-4 4H55a4 4 0 0 1-4-4Z" />
      <svg class="folder-documents" x="0" y="0" width="190" height="84" viewBox="0 0 190 84">
      {#each [0, 1, 2, 3] as file}
        <g class="folder-file" class:file-second={file === 1} class:file-third={file === 2} class:file-fourth={file === 3}>
          <g transform="translate(95 63) rotate(270) scale(1.8) translate(-89 -63)">
            <path class="document-sheet" d="M78 48h15l7 7v23H78Z" />
            <path class="document-fold" d="M93 48v7h7" />
            <path class="document-lines" d="M83 61h12m-12 5h12m-12 5h8" />
          </g>
        </g>
      {/each}
      </svg>
      <path class="folder-front" d="M51 45a3 3 0 0 1 3-3h82a3 3 0 0 1 3 3v35a4 4 0 0 1-4 4H55a4 4 0 0 1-4-4Z" />
    </svg>
  {/if}
</div>

<style>
  .mechanical { width: 190px; height: 105px; flex: none; }
  .mechanical svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .mechanical * { animation-play-state: var(--loader-play-state, running) !important; }
  .pipeline-rail { stroke: currentColor; stroke-width: 1; opacity: .18; }

  .storage-layer { fill: var(--loader-accent, currentColor); opacity: 1;
    animation: storage-third var(--loader-cycle, 3s) ease-in-out infinite; }
  .layer-second { animation-name: storage-second; }
  .layer-third { animation-name: storage-first; }
  @keyframes storage-first {
    0.000000% { fill: currentColor; opacity: .25; }
    12.000000% { fill: currentColor; opacity: .25; }
    19.200000% { fill: var(--loader-accent, currentColor); opacity: 1; }
    69.600000% { fill: var(--loader-accent, currentColor); opacity: 1; }
    78.000000% { fill: currentColor; opacity: .25; }
    100.000000% { fill: currentColor; opacity: .25; }
  }
  @keyframes storage-second {
    0.000000% { fill: currentColor; opacity: .25; }
    28.200000% { fill: currentColor; opacity: .25; }
    35.400000% { fill: var(--loader-accent, currentColor); opacity: 1; }
    69.600000% { fill: var(--loader-accent, currentColor); opacity: 1; }
    78.000000% { fill: currentColor; opacity: .25; }
    100.000000% { fill: currentColor; opacity: .25; }
  }
  @keyframes storage-third {
    0.000000% { fill: currentColor; opacity: .25; }
    44.400000% { fill: currentColor; opacity: .25; }
    51.600000% { fill: var(--loader-accent, currentColor); opacity: 1; }
    69.600000% { fill: var(--loader-accent, currentColor); opacity: 1; }
    78.000000% { fill: currentColor; opacity: .25; }
    100.000000% { fill: currentColor; opacity: .25; }
  }

  .station { color: inherit; opacity: .42; animation: process-stage-0 var(--loader-cycle, 5.4s) linear infinite; }
  .station-second { animation-name: process-stage-1; }
  .station-third { animation-name: process-stage-2; }
  .station-fourth { animation-name: process-stage-3; }
  .station-shell { fill: currentColor; fill-opacity: .055; stroke: currentColor; stroke-opacity: .45; }
  .station path { stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  .station-light { stroke-width: 2 !important; opacity: .65; }
  .pipeline-token { fill: currentColor; animation: process-token var(--loader-cycle, 5.4s) cubic-bezier(.45, 0, .25, 1) infinite; }
  .pipeline-output { stroke: var(--loader-accent, currentColor); stroke-width: 1; animation: process-output var(--loader-cycle, 5.4s) linear infinite; }
  @keyframes process-stage-0 {
    0.000000% { color: inherit; opacity: .42; }
    9.281046% { color: inherit; opacity: .42; }
    10.457517% { color: inherit; opacity: 1; }
    15.163399% { color: inherit; opacity: 1; }
    16.339870% { color: var(--loader-accent, currentColor); opacity: 1; }
    87.581700% { color: var(--loader-accent, currentColor); opacity: 1; }
    89.542483% { color: inherit; opacity: .42; }
    100.000000% { color: inherit; opacity: .42; }
  }
  @keyframes process-stage-1 {
    0.000000% { color: inherit; opacity: .42; }
    21.568627% { color: inherit; opacity: .42; }
    22.745099% { color: inherit; opacity: 1; }
    27.450981% { color: inherit; opacity: 1; }
    28.627451% { color: var(--loader-accent, currentColor); opacity: 1; }
    87.581700% { color: var(--loader-accent, currentColor); opacity: 1; }
    89.542483% { color: inherit; opacity: .42; }
    100.000000% { color: inherit; opacity: .42; }
  }
  @keyframes process-stage-2 {
    0.000000% { color: inherit; opacity: .42; }
    33.856209% { color: inherit; opacity: .42; }
    35.032680% { color: inherit; opacity: 1; }
    39.738562% { color: inherit; opacity: 1; }
    40.915033% { color: var(--loader-accent, currentColor); opacity: 1; }
    87.581700% { color: var(--loader-accent, currentColor); opacity: 1; }
    89.542483% { color: inherit; opacity: .42; }
    100.000000% { color: inherit; opacity: .42; }
  }
  @keyframes process-stage-3 {
    0.000000% { color: inherit; opacity: .42; }
    46.143791% { color: inherit; opacity: .42; }
    47.320262% { color: inherit; opacity: 1; }
    52.026144% { color: inherit; opacity: 1; }
    53.202614% { color: var(--loader-accent, currentColor); opacity: 1; }
    87.581700% { color: var(--loader-accent, currentColor); opacity: 1; }
    89.542483% { color: inherit; opacity: .42; }
    100.000000% { color: inherit; opacity: .42; }
  }
  @keyframes process-token {
    0.000000% { transform: translateX(0); opacity: 0; }
    6.535948% { transform: translateX(0); opacity: 0; }
    7.712418% { transform: translateX(6.9px); opacity: 1; }
    10.457517% { transform: translateX(23px); opacity: 1; }
    19.607842% { transform: translateX(23px); opacity: 1; }
    22.745099% { transform: translateX(67px); opacity: 1; }
    31.895424% { transform: translateX(67px); opacity: 1; }
    35.032680% { transform: translateX(111px); opacity: 1; }
    44.183006% { transform: translateX(111px); opacity: 1; }
    47.320262% { transform: translateX(155px); opacity: 1; }
    62.352941% { transform: translateX(155px); opacity: 1; }
    65.882354% { transform: translateX(178px); opacity: 0; }
    100.000000% { transform: translateX(178px); opacity: 0; }
  }
  @keyframes process-output {
    0.000000% { opacity: 0; }
    62.745098% { opacity: 0; }
    64.313726% { opacity: .7; }
    87.581700% { opacity: .7; }
    89.542483% { opacity: 0; }
    100.000000% { opacity: 0; }
  }

  .folder-back { fill: currentColor; fill-opacity: .08; stroke: currentColor; stroke-opacity: .4; stroke-width: 1.5; }
  .mechanical .folder-documents { width: 190px; height: 84px; overflow: hidden; }
  .folder-front { fill: color-mix(in srgb, var(--loader-accent) 22%, var(--color-surface));
    stroke: var(--loader-accent); stroke-width: 1.5; transform-origin: 95px 84px;
    transform: skewX(-20deg) scaleY(.72); animation: folder-open calc(var(--loader-cycle, 3s) * 2) ease-in-out infinite; }
  .folder-file { transform-origin: 89px 63px;
    animation: folder-file-first calc(var(--loader-cycle, 3s) * 2) linear infinite; }
  .document-sheet { fill: var(--color-surface); stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round; }
  .document-fold { stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round; }
  .document-lines { stroke: var(--loader-accent); stroke-width: 1.5; stroke-linecap: round; }
  .file-second { animation-name: folder-file-second; }
  .file-third { animation-name: folder-file-third; }
  .file-fourth { animation-name: folder-file-fourth; }
  @keyframes folder-open {
    0.000000% { transform: skewX(0) scaleY(1); }
    10.000000% { transform: skewX(0) scaleY(1); }
    14.000000% { transform: skewX(-20deg) scaleY(.72); }
    81.583333% { transform: skewX(-20deg) scaleY(.72); }
    85.083333% { transform: skewX(0) scaleY(1); }
    100.000000% { transform: skewX(0) scaleY(1); }
  }
  @keyframes folder-file-first {
    0.000000% { transform: translateY(12px); }
    18.166667% { transform: translateY(12px); }
    30.166667% { transform: translateY(-86px); }
    100.000000% { transform: translateY(-86px); }
  }
  @keyframes folder-file-second {
    0.000000% { transform: translateY(12px); }
    33.916667% { transform: translateY(12px); }
    45.916667% { transform: translateY(-86px); }
    100.000000% { transform: translateY(-86px); }
  }
  @keyframes folder-file-third {
    0.000000% { transform: translateY(12px); }
    49.666667% { transform: translateY(12px); }
    61.666667% { transform: translateY(-86px); }
    100.000000% { transform: translateY(-86px); }
  }

  @keyframes folder-file-fourth {
    0%, 65.416667% { transform: translateY(12px); }
    77.416667%, 100% { transform: translateY(-86px); }
  }

  @media (prefers-reduced-motion: reduce) {
    .mechanical * { animation: none !important; }
    .folder-file { opacity: 0; }
    .folder-file:first-of-type { opacity: 1; transform: translateY(-12px); }
    .station { color: var(--loader-accent, currentColor); }
    .pipeline-token { transform: translateX(155px); }
    .pipeline-output { opacity: .7; }
  }
</style>
