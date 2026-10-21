#!/usr/bin/env bash
# ============================================================================
# FLEET BROWSER TRAFFIC GATE  (run 2 law — see docs/BROWSER-TRAFFIC-LAW.md)
#
# This host has 7.3 GiB RAM / 6 cores, shared with ollama (~850 MB) and TTS
# (~450 MB) daemons. One leaked Playwright fleet (489 zombie chrome-headless
# procs from lanes running browsers simultaneously) OOM-killed the box on
# 2026-10-21. Rule: code work (vitest/tsc/build/git) stays fully parallel;
# BROWSER runs are fleet-serialized through this gate.
#
# Usage (ALWAYS wrap Playwright/smoke runs in this):
#   scripts/e2e-gate.sh npx playwright test
#   scripts/e2e-gate.sh npm run smoke:prod
#
# Semantics:
#   - E2E_SLOTS (default 1) concurrent browser runs fleet-wide.
#   - A queued caller blocks up to E2E_GATE_TIMEOUT (default 1800s), then
#     exits 75 ("gate busy") — never run browsers ungated to dodge it.
#   - flock on a lockfile: dies with the holder, survives crashes, no
#     counting bugs.
# ============================================================================
set -u
SLOTS="${E2E_SLOTS:-1}"
TIMEOUT="${E2E_GATE_TIMEOUT:-1800}"
DIR="${E2E_LOCK_DIR:-/tmp}"

if [ "$#" -eq 0 ]; then
  echo "usage: scripts/e2e-gate.sh <command...>" >&2
  exit 2
fi

slot=0
while [ "$slot" -lt "$SLOTS" ]; do
  lock="$DIR/nds-e2e-$slot.lock"
  : >"$lock" 2>/dev/null || true
  exec {fd}>"$lock"
  if flock -n "$fd"; then
    trap "flock -u $fd" EXIT
    # Keep browsers lean inside the run (see law): 1-2 chromiums max.
    export E2E_WORKERS="${E2E_WORKERS:-1}"
    exec "$@"
  fi
  exec {fd}>&-
  slot=$((slot + 1))
done

# All slots busy: block on slot 0 with a bounded wait.
lock="$DIR/nds-e2e-0.lock"
exec {fd}>"$lock"
if flock -w "$TIMEOUT" "$fd"; then
  trap "flock -u $fd" EXIT
  export E2E_WORKERS="${E2E_WORKERS:-1}"
  exec "$@"
fi
echo "e2e-gate: all $SLOTS browser slot(s) busy after ${TIMEOUT}s — NOT running browsers ungated (fleet law). Retry, split the lane, or report the block." >&2
exit 75
