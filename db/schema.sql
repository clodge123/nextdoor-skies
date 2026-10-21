-- NextDoor Skies run 2 — canonical schema (idempotent: safe to re-run any number of times).
-- Applied by db/migrate.mjs. Postgres (Neon) dialect.

CREATE TABLE IF NOT EXISTS reports (
  id                text PRIMARY KEY,
  lat               double precision NOT NULL,
  lon               double precision NOT NULL,
  text              text,
  type              text,
  ts                timestamptz NOT NULL,
  author_token_hash text NOT NULL,
  seeded            boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
  id                text PRIMARY KEY,
  report_id         text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  text              text,
  author_token_hash text NOT NULL,
  seeded            boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_report_id_idx ON comments (report_id);

CREATE TABLE IF NOT EXISTS flags (
  id                text PRIMARY KEY,
  report_id         text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  commenter_id      text,
  reason            text,
  author_token_hash text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flags_report_id_idx ON flags (report_id);

CREATE TABLE IF NOT EXISTS reactions (
  id                text PRIMARY KEY,
  report_id         text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  emoji             text NOT NULL,
  author_token_hash text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, emoji, author_token_hash)
);
CREATE INDEX IF NOT EXISTS reactions_report_id_idx ON reactions (report_id);

CREATE TABLE IF NOT EXISTS rate_limit (
  id                text PRIMARY KEY,
  author_token_hash text NOT NULL,
  bucket            text NOT NULL,
  count             integer NOT NULL DEFAULT 1,
  window_start      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (author_token_hash, bucket)
);
