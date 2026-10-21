// TEMPORARY wave-1 preflight probe: verify Neon connectivity from Vercel.
// Same db-probe precedent as run 1. Removed once wave 1 lanes land.
export default async function handler(_req, res) {
  const url = process.env.POSTGRES_URL
  if (!url) return res.status(200).json({ ok: false, error: 'POSTGRES_URL not set' })
  try {
    const { default: pg } = await import('pg')
    const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
    await client.connect()
    const r = await client.query('select current_database() as db')
    await client.end()
    return res.status(200).json({ ok: true, db: r.rows[0].db })
  } catch (err) {
    return res.status(200).json({ ok: false, error: String(err.message ?? err) })
  }
}
