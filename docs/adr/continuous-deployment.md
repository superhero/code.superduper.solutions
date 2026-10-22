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

The repository contains adapted workflows and deployment helpers, not a
provisioned deployment. `CODE_AUTOMATION_ENABLED=true` and configured GitHub App
and Cloudflare credentials/resources are required for mutating automation.
The default remains disabled, and this local setup performs no publication.

Provision the editor's own Pages project, report bucket, domains, branch rules,
and credentials before enabling automation. Operations' deployed resources and
secrets are not shared implicitly. Publish the complete validated 11-file
application artifact: the bundled HTML, hosting metadata and nine generated
favicon files. The metadata carries the isolation headers required by the
selected browser model; hosted favicon URLs preserve browser and crawler
fallbacks. Do not deploy the HTML alone. The [build guide](../../build/README.md)
owns the distribution contract.
