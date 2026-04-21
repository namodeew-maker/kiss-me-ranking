-- ============================================
-- Migration: Remove Staff Duplicate Selection Constraint
-- 
-- What this migration does:
-- 1. Removes the unique constraint that prevents selecting the same staff
--    multiple times in the same guess cycle
-- 2. Allows employees to be selected multiple times within a voting set
--    until all 5 points are used up and a new voting cycle begins
--
-- Note:
-- This change allows more flexibility in staff selection while maintaining
-- the overall structure of the guess cycle system.
-- ============================================

BEGIN;

DROP INDEX IF EXISTS uq_user_staff_round_cycle;

COMMIT;
