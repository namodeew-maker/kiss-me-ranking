-- Migration: User Visit Tracking
-- Adds:
--   1) `user_visits` table — append-only log of every /api/auth/login call
--   2) `users.last_login_at` — cached timestamp of the most recent visit
--   3) Indexes for fast DAU/WAU/MAU aggregation
--
-- Idempotent: safe to run multiple times. Runtime ensureDatabaseStructure()
-- mirrors this DDL so production picks it up automatically on next boot,
-- but this file is the source-of-truth migration.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS user_visits (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    visited_at TIMESTAMP NOT NULL DEFAULT NOW(),
    entry_page VARCHAR(40),
    user_agent TEXT,
    ip INET
);

CREATE INDEX IF NOT EXISTS idx_user_visits_user_visited_at
    ON user_visits (user_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_visits_visited_at
    ON user_visits (visited_at DESC);

-- Backfill last_login_at from existing transaction history so the column is
-- not empty after deploy. New visits will overwrite this with real values.
UPDATE users u
SET last_login_at = sub.last_at
FROM (
    SELECT user_id, MAX(COALESCE(service_date::timestamp, created_at)) AS last_at
    FROM transactions
    GROUP BY user_id
) sub
WHERE sub.user_id = u.id
  AND u.last_login_at IS NULL;
