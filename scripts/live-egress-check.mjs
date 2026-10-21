#!/usr/bin/env node
/**
 * W1 LIVE-EGRESS ASSERTION (wave-2 law, mandatory)
 *
 * Fetches the REAL https://api.open-meteo.com/v1/forecast endpoint (the one
 * api/weather.js proxies to) and asserts:
 *   1. HTTP 200
 *   2. JSON parses
 *   3. current.temperature_2m is a finite number
 *   4. current_units.temperature_2m is a recognized label (°C/°F) — proves
 *      normalizeTempF() in api/weather.js can convert honestly.
 *
 * No mocks, no stubs. Exit 0 = live egress proven; exit 1 = broken.
 *
 * Usage: node scripts/live-egress-check.mjs
 */
const URL = 'https://api.open-meteo.com/v1/forecast?latitude=39.7817&longitude=-89.6501&current=temperature_2m&units=imperial'

async function main() {
  const started = process.hrtime.bigint()
  const res = await fetch(URL, { method: 'GET' })
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  console.log(`live-egress: GET ${URL}`)
  console.log(`live-egress: HTTP ${res.status} (${ms.toFixed(0)} ms)`)
  if (res.status !== 200) {
    console.error(`FAIL: expected HTTP 200, got ${res.status}`)
    process.exit(1)
  }
  const payload = await res.json()
  const temp = payload?.current?.temperature_2m
  const unit = payload?.current_units?.temperature_2m
  if (typeof temp !== 'number' || !Number.isFinite(temp)) {
    console.error('FAIL: current.temperature_2m missing/not finite:', JSON.stringify(payload?.current))
    process.exit(1)
  }
  if (unit !== '°C' && unit !== '°F') {
    console.error('FAIL: unrecognized current_units.temperature_2m:', JSON.stringify(unit))
    process.exit(1)
  }
  const tempF = unit === '°F' ? temp : (temp * 9) / 5 + 32
  console.log(`live-egress: PASS current.temperature_2m=${temp} ${unit} -> ${tempF.toFixed(1)} °F (Springfield, IL)`
  )
}

main().catch((err) => {
  console.error('FAIL: live-egress check errored:', err?.message ?? err)
  process.exit(1)
})
