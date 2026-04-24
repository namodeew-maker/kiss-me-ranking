# Flow Deep Dive: Reward Claim

## Scope

โน้ตนี้สรุป flow การใช้สิทธิ์รางวัลหลังประกาศผลทายเลข โดยอิง route และ query ปัจจุบัน

## Reward Model

- ถ้าทายถูก: `result = won`, reward type เป็น `cashback`
- ถ้าทายผิด: `result = lost`, reward type เป็น `gv`
- มูลค่าเต็มเก็บใน `lottery_guesses.reward_amount`
- การทยอยใช้สิทธิ์เก็บใน `lottery_reward_claims`

## Claim Creation Flow

Endpoint: `POST /api/admin/rewards/claims`

1. รับ `lottery_guess_id`, `amount`, `claim_mode`, `redeemed_at`
2. validate input และ format
3. lock target `lottery_guesses` row (`FOR UPDATE`)
4. derive reward type จากผลการทาย
5. อ่านยอดที่เคย claim ไปแล้ว (SUM)
6. คำนวณ remaining
7. ถ้า `amount > remaining` ให้ reject
8. insert claim row ใหม่
9. commit และตอบกลับ snapshot ล่าสุด

## Claim Deletion Flow

Endpoint: `DELETE /api/admin/rewards/claims/:id`

- ลบ claim record ตาม id
- ใช้สิทธิ์ `requireAdminOnly`
- หลังลบ ยอดคงเหลือคำนวณใหม่จาก source rows ได้

## Excel Import Coupling

ผ่าน `POST /api/admin/import/reward_claims_current`:

- รองรับเฉพาะ `row_action = claim`
- validate `claim_amount`, `claim_mode`, `redeemed_at`
- ถ้าไฟล์มี error แถวเดียว rollback ทั้งไฟล์

## Business Rules In Code

- amount ต้องมากกว่า 0
- cashback บังคับ `claim_mode` เป็น `withdraw` หรือ `reuse`
- gv ไม่มี requirement เดียวกันกับ claim_mode
- claim timestamp สามารถระบุเองหรือให้ระบบใช้ `NOW()`

## Risk Spots

- race condition ถ้าไม่มี row lock (ตอนนี้มี lock แล้ว)
- import ไฟล์ใหญ่และมี error ทำให้ retry cost สูง
- การตีความ net amount (withdraw หัก %) ต้องสอดคล้องทุกหน้ารายงาน

## Suggested Hardening

- เพิ่ม explicit domain service สำหรับ reward accounting
- แยก validation rules เป็น shared function ระหว่าง API และ import
- เพิ่ม test case สำหรับ partial claims หลายลำดับ