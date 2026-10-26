# Vault pane

`VaultPanel.svelte` hosts guarded value management in the sliding dock,
after History, Git and AI and before Resources. Open it with the editor toolbar's
Vault button. It remains independent of the selected
repository, AI connections and main view. The shared Sheet pane and WidthDivider
provide motion, reduced motion, closing focus and resizing. Workspace metadata
retains only its visibility, opening/selection order and preferred width; narrow windows
close older panes to keep the editor and newest pane visible.

`VaultPage.svelte` owns the forms and existing vault service presentation. Mount
it only while the pane is open. Unmounting clears sensitive inputs and the
one-time recovery display, aborts unfinished management, and locks unfinished
recovery ceremonies. Closing a completed vault view keeps normal access available
until explicit lock, reload, page exit or an enabled idle deadline. Credential
values and form drafts never enter workspace metadata or repository history.

Retain shared controls, semantic palette fills, native guarded inputs and the
existing recovery/passkey/encrypted backup/restore behavior. The optional change
callback refreshes consumers' public key metadata without exposing secret values.
The reusable vault service belongs to [`$lib/secrets`](../../secrets/README.md).
