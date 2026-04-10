-- ============================================
-- Migration: Fix Sold Out Round Uniqueness
-- Safe to run on production for databases created before round_label support.
-- ============================================

BEGIN;

ALTER TABLE sold_out
    ADD COLUMN IF NOT EXISTS round_label VARCHAR(20);

UPDATE sold_out
SET round_label = COALESCE(NULLIF(round_label, ''), TO_CHAR(CURRENT_DATE, 'YYYY-MM') || CASE WHEN EXTRACT(DAY FROM CURRENT_DATE) <= 15 THEN '-A' ELSE '-B' END)
WHERE round_label IS NULL
   OR round_label = '';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'sold_out'::regclass
          AND conname = 'sold_out_number_key'
    ) THEN
        ALTER TABLE sold_out DROP CONSTRAINT sold_out_number_key;
    END IF;
END $$;

DROP INDEX IF EXISTS uq_sold_out_number_round;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sold_out_number_round
    ON sold_out (number, round_label);

COMMIT;