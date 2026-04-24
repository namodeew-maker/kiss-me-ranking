# SQL Audit Cheat Sheet

## Purpose

ชุด query สำหรับตรวจความสอดคล้องของ point ledger, lottery guesses, reward claims และความเสี่ยง data drift

## Usage Notes

- รันใน environment ที่ schema ตรงกับ production เท่านั้น
- ควรเริ่มจาก query แบบ read-only เสมอ
- ถ้าจะซ่อมข้อมูล ให้ทำ backup หรือ transaction block ก่อน

## 1) Users With Approved Transactions But Low/No Approved Point Events

```sql
WITH approved_tx AS (
  SELECT
    t.user_id,
    u.global_user_id,
    COUNT(*)::int AS approved_count
  FROM transactions t
  JOIN users u ON u.id = t.user_id
  WHERE t.status = 'approved'
  GROUP BY t.user_id, u.global_user_id
),
approved_points AS (
  SELECT
    p.global_user_id,
    COUNT(*) FILTER (WHERE p.activity_type = 'transaction_approved')::int AS approved_point_events
  FROM points p
  GROUP BY p.global_user_id
)
SELECT
  a.user_id,
  a.global_user_id,
  a.approved_count,
  COALESCE(ap.approved_point_events, 0) AS approved_point_events,
  (a.approved_count - COALESCE(ap.approved_point_events, 0)) AS missing_events
FROM approved_tx a
LEFT JOIN approved_points ap ON ap.global_user_id = a.global_user_id
WHERE a.approved_count > COALESCE(ap.approved_point_events, 0)
ORDER BY missing_events DESC, a.user_id;
```

## 2) Lottery Guesses Missing Spend Events (-5)

```sql
SELECT
  lg.id AS lottery_guess_id,
  lg.user_id,
  u.global_user_id,
  lg.round_label,
  lg.guess_number,
  lg.created_at
FROM lottery_guesses lg
JOIN users u ON u.id = lg.user_id
LEFT JOIN points p
  ON p.global_user_id = u.global_user_id
 AND p.activity_type = 'lottery_guess_spend'
 AND p.metadata->>'lottery_guess_id' = lg.id::text
WHERE p.id IS NULL
ORDER BY lg.created_at DESC;
```

## 3) Spend Events Referencing Missing Guesses

```sql
SELECT
  p.id AS point_id,
  p.global_user_id,
  p.created_at,
  p.metadata->>'lottery_guess_id' AS lottery_guess_id_text
FROM points p
LEFT JOIN lottery_guesses lg
  ON lg.id::text = p.metadata->>'lottery_guess_id'
WHERE p.activity_type = 'lottery_guess_spend'
  AND lg.id IS NULL
ORDER BY p.created_at DESC;
```

## 4) Current Point Balance Per User

```sql
SELECT
  u.id AS user_id,
  u.platform_id,
  u.display_name,
  u.global_user_id,
  COALESCE(SUM(p.points), 0)::int AS total_points
FROM users u
LEFT JOIN points p ON p.global_user_id = u.global_user_id
GROUP BY u.id, u.platform_id, u.display_name, u.global_user_id
ORDER BY total_points DESC, u.id;
```

## 5) Round-Scoped Point Balance (Adjust round label)

```sql
-- Replace :round_label with a real value like '2026-04-A'
SELECT
  u.id AS user_id,
  u.platform_id,
  u.display_name,
  COALESCE(SUM(p.points), 0)::int AS round_points
FROM users u
LEFT JOIN points p
  ON p.global_user_id = u.global_user_id
 AND COALESCE(p.metadata->>'round_label', '') = :round_label
GROUP BY u.id, u.platform_id, u.display_name
ORDER BY round_points DESC, u.id;
```

## 6) Reward Remaining Sanity Check

```sql
WITH claimed AS (
  SELECT
    lottery_guess_id,
    COALESCE(SUM(amount), 0)::numeric(10,2) AS claimed_amount
  FROM lottery_reward_claims
  GROUP BY lottery_guess_id
)
SELECT
  lg.id AS lottery_guess_id,
  lg.user_id,
  lg.result,
  lg.reward_amount,
  COALESCE(c.claimed_amount, 0) AS claimed_amount,
  (COALESCE(lg.reward_amount, 0) - COALESCE(c.claimed_amount, 0)) AS remaining_amount
FROM lottery_guesses lg
LEFT JOIN claimed c ON c.lottery_guess_id = lg.id
WHERE lg.result IN ('won', 'lost')
ORDER BY lg.id DESC;
```

## 7) Over-Claim Detection (Should Be Empty)

```sql
WITH claimed AS (
  SELECT lottery_guess_id, COALESCE(SUM(amount), 0)::numeric(10,2) AS claimed_amount
  FROM lottery_reward_claims
  GROUP BY lottery_guess_id
)
SELECT
  lg.id AS lottery_guess_id,
  lg.user_id,
  lg.result,
  lg.reward_amount,
  c.claimed_amount
FROM lottery_guesses lg
JOIN claimed c ON c.lottery_guess_id = lg.id
WHERE c.claimed_amount > COALESCE(lg.reward_amount, 0)
ORDER BY c.claimed_amount DESC;
```

## 8) Duplicate Guess In Same Round (Should Be Empty)

```sql
SELECT
  user_id,
  round_label,
  guess_number,
  COUNT(*)::int AS dup_count
FROM lottery_guesses
GROUP BY user_id, round_label, guess_number
HAVING COUNT(*) > 1
ORDER BY dup_count DESC;
```

## 9) Sold-out Duplicates In Round (Should Be Empty)

```sql
SELECT
  number,
  round_label,
  COUNT(*)::int AS dup_count
FROM sold_out
GROUP BY number, round_label
HAVING COUNT(*) > 1
ORDER BY dup_count DESC;
```

## 10) Quick Snapshot For Incident Triage

```sql
SELECT
  (SELECT COUNT(*) FROM users) AS users_count,
  (SELECT COUNT(*) FROM transactions) AS transactions_count,
  (SELECT COUNT(*) FROM transactions WHERE status = 'pending') AS pending_transactions,
  (SELECT COUNT(*) FROM lottery_guesses) AS guesses_count,
  (SELECT COUNT(*) FROM lottery_reward_claims) AS reward_claims_count,
  (SELECT COUNT(*) FROM points) AS points_rows_count;
```

## Optional Fix Pattern (Manual, Use Carefully)

```sql
BEGIN;

-- Put corrective updates/inserts/deletes here

-- ROLLBACK; -- use during dry-run
COMMIT;
```

## Related Notes

- `10_Flow_Point_Ledger.md`
- `11_Flow_Reward_Claim.md`
- `12_Flow_Round_Logic.md`
- `13_Diagrams_ERD_and_Flows.md`