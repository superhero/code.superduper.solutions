# Optional upstream connections and browser Git transport

> [!IMPORTANT]
> Install provider SDKs explicitly, keep credentials outside history, and use direct Git HTTPS or an explicitly configured trusted CORS relay without introducing an editor backend.

## Context

The developer requested installable GitHub, GitLab and Bitbucket JavaScript
libraries, complete remote Git workflows, and a unified interface, with no real
remote writes during implementation validation. The existing local Git engine
already supplies staging, commits, branch integration, conflicts, recovery and
separate private editor history. Provider REST APIs support browsing and hosted
collaboration, but do not provide a complete byte-preserving Git clone or remove
the Git host's browser CORS restrictions.

## Decision

Package pinned Octokit, GitBeaker and Bitbucket.js adapters as three separate
verified static artifacts. Reuse the shared IndexedDB package registry and notice
inventory. Installing a library neither authenticates nor contacts its upstream.
Personal connection profiles support cloud providers and GitHub/GitLab custom
hosts. Tokens default to memory; remembered credentials are passphrase-encrypted
outside settings, source files and both private histories. No OAuth client secret
or token is embedded in the application.

Use the existing isomorphic-git worker and IndexedDB filesystem for complete Git
clone/fetch/push. Direct HTTPS is available only where the Git server permits
browser CORS. GitHub and other restrictive Git hosts require a user-selected,
trusted, isomorphic-git compatible relay. No public relay is assumed, provisioned
or silently substituted. API requests stay direct and credentials remain scoped
to their configured origin. Refuse credentialed redirects and URL credentials.
The explicit relay is separately operated infrastructure; the editor retains no
application backend. This resolves the earlier unspecified transport choice,
without claiming direct browser Git works on every provider.

Preserve all advertised branches/tags and complete reachable history on clone.
Never substitute source archives or shallow/single-branch downloads. Clone only
publishes after validating historical objects and initializing independent private
file history. Fetch and push use scratch control files and the existing durable
journal. Recovery applies local receipts and never resends a network command.
Pull invokes the existing merge/rebase/conflict engine. Push requires reviewed
refs; replacement uses a checked lease and receive-pack's atomic old-OID compare.
Private editing refs are not publish targets. Cancellation cannot undo an upstream
write already accepted by its server.

Expose provider browsing, upstream repository creation/forks, requests, issues and
checks alongside synchronization. Writes require explicit UI actions and are not
automatically retried. GitHub/GitLab review merges use their head-SHA precondition;
Bitbucket only supports an immediate reread and its server's merge rules. Retain
that limitation explicitly rather than inventing an atomic API guarantee.

## Status and consequences

Implemented and verified with local Git fixtures, intercepted-provider browser
workflows and production packaging checks. Live provider write tests are
deliberately excluded. Account scopes, protected-branch policies and deployed
transport CORS remain account/infrastructure configuration, not properties proven
by mocks. SSH, Git LFS transfers, OAuth registration/refresh and Bitbucket Data
Center are outside the implemented HTTPS/token-provider boundary. The existing
repository symlink/submodule restrictions remain unchanged.
