# Continuous deployment

> [!IMPORTANT]
> Promote the artifact and reports from the validated release run, preserving their revision identity.

## Prepared delivery model

Cloudflare Pages hosts the static production application and branch previews;
R2 stores combined test and coverage reports. Development and release
integrations can publish previews. Release/hotfix PRs preview the tested head
before production integration. Documentation changes do not deploy.

Publication reuses validated artifacts without rebuilding. Production uses the
confirmed merge revision, verifies the tested/released trees, serializes
promotion, rejects superseded revisions, and reuses matching deployments on
retry. Branch synchronization follows the released revision.

## Current boundary

The repository contains adapted workflows and deployment helpers. The developer
authorized a manual Pages publication at `code.superduper.solutions`; this is
separate from activating the prepared release pipeline.
`CODE_AUTOMATION_ENABLED=true` and configured GitHub App and Cloudflare
credentials/resources are required for mutating automation. Its default remains
disabled; a manual deployment does not enable unrelated remote jobs.

Provision the editor's own Pages project, report bucket, domains, branch rules,
and credentials before enabling automation. Operations' deployed resources and
secrets are not shared implicitly. Publish the complete application artifact:
the eleven core files plus all optional package, language, syntax, type, remote,
and browser-runtime files. Large optional packages use verified static parts so
the complete product fits Pages' per-file limit without an application backend.
The developer explicitly selected Pages and `code.superduper.solutions` for the
first deployment; a manual publication does not activate release automation.
The Direct Upload project `code-superduper-solutions` serves the production
hostname through a proxied CNAME to `code-superduper-solutions.pages.dev`.
Keep Cloudflare email address obfuscation disabled for this hostname using its
hostname configuration rule: the default rewriting alters third-party author
credits inside the bundled notices. Preserve other hostnames' settings. Verify
the served HTML and packages against the candidate hashes after hosting changes,
then exercise the editor with the opt-in `pagesLive` and `pagesBehavior`
profiles described in the [browser test guide](../../tests/browser/README.md).
Its corresponding source must remain available when publishing a working-tree
build. Hosting metadata retains browser isolation headers, and hosted favicon
URLs preserve browser/crawler fallbacks. Do not deploy the HTML alone. The
[build guide](../../build/README.md) owns the distribution contract.
