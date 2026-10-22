# Runtime secrets

> [!IMPORTANT]
> Keep credentials out of source, browser bundles, logs, and generated reports.

## Browser boundary

The application has no files/Git or inference backend. Build-time variables
exposed to Vite are public bundle content, not secret storage. AI credentials
use an origin-local encrypted IndexedDB vault adapted from Operations. A dedicated
worker owns its non-extractable runtime key, authenticated records and approved
credentialed OpenAI requests. Saved connection profiles retain opaque entry IDs.
The ordinary chat/settings UI does not receive decrypted values for execution.
User entry, explicit Copy and one-time recovery-key presentation are the narrow
plaintext UI boundaries; temporary inputs and displays are cleared afterward.

Passwords use pinned Argon2id v19 with 64 MiB, three iterations and parallelism
one. AES-256-GCM encrypts records and authenticated inventories with fresh IVs
and bound context. Independent password, recovery and optional WebAuthn PRF
envelopes wrap the same vault key. Native Web Crypto and hash-wasm execute in the
worker. Validate bounds before cryptography or allocation. Atomic storage
revisions and durable lock counters reject stale sessions across browser tabs.
Reload/page exit/Lock terminate access; switching browser tabs preserves it.
Optional trusted-activity idle locking starts disabled. No automatic request
replay occurs after cancellation or unlocking.

Credentialed inference is pinned to owned OpenAI HTTPS paths and Bearer placement.
Refuse redirects and omit cookies, referrers and caching. Bound and sanitize output
before worker replies; known credential echoes stop streaming even when split
across events. Fixed errors do not carry request headers, native causes or raw
provider diagnostics. This does not identify arbitrary encodings or newly issued
remote secrets reliably.

Encrypted exports protect against browser storage loss; independent recovery
protects a forgotten password. Replacing a vault authenticates both snapshots.
Key rotation cannot revoke already stolen exports or provider tokens. Storage is
origin-local, not synchronized by a passkey. Workers reduce accidental exposure
and main-thread processing but are not a security principal. The vault cannot
protect against malicious same-origin code, extensions or a compromised device;
JavaScript cannot guarantee physical memory erasure.

Existing Git-upstream token profiles remain separately encrypted by their
implemented connection flow. Do not silently migrate or retrieve those tokens.
Neither system places secrets in source repositories, settings/application
history, private file history, bundles, logs or reports. Only newly supplied keys
may be used for live provider tests; ordinary tests use synthetic credentials.

## Automation boundary

GitHub App and Cloudflare credentials belong in configured Actions secrets;
non-secret enablement and resource configuration belong in repository variables
or the owning deployment configuration. Example files carry names, not values.
Creating local automation files does not provision credentials or authorize
remote writes. Production and diagnostic output must not reveal secret values.

## Review trigger

Review this boundary before adding authentication, introducing a client-exposed
build variable, or changing automation permissions or credential handling.
