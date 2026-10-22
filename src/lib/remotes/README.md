# Upstream integrations

The editor supports GitHub, GitLab (including self-managed instances), and
Bitbucket Cloud. It has no application backend. Install Octokit, GitBeaker or
Bitbucket.js in **Settings → Upstream connections**, then add a personal connection.
The three pinned, self-contained SDKs are optional static packages under
`remotes/`; the shared registry verifies their exact size and SHA-256 before
installation and again before execution. Full application and dependency notices
travel with every package and appear in Licenses and notices. No runtime CDN,
registry lookup or repository-supplied plugin executes.

## Authentication and connection setup

Use a scoped personal/API token. GitHub needs repository contents, pull requests
and issues permissions for the operations used; changing workflow files also
needs workflow permission. Organization SSO and repository roles still apply.
GitLab supports personal, project or group tokens with API/repository access.
Bitbucket uses scoped API tokens, not retired app passwords. Its API uses Bearer
authentication and its Git transport uses `x-bitbucket-api-token-auth` plus the
token. OAuth application registration, secret exchange and automatic refresh are
not part of these token connections.

Tokens default to this tab's memory. **Remember encrypted token** stores an
AES-256-GCM ciphertext in `code-remote-connections`, derived from an unsaved
passphrase with PBKDF2-SHA-256 (310,000 iterations and a random salt). Reloading
locks remembered connections. Removing a connection erases its local credential;
it does not revoke the upstream token. Connections, tokens, encryption keys and
network commands never enter repository files, ordinary Git configuration,
application settings history or private editor-history snapshots.

Hosted APIs are direct HTTPS requests, pinned to the connection's API origin and
base path. Credentials are omitted from URLs, browser cookies are excluded,
credentialed redirects are refused, JSON responses are bounded, requests time out,
and writes are never automatically retried. GitBeaker uses an owned requester to
avoid its default retry of some write failures. Errors exposed to the UI do not
retain SDK request objects or credential headers.

## Git transport and full history

REST APIs and JavaScript SDKs do not remove browser CORS restrictions on Git Smart
HTTP. Direct mode works only when the Git host allows the editor's browser origin.
GitHub's ordinary Git endpoint requires a CORS relay for browser access. Configure
an **isomorphic-git compatible trusted CORS relay** under the connection's Git
transport section. No public relay is preselected, deployed or silently contacted.
The relay receives Git credentials and repository data, so its operator must be
trusted. Its endpoint must accept `<relay>/<upstream-host>/<repository-path>` and
forward Git GET/POST requests, Authorization and Git content types, with CORS for
the editor origin. A relay is separately operated infrastructure, not a hidden
editor backend. Self-managed Git hosts can instead enable appropriate Git CORS.

Only HTTPS clone URLs without embedded credentials, query strings or fragments are
accepted. A connection token can be used only on that connection's host. Git HTTP
is further restricted to the selected repository's `info/refs`, upload-pack and
receive-pack endpoints. Neither imported `http.corsProxy` configuration nor an
unsafe fetch refspec can redirect credentials or rewrite local branch refs.

**Repository → Clone repository** provides account browsing, exact path/URL lookup,
full clone, optional initial branch, upstream repository creation and forks. Clone
fetches every advertised branch and tag with no depth, time or single-branch
restriction. Historical commits, trees and blobs are checked before publication;
an archive never substitutes for Git. Failed or cancelled unpublished clones are
removed. Existing filesystem limitations for symlinks and submodules remain
explicit errors. Git LFS pointers remain ordinary versioned files; no LFS download
or SSH transport is claimed.

## Git pane

**Remotes → Sync** manages remotes and tracking branches, fetch/prune, checkout of
remote branches, fast-forward/merge/rebase pull, branch/tag push and remote ref
deletion. Pull reuses the existing clean-tree checks, collision protection,
conflict sessions, local recovery refs and private file Undo/Redo. Fetch and push
do not reset editor selections or make file-history revisions.

Publishing always has a review step. The push checks the reviewed remote OID
against the receive-pack advertisement; the Git server then atomically compares
that old OID when accepting the update. Optional replacement uses this lease,
never an unconditional force. Replacement/deletion also requires typing the target
reference name. Only ordinary branch/tag refs are pushed; private editor-history
refs are never selected for publication. Source objects are shared immutably while
control-file changes are prepared in a scratch Git directory and published through
the normal durable journal. Recovery replays only local control files, never a
network operation. An interrupted upstream write may already have succeeded;
refresh remote refs before retrying.

**Requests**, **Issues** and **Checks** expose hosted review creation, comments,
approvals, merge/close, issue creation/comments/close and status/pipeline links.
GitHub and GitLab merge requests carry the reviewed head SHA. Bitbucket's merge
API has no equivalent SHA precondition; its adapter rereads the head immediately
before merging, but its server can still accept a concurrent update. Branch
protection and required approvals/checks remain authoritative upstream. Merging a
request changes the upstream; fetch/pull updates the browser repository afterward.

## Verification boundary

Cucumber source scenarios use injected API responses and a local `git http-backend`
process over stdin/stdout. They make no network requests and mutate only disposable
local Git fixtures. These cover SDK contracts, full-history cloning, safe fetch,
file Undo after pull, push/lease races, cancellation and crash recovery. Browser
scenarios use isolated storage and intercepted upstream requests. Packaging checks
verify optional separation, catalog hashes and notices. Real provider writes are
intentionally not tested; deployed CORS/relay behavior, account scopes, organization
policies and live write permissions must be checked with the user's accounts.

Primary contracts: [isomorphic-git clone](https://isomorphic-git.org/docs/en/clone),
[fetch](https://isomorphic-git.org/docs/en/fetch),
[push](https://isomorphic-git.org/docs/en/push),
[browser CORS](https://isomorphic-git.org/docs/en/faq),
[Octokit](https://github.com/octokit/rest.js),
[GitBeaker](https://github.com/jdalrymple/gitbeaker),
[Bitbucket.js](https://github.com/MunifTanjim/node-bitbucket),
[GitLab token authentication](https://docs.gitlab.com/api/rest/authentication/),
[Bitbucket API tokens](https://support.atlassian.com/bitbucket-cloud/docs/using-api-tokens/).
