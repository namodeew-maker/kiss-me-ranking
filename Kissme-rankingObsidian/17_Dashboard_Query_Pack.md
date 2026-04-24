# Dashboard Query Pack (Admin / Ops / Finance)

## Purpose

ชุด query สำหรับเช็กสถานะรายวันให้เร็วขึ้น โดยจัดตามบทบาทใช้งาน

## Common Settings

- หากใช้ psql ให้กำหนดวันที่ก่อน เช่น

```sql
-- ตัวอย่างพารามิเตอร์วัน
-- ปรับให้ตรงกับเครื่องมือที่ใช้งาน
-- :from_date = '2026-04-01'
-- :to_date   = '2026-04-30'
```

---

## Admin Pack

### A1) Pending Review Queue

```sql
SELECT
  COUNT(*)::int AS pending_count
FROM transactions
WHERE status = 'pending';
```

### A2) Pending Breakdown By Day

```sql
SELECT
  COALESCE(service_date, created_at::date) AS tx_day,
  COUNT(*)::int AS pending_count
FROM transactions
WHERE status = 'pending'
GROUP BY COALESCE(service_date, created_at::date)
ORDER BY tx_day DESC;
```

### A3) Approve/Reject Throughput (Date Range)

```sql
SELECT
  reviewed_at::date AS review_day,
  COUNT(*) FILTER (WHERE status = 'approved')::int AS approved_count,
  COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected_count
FROM transactions
WHERE reviewed_at::date BETWEEN :from_date AND :to_date
GROUP BY reviewed_at::date
ORDER BY review_day DESC;
```

### A4) Staff Usage And Approval Rate

```sql
SELECT
  s.id,
  s.name,
  COUNT(t.id)::int AS total_submissions,
  COUNT(*) FILTER (WHERE t.status = 'approved')::int AS approved_submissions,
  ROUND(
    CASE WHEN COUNT(t.id) = 0 THEN 0
         ELSE (COUNT(*) FILTER (WHERE t.status = 'approved')::numeric / COUNT(t.id)::numeric) * 100
    END, 2
  ) AS approve_rate_pct
FROM staffs s
LEFT JOIN transactions t ON t.staff_id = s.id
GROUP BY s.id, s.name
ORDER BY total_submissions DESC, approve_rate_pct DESC;
```

### A5) Daily Import Log Status

```sql
SELECT
  created_at::date AS import_day,
  report_key,
  status,
  COUNT(*)::int AS runs
FROM admin_excel_import_logs
WHERE created_at::date BETWEEN :from_date AND :to_date
GROUP BY created_at::date, report_key, status
ORDER BY import_day DESC, report_key, status;
```

---

## Ops Pack

### O1) Core Volume Snapshot

```sql
SELECT
  (SELECT COUNT(*) FROM users) AS users_count,
  (SELECT COUNT(*) FROM transactions) AS transactions_count,
  (SELECT COUNT(*) FROM lottery_guesses) AS guesses_count,
  (SELECT COUNT(*) FROM lottery_reward_claims) AS reward_claims_count,
  (SELECT COUNT(*) FROM points) AS points_rows_count;
```

### O2) Point Drift Signal (Approved vs Point Events)

```sql
WITH approved_tx AS (
  SELECT u.global_user_id, COUNT(*)::int AS approved_count
  FROM transactions t
  JOIN users u ON u.id = t.user_id
  WHERE t.status = 'approved'
  GROUP BY u.global_user_id
),
approved_points AS (
  SELECT global_user_id,
         COUNT(*) FILTER (WHERE activity_type = 'transaction_approved')::int AS point_events
  FROM points
  GROUP BY global_user_id
)
SELECT
  a.global_user_id,
  a.approved_count,
  COALESCE(p.point_events, 0) AS point_events,
  (a.approved_count - COALESCE(p.point_events, 0)) AS drift
FROM approved_tx a
LEFT JOIN approved_points p USING (global_user_id)
WHERE a.approved_count <> COALESCE(p.point_events, 0)
ORDER BY ABS(a.approved_count - COALESCE(p.point_events, 0)) DESC;
```

### O3) Guesses Missing Spend Event

```sql
SELECT
  lg.id AS lottery_guess_id,
  lg.user_id,
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

### O4) Duplicate Data Guards

```sql
-- duplicate guess in same round
SELECT user_id, round_label, guess_number, COUNT(*)::int AS dup_count
FROM lottery_guesses
GROUP BY user_id, round_label, guess_number
HAVING COUNT(*) > 1
ORDER BY dup_count DESC;

-- duplicate sold-out number in same round
SELECT number, round_label, COUNT(*)::int AS dup_count
FROM sold_out
GROUP BY number, round_label
HAVING COUNT(*) > 1
ORDER BY dup_count DESC;
```

### O5) Review Backlog Trend

```sql
SELECT
  COALESCE(service_date, created_at::date) AS tx_day,
  COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
  COUNT(*) FILTER (WHERE status = 'approved')::int AS approved_count,
  COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected_count
