# Test suites and reports

> [!IMPORTANT]
> Every independently evaluated case belongs in the combined Cucumber report, with coverage claims limited to their explicit source scope.

## Suite boundaries

Use four Cucumber profiles: source behavior, built-artifact acceptance,
automation behavior, and browser behavior. Playwright drives browser steps;
helpers and shell scripts remain implementation details of named scenarios.
Do not hide unrelated independent tests behind one aggregate scenario or keep
standalone checks outside the report while claiming complete scenario counts.

## Reporting

Each profile writes Cucumber JSON. A complete offline HTML report and scenario
badge require fresh unfiltered results from all four profiles. Missing, invalid,
skipped, or unfinished input does not certify success. CI may retain partial
diagnostics after failure, clearly identified as incomplete. Passing tests,
report completeness, and coverage are separate claims.

The report generator cannot establish that tests were registered, runs were
unfiltered, or results are fresh. Verify those conditions independently. Counts
refer to scenarios and outline examples, not individual steps; a case passes
only when all of its steps and hooks pass.

The standalone test report preserves feature tables, filters, scenario steps,
attachments, navigation, and theme controls. It deliberately omits the
reporter's ApexCharts asset and graphical panels: that bundled vendor's separate
terms do not establish redistribution entitlement for this project. This
adaptation removes graphical summaries while keeping the underlying results.
Pinned reporter versions and checked template shapes require renewed review
when the dependency changes.

Test and coverage reports retain complete first-party and required vendor legal
notices in an inert template in each standalone HTML file. The
[script guide](../../.github/scripts/README.md) and
[vendor notice record](../../.github/licenses/README.md) own the explicit asset
inventories and provenance. Retain these notices when changing report packaging.

## Coverage

c8 enforces 100% statements, branches, functions, and lines for the
Node-executable application files explicitly included in `.c8rc.json`, including
unexecuted files in that scope. This is not whole-UI, whole-browser, or
whole-repository coverage. Browser integration and excluded adapters still need
meaningful scenarios. Review scope with source changes; never shrink it merely
to conceal a failing check or execute code without asserting behavior.

## Release evidence

Release validation uses the same tested revision and reports as the promoted
artifact. Local report/badge generation is reproducible without enabling any
remote release or deployment action.
