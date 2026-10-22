# Continuous integration

> [!IMPORTANT]
> Reuse Operations' Gitflow validation, release preparation, and synchronization model, with remote automation disabled until explicitly provisioned and enabled.

## Branch contracts

Feature and integration bugfix branches flow into `develop`. Release branches
are prepared from development and validated for `main`; stabilization fixes
return to their release branch. Hotfixes start from a released `main` and use
the next patch version. Release and hotfix integration synchronizes `main`
back into development. Support branches retain their separate validation route.

## Updating documentation

Documentation-only branches have a constrained Markdown path and trusted-base
validation; they do not build or deploy the application. The prepared policy
file is not proof that the required repository event policy is installed.

## Validation and history

Validate branch policy, types, source/acceptance/automation/browser scenarios,
and explicitly scoped coverage. Preserve reviewed commit messages in the
Staging changelog before squash integration. Release preparation moves those
entries into the selected Semantic Version and validates that resulting tree.
Merge strategies and expected-revision guards prevent unreviewed branch drift.

## Activation boundary

Workflow files, helpers, policies, and tests are present locally. Mutating jobs
and documentation mutation steps require repository variable
`CODE_AUTOMATION_ENABLED` to equal the string `true`; absent or other values
keep them disabled. Scheduled dependency publication is also disabled by
default. Validation remains available without release credentials.

Enabling the variable is a separate operational decision after branches,
protections, GitHub App permissions, secrets, and required checks are configured.
It does not replace those prerequisites. Current authorization remains local
work without commits, pushes, merges, tags, or deployment.
