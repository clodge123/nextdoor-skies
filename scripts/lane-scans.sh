#!/usr/bin/env bash
# L6 lane scans: determinism (R17) + radius (R20) over lane-owned sources.
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0

echo "== determinism scan (R17): Math.random / Date.now / new Date in src =="
# Strip line/block comments before matching; comments may name the law.
if grep -rnE 'Math\.random|Date\.now|new Date' src/ --include='*.ts' --include='*.tsx' \
  | sed -E 's~//.*~~' | grep -vE '^([^:]+:[0-9]+):\s*\*' ; then
  echo "FAIL: nondeterministic call found in src/"
  fail=1
else
  echo "OK: zero hits"
fi

echo "== radius scan (R20): border-radius literals in src =="
if grep -rnE 'border-radius:\s*[1-9]' src/; then
  echo "FAIL: non-zero border-radius found"
  fail=1
else
  echo "OK: zero hits (var(--radius)=0px law)"
fi

exit $fail
