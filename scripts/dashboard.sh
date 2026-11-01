#!/usr/bin/env bash
# Collect live evidence for all six tasks (Node, read-only) and open the dashboard.
# The UI itself is plain HTML/CSS/JS in dashboard/; data.js is the only generated file.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node "$ROOT/dashboard/collect.mjs"
[ "${NO_OPEN:-}" = "1" ] || open "$ROOT/dashboard/index.html" 2>/dev/null || true
