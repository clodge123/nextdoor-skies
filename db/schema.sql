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

-- W4 POSTS-API (wave 2, contracts S2-S4, S8). Idempotent additions.
-- posts: town-scoped feed posts with optional canvas snapshot (S7, data URL
-- <=120KB enforced in api/posts.js, not the DB). createdAt server-assigned.

CREATE TABLE IF NOT EXISTS posts (
  id         text PRIMARY KEY,
  town       text NOT NULL,
  author     text NOT NULL,
  text       text NOT NULL,
  snapshot   text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posts_town_created_at_idx ON posts (town, created_at DESC);

-- post_comments: one level only (post -> replies; no nested threads).
-- Distinct from run-1 `comments` (which keys on reports.id).

CREATE TABLE IF NOT EXISTS post_comments (
  id         text PRIMARY KEY,
  post_id    text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author     text NOT NULL,
  text       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS post_comments_post_id_idx ON post_comments (post_id);

-- post_reactions: one row per (post, nickname); emoji is 👍|❤️|😂 (validated
-- in api/posts.js). Toggle = same emoji twice deletes (handled in handler).

CREATE TABLE IF NOT EXISTS post_reactions (
  id       text PRIMARY KEY,
  post_id  text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  emoji    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, nickname)
);
CREATE INDEX IF NOT EXISTS post_reactions_post_id_idx ON post_reactions (post_id);

-- post_flags: distinct nickname per post (UNIQUE below); feed hides a post
-- once COUNT(DISTINCT nickname) >= 3 (api/posts.js FLAG_HIDE_COUNT).

CREATE TABLE IF NOT EXISTS post_flags (
  id         text PRIMARY KEY,
  post_id    text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  nickname   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, nickname)
);
CREATE INDEX IF NOT EXISTS post_flags_post_id_idx ON post_flags (post_id);
