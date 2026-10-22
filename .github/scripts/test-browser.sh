#!/usr/bin/env bash
# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
rm -rf tmp/test/browser
mkdir -p tmp/test/browser
rm -f tmp/test/cucumber-browser.json
# Playwright retains trace resources until the suite's browser closes. Keep
# those temporary files on disk so a full run cannot exhaust the /tmp tmpfs.
runtime_directory=tmp/test/browser/.runtime
runtime_alias_directory=""
mkdir -p "$runtime_directory"
cleanup_runtime() {
  rm -rf -- "$runtime_directory"
  if [[ -n "$runtime_alias_directory" ]]; then rm -rf -- "$runtime_alias_directory"; fi
}
trap cleanup_runtime EXIT

fail() {
  echo "Browser tests: $*" | tee tmp/test/browser/runner.log >&2
  exit 1
}
[[ -s dist/index.html ]] || fail "Missing built application '$PWD/dist/index.html'. Run npm run build first."
runtime="${BROWSER_TEST_RUNTIME:-docker}"
case "$runtime" in
  docker)
    command -v docker >/dev/null || fail 'Docker is not installed. Install and start Docker, then rerun npm run test:browser.'
    docker info >/dev/null 2>&1 || fail 'Cannot connect to Docker. Start Docker and check your access with docker info.'
    ;;
  local) ;;
  *) fail "Unknown BROWSER_TEST_RUNTIME '$runtime'; expected docker or local." ;;
esac

# These test packages are JavaScript; reuse npm ci without building or installing
# the application inside the browser image. The image supplies browser binaries.
version="$(node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const declared = JSON.parse(readFileSync("package.json")).devDependencies["@playwright/test"];
  const installed = JSON.parse(readFileSync("node_modules/@playwright/test/package.json")).version;
  if (!/^\d+\.\d+\.\d+$/.test(declared) || declared !== installed)
    throw new Error("Playwright must have an exact matching version: declared=" + declared + ", installed=" + installed + ". Run npm ci.");
  process.stdout.write(declared);
')" || fail 'Cannot resolve the pinned Playwright package. Check the error above and run npm ci.'
image="mcr.microsoft.com/playwright:v${version}-noble"
echo "Browser tests: runtime=$runtime, image=$image, bundle=dist/index.html, profile=browser, output=tmp/test."

if [[ "$runtime" == docker ]]; then
# Only the test output is writable; the app needs no network access. All test
# processes share the container's loopback interface, so no ports are exposed.
docker run --rm --init --network=none --read-only --shm-size=1g \
  --cap-drop=ALL --security-opt=no-new-privileges \
  --user "$(id -u):$(id -g)" --env HOME=/tmp --env CI=true \
  --env TMPDIR=/workspace/tmp/test/browser/.runtime \
  --env "BROWSER_TEST_IMAGE=$image" \
  --tmpfs /tmp:rw,nosuid,nodev,size=512m \
  --mount "type=bind,source=$PWD,target=/workspace,readonly" \
  --mount "type=bind,source=$PWD/tmp/test,target=/workspace/tmp/test" \
  --workdir /workspace "$image" \
  node node_modules/@cucumber/cucumber/bin/cucumber.js \
  --config cucumber.config.mjs --profile browser "$@" \
  2>&1 | tee tmp/test/browser/runner.log
else
  # Explicit local fallback runs the same scenarios and assertions. It lacks
  # Docker's process/network isolation; browser requests remain checked by the
  # browser harness. Use a matching local Playwright browser or an explicit
  # BROWSER_EXECUTABLE_PATH supported by that harness.
  echo 'Browser tests: local runtime selected; Docker isolation is not applied.'
  # Chrome's Unix socket has a short path limit. Keep profile data on disk
  # while giving the local browser a short temporary path through an owned link.
  runtime_alias_directory="$(mktemp -d /tmp/code-browser.XXXXXX)"
  ln -s -- "$PWD/$runtime_directory" "$runtime_alias_directory/runtime"
  CI=true TMPDIR="$runtime_alias_directory/runtime" BROWSER_TEST_IMAGE="local-playwright-$version" \
    node node_modules/@cucumber/cucumber/bin/cucumber.js \
    --config cucumber.config.mjs --profile browser "$@" \
    2>&1 | tee tmp/test/browser/runner.log
fi

node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const report = JSON.parse(readFileSync("tmp/test/cucumber-browser.json"));
  const scenarios = report.flatMap(feature => feature.elements).filter(item => item.type === "scenario");
  if (!scenarios.length || scenarios.some(scenario =>
    !scenario.steps.length || [...(scenario.before ?? []), ...scenario.steps, ...(scenario.after ?? [])]
      .some(step => step.result?.status !== "passed")))
    throw new Error("Browser results must contain executed, passing scenarios and hooks. See tmp/test/cucumber-browser.json and tmp/test/browser/runner.log.");
'
