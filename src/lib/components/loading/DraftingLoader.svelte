<!--
Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS.
-->

<script lang="ts">
  let { variant }: { variant: "commits" | "editor" | "fold" } = $props();

  // One commit per 30px chronological row; lanes can pause while another advances.
  const commits = [0, 0, 0, 1, 1, 0, 1, 2, 1, 1, 0, 1, 2, 0, 0]
    .map((lane, index) => ({ lane, offset: index * 30 }));
</script>

<div class="drafting" style:--loader-cycle={variant === "fold" ? "5.5s" : variant === "editor" ? "6.1s" : "3s"} class:commits={variant === "commits"} aria-hidden="true">
  {#if variant === "commits"}
    <div class="commit-window">
    <svg class="commit-graph" viewBox="0 0 190 105" fill="none">
      <g class="commit-reader">
        <g class="commit-stream">
          <path class="commit-line main-line" d="M53 52.5V-367.5" />
          <path class="commit-line" d="M53-7.5C53-22.5 95-22.5 95-37.5V-277.5" />
          <path class="commit-line" d="M95-127.5C95-142.5 137-142.5 137-157.5V-307.5" />
          {#each commits as commit, index}
            <circle class="commit-node" class:main-node={commit.lane === 0}
              cx={53 + commit.lane * 42} cy={52.5 - commit.offset} r="4.5" />
            <circle class={`commit-focus commit-${index}`} class:still-focus={index === 7}
              class:last-commit={index === commits.length - 1}
              style={`--commit-index:${index}`}
              cx={53 + commit.lane * 42} cy={52.5 - commit.offset} r="2.2" />
            {#if index === commits.length - 1}
              <path class="commit-complete-ring" pathLength="1"
                d={`M${53 + commit.lane * 42} ${44 - commit.offset} a8.5 8.5 0 1 1 0 17 a8.5 8.5 0 1 1 0 -17`} />
            {/if}
          {/each}
        </g>
      </g>
    </svg>
    </div>
  {:else if variant === "editor"}
    <svg class="editor" viewBox="0 0 190 105" fill="none">
      <rect class="editor-frame" x="23" y="9" width="144" height="87" rx="5" />
      <path class="editor-divider" d="M23 29H167M47 29V96" />
      <path class="editor-tab-icon" d="m36 16-3 3 3 3m5-6 3 3-3 3" />
      <path class="editor-tab-label" d="M52 19H77" />
      <path class="editor-tab-active" d="M29 29H87" />
      <g>
        <path class="editor-token" pathLength="1" d="M57 42H72" />
        <path class="editor-token" pathLength="1" d="M80 42H106" />
        <path class="editor-token" pathLength="1" d="M114 42H135" />
        <path class="editor-token" pathLength="1" d="M143 42H148" />
      </g>
      <g class="row-two">
        <path class="editor-token" pathLength="1" d="M67 55H88" />
        <path class="editor-token" pathLength="1" d="M96 55H128" />
        <path class="editor-token" pathLength="1" d="M136 55H142" />
      </g>
      <g class="row-three">
        <path class="editor-token" pathLength="1" d="M57 68H63" />
      </g>
      <path class="editor-active-line" d="M49 81H165" />
      <path class="editor-caret" d="M57 76V86" />
    </svg>
  {:else}
    <div class="fold">
      <div class="panels">
        {#each Array(6) as _, i}
          <div class="panel" style={`--i:${i}`}>
            <div class="face front"><span></span><span></span></div>
            <div class="face back"><span></span></div>
          </div>
        {/each}
      </div>
      <div class="fold-rule">
        {#each Array(6) as _, i}<span style={`--i:${i}`}></span>{/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .drafting { width: 190px; height: 105px; flex: none; }
  .drafting.commits { box-sizing: border-box; position: relative;
    --frame-corner: color-mix(in srgb, var(--color-foreground) 14%, color-mix(in srgb, var(--color-surface) 60%, var(--color-background)));
    border: 1px solid transparent; }
  /* Transparent side centers reveal the pane's actual transitioning background. */
  .drafting.commits::after { content: ""; position: absolute; inset: -1px; pointer-events: none;
    background:
      linear-gradient(to right, var(--frame-corner), transparent 50%, var(--frame-corner)) top / 100% 1px,
      linear-gradient(to right, var(--frame-corner), transparent 50%, var(--frame-corner)) bottom / 100% 1px,
      linear-gradient(to bottom, var(--frame-corner), transparent 50%, var(--frame-corner)) left / 1px 100%,
      linear-gradient(to bottom, var(--frame-corner), transparent 50%, var(--frame-corner)) right / 1px 100%;
    background-repeat: no-repeat; }
  svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .commit-window { width: 100%; height: 100%; overflow: hidden;
    mask-image: linear-gradient(to bottom, transparent 3%, #000 18%, #000 82%, transparent 97%); }
  .commit-graph { overflow: hidden; --commit-cycle: 8.9s; }
  .commit-reader { animation: restart-reading var(--commit-cycle) linear infinite; }
  .commit-stream { animation: read-commits var(--commit-cycle) ease-in-out infinite; }
  .commit-line { stroke: currentColor; stroke-opacity: .4; stroke-width: 2;
    stroke-linecap: round; stroke-linejoin: round; }
  .main-line { stroke: var(--loader-accent, currentColor); stroke-opacity: .8; }
  .commit-node { stroke: currentColor; stroke-opacity: .75; stroke-width: 2;
    fill: color-mix(in srgb, var(--color-surface) 60%, var(--color-background)); }
  .main-node { stroke: var(--loader-accent, currentColor); stroke-opacity: 1; }
  .commit-focus { fill: var(--loader-accent, currentColor); opacity: 0;
    animation: read-commit-0 var(--commit-cycle) ease-in-out infinite;
    animation-delay: 0s; }

  /* 240ms commit slides, 80ms arrival holds, and a longer lead-in before reading. */
  @keyframes read-commits {
    0.000000% { transform: translateY(0); }
    4.494382% { transform: translateY(0); }
    7.191011% { transform: translateY(30px); }
    8.089888% { transform: translateY(30px); }
    10.786517% { transform: translateY(60px); }
    11.685393% { transform: translateY(60px); }
    14.382022% { transform: translateY(90px); }
    15.280899% { transform: translateY(90px); }
    17.977528% { transform: translateY(120px); }
    18.876405% { transform: translateY(120px); }
    21.573034% { transform: translateY(150px); }
    22.471910% { transform: translateY(150px); }
    25.168539% { transform: translateY(180px); }
    26.067415% { transform: translateY(180px); }
    28.764045% { transform: translateY(210px); }
    29.662922% { transform: translateY(210px); }
    32.359551% { transform: translateY(240px); }
    33.258427% { transform: translateY(240px); }
    35.955056% { transform: translateY(270px); }
    36.853932% { transform: translateY(270px); }
    39.550561% { transform: translateY(300px); }
    40.449439% { transform: translateY(300px); }
    43.146068% { transform: translateY(330px); }
    44.044944% { transform: translateY(330px); }
    46.741573% { transform: translateY(360px); }
    47.640449% { transform: translateY(360px); }
    50.337078% { transform: translateY(390px); }
    51.235955% { transform: translateY(390px); }
    53.932585% { transform: translateY(420px); }
    54.831461% { transform: translateY(420px); }
    88.089887% { transform: translateY(420px); }
    88.101124% { transform: translateY(0); }
    100.000000% { transform: translateY(0); }
  }
  @keyframes restart-reading {
    0.000000% { opacity: 1; }
    85.393258% { opacity: 1; }
    88.089887% { opacity: 0; }
    94.382023% { opacity: 0; }
    97.078652% { opacity: 1; }
    100.000000% { opacity: 1; }
  }
  .commit-0 { animation-name: read-commit-0; }
  @keyframes read-commit-0 {
    0.000000% { opacity: 0; }
    3.146067% { opacity: 0; }
    4.494382% { opacity: 1; }
    7.415731% { opacity: 1; }
    9.438203% { opacity: 0; }
    100.000000% { opacity: 0; }
  }
  .commit-1 { animation-name: read-commit-1; }
  @keyframes read-commit-1 {
    0.000000% { opacity: 0; }
    5.842696% { opacity: 0; }
    7.191011% { opacity: 1; }
    10.112360% { opacity: 1; }
    12.134832% { opacity: 0; }
    100.000000% { opacity: 0; }
  }
  .commit-2 { animation-name: read-commit-2; }
  @keyframes read-commit-2 {
    0.000000% { opacity: 0; }
    9.438203% { opacity: 0; }
    10.786517% { opacity: 1; }
    13.707865% { opacity: 1; }
    15.730337% { opacity: 0; }
    100.000000% { opacity: 0; }
  }
  .commit-3 { animation-name: read-commit-3; }
  @keyframes read-commit-3 {
    0.000000% { opacity: 0; }
    13.033708% { opacity: 0; }
    14.382022% { opacity: 1; }
    17.303370% { opacity: 1; }
    19.325842% { opacity: 0; }
    100.000000% { opacity: 0; }
  }
  .commit-4 { animation-name: read-commit-4; }
  @keyframes read-commit-4 {
    0.000000% { opacity: 0; }
    16.629213% { opacity: 0; }
    17.977528% { opacity: 1; }
    20.898877% { opacity: 1; }
    22.921349% { opacity: 0; }
    100.000000% { opacity: 0; }
  }
  .commit-5 { animation-name: read-commit-5; }
  @keyframes read-commit-5 {
    0.000000% { opacity: 0; }
    20.224719% { opacity: 0; }
    21.573034% { opacity: 1; }
    24.494382% { opacity: 1; }
    26.516854% { opacity: 0; }
    100.000000% { opacity: 0; }
  }
  .commit-6 { animation-name: read-commit-6; }
  @keyframes read-commit-6 {
    0.000000% { opacity: 0; }
    23.820225% { opacity: 0; }
    25.168539% { opacity: 1; }
    28.089887% { opacity: 1; }
    30.112359% { opacity: 0; }
    100.000000% { opacity: 0; }
  }
  .commit-7 { animation-name: read-commit-7; }
  @keyframes read-commit-7 {
    0.000000% { opacity: 0; }
    27.415730% { opacity: 0; }
    28.764045% { opacity: 1; }
    31.685394% { opacity: 1; }
    33.707866% { opacity: 0; }
    100.000000% { opacity: 0; }
  }
  .commit-8 { animation-name: read-commit-8; }
  @keyframes read-commit-8 {
    0.000000% { opacity: 0; }
    31.011236% { opacity: 0; }
    32.359551% { opacity: 1; }
    35.280899% { opacity: 1; }
    37.303371% { opacity: 0; }
    100.000000% { opacity: 0; }
  }
  .commit-9 { animation-name: read-commit-9; }
  @keyframes read-commit-9 {
    0.000000% { opacity: 0; }
    34.606742% { opacity: 0; }
    35.955056% { opacity: 1; }
    38.876404% { opacity: 1; }
    40.898876% { opacity: 0; }
    100.000000% { opacity: 0; }
  }
  .commit-10 { animation-name: read-commit-10; }
  @keyframes read-commit-10 {
    0.000000% { opacity: 0; }
    38.202247% { opacity: 0; }
    39.550561% { opacity: 1; }
    42.471910% { opacity: 1; }
    44.494382% { opacity: 0; }
    100.000000% { opacity: 0; }
  }
  .commit-11 { animation-name: read-commit-11; }
  @keyframes read-commit-11 {
    0.000000% { opacity: 0; }
    41.797753% { opacity: 0; }
    43.146068% { opacity: 1; }
    46.067416% { opacity: 1; }
    48.089888% { opacity: 0; }
    100.000000% { opacity: 0; }
  }
  .commit-12 { animation-name: read-commit-12; }
  @keyframes read-commit-12 {
    0.000000% { opacity: 0; }
    45.393258% { opacity: 0; }
    46.741573% { opacity: 1; }
    49.662921% { opacity: 1; }
    51.685393% { opacity: 0; }
    100.000000% { opacity: 0; }
  }
  .commit-13 { animation-name: read-commit-13; }
  @keyframes read-commit-13 {
    0.000000% { opacity: 0; }
    48.988764% { opacity: 0; }
    50.337078% { opacity: 1; }
    53.258427% { opacity: 1; }
    55.280899% { opacity: 0; }
    100.000000% { opacity: 0; }
  }
  .commit-14 { animation-name: read-commit-14; }
  @keyframes read-commit-14 {
    0.000000% { opacity: 0; }
    52.584270% { opacity: 0; }
    53.932585% { opacity: 1; }
    85.393258% { opacity: 1; }
    87.415730% { opacity: 0; }
    100.000000% { opacity: 0; }
  }
  .commit-complete-ring { fill:none;stroke:var(--loader-accent);stroke-width:1.5;
    stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;opacity:0;
    animation:circle-final-commit var(--commit-cycle) linear infinite; }
  @keyframes circle-final-commit {
    0.000000%, 60.674158% { stroke-dashoffset:1;opacity:0; }
    60.685393% { stroke-dashoffset:1;opacity:1; }
    65.741573%, 88.089887% { stroke-dashoffset:0;opacity:1; }
    88.101124%, 100.000000% { stroke-dashoffset:0;opacity:0; }
  }
  .editor-frame { stroke: currentColor; stroke-opacity: .55; stroke-width: 1.5; }
  .editor-divider { stroke: currentColor; stroke-opacity: .2; }
  .editor-tab-icon, .editor-tab-label { stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }
  .editor-tab-label { stroke-opacity: .5; }
  .editor-tab-active { stroke: var(--loader-accent, currentColor); stroke-width: 2; }
  .editor-token { stroke: currentColor; stroke-width: 3; stroke-linecap: round;
    stroke-dasharray: 1; animation: editor-first-row var(--loader-cycle, 3s) ease-in-out infinite; }
  .row-two .editor-token { animation-name: editor-second-row; }
  .row-three .editor-token { animation-name: editor-third-row; }
  .editor-active-line { stroke: var(--loader-accent, currentColor); stroke-width: 13;
    stroke-opacity: .09; animation: editor-ready var(--loader-cycle, 3s) linear infinite; }
  .editor-caret { stroke: var(--loader-accent, currentColor); stroke-width: 1.5;
    animation: editor-cursor var(--loader-cycle, 3s) linear infinite; }
  @keyframes editor-first-row {
    0.000000%, 3.934426%, 100.000000% { stroke-dashoffset: 1; opacity: 0; }
    11.803279%, 43.278688%, 94.098361% { stroke-dashoffset: 0; opacity: 1; }
  }
  @keyframes editor-second-row {
    0.000000%, 11.803279%, 100.000000% { stroke-dashoffset: 1; opacity: 0; }
    19.672132%, 43.278688%, 94.098361% { stroke-dashoffset: 0; opacity: 1; }
  }
  @keyframes editor-third-row {
    0.000000%, 19.672132%, 100.000000% { stroke-dashoffset: 1; opacity: 0; }
    23.606558%, 43.278688%, 94.098361% { stroke-dashoffset: 0; opacity: 1; }
  }
  @keyframes editor-ready {
    0.000000%, 27.049180%, 98.032787%, 100.000000% { opacity: 0; }
    29.508197%, 43.278688%, 94.098361% { opacity: 1; }
  }
  @keyframes editor-cursor {
    0.000000% { opacity: 0; }
    28.524590% { opacity: 0; }
    29.016393% { opacity: 1; }
    33.934426% { opacity: 1; }
    34.426230% { opacity: 0; }
    38.360656% { opacity: 0; }
    38.852459% { opacity: 1; }
    43.770492% { opacity: 1; }
    44.262295% { opacity: 0; }
    48.196721% { opacity: 0; }
    48.688525% { opacity: 1; }
    53.606557% { opacity: 1; }
    54.098361% { opacity: 0; }
    58.032787% { opacity: 0; }
    58.524590% { opacity: 1; }
    63.442623% { opacity: 1; }
    63.934426% { opacity: 0; }
    67.868852% { opacity: 0; }
    68.360656% { opacity: 1; }
    73.278689% { opacity: 1; }
    73.770492% { opacity: 0; }
    77.704918% { opacity: 0; }
    78.196721% { opacity: 1; }
    83.114754% { opacity: 1; }
    83.606557% { opacity: 0; }
    87.540984% { opacity: 0; }
    88.032787% { opacity: 1; }
    92.950820% { opacity: 1; }
    93.442623% { opacity: 0; }
    100.000000% { opacity: 0; }
  }
  .fold { height: 100%; display: grid; align-content: center; gap: 13px; padding: 0 21px; }
  .panels { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; perspective: 500px; }
  .panel {
    position: relative; height: 42px; transform-style: preserve-3d;
    animation: panel-turn-0 var(--loader-cycle, 5.4s) cubic-bezier(.45, 0, .3, 1) infinite;
    animation-delay: 0s;
  }
  .face {
    position: absolute; inset: 0; border: 1px solid currentColor; border-radius: 1px;
    backface-visibility: hidden; display: flex; flex-direction: column; justify-content: center;
    gap: 5px; padding: 5px;
  }
  .front { background: color-mix(in srgb, currentColor 7%, transparent); border-color: color-mix(in srgb, currentColor 40%, transparent); }
  .front span { height: 1px; background: currentColor; opacity: .45; }
  .front span:last-child { width: 60%; }
  .back {
    transform: rotateY(180deg); color: var(--loader-accent, currentColor);
    background: color-mix(in srgb, var(--loader-accent, currentColor) 14%, transparent);
  }
  .back span { width: 4px; height: 4px; background: currentColor; margin: auto; }
  .fold-rule { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; border-top: 1px solid color-mix(in srgb, currentColor 20%, transparent); }
  .fold-rule span { justify-self: center; height: 4px; width: 1px; background: currentColor; opacity: .3; }
  .panel:nth-child(1) { animation-name: panel-turn-0; }
  @keyframes panel-turn-0 {
    0.000000% { transform: rotateY(0); }
    10.909091% { transform: rotateY(0); }
    15.272727% { transform: rotateY(180deg); }
    55.272727% { transform: rotateY(180deg); }
    59.636364% { transform: rotateY(360deg); }
    100.000000% { transform: rotateY(360deg); }
  }
  .panel:nth-child(2) { animation-name: panel-turn-1; }
  @keyframes panel-turn-1 {
    0.000000% { transform: rotateY(0); }
    15.272727% { transform: rotateY(0); }
    19.636364% { transform: rotateY(180deg); }
    59.636364% { transform: rotateY(180deg); }
    64.000000% { transform: rotateY(360deg); }
    100.000000% { transform: rotateY(360deg); }
  }
  .panel:nth-child(3) { animation-name: panel-turn-2; }
  @keyframes panel-turn-2 {
    0.000000% { transform: rotateY(0); }
    19.636364% { transform: rotateY(0); }
    24.000000% { transform: rotateY(180deg); }
    64.000000% { transform: rotateY(180deg); }
    68.363636% { transform: rotateY(360deg); }
    100.000000% { transform: rotateY(360deg); }
  }
  .panel:nth-child(4) { animation-name: panel-turn-3; }
  @keyframes panel-turn-3 {
    0.000000% { transform: rotateY(0); }
    24.000000% { transform: rotateY(0); }
    28.363636% { transform: rotateY(180deg); }
    68.363636% { transform: rotateY(180deg); }
    72.727273% { transform: rotateY(360deg); }
    100.000000% { transform: rotateY(360deg); }
  }
  .panel:nth-child(5) { animation-name: panel-turn-4; }
  @keyframes panel-turn-4 {
    0.000000% { transform: rotateY(0); }
    28.363636% { transform: rotateY(0); }
    32.727273% { transform: rotateY(180deg); }
    72.727273% { transform: rotateY(180deg); }
    77.090909% { transform: rotateY(360deg); }
    100.000000% { transform: rotateY(360deg); }
  }
  .panel:nth-child(6) { animation-name: panel-turn-5; }
  @keyframes panel-turn-5 {
    0.000000% { transform: rotateY(0); }
    32.727273% { transform: rotateY(0); }
    37.090909% { transform: rotateY(180deg); }
    77.090909% { transform: rotateY(180deg); }
    81.454545% { transform: rotateY(360deg); }
    100.000000% { transform: rotateY(360deg); }
  }
  .commit-reader, .commit-stream, .commit-focus, .commit-complete-ring, .editor-token, .editor-active-line, .editor-caret, .panel {
    animation-play-state: var(--loader-play-state, running); }
  @media (prefers-reduced-motion: reduce) {
    .commit-reader, .commit-stream, .commit-focus, .commit-complete-ring, .editor-token, .editor-active-line, .editor-caret, .panel { animation: none; }
    .commit-stream { transform: translateY(210px); }
    .still-focus { opacity: 1; }
    .panel:nth-child(even) { transform: rotateY(180deg); }
  }
</style>
