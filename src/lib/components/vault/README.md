# Vault page

`VaultPage.svelte` presents guarded key/value management as the **Vault** main
page, selected from the first header's second (Page) dropdown. Keep this page
independent of AI or Git panes; the reusable vault service belongs to
[`$lib/secrets`](../../secrets/README.md).

Mount only while Vault is selected. Unmounting clears sensitive inputs and the
one-time recovery display, aborts unfinished management, and locks unfinished
recovery ceremonies. Leaving a completed vault view keeps normal access available
until explicit lock, reload, page exit or an enabled idle deadline. Page selection
is ordinary workspace metadata; credential values and form drafts never enter it.

Retain shared controls, semantic palette fills, native guarded inputs and the
existing recovery/passkey/encrypted backup/restore behavior. The optional change
callback refreshes consumers' public key metadata without exposing secret values.
