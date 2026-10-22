#!/usr/bin/env bash
# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
set -euo pipefail

usage='Usage: validate-semver.sh <version>'

[[ -n "${1:-}" ]] || { printf '%s\n<version> is missing\n' "$usage" >&2; exit 1; }

version="$1"
semver_re='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'

[[ "$version" =~ $semver_re ]] || {
  echo "::error::Version '$version' must be unprefixed SemVer MAJOR.MINOR.PATCH with no leading zeros." >&2
  exit 1
}

echo "SemVer is valid: $version"
