<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount } from "svelte";
  import EditorialLoader from "./EditorialLoader.svelte";
  import MechanicalLoader from "./MechanicalLoader.svelte";
  import DraftingLoader from "./DraftingLoader.svelte";
  import { startupProgress, type StartupStage, type StartupStatus } from "../../startup-progress.ts";

  let presented = $state<string[]>([]);
  let finished = 0;
  const presentationWaiters = new Set<() => void>();
  export function waitUntilPresented(): Promise<void> {
    if (finished === $startupProgress.stages.length) return Promise.resolve();
    return new Promise(resolve => presentationWaiters.add(resolve));
  }
  onMount(() => {
    const queued = new Set<string>();
    const queue: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let busy = false;
    function advance() {
      if (busy || !queue.length) return;
      busy = true;
      presented = [...presented, queue.shift()!];
      frame = requestAnimationFrame(() => {
        timer = setTimeout(() => {
          timer = undefined;
          busy = false;
          finished++;
          if (finished === $startupProgress.stages.length) {
            for (const resolve of presentationWaiters) resolve();
            presentationWaiters.clear();
          }
          advance();
        }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160);
      });
    }
    const unsubscribe = startupProgress.subscribe(progress => {
      for (const stage of progress.stages) {
        if (!queued.has(stage.id) && (stage.status === "complete" || stage.status === "skipped")) {
          queued.add(stage.id);
          queue.push(stage.id);
        }
      }
      advance();
    });
    return () => { unsubscribe(); cancelAnimationFrame(frame); clearTimeout(timer); };
  });

  const statusLabels: Record<StartupStatus, string> = {
    pending: "Waiting", running: "In progress", complete: "Ready", skipped: "Not needed", error: "Could not complete",
  };

  /** Follow actual work on compact screens; animations never advance progress. */
  function compactStages(stages: StartupStage[]): string[] {
    const active = stages.filter(stage => stage.status === "running" || stage.status === "error");
    const upcoming = stages.filter(stage => stage.status === "pending");
    const finished = stages.filter(stage => stage.status === "complete" || stage.status === "skipped").reverse();
    return [...active, ...upcoming, ...finished].map(stage => stage.id);
  }

  const compactOrder = $derived(compactStages($startupProgress.stages));
  const currentStage = $derived($startupProgress.stages.find(stage => stage.status === "error")
    ?? $startupProgress.stages.find(stage => stage.status === "running")
    ?? $startupProgress.stages.find(stage => stage.status === "pending"));
  const announcement = $derived(currentStage
    ? `${currentStage.title}: ${statusLabels[currentStage.status]}`
    : "Workspace ready");
</script>

