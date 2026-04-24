# Data Dictionary

## Identity Fields

### `platform`

- Current expected value: `line`
- หมายถึงช่องทาง identity ของผู้ใช้

### `platform_id`

- LINE user ID ของลูกค้า
- ใช้ค้นหาผู้ใช้และเชื่อม auth/profile flow

### `global_user_id`

- UUID ระดับ global สำหรับเชื่อม ledger `points`
- สำคัญเมื่อมีหลายบัญชีที่ต้อง sync profile หรือ reward data เข้าด้วยกัน

## Transaction Fields

### `service_date`

- วันที่ลูกค้ามาใช้บริการจริง
- ใช้กับการจัดรอบและการคำนวณ rank บางส่วน

### `status`

- `pending`
- `approved`
- `rejected`

### `round_label`

- label ของรอบกิจกรรม เช่น `2026-04-A`
- ถูกใช้กว้างมากใน logic ของ ranking, guesses, sold-out, points interpretation

### `guess_cycle`

- integer สำหรับแยกชุดกิจกรรม/ประวัติหลังการทายเลข

## Rating Fields

### `looks_score`
### `service_score`
### `value_score`

- คะแนนลับ 1-10
- แอดมินไม่ควรใช้เป็นข้อมูลแสดงผลตรงใน UI ตรวจสลิป

## Lottery Fields

### `guess_number`

- เลข 2 หลัก `00-99`

### `result`

- `pending`
- `won`
- `lost`

### `reward_amount`

- มูลค่ารางวัลเต็มก่อนคำนวณยอด claim คงเหลือ

## Reward Claim Fields

### `reward_type`

- `cashback`
- `gv`

### `claim_mode`

- ใช้กับ cashback เป็นหลัก
- ค่าที่พบในระบบ: `withdraw`, `reuse`

### `amount`

- ยอดที่ใช้สิทธิ์ครั้งนั้น ต้องมากกว่า 0

## Points Fields

### `activity_type`

ตัวอย่างที่พบใน implementation:

- `transaction_approved`
- `lottery_guess_spend`

### `points`

- จำนวนเต็ม บวกหรือลบตาม activity

### `metadata`

- JSONB สำหรับเก็บรายละเอียด source/event context

## Admin Fields

### `role`

- `admin`
- `editor`

## Note

ไฟล์นี้เป็น data dictionary ระดับใช้งานสำหรับการวิเคราะห์ต่อ ไม่ใช่ schema spec เต็ม 100% ถ้าจะใช้ทำ migration หรือ audit จริง ให้เทียบกับ SQL files และ implementation ใน `server.js` ทุกครั้ง