BEGIN;

ALTER TABLE lottery_reward_claims
    ADD COLUMN IF NOT EXISTS claim_mode VARCHAR(20);

UPDATE lottery_reward_claims
SET claim_mode = 'withdraw'
WHERE reward_type = 'cashback'
  AND COALESCE(claim_mode, '') = '';

COMMIT;