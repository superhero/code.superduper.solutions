<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import NavigationDropdown from "$lib/components/NavigationDropdown.svelte";
  import { vaultCall as requestVault, readVaultKeys, lockVault, subscribeVaultLock, loadVaultPreferences, saveVaultPreferences, vaultCeremony } from "$lib/secrets/client";
  import type { VaultArguments, VaultMethod, VaultResult } from "$lib/secrets/protocol";
  import { enrollPasskey, unlockPasskey } from "$lib/secrets/passkeys";
  import { defaultVaultPreferences, safeVaultError, vaultLimits, type VaultStatus, type VaultKey, type UnlockProof } from "$lib/secrets/types";
  let { onchange = () => {}, embedded = false }: { onchange?: () => void; embedded?: boolean } = $props();
  let status = $state<VaultStatus>({ exists: false, unlocked: false, revision: 0, epoch: 0, methods: [] });
  let entries = $state.raw<VaultKey[]>([]), busy = $state(false), failure = $state(""), notice = $state("");
  let panel = $state<HTMLDivElement>(), recoveryOutput = $state<HTMLPreElement>();
  let recoveryMode = $state<"create" | "rotate" | null>(null), recoverySaved = $state(false);
  let editing = $state(""), label = $state(""), kind = $state("secret"), deleting = $state("");
  let preferences = $state({ ...defaultVaultPreferences }), importName = $state("");
  let restorePayload = "", generation = 0, disposed = false;
  const viewAbort = new AbortController();
  const vaultCall = <M extends VaultMethod>(method: M, args: VaultArguments<M>): Promise<VaultResult<M>> => requestVault(method, args, viewAbort.signal);
  const keyKinds = [{ value: "secret", label: "Guarded value", icon: "key" }, { value: "bearer", label: "Bearer token", icon: "vpn_key" }, { value: "apiKey", label: "API key", icon: "key" }];
  function take(name: string): string {
    const input = panel?.querySelector<HTMLInputElement>(`[name="${name}"]`), value = input?.value ?? "";
    if (input) input.value = ""; return value;
  }
  function clearSensitive() { panel?.querySelectorAll<HTMLInputElement>("[data-vault-sensitive]").forEach(input => input.value = ""); }
  function clearRecovery() { if (recoveryOutput) recoveryOutput.textContent = ""; recoveryMode = null; recoverySaved = false; }
  function locked() {
    generation++; clearSensitive(); clearRecovery(); restorePayload = ""; importName = ""; status = { ...status, unlocked: false }; busy = false;
    onchange();
  }
  async function refresh() {
    const expected = generation, next = await vaultCall("status", []), keys = await readVaultKeys();
    if (disposed || expected !== generation) return;
    status = next; entries = keys.entries.toSorted((a, b) => a.label.localeCompare(b.label)); onchange();
  }
  async function run(action: () => Promise<void>) {
    if (busy) return; const expected = generation; busy = true; failure = ""; notice = "";
    try { await action(); } catch (error) { if (!disposed && expected === generation) failure = safeVaultError(error).message; }
    finally { clearSensitive(); if (!disposed && expected === generation) busy = false; }
  }
  const proof = (name = "authenticate"): UnlockProof => ({ methodId: "auto", secret: take(name) });
  const wipe = (value: UnlockProof) => { if ("secret" in value) value.secret = ""; else value.prf.fill(0); };
  function download(text: string, filename: string, type = "text/plain") {
    const url = URL.createObjectURL(new Blob([text], { type })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function showRecovery(value: string, mode: "create" | "rotate") {
    recoveryMode = mode; recoverySaved = false; await tick();
    if (recoveryOutput && !disposed) recoveryOutput.textContent = value;
  }
  async function create() {
    let password = take("create-password"), confirmation = take("confirm-password");
    if (password.length < 3 || password !== confirmation) { password = ""; confirmation = ""; failure = "Enter matching passwords with at least 3 characters."; return; }
    confirmation = "";
    try { let recovery = await vaultCall("prepareCreate", [password]); try { await showRecovery(recovery, "create"); } finally { recovery = ""; } }
    finally { password = ""; }
  }
  async function confirmRecovery() {
    let recovery = recoveryOutput?.textContent ?? "";
    try { if (recoveryMode === "create") await vaultCall("confirmCreate", [recovery]);
      download(recovery + "\n", "code-vault-recovery-key.txt"); clearRecovery(); await refresh(); notice = "Vault ready. Keep the downloaded recovery key safe.";
    } finally { recovery = ""; }
  }
  async function unlock() {
    const value: UnlockProof = { methodId: "auto", secret: take("unlock") };
    try { await vaultCall("unlock", [value]); await refresh(); } finally { wipe(value); }
  }
  async function passkeyUnlock(method: VaultStatus["methods"][number]) {
    if (!method.credentialId || !method.prfSalt) return;
    const prf = await vaultCeremony(signal => unlockPasskey({ credentialId: method.credentialId!, prfSalt: method.prfSalt! }, AbortSignal.any([signal, viewAbort.signal])));
    try { await vaultCall("unlock", [{ methodId: method.id, prf }]); await refresh(); } finally { prf.fill(0); }
  }
  async function saveValue() {
    const input = { ...(editing ? { id: editing } : {}), label, kind: kind as VaultKey["kind"], value: take("credential-value") };
    try { await vaultCall("put", [null, input]); editing = ""; label = ""; await refresh(); notice = "Value saved."; } finally { input.value = ""; }
  }
  async function copyValue(id: string) {
    let value = await vaultCall("copyCredential", [id]); try { await navigator.clipboard.writeText(value); notice = "Value copied."; } finally { value = ""; }
  }
  async function changePassword() {
    const authentication = proof(), material = { kind: "password" as const, secret: take("new-password") };
    let confirmation = take("new-password-confirm");
    try {
      if (material.secret.length < 3 || material.secret !== confirmation) { failure = "Enter matching passwords with at least 3 characters."; return; }
      await vaultCall("addMethod", [authentication, material, status.methods.find(method => method.kind === "password")?.id]); await refresh(); notice = "Password changed.";
    } finally { wipe(authentication); material.secret = ""; confirmation = ""; }
  }
  async function addPasskey() {
    const authentication = proof();
    try { const material = await vaultCeremony(signal => enrollPasskey(AbortSignal.any([signal, viewAbort.signal]))); try { await vaultCall("addMethod", [authentication, material]); await refresh(); } finally { material.prf.fill(0); } }
    finally { wipe(authentication); }
  }
  async function importVault() {
    const currentProof = status.exists ? proof("import-current-authenticate") : undefined, importedProof = { methodId: "auto", secret: take("import-authenticate") };
    try { await vaultCall("restore", [restorePayload, importedProof, currentProof]); restorePayload = ""; importName = ""; await refresh(); notice = "Encrypted vault imported."; }
    finally { if (currentProof) wipe(currentProof); wipe(importedProof); }
  }
  async function rotate() {
    const proofs: UnlockProof[] = [];
    try {
      for (const method of status.methods.filter(entry => entry.kind !== "recovery")) {
        if (method.kind === "password") proofs.push({ methodId: method.id, secret: take(`rotate-${method.id}`) });
        else if (method.credentialId && method.prfSalt) proofs.push({ methodId: method.id, prf: await vaultCeremony(signal => unlockPasskey({ credentialId: method.credentialId!, prfSalt: method.prfSalt! }, AbortSignal.any([signal, viewAbort.signal]))) });
      }
      const result = await vaultCall("rotate", [proofs]); let recovery = result.recovery;
      try { await showRecovery(recovery, "rotate"); } finally { result.recovery = ""; recovery = ""; }
      await refresh();
    } finally { proofs.forEach(wipe); }
  }
  onMount(() => { const unsubscribe = subscribeVaultLock(locked); void run(async () => { preferences = await loadVaultPreferences(); await refresh(); }); return unsubscribe; });
  onDestroy(() => { disposed = true; generation++; clearSensitive(); viewAbort.abort(); if (recoveryMode) void lockVault().catch(() => {}); clearRecovery(); restorePayload = ""; });
</script>

<div id="panel-vault" class="vault-view" bind:this={panel} role="region" aria-label="Vault" tabindex="-1">
  {#if !embedded || status.unlocked || recoveryMode}<div class="view-heading">{#if !embedded}<h3><MaterialIcon name="shield_locked" size={18} />Vault</h3>{/if}
    {#if status.unlocked || recoveryMode}<Button size="sm" variant="ghost" onclick={() => void lockVault().catch(error => failure = safeVaultError(error).message)}><MaterialIcon name="lock" size={16} />Lock vault</Button>{/if}</div>{/if}
  {#if failure}<p class="failure" role="alert">{failure}</p>{/if}
  {#if notice}<p role="status">{notice}</p>{/if}
  {#if recoveryMode}
    <section class="card"><h4>Save your recovery key</h4><p>This key can unlock the vault if you forget your password.</p>
      <pre class="recovery" bind:this={recoveryOutput} aria-label="Recovery key"></pre>
      <Button size="sm" variant="ghost" onclick={() => void run(async () => { await navigator.clipboard.writeText(recoveryOutput?.textContent ?? ""); })}>Copy recovery key</Button>
      <label class="check"><input type="checkbox" bind:checked={recoverySaved} />I will keep my recovery key safe</label>
      <Button disabled={busy || !recoverySaved} onclick={() => void run(confirmRecovery)}>Download recovery key and continue</Button>
    </section>
  {:else if !status.exists}
    <form class="card" onsubmit={event => { event.preventDefault(); void run(create); }}><h4>Create vault</h4>
      <label>Password<input name="create-password" aria-label="Vault password" type="password" autocomplete="new-password" required minlength="3" data-vault-sensitive /></label>
      <label>Confirm password<input name="confirm-password" aria-label="Confirm vault password" type="password" autocomplete="new-password" required minlength="3" data-vault-sensitive /></label>
      <Button type="submit" variant="secondary" size="sm" disabled={busy}>Create vault</Button>
    </form>
  {:else if !status.unlocked}
    <form class="card" onsubmit={event => { event.preventDefault(); void run(unlock); }}><h4>Unlock vault</h4>
      <label>Password or recovery key<input name="unlock" aria-label="Vault password or recovery key" type="password" autocomplete="current-password" required data-vault-sensitive /></label>
      <Button type="submit" disabled={busy}>Unlock vault</Button>
      {#each status.methods.filter(method => method.kind === "passkey") as method}<Button disabled={busy} variant="ghost" onclick={() => void run(() => passkeyUnlock(method))}>Unlock with passkey</Button>{/each}
    </form>
  {/if}
  {#if !recoveryMode}
    <section class="card"><h4>Guarded values <span class="count">{entries.length}</span></h4>
      {#each entries as entry (entry.id)}<div class="entry"><div class="entry-name"><strong>{entry.label}</strong><span>••••••••</span></div>
        <Button size="icon-sm" variant="ghost" aria-label={`Copy ${entry.label}`} tooltip="Copy value" disabled={busy || !status.unlocked} onclick={() => void run(() => copyValue(entry.id))}><MaterialIcon name="content_copy" size={16} /></Button>
        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${entry.label}`} tooltip="Replace value" disabled={busy || !status.unlocked} onclick={() => { editing = entry.id; label = entry.label; kind = entry.kind; }}><MaterialIcon name="edit" size={16} /></Button>
        <Button size="icon-sm" variant="ghost" aria-label={`Delete ${entry.label}`} tooltip="Delete value" disabled={busy || !status.unlocked} onclick={() => deleting = deleting === entry.id ? "" : entry.id}><MaterialIcon name="delete" size={16} /></Button>
      </div>
      {#if deleting === entry.id}<div class="actions"><span>Delete {entry.label}?</span><Button size="sm" disabled={busy} onclick={() => void run(async () => { await vaultCall("remove", [null, entry.id]); deleting = ""; await refresh(); })}>Delete value</Button><Button size="sm" variant="ghost" onclick={() => deleting = ""}>Cancel</Button></div>{/if}
      {/each}
      {#if !entries.length}<p>No guarded values saved.</p>{/if}
      {#if status.unlocked}<form class="value-form" onsubmit={event => { event.preventDefault(); void run(saveValue); }}>
        <h4>{editing ? "Replace guarded value" : "Add guarded value"}</h4>
        <label>Key<input aria-label="Vault key name" bind:value={label} required maxlength="120" autocomplete="off" /></label>
        <NavigationDropdown label="Value kind" value={kind} placeholder="Value kind" items={keyKinds} onchange={value => kind = value} />
        <label>Value<input name="credential-value" aria-label="Secret value" type="password" autocomplete="off" required data-vault-sensitive /></label>
        <div class="actions"><Button type="submit" disabled={busy}>Save value</Button>{#if editing}<Button variant="ghost" onclick={() => { editing = ""; label = ""; take("credential-value"); }}>Cancel</Button>{/if}</div>
      </form>{/if}
      <p class="hint">Key names remain visible while locked. Values are encrypted outside repositories and history.</p>
    </section>
    <section class="card"><h4>Backup and restore</h4>
      <Button disabled={busy || !status.exists} size="sm" variant="ghost" onclick={() => void run(async () => download(await vaultCall("backup", []), "code-vault.encrypted.json", "application/json"))}><MaterialIcon name="download" size={16} />Export encrypted vault</Button>
      <label>Import encrypted vault<input type="file" accept=".json,application/json" aria-label="Import encrypted vault" disabled={busy} onchange={event => { const file = event.currentTarget.files?.[0]; if (file) void run(async () => { if (file.size > vaultLimits.backupBytes) throw new Error(); restorePayload = await file.text(); importName = file.name; }); event.currentTarget.value = ""; }} /></label>
      {#if importName}<form onsubmit={event => { event.preventDefault(); void run(importVault); }}><p>{importName}</p>
        <label>Imported vault password or recovery key<input name="import-authenticate" type="password" autocomplete="off" required data-vault-sensitive /></label>
        {#if status.exists}<label>Current vault password or recovery key<input name="import-current-authenticate" type="password" autocomplete="current-password" required data-vault-sensitive /></label>{/if}
        <Button type="submit" disabled={busy}>Import and unlock vault</Button>
      </form>{/if}
    </section>
    {#if status.unlocked}<section class="card"><h4>Locking</h4>
      <label class="check"><input type="checkbox" bind:checked={preferences.idleLockEnabled} onchange={event => { preferences.idleLockEnabled = event.currentTarget.checked; void run(() => saveVaultPreferences(preferences)); }} />Lock after inactivity</label>
      {#if preferences.idleLockEnabled}<label>Minutes<input type="number" min="1" max="10080" bind:value={preferences.idleLockMinutes} onchange={() => void run(() => saveVaultPreferences(preferences))} /></label>{/if}
      <p class="hint">Reloading or leaving the page locks the vault. Switching browser tabs keeps it unlocked.</p>
    </section>
    <details class="card"><summary>Unlock methods</summary><div class="details-content">
      <label>Current password or recovery key<input name="authenticate" type="password" autocomplete="current-password" data-vault-sensitive /></label>
      <label>New password<input name="new-password" type="password" autocomplete="new-password" data-vault-sensitive /></label>
      <label>Confirm new password<input name="new-password-confirm" type="password" autocomplete="new-password" data-vault-sensitive /></label>
      <div class="actions"><Button size="sm" disabled={busy} onclick={() => void run(changePassword)}>Change password</Button><Button size="sm" variant="ghost" disabled={busy} onclick={() => void run(addPasskey)}>Add passkey</Button></div>
      {#each status.methods as method}<div class="actions"><span>{method.kind === "passkey" ? "Passkey" : method.kind === "password" ? "Password" : "Recovery key"}</span>
        {#if method.kind === "passkey"}<Button variant="ghost" size="sm" disabled={busy} onclick={() => void run(async () => { const authentication = proof(); try { await vaultCall("removeMethod", [authentication, method.id]); await refresh(); } finally { wipe(authentication); } })}>Remove passkey</Button>{/if}</div>{/each}
    </div></details>
    <details class="card"><summary>Rotate encryption key</summary><form class="details-content" onsubmit={event => { event.preventDefault(); void run(rotate); }}>
      <p>Authenticate each retained unlock method. Rotation generates a new recovery key.</p>
      {#each status.methods.filter(method => method.kind === "password") as method}<label>Password<input name={`rotate-${method.id}`} type="password" autocomplete="current-password" required data-vault-sensitive /></label>{/each}
      <Button type="submit" disabled={busy}>Rotate vault encryption key</Button>
    </form></details>{/if}
  {/if}
  {#if busy}<p role="status">Working…</p>{/if}
</div>

<style>
  .vault-view { flex: 1; min-width:0; min-height: 0; overflow: auto; padding: var(--pane-gap); display: flex; flex-direction: column; gap: var(--pane-gap); overscroll-behavior: contain; font-size: .75rem; }.card { flex-shrink: 0; }
  .view-heading, .actions, .entry { display: flex; align-items: center; gap: 8px; }.view-heading { justify-content: space-between; }h3 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: .875rem; }h4 { margin: 0; font-size: .75rem; }h3, h4 { font-weight: 700; }
  .card { min-width:0; background: var(--color-surface); padding: var(--pane-padding); border-radius: 4px; display: grid; gap: 12px; }.details-content, form { display: grid; gap: 12px; }.details-content { margin-top: var(--pane-padding); }.value-form { margin-top: 8px; }p { margin: 0; line-height: 1.6; }label { display: grid; gap: 6px; font-size: .6875rem; }
  input:not([type="checkbox"]) { min-width: 0; width: 100%; padding: 9px 11px; border: 0; border-radius: 4px; background: var(--color-background); color: inherit; font: inherit; }input[type="file"] { font-size: .6875rem; }input[type="checkbox"] { accent-color: var(--color-primary); }.check { display: flex; align-items: center; gap: 8px; }
  input[type="file"]::file-selector-button { padding:0; margin-right:8px; border:0; background:transparent; color:inherit; font:inherit; cursor:pointer; }
  input[type="file"]:disabled::file-selector-button { cursor:not-allowed; }
  @media (hover:hover) { input[type="file"]:hover:not(:disabled) { color:var(--color-hover-foreground); } }
  .entry-name { display: grid; gap: 5px; flex: 1; min-width: 0; overflow-wrap: anywhere; }.entry-name span, .hint { font-size: .6875rem; opacity: .65; }.entry { gap: 3px; }.actions { flex-wrap: wrap; }.actions > span { flex: 1; }.recovery { white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; background: var(--color-background); border-radius: 4px; font: .6875rem/1.6 "JetBrains Mono", monospace; user-select: all; }
  .count { opacity: .6; margin-left: 8px; }.failure { margin: 0; padding: 12px; background: var(--color-error-background); color: var(--color-error-foreground); border-radius: 4px; }.card :global(.navigation-trigger) { padding: 8px 10px; background: var(--color-background); }summary { cursor: pointer; font-weight: 650; }
  .check input { appearance: none; position: relative; width: 32px; flex: 0 0 32px; height: 19px; border: 0; border-radius: 20px; background: var(--color-background); cursor: pointer; }
  .check input::before { content: ""; position: absolute; width: 11px; height: 11px; top: 4px; left: 4px; background: var(--color-foreground); border-radius: 50%; transition: transform 100ms ease-in; }
  .check input:checked { background: var(--color-foreground); }.check input:checked::before { transform: translateX(13px); background: var(--color-background); }
  .check:has(:focus-visible) { background: var(--color-focus-background); color: var(--color-focus-foreground); border-radius: 4px; }
  @container vault-pane (max-width:360px) { .entry { flex-wrap:wrap; }.entry-name { flex-basis:100%; } }
  @media (prefers-reduced-motion: reduce) { .check input::before { transition: none; } }
</style>