<main class="gallery" aria-label="Loading progress">
  <header>
    <h1 class="wordmark">code.</h1>
    <p class="subtitle">A HEADLESS BROWSER IDE</p>
  </header>
  <p id="startup-stage" class="screen-reader" aria-live="polite" aria-atomic="true">{announcement}</p>
  <section class="studies" aria-label="Startup stages">
    {#each $startupProgress.stages as study, i (study.id)}
      {@const priority = compactOrder.indexOf(study.id)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <article tabindex="0" aria-labelledby={`startup-${study.id}`} data-stage={study.id} data-status={study.status}
        class:presented={presented.includes(study.id)} class:compact-visible={priority < 4} class:compact-six={priority < 6} class:compact-eight={priority < 8}>
        <div class="stage">
          <svg class="drawing-frame" viewBox="0 0 190 105" aria-hidden="true">
            <foreignObject width="190" height="105">
            {#if study.kind === "typesetter" || study.kind === "brackets" || study.kind === "stack"}
              <EditorialLoader variant={study.kind} />
            {:else if study.kind === "storage" || study.kind === "pipeline" || study.kind === "folder"}
              <MechanicalLoader variant={study.kind} />
            {:else}<DraftingLoader variant={study.kind} />{/if}
            </foreignObject>
          </svg>
        </div>
        <span class="caption-number" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
        <div class="caption">
          <div class="caption-content">
            <h2 class="screen-reader" id={`startup-${study.id}`}>{study.title}</h2>
            <span class="caption-title" aria-hidden="true">{study.title}</span>
            <span class="screen-reader">{statusLabels[study.status]}</span>
          </div>
        </div>
      </article>
    {/each}
  </section>
  <footer>
    <p class="loading-label" aria-label="Loading">Loading<span class="loading-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></p>
  </footer>
</main>

<style>
  .gallery { --loader-accent: var(--palette-8); --loader-cycle: 3s;
    --loading-font-size: clamp(34px, 4vw, 46px);
    position: fixed; inset: 0; width: 100%; height: 100dvh; min-height: 0; max-width: 1256px; margin: 0 auto;
    padding: 20px 36px; overflow: clip; display: flex; flex-direction: column; gap: 24px; }
  header, footer { flex: none; }
  footer { text-align: right; }
  .wordmark, .loading-label { font-family: Rationale, sans-serif; font-weight: 400; line-height: 1; margin: 0; }
  .wordmark { font-size: calc(var(--loading-font-size) * .9); }
  .loading-label { font-size: var(--loading-font-size); }
  .loading-dots, .loading-dots span { display: inline-block; }
  .loading-dots span { animation: dot-first 3s ease-out infinite; }
  .loading-dots span:nth-child(2) { animation-name: dot-second; }
  .loading-dots span:nth-child(3) { animation-name: dot-third; }
  @keyframes dot-first {
    0%, 5% { opacity: 0; transform: translateY(.3em); }
    11.4% { opacity: 1; transform: translateY(-.1em); }
    13.4% { transform: translateY(.04em); }
    15.4%, 96% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(0); }
  }
  @keyframes dot-second {
    0%, 15% { opacity: 0; transform: translateY(.3em); }
    21.4% { opacity: 1; transform: translateY(-.1em); }
    23.4% { transform: translateY(.04em); }
    25.4%, 96% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(0); }
  }
  @keyframes dot-third {
    0%, 25% { opacity: 0; transform: translateY(.3em); }
    31.4% { opacity: 1; transform: translateY(-.1em); }
    33.4% { transform: translateY(.04em); }
    35.4%, 96% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(0); }
  }
  .subtitle { margin: 3px 0 0; font-size: 0.5625rem; font-weight: 700; letter-spacing: .16em; opacity: .75; }
  .studies { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: repeat(3, minmax(0, 1fr)); gap: 14px; }
  article { --pane-opacity: 25%; position: relative; overflow: clip; min-width: 0;
    background: color-mix(in srgb, color-mix(in srgb, var(--color-surface) 60%, var(--color-background)) var(--pane-opacity), transparent);
    transition: background-color 160ms ease-out;
    border-radius: 4px; display: flex; flex-direction: column; justify-content: center; min-height: 0; padding: 12px 20px 17px; }
  article.presented { --pane-opacity: 100%; }
  article:not(.presented):is(:hover, :focus-visible) { --pane-opacity: 50%; }
  article[data-status="pending"] .drawing-frame { opacity: .55; }
  article[data-status="error"] h2 { text-decoration: underline; text-underline-offset: 3px; }
  .stage { position: relative; flex: 1; min-height: 0; min-width: 0; overflow: clip; }
  /* SVG fits the same drawing on both axes before any application JavaScript. */
  .drawing-frame { position: absolute; top: 50%; left: 50%;
    width: max(0px, min(190px, calc(100% - 12px))); height: max(0px, min(105px, calc(100% - 12px)));
    transform: translate(-50%, -50%); }
  .caption { position: absolute; left: 50px; right: 20px; bottom: 12px;
    visibility: hidden; opacity: 0; transform: translateY(calc(100% + 20px));
    pointer-events: none;
    transition: transform 180ms ease-in, opacity 140ms ease-in, visibility 0s 180ms; }
  article:is(:hover, :focus-visible) .caption { visibility: visible; opacity: 1; transform: translateY(0);
    transition: transform 320ms cubic-bezier(.2, 1.5, .4, 1), opacity 120ms ease-out, visibility 0s; }
  .caption-number { position: absolute; left: 20px; bottom: 12px; font: 10px/1.62 ui-monospace, monospace;
    opacity: 0; visibility: hidden; transform: translateX(calc(-100% - 24px)); pointer-events: none;
    transition: transform 180ms ease-in, opacity 140ms ease-in, visibility 0s 180ms; }
  article:is(:hover, :focus-visible) .caption-number { opacity: .65; visibility: visible; transform: translateX(0);
    transition: transform 320ms cubic-bezier(.2, 1.5, .4, 1), opacity 120ms ease-out, visibility 0s; }
  .caption-content { min-width: 0; }
  h2, .caption-title { display: block; font-size: 0.75rem; line-height: 1.35; font-weight: 700; margin: 0; }
  .caption-title { opacity: .8; position: relative; top: -2px; left: -8px; }
  .screen-reader { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @media (max-height: 800px) {
    .gallery { --loading-font-size: 2.25rem; padding-block: 18px; gap: 16px; }
    article { padding-block: 6px 12px; }
  }
  @media (max-width: 900px), (max-height: 480px) {
    .gallery { padding: 20px; gap: 18px; }
    .studies { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 12px; }
    article { display: none; padding: 10px; }
    article.compact-visible { display: flex; }
    .caption { left: 40px; right: 10px; bottom: 8px; }
    .caption-number { left: 10px; bottom: 8px; }
    h2, .caption-title { font-size: 0.6875rem; }
  }
  /* More rows when height allows, including before JavaScript hydrates the page. */
  @media (max-width: 900px) and (min-height: 700px) {
    .studies { grid-template-rows: repeat(3, minmax(0, 1fr)); }
    article.compact-six { display: flex; }
  }
  @media (max-width: 900px) and (min-height: 900px) {
    .studies { grid-template-rows: repeat(4, minmax(0, 1fr)); }
    article.compact-eight { display: flex; }
  }
  @media (max-height: 440px) {
    .gallery { --loading-font-size: 1.75rem; padding: 12px; gap: 10px; }
    .subtitle { margin-top: 2px; font-size: 0.4375rem; }
    .studies { gap: 8px; }
    article { padding: 4px; }
    .caption { left: 30px; right: 4px; bottom: 4px; }
    .caption-number { left: 4px; bottom: 4px; font-size: 8px; }
    h2, .caption-title { font-size: 0.5625rem; line-height: 1.25; }
  }
  @media (prefers-reduced-motion: reduce) {
    article { transition: none; }
    .caption, .caption-number { transition: none; transform: none; }
  }
</style>
