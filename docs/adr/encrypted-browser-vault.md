# Encrypted browser vaults guard reusable AI credentials

> [!IMPORTANT]
> Adapt Operations' vault cryptography and lifecycle, keeping credential use in
> a dedicated browser worker and saved AI profiles limited to opaque key IDs.

## Context

The developer extended AI chat from local Ollama to OpenAI and requested saved
connections plus a viewport for guarded key/value management. Credentials must
remain outside repositories and both editing/application history. The verified
Operations vault already supplies an authenticated encrypted format, independent
unlock methods, recovery, locking and stale-session protection. The editor has
no application backend and must retain its own interface and shared controls.

## Decision

Reuse the reviewed crypto, format, session, storage, public-key index, lifecycle
and WebAuthn PRF approach. Pin the same Argon2id implementation and parameters.
Use a Code-specific database/channel/lock namespace and HKDF domain. Keep public
names advisory; resolve the requested entry against authenticated encrypted data.
No credentials are retrieved from the reference application or existing profiles.

Adapt the worker protocol to named vault management operations and owned OpenAI
model discovery/Responses chat. Do not import Operations' workflow execution or
schema approval models. Pin credentialed inference to the official HTTPS origin
and reviewed fields. Omit cookies, caching and referrers, refuse redirects, bound
responses, scrub known credential echoes and expose fixed error codes. Decrypt
only the selected record for inference and batch streaming IPC/render updates.
No generic decrypt or caller-supplied credentialed HTTP action is exposed.

The AI pane provides Connections alongside thread tabs. Vault management is an
independent sliding pane after History, Git and AI, before Resources. The toolbar
opens it without replacing the main view. Its visibility, opening
order and preferred width enter workspace metadata; form values never do.
Closing the pane unmounts its forms, clearing sensitive drafts and recovery
presentation and aborting unfinished management. Narrow windows retain the newest
pane beside the editor by closing older panes.
Each thread selects its own profile and model. Public connection profiles persist
separately, holding an entry ID rather than a value. Normal inference does not
return plaintext credentials to the page. User entry, explicit Copy and one-time
recovery presentation are deliberate, cleared UI boundaries.

## Consequences

Vault data is encrypted at rest in origin-local IndexedDB. Password, recovery
and optional PRF passkeys unlock independently. Reload/page exit/Lock end access;
browser-tab switching preserves it. Optional idle locking starts disabled.
Durable revisions and lock counters protect against missed peer notifications.
Mutations stop existing credentialed requests; cancellation never replays them.
Encrypted export/import and fresh-authentication method changes/rotation preserve
the reference's recovery contract.

Workers protect against accidental exposure and move costly processing off the
page; they are not a separate security principal. Same-origin malicious code,
extensions, compromised devices, memory erasure and arbitrary unknown secret
encodings remain outside that protection. Old complete exports and API tokens
are not revoked by local rotation. A vault is not synchronized by a passkey.
The earlier Git-upstream token flow remains separate without silent migration.

## Verification status

Focused source tests cover real cryptography, tampering, KDF bounds, independent
methods, rotation, stale sessions and request/stream validation. Browser tests
use real workers/IndexedDB/Argon2, synthetic keys and intercepted OpenAI streams.
Chromium virtual PRF behavior is tested; physical providers remain unverified.
Live OpenAI inference requires fresh user credentials and is not claimed by mocks.
The existing local Ornith flow is exercised separately without paid inference.
