#!/usr/bin/env node
// Constraint scan: no imports (or path references) to crypto-weather-central
// anywhere in src, api, scripts, config files. The scanner's own source is
// excluded (it legitimately names the pattern it forbids).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src', 'api', 'scripts']
const FILES = ['package.json', 'vite.config.ts', 'vitest.config.ts', 'eslint.config.js']
const SELF = 'check-no-cwc.mjs'

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const targets = []
for (const root of ROOTS) {
  try {
    targets.push(...walk(root))
  } catch {
    /* missing root = nothing to scan */
  }
}
for (const f of FILES) {
  try {
    statSync(f)
    targets.push(f)
  } catch {
    /* optional file */
  }
}

const hits = []
for (const file of targets) {
  if (file.split(/[\\/]/).pop().startsWith(SELF)) continue
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (/crypto-weather-central/i.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`)
  })
}

if (hits.length > 0) {
  console.error(
    'CWC IMPORT SCAN FAILED: crypto-weather-central references found:\n' + hits.join('\n'),
  )
  process.exit(1)
}
console.log(`no-cwc scan OK (${targets.length} files scanned)`)
