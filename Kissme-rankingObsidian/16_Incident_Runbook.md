# Incident Runbook

## Purpose

Runbook นี้ใช้รับมือ incident ที่พบบ่อยในระบบ เช่น แต้มคลาดเคลื่อน, reward claim ผิดยอด, และปัญหารอบกิจกรรม โดยเชื่อมกับ query ในไฟล์ [15_SQL_Audit_Cheat_Sheet.md](15_SQL_Audit_Cheat_Sheet.md)

## Severity Model

- SEV-1: กระทบการคิดเงิน/สิทธิ์รางวัลจำนวนมาก, ระบบใช้งานหลักไม่ได้
- SEV-2: กระทบผู้ใช้บางส่วน, ฟังก์ชันหลักยังใช้งานได้
- SEV-3: ความคลาดเคลื่อนเล็กน้อย, workaround ได้

## First 10 Minutes Checklist

1. ระบุ incident type: points, rewards, round, import/export, auth
2. เก็บช่วงเวลาเริ่มผิดปกติ (UTC และเวลาไทย)
3. รัน query snapshot ในหัวข้อ 10 ของ [15_SQL_Audit_Cheat_Sheet.md](15_SQL_Audit_Cheat_Sheet.md)
4. จำกัดผลกระทบเบื้องต้น: ผู้ใช้กี่คน, รายการกี่แถว, มูลค่าเท่าไร
5. ประกาศสถานะภายในทีมพร้อม severity

## Incident Types And Triage

### A) Point Drift

อาการ:

- ผู้ใช้แต้มไม่ตรงกับ expected flow
- guess ได้ทั้งที่แต้มไม่พอ หรือเดาถูกตัดแต้มเกิน

ตรวจทันที:

- Query 1: approved transaction vs approved point events
- Query 2: guesses ที่ไม่มี spend event
- Query 3: spend event ที่อ้างถึง guess ที่หาย
- Query 4/5: total points และ round points

แนวทางแก้:

1. หยุดการแก้แบบ ad-hoc
2. เก็บรายการ user/guess ที่ผิดปกติเป็นหลักฐาน
3. พิจารณาใช้ endpoint reconcile หลังยืนยันขอบเขต
4. ตรวจผลซ้ำด้วย Query 1-5

### B) Reward Balance Mismatch

อาการ:

- remaining amount ติดลบ
- claim เกินยอด reward
- รายงาน reward ไม่สอดคล้องกัน

ตรวจทันที:

- Query 6: reward remaining sanity
- Query 7: over-claim detection

แนวทางแก้:

1. ระบุรายการ `lottery_guess_id` ที่ผิดปกติ
2. freeze การ claim เฉพาะรายการกระทบ
3. ยืนยันยอดจาก source rows (`lottery_guesses`, `lottery_reward_claims`)
4. ซ่อมข้อมูลใน transaction block
5. recheck ด้วย Query 6-7

### C) Round Logic Anomaly

อาการ:

- ผู้ใช้ทายไม่ได้ทั้งที่ควรเปิดรอบ
- sold-out behavior ผิด
- draw update ไม่ตรงรอบ

ตรวจทันที:

- Query 8: duplicate guess same round
- Query 9: sold-out duplicates
- ตรวจ `app_settings` และ `round_label` ที่เกี่ยวข้อง

แนวทางแก้:

1. ยืนยัน timezone และวันที่อ้างอิง
2. ยืนยัน round label ที่ระบบใช้งานจริง ณ เวลานั้น
3. ตรวจข้อจำกัด unique index ใน environment

## Standard Investigation Flow

1. Snapshot
2. Scope impact
3. Confirm reproducibility
4. Isolate root cause
5. Apply minimal fix
6. Verify with SQL audit queries
7. Record postmortem

## Communication Template

```text
Incident: <title>
Severity: <SEV-1/2/3>
Start time: <timestamp>
Current impact: <users/transactions/amount>
Containment: <what is paused or protected>
Next update: <time>
Owner: <name>
```

## Safe Fix Pattern

```sql
BEGIN;

-- 1) read validation
-- 2) corrective statement(s)
-- 3) read validation again

-- ROLLBACK; -- use for dry-run
COMMIT;
```

## Exit Criteria

- Query checks กลับมาปกติ
- ไม่พบ drift เพิ่มในช่วงสังเกตการณ์
- ทีมรับทราบ root cause และแผนป้องกัน
- มีบันทึก postmortem พร้อม action items

## Related Notes

- [10_Flow_Point_Ledger.md](10_Flow_Point_Ledger.md)
- [11_Flow_Reward_Claim.md](11_Flow_Reward_Claim.md)
- [12_Flow_Round_Logic.md](12_Flow_Round_Logic.md)
- [15_SQL_Audit_Cheat_Sheet.md](15_SQL_Audit_Cheat_Sheet.md)