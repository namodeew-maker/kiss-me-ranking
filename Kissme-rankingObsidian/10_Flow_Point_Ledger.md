# Flow Deep Dive: Point Ledger

## Scope

โน้ตนี้อธิบาย flow ของ point ledger ตาม implementation ปัจจุบันใน `server.js` และ schema `points`

## Source Of Truth

- ledger แต้มจริงอยู่ที่ตาราง `points`
- `users.progress_count` เป็น state สำหรับ progress UI ในรอบ ไม่ใช่ยอดแต้มสะสมทั้งหมด

## Point Events Found In Runtime

### Credit

- เมื่อ transaction ถูก approve ระบบเพิ่ม point ผ่าน logic `addApprovedTransactionPoint(...)`
- event type ที่พบ: `transaction_approved`

### Debit

- เมื่อผู้ใช้ทายเลข 1 ครั้ง ระบบ insert `points = -5`
- event type ที่พบ: `lottery_guess_spend`

## Main Runtime Paths

### Path A: Approve Transaction -> Add Point

1. `PUT /api/history/:id/approve`
2. lock transaction row
3. เปลี่ยนสถานะ `pending -> approved`
4. เรียก `addApprovedTransactionPoint(...)`
5. sync state ผู้ใช้ผ่าน `syncUserRoundState(...)`
6. response กลับพร้อมแต้มรอบล่าสุด

### Path B: Guess Lottery -> Spend Point

1. `POST /api/lottery/guess`
2. ตรวจ round เปิดอยู่
3. โหลด user และ `global_user_id`
4. อ่านแต้มรอบผ่าน `getRoundPointsForGlobalUser(...)`
5. ถ้าแต้ม < 5 ให้ reject
6. insert `lottery_guesses`
7. insert points row ที่ `points = -5`
8. คำนวณยอดคงเหลือแล้วตอบกลับ

### Path C: Reconcile

1. `POST /api/admin/guess-points/reconcile`
2. ลบ point rows ที่ invalid/orphan
3. เติมแต้มที่ควรมีแต่หายไป
4. sync state ผู้ใช้ที่ได้รับผลกระทบ
5. สรุปจำนวนรายการที่แก้ไข

## Ledger Integrity Controls

- ใช้ DB transaction ในหลาย flow สำคัญ
- ใช้ `global_user_id` เป็น identity กลางของ ledger
- มี reconcile endpoint สำหรับซ่อม data drift
- debit event ผูก metadata กับ `lottery_guess_id`

## Potential Failure Modes

- transaction ถูก approve แต่ point ไม่ถูก insert
- lottery guess ถูกสร้าง แต่ debit point พลาด
- data legacy ทำให้ `global_user_id` ขาด/ไม่ตรง
- การลบประวัติบางแบบทำให้ point orphan ถ้าไม่ผ่าน flow ที่คาดไว้

## Suggested Monitoring Queries

- ตรวจ users ที่ approved transaction สูง แต่ points event ต่ำผิดปกติ
- ตรวจ guesses ที่ไม่มี `lottery_guess_spend` event
- ตรวจ points rows ที่ metadata อ้างถึง entity ที่ไม่มีอยู่แล้ว

## Follow-up Ideas

- แยก ledger service ออกจาก route
- เพิ่ม idempotency key สำหรับ event สำคัญ
- เพิ่ม audit table สำหรับ point reconciliation