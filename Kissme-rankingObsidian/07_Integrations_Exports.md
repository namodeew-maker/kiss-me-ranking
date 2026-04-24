# Integrations And Exports

## Current External Integrations

### LINE LIFF

- ใช้สำหรับ customer login ฝั่ง client
- runtime ปัจจุบันเป็น LINE-only

### Cloudflare R2

- ใช้เก็บรูปสลิปและ avatar เมื่อเปิดใช้งาน

### Google Sheets Export Design

ตาม `POSTGRES_TO_GOOGLE_SHEETS_ARCHITECTURE.md` แนวทางที่แนะนำคือ:

`PostgreSQL -> Express API / Sync Service -> Google Sheets API -> Google Sheet`

แนวคิดสำคัญ:

- ไม่ให้ Google Sheets ต่อ database ตรง
- backend เป็นตัวคุม query, auth, logging, rate limit
- รองรับ manual sync, scheduled sync, และ report-based sync

## Export/Import Features Found In Code

### Reports

- `leaderboard`
- `members`
- `reward_claims_current`

### Output Formats

- CSV
- XLSX
- editable XLSX สำหรับบาง report

### Import Support

- `members`
- `reward_claims_current`

## Import Safety Rules

จาก `EXCEL_ADMIN_GUIDE.md`:

- ถ้าแถวเดียวผิด ระบบ rollback ทั้งไฟล์
- ควรใช้ไฟล์ template ที่ระบบสร้างให้
- leaderboard เป็น read-only
- ต้อง validate `claim_mode`, `redeemed_at`, และ field ที่อนุญาตให้แก้

## Disabled Integrations

- Telegram login and messaging
- Company webhook activity receiver
- legacy server-side LINE callback

## Future Analysis Ideas

- แยก export services ออกจาก `server.js`
- ทำ report definitions ให้ reusable มากขึ้น
- เพิ่ม audit trail ของ export/sync แบบเป็นระบบ
- เปรียบเทียบ CSV/XLSX กับ eventual Google Sheets sync flow