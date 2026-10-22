#!/usr/bin/env node
// R17 determinism scan: no Math.random / Date.now / new Date in src,
// excluding test files (*.test.ts(x), src/test/**).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'

const ROOT = 'src'
const FORBIDDEN = [/\bMath\.random\b/g, /\bDate\.now\b/g, /\bnew\s+Date\b/g]

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

function isTestFile(file) {
  const rel = file.split(/[\\/]/).join('/')
  return rel.endsWith('.test.ts') || rel.endsWith('.test.tsx') || rel.includes('/test/')
}

const files = walk(ROOT).filter((f) => !isTestFile(f))
const hits = []
// R17 scans CODE only: comment lines (doc blocks that quote the law, e.g.
// "no Math.random / Date.now") must not trip the scanner. Strip line
// comments and jsdoc body lines before matching.
function codeOnly(line) {
  const t = line.trimStart()
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return ''
  return line.replace(/\/\/.*$/, '')
}
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    const code = codeOnly(line)
    for (const re of FORBIDDEN) {
      re.lastIndex = 0
      if (re.test(code)) hits.push(`${file}:${i + 1}: ${line.trim()}`)
    }
  })
}

if (hits.length > 0) {
  console.error(
    'DETERMINISM SCAN FAILED (R17): forbidden nondeterministic calls in src:\n' + hits.join('\n'),
  )
  process.exit(1)
}
console.log(`determinism scan OK (${files.length} source files scanned)`)
