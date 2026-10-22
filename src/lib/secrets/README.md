# Origin-local secrets vault

This is the editor adaptation of Operations' browser vault. Read the runtime
secrets ADR for its trust boundary. The implementation reference is
`/home/erik/Development/operations.superduper.solutions/src/lib/secrets/` and its
README, crypto/session/storage/lifecycle/passkey modules and source scenarios.
Those reference files and their browser data are not modified or read for keys.

## Ownership

Guarded values are managed in the global [Vault page](../components/vault/README.md),
selected from the main header's Page dropdown. Its presentation is independent
of AI and Git panes. Navigation remembers the selected view without storing
credential inputs or recovery material in workspace metadata.

`crypto.ts`, `format.ts`, `session.ts`, `storage.ts`, `key-index.ts`, `lifecycle.ts`
and `passkeys.ts` retain the reference's authenticated inventory, non-extractable
runtime key, bounded Argon2id profile, independent unlock envelopes, expected
storage revisions, recovery and locking semantics. The database, lock/channel
names, HKDF domain and passkey display name belong to Code. Workflow grants,
schema catalogs and generic execution are excluded. Guarded values support
Unicode; bearer/API-key kinds retain the reference's header-safe validation.

`protocol.ts`, `client.ts` and `vault.worker.ts` own a narrow allowlist. Normal
execution does not return a decrypted value to the page. Only explicit Copy does.
User-entered values and passwords are taken from unbound inputs, transferred to
the worker, then cleared; they are never stored in Svelte conversation state.
The one-time recovery display is another intentional plaintext UI boundary and
is cleared when confirmed, locked or unmounted.

`code-secrets-vault` stores encrypted snapshots, a public name/ID/kind index and
durable counters in IndexedDB. Key names are public and are not authorization.
Cryptography finishes before the atomic compare-and-swap write. Settings,
repositories, ordinary Git and private editor/application histories do not hold
these values. Idle preferences use a separate non-secret database. The existing
Git-upstream token profiles remain separate; this change does not migrate or
retrieve their credentials.

## Operations-derived lifecycle

Passwords use pinned hash-wasm 4.12.0 Argon2id v19 (64 MiB, three iterations,
parallelism one, 32-byte output) and random 16-byte salts. AES-256-GCM encrypts
values and inventories with fresh 96-bit IVs and authenticated record context.
Recovery and passkey PRF envelopes use domain-separated HKDF-SHA-256. Password,
one generated 128-byte recovery key and optional PRF-capable passkeys are
independent unlock methods. A passkey is enrolled only after a real PRF result.

Lock/reload/page exit terminate the worker and cancel requests. Switching browser
tabs preserves access. Optional idle locking starts disabled; trusted visible
activity and absolute deadlines follow Operations. Origin-wide notifications
terminate peers; durable counters reject stale or suspended sessions even if a
notification is missed. Writes invalidate active OpenAI requests in the owning
worker before changing credentials. API writes are never automatically retried.

Encrypted export works while locked. Import authenticates the imported snapshot
and any vault being replaced before atomic promotion. Changing a password
rewraps the vault key. Rotation authenticates every retained password/passkey,
re-encrypts records and generates a replacement recovery key. An older complete
valid export remains usable; rotation does not revoke remote API keys or old
exports. Losing all unlock methods makes the vault unrecoverable.

## Credentialed inference

The worker accepts only owned OpenAI model discovery and Responses chat actions.
It decrypts only the selected record, validates the request and injects Bearer auth at
the fixed `https://api.openai.com/v1` origin. Caller-supplied destinations,
headers, tools and redirects are not supported. Cookies, referrers and caching
are disabled. Output and parser buffers are bounded. Known credential echoes,
including URL/form encodings and echoes split across text deltas, stop the reply
before that credential crosses the worker boundary. Errors use fixed codes.

Streaming IPC is batched at 16ms; visible DOM updates are additionally batched per
animation frame. Durable storage checks run before dispatch, periodically during
streaming (at most one per 250ms), and on completion. The worker enforces the
absolute idle deadline independently. Raw model events and native errors do not
enter application logging. Unknown newly issued or arbitrarily encoded secrets
cannot be identified reliably.

This protects stored data while locked. It does not protect against malicious
same-origin code, extensions or a compromised device. Workers are not a separate
security principal, and JavaScript cannot guarantee physical erasure of strings.

## Verification

The production Chromium 155 fixtures retained one live DOM update for a
513-delta Ollama burst. The OpenAI worker fixture received 64 text deltas and
four total worker replies across discovery, successful completion and an echo
failure. These are structural batching observations under Playwright tracing,
not latency measurements. The last pre-vault core HTML was 9,708.65 kB
(3,952.62 kB gzip); this implementation is 9,812.93 kB (3,983.71 kB gzip),
including the new views and embedded worker. Argon2's 64 MiB working memory is
allocated in that worker on password use; no before/after timing gain is claimed.

`@ai-vault-source` scenarios use synthetic values and real cryptography with an
injectable memory store. `@ai-vault-ui` uses real browser workers, IndexedDB and
Argon2, intercepted OpenAI responses and isolated profiles. Chromium's virtual
PRF authenticator qualifies the browser bridge; physical and synced passkey
providers remain unverified. No real API key is retrieved or paid inference sent.
See [assistant](../assistant/README.md) for connection and manual testing details.
