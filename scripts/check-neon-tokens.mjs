#!/usr/bin/env node
// W4-G1 NEON-TOKEN AUDIT (wave-4 session C-01 law): every accent/neon COLOR
// used in CSS must reference var(--current-accent) — the theme seam — never a
// hardcoded neon hex. The only sanctioned literal is the token definition
// itself (--accent: #00ff9d) in :root. Fails on raw neon hexes/rgbs anywhere
// else in src/**.css (and inline styles in src/**.{ts,tsx}).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src'
// Neon family: the C-01 green #00ff9d (any case, 3/6-digit, + rgb forms).
const NEON_HEX = /#00ff9d\b|#0f9\b/i
const NEON_RGB = /\brgba?\(\s*0\s*,\s*255\s*,\s*157\b/i
// Sanctioned forms: token definitions + var() references (case-insensitive).
const TOKEN_DEF = /--accent\s*:\s*#00ff9d\b/i
const VAR_REF = /var\(\s*--current-accent\s*\)|var\(\s*--accent\s*\)/gi

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.css$/.test(entry)) out.push(full)
  }
  return out
}

const hits = []
for (const file of walk(ROOT)) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, idx) => {
    let work = line.replace(VAR_REF, '')
    if (!NEON_HEX.test(work) && !NEON_RGB.test(work)) return
    // Strip the sanctioned token definition line (--accent: #00ff9d) — only
    // valid where it defines the token (a custom-property declaration).
    work = work.replace(TOKEN_DEF, '')
    if (NEON_HEX.test(work) || NEON_RGB.test(work)) {
      hits.push(`${file}:${idx + 1}: ${line.trim()}`)
    }
  })
}

if (hits.length > 0) {
  console.error(
    'NEON-TOKEN AUDIT FAILED (C-01): hardcoded neon color found — use var(--current-accent):\n' +
      hits.join('\n'),
  )
  process.exit(1)
}
console.log('neon-token audit OK (CSS accent colors flow through var(--current-accent))')
