# Backend API

## Backend Summary

Backend หลักอยู่ใน `server.js` และเป็นศูนย์กลางของทั้ง auth, transaction, ranking, lottery, admin tools, reward ledger, export/import และ storage migration

## Main API Domains

### Admin Auth

- `POST /api/login`
- `GET /api/auth/verify`
- `POST /api/logout`
- `POST /api/admin/me/password`

### Customer Auth

- `POST /api/auth/login`
- Telegram auth/config ปิดแล้วด้วย `410`
- `GET /auth/line/callback` ปิดแล้วด้วย `410`

### Staff

- `GET /api/staffs`
- `GET /api/staffs/all`
- `POST /api/staffs`
- `PUT /api/staffs/:id`
- `DELETE /api/staffs/:id`
- `DELETE /api/staffs/:id/permanent`

### Ranking

- `GET /api/ranking/staff`
- `GET /api/ranking/customers`
- `GET /api/ranking/staff-usage`

### Users / Profile / Progress

- `POST /api/users/upsert`
- `GET /api/users/:platform_id/progress`
- `GET /api/users/:platform_id/history`
- `POST /api/users/:platform_id/avatar`

### Transactions

- `POST /api/transactions`
- `GET /api/history`
- `PUT /api/history/:id/approve`
- `PUT /api/history/:id/reject`
- `DELETE /api/history/:id`
- `GET /api/history/pending/count`

### Lottery / Rewards

- `POST /api/lottery/guess`
- `POST /api/draw`
- `GET /api/sold-out`
- `POST /api/sold-out`
- `DELETE /api/sold-out/:number`
- `GET /api/admin/rewards/ledger`
- `POST /api/admin/rewards/claims`
- `DELETE /api/admin/rewards/claims/:id`

### Admin User Management

- `GET /api/admin/accounts`
- `POST /api/admin/accounts`
- `PUT /api/admin/accounts/:id`
- `DELETE /api/admin/accounts/:id`

### Admin Customer Management

- `GET /api/admin/users`
- `GET /api/admin/users/:id`
- `PUT /api/admin/users/:id`
- `DELETE /api/admin/users/:id`

### Guess Point Cycle / Reconcile

- `GET /api/admin/guess-points/cycle`
- `POST /api/admin/guess-points/cycle`
- `POST /api/admin/guess-points/reconcile`

### Export / Import

- `POST /api/admin/google-sheets/export`
- `GET /api/admin/export/:reportKey.csv`
- `GET /api/admin/export/:reportKey.xlsx`
- `GET /api/admin/export/:reportKey-editable.xlsx`
- `POST /api/admin/import/:reportKey`
- `GET /api/admin/import-logs`

### System / Stats / Storage

- `GET /api/stats`
- `GET /api/stats/guesses-by-number`
- `GET /api/round`
- `GET /api/admin/storage/status`
- `POST /api/admin/storage/migrate`

## Important Backend Behaviors

- ลูกค้า auth รับเฉพาะ `platform = line`
- การ submit transaction ต้องมี `service_date` และไฟล์สลิป
- คะแนนอยู่ในช่วง 1-10
- การ approve transaction จะเพิ่ม point และ sync state ผู้ใช้
- การ guess ต้องมี point คงเหลืออย่างน้อย 5 ในรอบปัจจุบัน
- draw จะเปลี่ยน `lottery_guesses.result` และกำหนด `reward_amount`
- reward claims รองรับการทยอยตัดยอด

## Backend Coupling Notes

- logic หลายส่วนผูกกับ `round_label`
- user identity จริงฝั่ง points ผูกผ่าน `global_user_id`
- customer rank reset และ guess point cycle ใช้ `app_settings`
- export reports ผูกกับ query ใน `server.js` โดยตรง

## Suggested Deep-Dive Areas

- points ledger consistency
- reward accounting correctness
- transaction approval side effects
- admin auth token lifecycle
- report/query duplication between docs and code