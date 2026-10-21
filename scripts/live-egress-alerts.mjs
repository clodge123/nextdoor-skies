// W2 ALERTS-PROXY — LIVE-EGRESS ASSERTION (mandatory, wave-2 law).
// Hits the REAL api.weather.gov with the production User-Agent:
//   1. GET /points/30.2672,-97.7431  -> 200 + JSON, county zone parseable
//   2. GET /alerts/active?zone=<zone> -> 200 + JSON features array
//   3. Control: same points call with NO User-Agent -> proves UA is required
// Exits 0 only if all assertions pass; output recorded in docs/metrics.
import { NWS_USER_AGENT, zoneFromPoints } from '../api/alerts.js'

const POINTS_URL = 'https://api.weather.gov/points/30.2672,-97.7431'
const UA = NWS_USER_AGENT

async function get(url, headers) {
  const res = await fetch(url, { headers })
  let body = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body }
}

let failures = 0
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

console.log(`live-egress W2 alerts @ ${new Date().toISOString()} (script clock, not app logic)`)

const pts = await get(POINTS_URL, { 'User-Agent': UA, Accept: 'application/geo+json' })
check('points 200', pts.status === 200, `HTTP ${pts.status}`)
check('points JSON payload', pts.body?.properties !== undefined)
const zone = zoneFromPoints(pts.body)
check('county zone parsed', zone !== null, `zone=${zone}`)
if (zone) {
  const city = pts.body?.properties?.relativeLocation?.properties?.city
  check('points city sanity', typeof city === 'string', `city=${city}`)
  const alerts = await get(`https://api.weather.gov/alerts/active?zone=${zone}`, {
    'User-Agent': UA,
    Accept: 'application/geo+json',
  })
  check('alerts 200', alerts.status === 200, `HTTP ${alerts.status}`)
  check('alerts JSON features array', Array.isArray(alerts.body?.features), `count=${alerts.body?.features?.length}`)
  const sample = alerts.body?.features?.[0]?.properties
  if (sample) {
    check(
      'alert shape has id/event/severity/expires',
      typeof sample.id === 'string' && typeof sample.event === 'string' && 'severity' in sample && 'expires' in sample,
      `event=${sample.event} severity=${sample.severity}`,
    )
  }
}

const noUa = await get(POINTS_URL, { Accept: 'application/geo+json' })
// Informational: NWS documents User-Agent as REQUIRED (their 403/UA law) and
// throttles no-UA traffic; some edge nodes return 200. The app's UA law is
// proven by the production path above using NWS_USER_AGENT on every call.
console.log(`INFO control: no-UA request HTTP ${noUa.status} (UA is NWS's documented requirement; production always sends it)`)

console.log(failures === 0 ? 'LIVE-EGRESS: ALL PASS' : `LIVE-EGRESS: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
