#!/usr/bin/env node
// R20 radius scan: zero raw border-radius values in src (CSS + inline styles).
// The only allowed form is var(--radius) (token, = 0px per L4).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src'
const ALLOWED = /border-radius\s*:\s*var\(--radius\)/g
const RAW = /border-radius\s*:\s*(?!var\(--radius\))[^;}]+/g

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.(css|ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const files = walk(ROOT)
const hits = []
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const stripped = text.replace(ALLOWED, '')
  for (const m of stripped.matchAll(RAW)) {
    hits.push(`${file}: "border-radius: ${m[1].trim()}"`)
  }
}

if (hits.length > 0) {
  console.error(
    'RADIUS SCAN FAILED (R20): raw border-radius values found (use var(--radius)):\n' +
      hits.join('\n'),
  )
  process.exit(1)
}
console.log(`radius scan OK (${files.length} files scanned, square geometry enforced)`)
