// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Given, Then, When } from "@cucumber/cucumber";
import { parseDocument } from "yaml";

const directory = new URL("../workflows/", import.meta.url);
const publicationJobs = {
  "ci-develop": ["prepare-changelog", "auto-merge", "preview"],
  "ci-main": ["create-release", "preview", "auto-merge", "create-release-tag", "backmerge-develop", "promote-release"],
  "ci-release": ["auto-merge", "preview"],
  "ci-support": ["auto-merge"],
  "cron-outdated": ["branches", "dependency-status"]
};
const documentationWrites = ["Create GitHub App token", "Prepare Staging changelog for develop", "Merge validated documentation"];

function workflow(name)
{
  const document = parseDocument(readFileSync(new URL(`${name}.yml`, directory), "utf8"), { uniqueKeys: true });
  assert.deepEqual(document.errors, [], `${name} must be valid YAML`);
  return document.toJS();
}

function condition(expression, activation, { source = "feature/editor", target = "develop", workflowResult = "success", branchResult = "success" } = {})
{
  if (expression === undefined) return true;
  const github = { head_ref: source, base_ref: target, repository: "owner/project",
    event: { pull_request: { draft: false, head: { repo: { full_name: "owner/project" } } } } };
  const needs = {
    "workflow-checks": { result: workflowResult },
    "validate-pr": { result: branchResult },
    "prepare-changelog": { result: "skipped", outputs: { updated: "" } }
  };
  const steps = { prepare: { outputs: { updated: "false" } } };
  const normalized = expression.replace(/^\s*\$\{\{([\s\S]*)\}\}\s*$/, "$1")
    .replace(/\bneeds\.([A-Za-z0-9_-]+)/g, 'needs["$1"]');
  const evaluate = new Function("github", "vars", "needs", "steps", "startsWith", "cancelled", `return (${normalized});`);
  return evaluate(github, { CODE_AUTOMATION_ENABLED: activation }, needs, steps,
    (value, prefix) => value.toLowerCase().startsWith(prefix.toLowerCase()), () => false);
}

Given("the repository automation activation value is {string}", function (value)
{
  this.automationActivation = value === "missing" ? "" : value;
});

function eachPublication(assertion)
{
  for (const [name, jobs] of Object.entries(publicationJobs))
  {
    const configuration = workflow(name);
    for (const job of jobs)
      assertion(configuration.jobs[job].if, `${name}/${job}`, {
        source: job === "create-release" ? "develop" : name === "ci-main" ? "release/1.0.0" : "feature/editor"
      });
  }
  const steps = workflow("ci-docs").jobs.documentation.steps;
  for (const title of documentationWrites)
  {
    const step = steps.find(candidate => candidate.name === title);
    assert.ok(step, title);
    assertion(step.if, `ci-docs/${title}`, { source: "docs/readme", target: "develop" });
  }
}

Then("every publication job and documentation write is disabled", function ()
{
  eachPublication((expression, label, route) =>
    assert.equal(condition(expression, this.automationActivation, route), false, label));
});

Then("eligible publication jobs and documentation writes are enabled", function ()
{
  eachPublication((expression, label, route) =>
    assert.equal(condition(expression, this.automationActivation, route), true, label));
});

Then("ordinary pull requests still run validation", function ()
{
  for (const name of ["ci-develop", "ci-main", "ci-release", "ci-support"])
  {
    const jobs = workflow(name).jobs;
    for (const job of ["workflow-checks", "validate-pr", "application"])
      assert.equal(condition(jobs[job].if, this.automationActivation, {
        source: name === "ci-main" ? "release/1.0.0" : "feature/editor"
      }), true, `${name}/${job}`);
  }
  const documentation = workflow("ci-docs").jobs.documentation;
  assert.equal(condition(documentation.if, this.automationActivation, { source: "docs/readme" }), true);
  for (const step of documentation.steps.slice(0, 3)) assert.equal(step.if, undefined);
});

When("workflow validation is {string} and branch validation is {string}", function (workflowResult, branchResult)
{
  this.activationValidation = { workflowResult, branchResult };
});

Then("application validation is {string} with changelog preparation skipped", function (outcome)
{
  assert.equal(condition(workflow("ci-develop").jobs.application.if, this.automationActivation,
    this.activationValidation), outcome === "enabled");
});

Then("every credential grant and publication command has an activation guard", function ()
{
  const guard = /vars\.CODE_AUTOMATION_ENABLED == 'true'/;
  const publication = /(?:auto-merge|merge-release-pr|create-release-pr|prepare-changelog|synchronize-release|publish-status|publish-dependency-badges|record-pages-deployment)\.sh\b|\bgit push\b/;
  for (const name of readdirSync(directory).filter(name => name.endsWith(".yml")))
  {
    for (const [jobName, job] of Object.entries(workflow(name.slice(0, -4)).jobs))
    {
      for (const step of job.steps ?? [])
      {
        if (step.uses?.startsWith("actions/create-github-app-token@")
          || step.uses?.startsWith("cloudflare/wrangler-action@")
          || publication.test(step.run ?? ""))
          assert.ok(guard.test(job.if ?? "") || guard.test(step.if ?? ""), `${name}/${jobName}/${step.name}`);
      }
    }
  }
});

Then("publication destinations belong to the code editor", function ()
{
  const publishStatus = readFileSync(new URL("../scripts/publish-status.sh", import.meta.url), "utf8");
  assert.match(publishStatus, /r2\/buckets\/code-status\/objects/);
  for (const name of ["prepare-pages-deployment.sh", "record-pages-deployment.sh"])
    assert.match(readFileSync(new URL(`../scripts/${name}`, import.meta.url), "utf8"), /code-superduper-solutions/);
  for (const name of readdirSync(directory).filter(name => name.endsWith(".yml")))
    assert.doesNotMatch(readFileSync(new URL(name, directory), "utf8"), /operations(?:\.superduper\.solutions|-superduper-solutions|-status)/);
});