FROM transactions
WHERE COALESCE(service_date, created_at::date) BETWEEN :from_date AND :to_date
GROUP BY COALESCE(service_date, created_at::date)
ORDER BY tx_day DESC;
```

---

## Finance Pack

### F1) Reward Liability Snapshot

```sql
WITH claimed AS (
  SELECT lottery_guess_id, COALESCE(SUM(amount), 0)::numeric(10,2) AS claimed_amount
  FROM lottery_reward_claims
  GROUP BY lottery_guess_id
)
SELECT
  lg.result,
  COUNT(*)::int AS reward_rows,
  COALESCE(SUM(lg.reward_amount), 0)::numeric(12,2) AS total_reward_amount,
  COALESCE(SUM(COALESCE(c.claimed_amount, 0)), 0)::numeric(12,2) AS total_claimed_amount,
  COALESCE(SUM(COALESCE(lg.reward_amount, 0) - COALESCE(c.claimed_amount, 0)), 0)::numeric(12,2) AS total_remaining_amount
FROM lottery_guesses lg
LEFT JOIN claimed c ON c.lottery_guess_id = lg.id
WHERE lg.result IN ('won', 'lost')
GROUP BY lg.result
ORDER BY lg.result;
```

### F2) Over-Claim Detection (Critical)

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
  c.claimed_amount,
  (c.claimed_amount - COALESCE(lg.reward_amount, 0))::numeric(10,2) AS over_claim_amount
FROM lottery_guesses lg
JOIN claimed c ON c.lottery_guess_id = lg.id
WHERE c.claimed_amount > COALESCE(lg.reward_amount, 0)
ORDER BY over_claim_amount DESC;
```

### F3) Daily Claimed Amount

```sql
SELECT
  redeemed_at::date AS claim_day,
  reward_type,
  COALESCE(claim_mode, 'n/a') AS claim_mode,
  COUNT(*)::int AS claim_count,
  COALESCE(SUM(amount), 0)::numeric(12,2) AS claimed_amount
FROM lottery_reward_claims
WHERE redeemed_at::date BETWEEN :from_date AND :to_date
GROUP BY redeemed_at::date, reward_type, COALESCE(claim_mode, 'n/a')
ORDER BY claim_day DESC, reward_type, claim_mode;
```

### F4) Top Outstanding Rewards

```sql
WITH claimed AS (
  SELECT lottery_guess_id, COALESCE(SUM(amount), 0)::numeric(10,2) AS claimed_amount
  FROM lottery_reward_claims
  GROUP BY lottery_guess_id
)
SELECT
  lg.id AS lottery_guess_id,
  lg.user_id,
  lg.round_label,
  lg.result,
  COALESCE(lg.reward_amount, 0)::numeric(10,2) AS reward_amount,
  COALESCE(c.claimed_amount, 0)::numeric(10,2) AS claimed_amount,
  (COALESCE(lg.reward_amount, 0) - COALESCE(c.claimed_amount, 0))::numeric(10,2) AS remaining_amount
FROM lottery_guesses lg
LEFT JOIN claimed c ON c.lottery_guess_id = lg.id
WHERE lg.result IN ('won', 'lost')
  AND (COALESCE(lg.reward_amount, 0) - COALESCE(c.claimed_amount, 0)) > 0
ORDER BY remaining_amount DESC, lg.id DESC
LIMIT 100;
```

### F5) Round-Level Exposure

```sql
WITH claimed AS (
  SELECT lottery_guess_id, COALESCE(SUM(amount), 0)::numeric(10,2) AS claimed_amount
  FROM lottery_reward_claims
  GROUP BY lottery_guess_id
)
SELECT
  lg.round_label,
  COUNT(*)::int AS rewards_count,
  COALESCE(SUM(COALESCE(lg.reward_amount, 0)), 0)::numeric(12,2) AS total_reward,
  COALESCE(SUM(COALESCE(c.claimed_amount, 0)), 0)::numeric(12,2) AS total_claimed,
  COALESCE(SUM(COALESCE(lg.reward_amount, 0) - COALESCE(c.claimed_amount, 0)), 0)::numeric(12,2) AS total_remaining
FROM lottery_guesses lg
LEFT JOIN claimed c ON c.lottery_guess_id = lg.id
WHERE lg.result IN ('won', 'lost')
GROUP BY lg.round_label
ORDER BY lg.round_label DESC;
```

---

## Daily Run Order (Suggested)

1. Admin: A1, A3
2. Ops: O1, O2, O3, O4
3. Finance: F1, F2, F3
4. หากพบความผิดปกติ ให้เปิด [16_Incident_Runbook.md](16_Incident_Runbook.md)

## Related Notes

- [15_SQL_Audit_Cheat_Sheet.md](15_SQL_Audit_Cheat_Sheet.md)
- [16_Incident_Runbook.md](16_Incident_Runbook.md)