# Flow Deep Dive: Round Logic

## Scope

โน้ตนี้สรุปตรรกะรอบกิจกรรมที่มีผลต่อ transaction, ranking, guessing, และ draw

## Round Concepts

- ระบบใช้ `round_label` เช่น `YYYY-MM-A` หรือ `YYYY-MM-B`
- รอบเกี่ยวข้องกับ:
  - การทายเลข
  - sold-out numbers
  - ranking filters บางส่วน
  - progress และ point cycle interpretation

## Runtime Functions (Observed)

- `getCurrentRoundLabel()`
- `isRoundOpen()`
- `drawDateLabelToRoundLabel(...)`
- `getCustomerRankResetDate()`
- `getGuessPointCycleConfig(...)`

## Flow A: User Progress In Current Round

1. เรียก `GET /api/users/:platform_id/progress`
2. backend resolve `round_label` ปัจจุบัน
3. นับ approved count ในรอบ
4. คำนวณแต้มรอบและสิทธิ์การทาย
5. ส่งสถานะ `can_guess_lottery` + `is_round_open`

## Flow B: Guess Number Availability

1. resolve round ปัจจุบัน
2. ตรวจผู้ใช้ทายเลขเดียวกันในรอบนี้แล้วหรือไม่
3. ตรวจ `sold_out(number, round_label)`
4. ถ้าผ่านทุกเงื่อนไข จึง insert guess

## Flow C: Draw Announcement

Endpoint: `POST /api/draw`

- ใช้ `winningNumber` และ optional `drawDateLabel`
- map label ไปเป็น `round_label`
- update guesses ที่ยัง pending ในรอบนั้น
- set `won/lost` และ `reward_amount`

## Ranking Reset Interactions

- customer ranking มี reset date ของตัวเอง
- staff ranking มี reset date ของตัวเอง
- การแสดงผล rank ใช้ reset filter เมื่อวัน reset มีผลแล้ว

## Guess Point Cycle Interactions

- point cycle start date ถูกกำหนดได้จาก admin
- route reconcile ใช้ cycle config เพื่อ align ข้อมูล

## Edge Cases To Watch

- เปลี่ยนวัน reset แล้วกระทบ report ย้อนหลัง
- timezone ทำให้แปลความวันเปิด/ปิดรอบคลาดเคลื่อน
- draw label mapping ผิด format แล้ว fallback ไป round ปัจจุบัน
- sold-out และ unique constraints ไม่ตรงกันระหว่าง env

## Suggested Next Verification

1. สร้าง matrix ทดสอบรอบ A/B ตามวันที่จริง
2. ตรวจ timezone policy ของ server และ DB
3. ทำ integration tests สำหรับ draw + claim ต่อเนื่อง