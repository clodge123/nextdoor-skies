-- 001_reports.sql — L7 seed infra (R14/R16 auto-migration part).
-- Reports = posts (weather reports per town); comments = one-level replies.
-- seeded=true marks demo data so the UI can label it honestly (docs/SEED-CONTRACT.md).

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  town TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('rain','storm','snow','clear','heat')),
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  seeded BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  seeded BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS reports_ts_idx ON reports (ts DESC);
CREATE INDEX IF NOT EXISTS comments_report_idx ON comments (report_id, ts);
