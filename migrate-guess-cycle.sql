-- ============================================
-- Migration: Enable Re-Vote After Lottery Guess
-- Safe to run on production after the old schema is already in use.
--
-- What this migration does:
-- 1. Adds transactions.guess_cycle
-- 2. Backfills guess_cycle from historical lottery_guesses per user/round
-- 3. Replaces the old per-round unique index with a per-cycle unique index
--
-- Note:
-- This script uses a regular CREATE UNIQUE INDEX, so run it during a low-traffic
-- window if your production table is large.
-- ============================================

BEGIN;

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS guess_cycle INTEGER;

UPDATE transactions AS t
SET guess_cycle = COALESCE(cycle_data.guess_cycle, 0)
FROM LATERAL (
    SELECT COUNT(*)::INTEGER AS guess_cycle
    FROM lottery_guesses AS lg
    WHERE lg.user_id = t.user_id
      AND lg.round_label IS NOT DISTINCT FROM t.round_label
      AND lg.created_at <= t.created_at
) AS cycle_data
WHERE t.guess_cycle IS NULL
   OR t.guess_cycle <> COALESCE(cycle_data.guess_cycle, 0);

UPDATE transactions
SET guess_cycle = 0
WHERE guess_cycle IS NULL;

ALTER TABLE transactions
    ALTER COLUMN guess_cycle SET DEFAULT 0;

ALTER TABLE transactions
    ALTER COLUMN guess_cycle SET NOT NULL;

DROP INDEX IF EXISTS uq_user_staff_round;
DROP INDEX IF EXISTS uq_user_staff_round_cycle;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_staff_round_cycle
    ON transactions (user_id, staff_id, round_label, guess_cycle)
    WHERE status <> 'rejected';

COMMIT;