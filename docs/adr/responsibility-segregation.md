# Responsibility segregation

> [!IMPORTANT]
> Separate artifacts by responsibility while keeping closely related behavior together.

## Decision

Svelte components own presentation. Focused library modules own domain behavior
and browser services. Development adapters own tooling-specific integration.
Automation scripts own delivery mechanics; workflows compose them. Tests
exercise observable contracts, and ADRs explain their rationale.

Repository content belongs in its browser filesystem; repository indexes,
preferences, and editor state have separate ownership. Avoid a second mutable
copy of working files in application metadata.

## Consequences

A change has a discoverable owner and a proportionate validation path. Do not
split tightly coupled behavior into artificial layers or place unrelated logic
in a catch-all utility file.
