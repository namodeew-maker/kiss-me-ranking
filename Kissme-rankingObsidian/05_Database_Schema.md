# Database Schema

## Primary Schema Files

- `init-db.sql`
- `init-db-unified.sql`
- `migrate-unified.sql`
- `migrate-guess-cycle.sql`
- `migrate-rating-scale-10.sql`
- `migrate-reward-claim-mode.sql`
- `migrate-sold-out-round.sql`
- `migrate-remove-staff-duplicate-constraint.sql`

## Main Tables

### `users`

เก็บบัญชีลูกค้า LINE และ global identity ที่ใช้เชื่อมไปยัง points ledger

คอลัมน์สำคัญ:

- `platform`
- `platform_id`
- `display_name`
- `picture_url`
- `global_user_id`
- `progress_count`

### `staffs`

เก็บข้อมูลพนักงานที่เข้าร่วมกิจกรรม

### `transactions`

บันทึกรายการส่งสลิปและสถานะตรวจสอบ

คอลัมน์สำคัญ:

- `user_id`
- `staff_id`
- `slip_image_url`
- `service_date`
- `guess_cycle`
- `status`
- `round_label`
- `reviewed_by`
- `reviewed_at`

### `ratings`

คะแนนลับ 3 ด้านต่อ transaction

- `looks_score`
- `service_score`
- `value_score`

### `lottery_guesses`

บันทึกการทายเลขของลูกค้า

- `guess_number`
- `round_label`
- `result`
- `reward_amount`

### `lottery_reward_claims`

บันทึกการทยอยใช้สิทธิ์ reward

- `reward_type`
- `claim_mode`
- `amount`
- `redeemed_by`
- `redeemed_at`

### `sold_out`

ใช้กันเลขซ้ำในแต่ละรอบ

### `admin_users`

เก็บ credential และ role ของผู้ดูแล

### `points`

ledger สะสมและใช้ points โดยอิง `global_user_id`

### `app_settings`

เก็บค่า dynamic settings เช่นวันรีอันดับ และรอบนับแต้ม

## Key Constraints

- `users(platform, platform_id)` unique
- `users(global_user_id)` unique
- `lottery_guesses(user_id, round_label, guess_number)` unique
- `sold_out(number, round_label)` unique
- คะแนนใน `ratings` ต้องอยู่ 1-10
- `lottery_reward_claims.amount > 0`

## Data Relationships

```text
users -> transactions -> ratings
users -> lottery_guesses -> lottery_reward_claims
users(global_user_id) -> points
staffs -> transactions
admin_users -> transaction review / reward redemption / admin auth
app_settings -> runtime behavior
```

## Important Runtime Meanings

- `progress_count` เป็น UI/state ช่วงสั้น ไม่ใช่ source of truth ของแต้มทั้งหมด
- แต้มจริงมาจาก `points`
- `round_label` เป็นแกนของ transaction, guess, sold-out, และ rank calculation หลายส่วน
- `guess_cycle` ยังถูกเก็บไว้เพื่อแยกประวัติ แม้กติกาบางส่วนเปลี่ยนแล้ว

## Migration Watchlist

- ตรวจว่าทุก environment รัน migration ครบหรือไม่
- ตรวจความสอดคล้องของ constraints กับ business rules ล่าสุด
- ระวัง legacy comment ใน migration ที่พูดถึง Telegram แม้ runtime ปัจจุบันเป็น LINE-only