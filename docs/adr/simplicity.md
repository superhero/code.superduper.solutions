# Simplicity

> [!IMPORTANT]
> Prefer the smallest clear solution that completely meets the agreed requirement.

## Decision

Use focused responsibilities, familiar tools, and readable code. Reuse the
shared foundation before adding equivalent dependencies or abstractions.
Complete requested repository infrastructure alongside application features;
simplicity does not justify omitting required tooling.

## Presentation

Introduce visible controls with the feature that needs them, using concise
labels and progressive disclosure. Repository editing, history, and settings
have distinct views with shared controls. Development
diagnostics remain available without becoming production product UI.

## Consequences

The repository maintains complete build, test, licensing, and delivery support
as editor features evolve. Additional architecture must earn its complexity
through a concrete responsibility and verifiable outcome.
