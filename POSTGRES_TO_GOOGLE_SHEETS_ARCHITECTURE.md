# PostgreSQL to Google Sheets Architecture

## เป้าหมาย

ออกแบบสถาปัตยกรรมสำหรับโปรเจกต์ `Kiss Me Ranking` เพื่อดึงข้อมูลจาก `PostgreSQL` ไปยัง `Google Sheets` แบบที่:

- ควบคุมได้ว่าจะดึงข้อมูลอะไร
- กำหนดได้ว่าจะ sync เมื่อไร
- จำกัดสิทธิ์การเข้าถึงได้
- ไม่เปิดฐานข้อมูลให้ Google Sheets เชื่อมตรง
- รองรับการขยายต่อในอนาคต เช่น export หลายชีต, หลายรายงาน, incremental sync

จากโครงสร้างปัจจุบันของโปรเจกต์:

- Backend ใช้ `Node.js + Express`
- Database ใช้ `PostgreSQL` ผ่าน package `pg`
- มี `.env` และ `server.js` อยู่แล้ว

ดังนั้นแนวทางที่เหมาะที่สุดคือใช้ `Backend ตัวเดิม` เป็นตัวกลางระหว่าง `PostgreSQL` และ `Google Sheets`

## สรุปแนวทางที่แนะนำ

ใช้สถาปัตยกรรมแบบ:

`PostgreSQL -> Express API / Sync Service -> Google Sheets API -> Google Sheet`

โดยไม่ให้ Google Sheets ต่อเข้าฐานข้อมูลโดยตรง

### เหตุผลที่เลือกแบบนี้

- ใช้ stack เดิมของโปรเจกต์ได้เลย
- ซ่อนข้อมูลเชื่อมต่อฐานข้อมูลไว้ที่ backend
- คุม query, validation, logging, auth, rate limit ได้
- เลือกได้ว่าจะให้ sync แบบ manual, scheduled, หรือ on-demand
- ลดความเสี่ยงจากการเปิด PostgreSQL ออกอินเทอร์เน็ตเพื่อให้ Apps Script ต่อเอง

## ภาพรวมองค์ประกอบ

### 1. PostgreSQL

แหล่งข้อมูลหลักของระบบ เช่น:

- ข้อมูลสมาชิก
- คะแนน
- ประวัติ claim reward
- ตารางคะแนนหรือสรุปผลรายวัน

ควรเตรียมข้อมูลสำหรับ export ผ่าน:

- `VIEW` สำหรับรายงานที่อ่านอย่างเดียว
- หรือ `SELECT query` ที่ backend ควบคุมเอง

### 2. Express Backend

เพิ่มโมดูลใหม่ใน backend ปัจจุบัน เช่น:

- `services/googleSheetsService.js`
- `services/exportQueryService.js`
- `routes/adminExportRoutes.js`

หน้าที่หลัก:

- อ่านข้อมูลจาก PostgreSQL
- แปลงข้อมูลให้อยู่ในรูปที่ Google Sheets รับได้
- เขียนข้อมูลลง Google Sheets
- บังคับ auth ก่อน export
- log การ sync
- จำกัดรูปแบบการเรียกใช้งาน

### 3. Google Sheets API

backend จะใช้ `Google Service Account` เป็นตัวเขียนข้อมูลลงชีตผ่าน Google API

เหมาะกว่าใช้ Apps Script เป็นแกนหลักในกรณีนี้ เพราะ:

- credential อยู่ฝั่ง server
- ควบคุมการ deploy และ versioning ได้จาก repo เดิม
- ทำงานร่วมกับ business logic ใน `server.js` ได้ง่ายกว่า

### 4. Google Sheet ปลายทาง

ใช้เป็นปลายทางสำหรับ:

- ทีมงานเปิดดูรายงาน
- ทำ pivot / chart เพิ่มเอง
- แชร์ให้คนที่ไม่ควรเข้าฐานข้อมูลโดยตรง

โครงสร้างแนะนำ:

- 1 spreadsheet ต่อ 1 กลุ่มรายงาน
- แยกแต่ละ report เป็นคนละ sheet tab
- มี tab ชื่อ `sync_logs` หรือ `metadata` สำหรับเก็บเวลาซิงก์ล่าสุด

## Data Flow ที่แนะนำ

### Flow A: Manual Sync จาก Admin

เหมาะเมื่ออยากกดปุ่มเองจากหลังบ้าน

1. Admin กดปุ่ม `Export to Google Sheets`
2. Frontend เรียก API ของ backend
3. Backend ตรวจสิทธิ์
4. Backend รัน query หรืออ่านจาก view ใน PostgreSQL
5. Backend เขียนข้อมูลไปยัง Google Sheets
6. Backend บันทึก log และส่งผลลัพธ์กลับ

### Flow B: Scheduled Sync

เหมาะกับรายงานที่ต้องอัปเดตอัตโนมัติ เช่น ทุก 1 ชั่วโมง หรือทุกวัน

1. Scheduler ภายใน backend ทำงานตามเวลา
2. เรียก service export
3. ดึงข้อมูลจาก PostgreSQL
4. เขียนทับหรือ append ลง Google Sheets
5. บันทึกสถานะสำเร็จหรือ error

### Flow C: On-demand Sync ตาม Report Type

เหมาะเมื่อมีหลายรายงาน เช่น:

- leaderboard
- rewards
- member summary
- daily transactions

Backend รับ parameter `reportKey` แล้วเลือก query + sheet tab ตามรายงานนั้น

## โครงสร้างเชิงสถาปัตยกรรม

```text
Admin UI / Internal Trigger / Scheduler
                |
                v
      Express Export Controller
                |
                v
        Export Query Service
                |
                v
           PostgreSQL
                |
                v
      Google Sheets Service
                |
                v
         Google Sheets API
                |
                v
          Spreadsheet Tabs
```

## รูปแบบการ sync ที่ควรใช้

มี 3 แบบหลัก และควรเลือกให้เหมาะกับแต่ละรายงาน

### 1. Full Refresh

ล้างข้อมูลเก่าใน sheet tab แล้วเขียนใหม่ทั้งหมด

เหมาะกับ:

- leaderboard
- รายงานสรุป
- ตารางที่จำนวนแถวไม่มากเกินไป

ข้อดี:

- logic ง่าย
- ลดปัญหาข้อมูลซ้ำ
- ดูแลง่าย

ข้อเสีย:

- ถ้าข้อมูลเยอะมากจะช้ากว่าแบบ incremental

### 2. Append Only

เพิ่มเฉพาะแถวใหม่ต่อท้าย

เหมาะกับ:

- event log
- transaction history
- audit trail

ข้อดี:

- เร็ว
- ไม่ต้อง rewrite ทั้งชีต

ข้อเสีย:

- ต้องมี logic กันข้อมูลซ้ำ

### 3. Incremental Upsert

อัปเดตเฉพาะแถวที่เปลี่ยน โดยอิงจาก `id` หรือ `updated_at`

เหมาะกับ:

- member summary
- reward claim status
- ข้อมูลที่มีการเปลี่ยนสถานะภายหลัง

ข้อดี:

- ประหยัดเวลาเมื่อข้อมูลเยอะ

ข้อเสีย:

- logic ซับซ้อนกว่า
- ทำบน Google Sheets ยุ่งกว่า full refresh

### คำแนะนำสำหรับโปรเจกต์นี้

เริ่มจาก `Full Refresh` ก่อนในเฟสแรก เพราะดูแลง่ายและปลอดภัยที่สุด

## สิทธิ์และความปลอดภัย

### หลักการสำคัญ

- ไม่เปิด credential PostgreSQL ให้ Google Sheets หรือผู้ใช้ปลายทางเห็น
- ไม่ให้ frontend ยิง query SQL เอง
- จำกัดรายงานที่ export ได้ด้วย `reportKey` ที่กำหนดไว้ล่วงหน้า

### แนวทางที่แนะนำ

1. ใช้ `Google Service Account`
2. แชร์ Google Sheet ปลายทางให้ email ของ service account
3. เก็บ credential ไว้ใน `.env` หรือ secret manager
4. จำกัด API export เฉพาะ admin
5. ใช้ audit log ทุกครั้งที่มีการ sync
6. ใส่ rate limit ให้ route export

### ตัวอย่าง env ที่จะต้องเพิ่ม

```env
GOOGLE_SHEETS_SPREADSHEET_ID=1LulNFgvejjEV0Hod3xMURSfHzBVXcw7EkhSZCpXqzKs
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_ENABLED=true
GOOGLE_SHEETS_DEFAULT_MODE=full_refresh
EXPORT_SYNC_SECRET=some_internal_secret
```

หมายเหตุ:

- ถ้า deploy บน platform ที่รองรับ secret manager ควรเก็บ private key ไว้ที่นั่นแทน `.env`

## รูปแบบ API ที่แนะนำ

### Route สำหรับ sync แบบ manual

`POST /api/admin/google-sheets/sync`

request body ตัวอย่าง:

```json
{
  "reportKey": "leaderboard",
  "mode": "full_refresh"
}
```

response ตัวอย่าง:

```json
{
  "ok": true,
  "reportKey": "leaderboard",
  "mode": "full_refresh",
  "rowsWritten": 128,
  "sheetName": "leaderboard",
  "syncedAt": "2026-04-18T10:30:00.000Z"
}
```

### Route สำหรับดูสถานะล่าสุด

`GET /api/admin/google-sheets/status`

ใช้ดูว่า:

- sync ล่าสุดเมื่อไร
- สำเร็จหรือไม่
- report ไหน error

## รูปแบบ Query Layer ที่แนะนำ

ไม่ควรให้มี SQL query แบบ dynamic จาก user input ตรง ๆ

ควรใช้ mapping แบบนี้:

```js
const REPORT_DEFINITIONS = {
  leaderboard: {
    sheetName: 'leaderboard',
    mode: 'full_refresh',
    query: `SELECT ...`
  },
  rewards_claims: {
    sheetName: 'rewards_claims',
    mode: 'full_refresh',
    query: `SELECT ...`
  }
};
```

ข้อดี:

- ปลอดภัยกว่า
- ทดสอบง่าย
- คุม schema ที่จะส่งออกได้

## โครงสร้างไฟล์ที่แนะนำ

```text
server.js
services/
  exportQueryService.js
  googleSheetsService.js
  exportLogService.js
routes/
  adminExportRoutes.js
config/
  reportDefinitions.js
docs/
  postgres-to-google-sheets-architecture.md
```

ถ้ายังไม่อยากย้ายโครงสร้างเยอะในรอบแรก สามารถเริ่มจากเพิ่ม service file ก่อน แล้วค่อย refactor routes ภายหลัง

## แนวทางออกแบบ Report Definitions

แต่ละรายงานควรมี metadata ชัดเจน เช่น:

- `reportKey`
- `sheetName`
- `syncMode`
- `query`
- `headers`
- `allowedRoles`

ตัวอย่างแนวคิด:

```js
{
  reportKey: 'leaderboard',
  sheetName: 'Leaderboard',
  syncMode: 'full_refresh',
  allowedRoles: ['admin'],
  headers: ['rank', 'member_id', 'display_name', 'score', 'updated_at']
}
```

## Logging และ Monitoring

ควรมีการเก็บ log ทุกครั้งที่ sync เช่น:

- `report_key`
- `started_at`
- `finished_at`
- `status`
- `rows_written`
- `triggered_by`
- `error_message`

สามารถเก็บได้ 2 ชั้น:

### ชั้นที่ 1: Application log

เก็บใน console / PM2 log / platform log

### ชั้นที่ 2: Database log table

สร้าง table เช่น `export_sync_logs`

ข้อดี:

- admin เปิดย้อนหลังได้
- ทำ dashboard ได้
- ใช้ debug ปัญหาได้ง่าย

## ข้อเสนอเรื่อง Scheduler

ถ้าต้องการ auto sync มี 2 ทางเลือก

### ทางเลือก A: ใช้ cron ภายใน Node.js

เช่น package `node-cron`

เหมาะเมื่อ:

- มี backend instance เดียว
- deployment ไม่ซับซ้อน

ข้อควรระวัง:

- ถ้ามีหลาย instance อาจยิงซ้ำ

### ทางเลือก B: ใช้ external scheduler

เช่น:

- GitHub Actions schedule
- VPS cron
- Cloud scheduler
- PM2 trigger + cron

เหมาะกว่าในระยะยาว เพราะควบคุมรอบการยิงชัดกว่า

### คำแนะนำสำหรับโปรเจกต์นี้

ถ้า deploy บน VPS และมี `PM2` อยู่แล้ว ให้เริ่มจาก `server route + VPS cron` จะคุมง่ายและแยกความรับผิดชอบชัด

## แนวทางเรื่อง Performance

เพื่อให้ export ทำงานเสถียร:

- จำกัดจำนวนแถวต่อ report ถ้าไม่จำเป็นต้องส่งทั้งหมด
- ใช้ `VIEW` หรือ query ที่มี index รองรับ
- ถ้าข้อมูลเยอะมาก ให้แยก report เป็นรายวันหรือรายเดือน
- แปลงข้อมูลเป็น array ครั้งเดียวก่อนส่งเข้า Sheets API
- ถ้าเขียนหลาย tab ให้ทำทีละ tab พร้อม log ชัดเจน

## Error Handling ที่ควรมี

ต้องรองรับกรณี:

- Google credential ไม่ถูกต้อง
- spreadsheet id ผิด
- sheet tab ไม่มี
- query error
- network timeout
- quota ของ Google API เต็ม

แนวทาง:

- ห่อทุกขั้นด้วย try/catch
- log error แบบอ่านได้
- ส่ง response ที่บอกว่า fail ขั้นไหน
- ถ้า scheduled sync ล้มเหลว ควร retry ได้

## เฟสการพัฒนาที่แนะนำ

### Phase 1: Manual Export พื้นฐาน

ขอบเขต:

- เชื่อม Google Sheets API
- ทำ 1 report ก่อน เช่น leaderboard
- ทำ API sync แบบ admin only
- ใช้ full refresh
- บันทึก log ขั้นพื้นฐาน

ผลลัพธ์:

- ทีมงานกด export เองได้
- ใช้งานจริงได้เร็วที่สุด

### Phase 2: หลาย Report และสถานะ Sync

ขอบเขต:

- รองรับหลาย `reportKey`
- มี endpoint ดูสถานะ
- มี log table ใน PostgreSQL
- แยก config รายงานชัดเจน

### Phase 3: Scheduled Sync

ขอบเขต:

- ตั้ง cron อัตโนมัติ
- แยก manual กับ scheduled trigger
- แจ้งเตือนเมื่อ sync fail

### Phase 4: Incremental Sync

ขอบเขต:

- ใช้ `updated_at` หรือ `id` เป็นจุดอ้างอิง
- ลดเวลาการ sync สำหรับข้อมูลขนาดใหญ่

## สิ่งที่ต้องใช้

### ฝั่ง Google

- Google Cloud Project
- เปิดใช้งาน `Google Sheets API`
- Service Account
- JSON credential หรือค่า key ที่แยกใส่ env
- Google Spreadsheet ปลายทาง

### ฝั่ง Backend

- package `googleapis`
- service layer สำหรับ export
- route สำหรับ admin
- env สำหรับ Google credentials

### ฝั่ง Database

- query หรือ view ที่เตรียมไว้สำหรับ export
- table log ถ้าต้องการ audit

## Dependency ที่คาดว่าจะเพิ่ม

```bash
npm install googleapis
```

ถ้าต้องการ schedule ในตัว:

```bash
npm install node-cron
```

## สถาปัตยกรรมที่ไม่แนะนำสำหรับโปรเจกต์นี้

### 1. ให้ Google Sheets ต่อ PostgreSQL โดยตรง

ไม่แนะนำ เพราะ:

- เสี่ยงเรื่อง security
- คุม query ยาก
- rotate credential ลำบาก
- ผูกกับ network/database access โดยตรง

### 2. ใช้ Apps Script เป็นตัวหลักทั้งหมด

ทำได้ แต่ไม่เหมาะที่สุดกับโปรเจกต์นี้ เพราะตอนนี้มี backend Node อยู่แล้ว

ข้อเสียเมื่อเทียบกับ backend เดิม:

- business logic กระจัดกระจาย
- version control ไม่แน่นเท่า repo หลัก
- debug ยากกว่าในงานที่โตขึ้น

## โครงสร้าง Google Sheets ระดับคอลัมน์

แนวคิดหลักคือแยกชีตออกเป็น 3 กลุ่ม:

- `Raw Data Sheets` สำหรับข้อมูลที่ backend เขียนลงตรง ๆ
- `Reporting Sheets` สำหรับสูตร, pivot, chart, และสรุปผล
- `System Sheets` สำหรับควบคุมงาน sync และเก็บ log

หลักการสำคัญ:

- ชีตที่ backend เขียน ควรหลีกเลี่ยงการใส่สูตรที่แก้ไขเองในคอลัมน์เดียวกัน
- ชีตที่เป็น dashboard หรือสรุปผล ควรดึงจาก raw sheets ด้วย formula
- รายงานที่เป็น snapshot หรือ summary ใช้ `full refresh`
- รายงานที่เป็นประวัติถาวรใช้ `append only`

### 1. `Dashboard`

ประเภท: `Reporting Sheet`

Sync mode: `ไม่ให้ backend เขียนตรง`

หน้าที่:

- แสดง KPI หลัก
- แสดงเวลา sync ล่าสุด
- แสดงกราฟแนวโน้ม
- เป็นหน้าหลักสำหรับทีมงาน

บล็อกข้อมูลที่แนะนำ:

- `B2`: last sync time
- `B3`: sync status
- `B5`: total members
- `B6`: active members
- `B7`: total points balance
- `B8`: today claims
- `B9`: today redeemed points
- `B11:B17`: top 7 leaderboard summary

แหล่งอ้างอิง:

- `Members`
- `Leaderboard`
- `Reward_Claims`
- `Daily_Summary`
- `Sync_Log`

หมายเหตุ:

- ให้ใช้ formula เช่น `QUERY`, `FILTER`, `INDEX`, `SORT`, `UNIQUE`, `SUMIFS`
- ถ้าต้องการกราฟ ให้สร้างจาก `Daily_Summary`

### 2. `Leaderboard`

ประเภท: `Raw Data Sheet`

Sync mode: `full refresh`

เหตุผล:

- เป็นข้อมูลอันดับล่าสุด ณ เวลานั้น
- ไม่ต้องเก็บ snapshot ทุกครั้งในชีตนี้

คอลัมน์ที่แนะนำ:

| Column | Field | Type | Description |
|---|---|---|---|
| A | export_date | date | วันที่ export |
| B | export_datetime | datetime | เวลาที่ sync |
| C | rank | integer | ลำดับอันดับ |
| D | member_id | string | รหัสสมาชิก |
| E | line_user_id | string | LINE user id |
| F | display_name | string | ชื่อที่แสดง |
| G | phone | string | เบอร์โทร |
| H | total_score | number | คะแนนรวม |
| I | available_points | number | คะแนนคงเหลือ |
| J | tier_name | string | ระดับสมาชิก |
| K | rewards_claimed_count | integer | จำนวนครั้งที่เคย claim |
| L | last_activity_at | datetime | เวลากิจกรรมล่าสุด |
| M | updated_at | datetime | เวลาปรับปรุงข้อมูลล่าสุดจาก DB |

แนะนำ query source:

- ดึงจาก view เช่น `vw_leaderboard_export`

### 3. `Members`

ประเภท: `Raw Data Sheet`

Sync mode: `full refresh`

เหตุผล:

- เป็น master data ปัจจุบัน
- ต้องการมุมมองล่าสุด ไม่ใช่ประวัติทุกเวอร์ชัน

คอลัมน์ที่แนะนำ:

| Column | Field | Type | Description |
|---|---|---|---|
| A | export_date | date | วันที่ export |
| B | export_datetime | datetime | เวลาที่ sync |
| C | member_id | string | รหัสสมาชิก |
| D | line_user_id | string | LINE user id |
| E | display_name | string | ชื่อที่แสดง |
| F | first_name | string | ชื่อจริง |
| G | last_name | string | นามสกุล |
| H | phone | string | เบอร์โทร |
| I | email | string | อีเมล |
| J | branch_code | string | รหัสสาขาที่ดูแล |
| K | branch_name | string | ชื่อสาขา |
| L | total_score | number | คะแนนรวมสะสม |
| M | available_points | number | คะแนนคงเหลือปัจจุบัน |
| N | lifetime_redeemed_points | number | คะแนนที่ใช้ไปสะสม |
| O | tier_name | string | ระดับสมาชิก |
| P | status | string | สถานะสมาชิก |
| Q | is_blocked | boolean | ถูกระงับหรือไม่ |
| R | registered_at | datetime | วันที่สมัคร |
| S | last_login_at | datetime | วันที่เข้าใช้งานล่าสุด |
| T | last_activity_at | datetime | เวลากิจกรรมล่าสุด |
| U | updated_at | datetime | เวลาปรับปรุงข้อมูลล่าสุด |

หมายเหตุ:

- ถ้าระบบจริงไม่มีบางคอลัมน์ ให้ลดตาม schema ปัจจุบันได้
- ถ้ามีข้อมูลส่วนบุคคลอ่อนไหว ควรตัด `email` หรือ `phone` บางส่วนก่อน export

### 4. `Reward_Claims`

ประเภท: `Raw Data Sheet`

Sync mode: `append only`

เหตุผล:

- เป็นประวัติธุรกรรมที่ควรเก็บต่อเนื่อง
- เหมาะกับการ audit และย้อนหลัง

คอลัมน์ที่แนะนำ:

| Column | Field | Type | Description |
|---|---|---|---|
| A | export_date | date | วันที่ export |
| B | export_datetime | datetime | เวลาที่ sync |
| C | claim_id | string | รหัส claim |
| D | member_id | string | รหัสสมาชิก |
| E | line_user_id | string | LINE user id |
| F | display_name | string | ชื่อสมาชิก |
| G | reward_id | string | รหัสรางวัล |
| H | reward_name | string | ชื่อรางวัล |
| I | reward_category | string | ประเภทรางวัล |
| J | claim_mode | string | รูปแบบการ claim |
| K | points_used | number | คะแนนที่ใช้ |
| L | quantity | integer | จำนวนที่แลก |
| M | status | string | สถานะ claim |
| N | approval_status | string | สถานะอนุมัติ |
| O | branch_code | string | รหัสสาขา |
| P | branch_name | string | ชื่อสาขา |
| Q | requested_at | datetime | เวลาที่ส่งคำขอ |
| R | approved_at | datetime | เวลาที่อนุมัติ |
| S | fulfilled_at | datetime | เวลาส่งมอบสำเร็จ |
| T | cancelled_at | datetime | เวลายกเลิก |
| U | reference_no | string | เลขอ้างอิงภายใน |
| V | note | string | หมายเหตุ |
| W | updated_at | datetime | เวลาปรับปรุงข้อมูลล่าสุด |

เงื่อนไขการ append:

- append เฉพาะ `claim_id` ที่ยังไม่มีในชีต
- ถ้ามีการเปลี่ยนสถานะย้อนหลัง แนะนำเพิ่มชีตเสริม `Reward_Claims_Current`

### 5. `Reward_Claims_Current`

ประเภท: `Raw Data Sheet`

Sync mode: `full refresh`

เหตุผล:

- ใช้ดูสถานะล่าสุดของแต่ละ claim
- แก้ข้อจำกัดของ `append only` ที่ไม่สะท้อน state ล่าสุดได้ดี

คอลัมน์:

- ใช้คอลัมน์เดียวกับ `Reward_Claims`

แนวทาง:

- `Reward_Claims` เก็บประวัติสะสม
- `Reward_Claims_Current` ใช้สำหรับทำงานประจำวันและดูสถานะล่าสุด

### 6. `Transactions`

ประเภท: `Raw Data Sheet`

Sync mode: `append only`

เหตุผล:

- เป็น event/ledger log
- ควรเก็บต่อเนื่องและไม่ลบทับ

คอลัมน์ที่แนะนำ:

| Column | Field | Type | Description |
|---|---|---|---|
| A | export_date | date | วันที่ export |
| B | export_datetime | datetime | เวลาที่ sync |
| C | transaction_id | string | รหัสธุรกรรม |
| D | member_id | string | รหัสสมาชิก |
| E | line_user_id | string | LINE user id |
| F | display_name | string | ชื่อสมาชิก |
| G | transaction_type | string | ประเภท เช่น earn, redeem, adjust |
| H | transaction_subtype | string | ประเภทย่อย |
| I | points_delta | number | จำนวนคะแนนที่เปลี่ยน |
| J | balance_after | number | ยอดคงเหลือหลังรายการ |
| K | source_table | string | ตารางต้นทาง |
| L | source_id | string | id ของรายการต้นทาง |
| M | branch_code | string | รหัสสาขา |
| N | branch_name | string | ชื่อสาขา |
| O | note | string | หมายเหตุ |
| P | created_by | string | ผู้สร้างรายการ |
| Q | created_at | datetime | เวลาสร้างรายการ |
| R | updated_at | datetime | เวลาปรับปรุงข้อมูลล่าสุด |

เงื่อนไขการ append:

- append เฉพาะ `transaction_id` ใหม่

### 7. `Daily_Summary`

ประเภท: `Reporting Data Sheet`

Sync mode: `full refresh`

เหตุผล:

- เป็นข้อมูล aggregate ตามวัน
- คำนวณใหม่ทุกครั้งง่ายกว่าและลดความผิดพลาดสะสม

คอลัมน์ที่แนะนำ:

| Column | Field | Type | Description |
|---|---|---|---|
| A | summary_date | date | วันที่สรุป |
| B | new_members | integer | สมาชิกใหม่ |
| C | active_members | integer | สมาชิกที่ active |
| D | total_transactions | integer | จำนวนธุรกรรม |
| E | points_earned | number | คะแนนที่ได้รับรวม |
| F | points_redeemed | number | คะแนนที่ใช้รวม |
| G | reward_claims_requested | integer | จำนวนคำขอ claim |
| H | reward_claims_approved | integer | จำนวน claim ที่อนุมัติ |
| I | reward_claims_completed | integer | จำนวน claim ที่สำเร็จ |
| J | reward_claims_cancelled | integer | จำนวน claim ที่ยกเลิก |
| K | cashback_count | integer | จำนวนรายการ cashback |
| L | gv_count | integer | จำนวนรายการ GV |
| M | top_branch_code | string | รหัสสาขาที่เด่นที่สุด |
| N | top_branch_name | string | ชื่อสาขาที่เด่นที่สุด |
| O | generated_at | datetime | เวลาสร้าง summary |

เหมาะสำหรับ:

- กราฟรายวัน
- dashboard
- monthly review

### 8. `Branch_Summary`

ประเภท: `Reporting Data Sheet`

Sync mode: `full refresh`

เหตุผล:

- เป็นรายงานสรุปตามสาขา ณ ปัจจุบัน
- ไม่จำเป็นต้องเก็บสะสมแบบ append

คอลัมน์ที่แนะนำ:

| Column | Field | Type | Description |
|---|---|---|---|
| A | export_date | date | วันที่ export |
| B | branch_code | string | รหัสสาขา |
| C | branch_name | string | ชื่อสาขา |
| D | members_count | integer | จำนวนสมาชิก |
| E | active_members_count | integer | จำนวนสมาชิก active |
| F | total_score | number | คะแนนรวม |
| G | available_points | number | คะแนนคงเหลือรวม |
| H | claims_requested | integer | จำนวนคำขอ claim |
| I | claims_completed | integer | จำนวน claim สำเร็จ |
| J | redeemed_points | number | คะแนนที่ถูกใช้ |
| K | last_activity_at | datetime | เวลากิจกรรมล่าสุดของสาขา |
| L | updated_at | datetime | เวลาสรุปล่าสุด |

### 9. `Rewards_Catalog`

ประเภท: `Raw Data Sheet`

Sync mode: `full refresh`

เหตุผล:

- เป็นข้อมูล master ของรางวัล
- ต้องการสถานะล่าสุด เช่น stock, active status

คอลัมน์ที่แนะนำ:

| Column | Field | Type | Description |
|---|---|---|---|
| A | export_date | date | วันที่ export |
| B | reward_id | string | รหัสรางวัล |
| C | reward_name | string | ชื่อรางวัล |
| D | reward_category | string | ประเภทรางวัล |
| E | claim_mode | string | รูปแบบการรับสิทธิ์ |
| F | points_cost | number | คะแนนที่ใช้ |
| G | stock_qty | integer | จำนวน stock |
| H | sold_out_flag | boolean | หมดหรือไม่ |
| I | active_flag | boolean | เปิดใช้งานหรือไม่ |
| J | display_order | integer | ลำดับแสดงผล |
| K | start_at | datetime | วันเริ่มใช้ |
| L | end_at | datetime | วันสิ้นสุด |
| M | updated_at | datetime | เวลาปรับปรุงล่าสุด |

### 10. `Sync_Log`

ประเภท: `System Sheet`

Sync mode: `append only`

เหตุผล:

- ต้องเก็บประวัติการ sync ทุกครั้ง
- ใช้ตรวจสอบย้อนหลังและ debug

คอลัมน์ที่แนะนำ:

| Column | Field | Type | Description |
|---|---|---|---|
| A | run_id | string | รหัสรอบ sync |
| B | report_key | string | ชื่อรายงาน |
| C | target_sheet | string | ชื่อชีตปลายทาง |
| D | sync_mode | string | full_refresh / append_only |
| E | trigger_type | string | manual / cron / api |
| F | triggered_by | string | ผู้ใช้หรือระบบที่สั่ง |
| G | status | string | success / failed / partial |
| H | rows_read | integer | จำนวนแถวที่อ่านจาก DB |
| I | rows_written | integer | จำนวนแถวที่เขียนลงชีต |
| J | started_at | datetime | เวลาเริ่ม |
| K | finished_at | datetime | เวลาจบ |
| L | duration_ms | integer | เวลาที่ใช้ |
| M | error_code | string | รหัส error |
| N | error_message | string | ข้อความ error |

หมายเหตุ:

- ชีตนี้ใช้ใน dashboard ได้โดยอ้างอิงแถวล่าสุด

### 11. `Control`

ประเภท: `System Sheet`

Sync mode: `full refresh` หรือ `manual only`

คำแนะนำ:

- ถ้าจะใช้ชีตนี้เป็น config กลาง ให้ backend อ่านค่าแต่ไม่เขียนทับบ่อย
- ถ้า backend ต้องเติมสถานะล่าสุดลงไป ให้กำหนดเฉพาะบางช่อง

โครงสร้างที่แนะนำ:

| Column | Field | Type | Description |
|---|---|---|---|
| A | config_key | string | ชื่อ key |
| B | config_value | string | ค่า config |
| C | description | string | คำอธิบาย |
| D | updated_by | string | คนที่แก้ |
| E | updated_at | datetime | เวลาแก้ล่าสุด |

ค่า config ตัวอย่าง:

- `leaderboard_enabled`
- `reward_claims_enabled`
- `daily_summary_enabled`
- `max_export_rows`
- `default_timezone`

### 12. `Lookup`

ประเภท: `System Sheet`

Sync mode: `manual only` หรือ `full refresh` ถ้าค่ามาจาก DB

หน้าที่:

- เก็บ mapping สำหรับใช้ในสูตรหรือ dropdown
- ลดการ hardcode ค่าใน dashboard

คอลัมน์ที่แนะนำ:

| Column | Field | Type | Description |
|---|---|---|---|
| A | lookup_group | string | กลุ่มข้อมูล |
| B | lookup_key | string | key ภายใน |
| C | lookup_value | string | ค่าที่แสดง |
| D | sort_order | integer | ลำดับ |
| E | active_flag | boolean | ใช้งานอยู่หรือไม่ |

ตัวอย่างข้อมูล:

- `claim_status`
- `reward_category`
- `tier_name`
- `transaction_type`

## ตารางสรุป Sync Mode

| Sheet Name | Role | Recommended Sync Mode | Notes |
|---|---|---|---|
| Dashboard | reporting | no direct sync | ใช้ formula จากชีตอื่น |
| Leaderboard | raw | full refresh | snapshot ล่าสุด |
| Members | raw | full refresh | master data ล่าสุด |
| Reward_Claims | raw | append only | เก็บประวัติสะสม |
| Reward_Claims_Current | raw | full refresh | สถานะล่าสุดของ claim |
| Transactions | raw | append only | ledger / event log |
| Daily_Summary | reporting data | full refresh | aggregate รายวัน |
| Branch_Summary | reporting data | full refresh | สรุปตามสาขา |
| Rewards_Catalog | raw | full refresh | master reward ล่าสุด |
| Sync_Log | system | append only | log การ sync |
| Control | system | manual only / partial update | ค่าควบคุม |
| Lookup | system | manual only / full refresh | master mapping |

## รูปแบบการใช้งานจริงที่แนะนำ

ถ้าต้องการเริ่มแบบกระชับและคุมง่าย ให้เปิดใช้งานก่อน 6 ชีต:

1. `Leaderboard`
2. `Members`
3. `Reward_Claims_Current`
4. `Daily_Summary`
5. `Sync_Log`
6. `Dashboard`

ถ้าระบบเริ่มนิ่งแล้ว ค่อยเพิ่ม:

1. `Reward_Claims`
2. `Transactions`
3. `Branch_Summary`
4. `Rewards_Catalog`
5. `Control`
6. `Lookup`

## กฎการออกแบบเพื่อป้องกันข้อมูลพัง

1. แถวที่ 1 ใช้เป็น header เท่านั้น
2. ทุก raw sheet ใช้ชื่อคอลัมน์คงที่และห้ามสลับลำดับเอง
3. ห้ามใส่สูตรแทรกใน raw sheets ที่ backend เขียนทับ
4. ถ้าจำเป็นต้องมีสูตรเสริม ให้ทำในชีตใหม่ เช่น `Leaderboard_View`
5. กำหนด primary key ชัดเจน เช่น `member_id`, `claim_id`, `transaction_id`
6. append only sheets ต้องมีขั้นตอน deduplicate ที่ backend
7. ใช้รูปแบบวันเวลาเดียวกันทั้งหมด เช่น ISO datetime หรือ timezone เดียวกัน
8. ควรกำหนด freeze header row และเปิด filter ทุก raw sheet

## ข้อเสนอเรื่อง Naming Convention

เพื่อให้ backend map ง่าย:

- ใช้ชื่อ sheet ภาษาอังกฤษ
- ใช้ชื่อคอลัมน์แบบ `snake_case`
- ใช้ key เดียวกันระหว่าง DB export และ Google Sheets

ตัวอย่าง:

- `member_id`
- `reward_id`
- `claim_mode`
- `updated_at`

## ข้อเสนอเรื่อง Primary Key ต่อชีต

| Sheet Name | Primary Key |
|---|---|
| Leaderboard | member_id |
| Members | member_id |
| Reward_Claims | claim_id |
| Reward_Claims_Current | claim_id |
| Transactions | transaction_id |
| Daily_Summary | summary_date |
| Branch_Summary | branch_code |
| Rewards_Catalog | reward_id |
| Sync_Log | run_id |

## Google Apps Script Template

ส่วนนี้เป็น template สำหรับกรณีที่คุณสร้าง Google Sheet ตามโครงสร้างด้านบนแล้ว และต้องการให้ `Google Apps Script` เป็นตัวเรียก backend API เพื่อดึงข้อมูลลงแต่ละชีต

แนวคิดการทำงาน:

`Google Sheet -> Apps Script -> Backend API -> PostgreSQL`

ข้อดีของรูปแบบนี้:

- Apps Script เป็นตัวกด sync ได้จากในชีต
- แยกฟังก์ชันตามแต่ละหน้าได้ชัดเจน
- ยังไม่ต้องเปิด PostgreSQL ให้ Google เชื่อมตรง
- สามารถตั้ง trigger เป็นรายชีตหรือรายเวลาได้

### รูปแบบ response จาก backend ที่แนะนำ

Apps Script ด้านล่างนี้จะง่ายที่สุดถ้า backend ส่ง JSON รูปแบบนี้:

```json
{
  "ok": true,
  "reportKey": "leaderboard",
  "sheetName": "Leaderboard",
  "mode": "full_refresh",
  "headers": ["member_id", "display_name", "total_score"],
  "rows": [
    ["M001", "Alice", 2500],
    ["M002", "Bob", 2100]
  ],
  "rowsWritten": 2,
  "generatedAt": "2026-04-18T10:30:00.000Z"
}
```

ถ้าคุณยังไม่ได้ทำ backend ตอนนี้ สามารถใช้ section นี้เป็น spec สำหรับ endpoint ได้เลย

### Script Properties ที่ควรตั้ง

ไปที่ `Apps Script > Project Settings > Script properties` แล้วเพิ่มค่า:

| Key | Example |
|---|---|
| `API_BASE_URL` | `https://docs.google.com/spreadsheets/d/1LulNFgvejjEV0Hod3xMURSfHzBVXcw7EkhSZCpXqzKs/edit?gid=799177933#gid=799177933` |
| `API_TOKEN` | `your-internal-token` |
| `TIMEZONE` | `Asia/Bangkok` |

ถ้าต้องการแยกหลาย environment:

- `API_BASE_URL_DEV`
- `API_BASE_URL_PROD`

### โครงสร้างไฟล์ใน Apps Script ที่แนะนำ

```text
Code.gs
Config.gs
SyncLeaderboard.gs
SyncMembers.gs
SyncRewardClaims.gs
SyncSummary.gs
SyncUtils.gs
```

ถ้าคุณอยากรวมไว้ไฟล์เดียวก่อนก็ทำได้

### 1. Config และ Utility Functions

```javascript
const SHEET_CONFIG = {
  Dashboard: {
    syncMode: 'none'
  },
  Leaderboard: {
    reportKey: 'leaderboard',
    syncMode: 'full_refresh'
  },
  Members: {
    reportKey: 'members',
    syncMode: 'full_refresh'
  },
  Reward_Claims: {
    reportKey: 'reward_claims',
    syncMode: 'append_only',
    primaryKey: 'claim_id'
  },
  Reward_Claims_Current: {
    reportKey: 'reward_claims_current',
    syncMode: 'full_refresh'
  },
  Transactions: {
    reportKey: 'transactions',
    syncMode: 'append_only',
    primaryKey: 'transaction_id'
  },
  Daily_Summary: {
    reportKey: 'daily_summary',
    syncMode: 'full_refresh'
  },
  Branch_Summary: {
    reportKey: 'branch_summary',
    syncMode: 'full_refresh'
  },
  Rewards_Catalog: {
    reportKey: 'rewards_catalog',
    syncMode: 'full_refresh'
  },
  Sync_Log: {
    reportKey: 'sync_log',
    syncMode: 'append_only',
    primaryKey: 'run_id'
  }
};

function getAppConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    apiBaseUrl: props.getProperty('API_BASE_URL'),
    apiToken: props.getProperty('API_TOKEN'),
    timezone: props.getProperty('TIMEZONE') || Session.getScriptTimeZone()
  };
}

function getJson(url, payload) {
  const config = getAppConfig();
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + config.apiToken
    },
    payload: JSON.stringify(payload || {})
  });

  const statusCode = response.getResponseCode();
  const text = response.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('API error ' + statusCode + ': ' + text);
  }

  const json = JSON.parse(text);
  if (!json.ok) {
    throw new Error('API returned ok=false: ' + text);
  }

  return json;
}

function getOrCreateSheet_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function clearAndWriteSheet_(sheetName, headers, rows) {
  const sheet = getOrCreateSheet_(sheetName);
  sheet.clearContents();

  if (!headers || !headers.length) {
    throw new Error('Missing headers for sheet: ' + sheetName);
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (rows && rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  formatRawSheet_(sheet, headers.length);
}

function appendUniqueRows_(sheetName, headers, rows, primaryKeyName) {
  const sheet = getOrCreateSheet_(sheetName);

  if (!headers || !headers.length) {
    throw new Error('Missing headers for sheet: ' + sheetName);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const keyIndex = currentHeaders.indexOf(primaryKeyName);
  if (keyIndex === -1) {
    throw new Error('Primary key not found in sheet headers: ' + primaryKeyName);
  }

  const existingKeys = new Set();
  const dataRowCount = Math.max(sheet.getLastRow() - 1, 0);
  if (dataRowCount > 0) {
    const keyValues = sheet.getRange(2, keyIndex + 1, dataRowCount, 1).getValues();
    keyValues.forEach(function(row) {
      if (row[0] !== '' && row[0] !== null) {
        existingKeys.add(String(row[0]));
      }
    });
  }

  const incomingRows = rows || [];
  const filteredRows = incomingRows.filter(function(row) {
    const key = row[keyIndex];
    return key !== '' && key !== null && !existingKeys.has(String(key));
  });

  if (filteredRows.length) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, filteredRows.length, headers.length).setValues(filteredRows);
  }

  formatRawSheet_(sheet, headers.length);
}

function formatRawSheet_(sheet, totalColumns) {
  sheet.setFrozenRows(1);
  if (sheet.getFilter()) {
    sheet.getFilter().remove();
  }

  const lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.getRange(1, 1, lastRow, totalColumns).createFilter();
  sheet.autoResizeColumns(1, totalColumns);
}

function writeSyncStatusToDashboard_(reportKey, rowsWritten, generatedAt) {
  const sheet = getOrCreateSheet_('Dashboard');
  sheet.getRange('A1').setValue('last_report_key');
  sheet.getRange('B1').setValue(reportKey);
  sheet.getRange('A2').setValue('last_rows_written');
  sheet.getRange('B2').setValue(rowsWritten);
  sheet.getRange('A3').setValue('last_generated_at');
  sheet.getRange('B3').setValue(generatedAt);
}
```

### 2. Generic Sync Function

ฟังก์ชันนี้ใช้เป็นแกนกลางสำหรับทุกชีต

```javascript
function syncReport_(sheetName) {
  const config = getAppConfig();
  const sheetConfig = SHEET_CONFIG[sheetName];

  if (!sheetConfig) {
    throw new Error('Unknown sheet config: ' + sheetName);
  }

  if (sheetConfig.syncMode === 'none') {
    throw new Error('Sheet does not support direct sync: ' + sheetName);
  }

  const url = config.apiBaseUrl + '/export';
  const payload = {
    reportKey: sheetConfig.reportKey,
    mode: sheetConfig.syncMode
  };

  const result = getJson(url, payload);

  if (sheetConfig.syncMode === 'full_refresh') {
    clearAndWriteSheet_(sheetName, result.headers, result.rows);
  } else if (sheetConfig.syncMode === 'append_only') {
    appendUniqueRows_(sheetName, result.headers, result.rows, sheetConfig.primaryKey);
  } else {
    throw new Error('Unsupported sync mode: ' + sheetConfig.syncMode);
  }

  writeSyncStatusToDashboard_(
    result.reportKey || sheetConfig.reportKey,
    result.rowsWritten || (result.rows ? result.rows.length : 0),
    result.generatedAt || new Date().toISOString()
  );

  return result;
}
```

### 3. Functions แยกตามแต่ละชีต

คุณสามารถเอาฟังก์ชันเหล่านี้ไปผูกกับปุ่ม, เมนู, หรือ trigger ได้เลย

```javascript
function syncLeaderboard() {
  return syncReport_('Leaderboard');
}

function syncMembers() {
  return syncReport_('Members');
}

function syncRewardClaims() {
  return syncReport_('Reward_Claims');
}

function syncRewardClaimsCurrent() {
  return syncReport_('Reward_Claims_Current');
}

function syncTransactions() {
  return syncReport_('Transactions');
}

function syncDailySummary() {
  return syncReport_('Daily_Summary');
}

function syncBranchSummary() {
  return syncReport_('Branch_Summary');
}

function syncRewardsCatalog() {
  return syncReport_('Rewards_Catalog');
}

function syncSyncLog() {
  return syncReport_('Sync_Log');
}
```

### 4. Functions สำหรับ Sync หลายชีตพร้อมกัน

```javascript
function syncCoreSheets() {
  syncLeaderboard();
  syncMembers();
  syncRewardClaimsCurrent();
  syncDailySummary();
  syncSyncLog();
}

function syncAllSheets() {
  syncLeaderboard();
  syncMembers();
  syncRewardClaims();
  syncRewardClaimsCurrent();
  syncTransactions();
  syncDailySummary();
  syncBranchSummary();
  syncRewardsCatalog();
  syncSyncLog();
}
```

ถ้ากังวลเรื่องเวลา execute ของ Apps Script:

- เริ่มจาก `syncCoreSheets()` ก่อน
- แยก trigger เป็นหลายชุด เช่น เช้า, เที่ยง, เย็น

### 5. สร้าง Custom Menu ใน Google Sheet

```javascript
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Kiss Me Sync')
    .addItem('Sync Core Sheets', 'syncCoreSheets')
    .addItem('Sync All Sheets', 'syncAllSheets')
    .addSeparator()
    .addItem('Sync Leaderboard', 'syncLeaderboard')
    .addItem('Sync Members', 'syncMembers')
    .addItem('Sync Reward Claims Current', 'syncRewardClaimsCurrent')
    .addItem('Sync Daily Summary', 'syncDailySummary')
    .addItem('Sync Sync Log', 'syncSyncLog')
    .addToUi();
}
```

### 6. สร้าง Trigger สำหรับ Auto Sync

```javascript
function createDailyTriggers() {
  ScriptApp.newTrigger('syncCoreSheets')
    .timeBased()
    .everyHours(1)
    .create();
}
```

ถ้าต้องการหลายรอบ:

- ใช้หลาย trigger แยกตามฟังก์ชัน
- หลีกเลี่ยงให้ทุกชีตรันพร้อมกันถ้าข้อมูลเยอะ

### 7. ถ้าต้องการใช้ endpoint คนละแบบต่อชีต

ถ้า backend ของคุณจะออกแบบเป็น:

- `POST /export/leaderboard`
- `POST /export/members`
- `POST /export/reward-claims`

คุณสามารถเปลี่ยน `SHEET_CONFIG` ให้เก็บ endpoint ต่อชีตได้ เช่น:

```javascript
const SHEET_CONFIG = {
  Leaderboard: {
    endpoint: '/export/leaderboard',
    syncMode: 'full_refresh'
  },
  Members: {
    endpoint: '/export/members',
    syncMode: 'full_refresh'
  }
};
```

และแก้ `syncReport_()` เป็น:

```javascript
const url = config.apiBaseUrl + sheetConfig.endpoint;
const payload = {
  mode: sheetConfig.syncMode
};
```

### 8. ตัวอย่าง backend contract ต่อชีต

เพื่อให้ Apps Script ดึงง่าย แนะนำให้ทุก endpoint ส่ง:

- `headers`: array ของชื่อคอลัมน์
- `rows`: array ของ array
- `rowsWritten`: จำนวนแถว
- `generatedAt`: เวลา generate
- `reportKey`: ชื่อรายงาน

ตัวอย่างสำหรับ `Leaderboard`:

```json
{
  "ok": true,
  "reportKey": "leaderboard",
  "headers": [
    "export_date",
    "export_datetime",
    "rank",
    "member_id",
    "line_user_id",
    "display_name",
    "phone",
    "total_score",
    "available_points",
    "tier_name",
    "rewards_claimed_count",
    "last_activity_at",
    "updated_at"
  ],
  "rows": [
    [
      "2026-04-18",
      "2026-04-18T10:30:00.000Z",
      1,
      "M001",
      "Uxxxx",
      "Alice",
      "0812345678",
      2500,
      1800,
      "Gold",
      3,
      "2026-04-18T09:05:00.000Z",
      "2026-04-18T09:05:00.000Z"
    ]
  ],
  "rowsWritten": 1,
  "generatedAt": "2026-04-18T10:30:00.000Z"
}
```

### 9. แนวทางสำหรับ append only sheets

สำหรับชีตต่อไปนี้:

- `Reward_Claims`
- `Transactions`
- `Sync_Log`

Apps Script ตัวอย่างนี้ใช้วิธี:

1. อ่าน header ในชีตก่อน
2. หา column index ของ primary key
3. โหลด key ที่มีอยู่แล้วในชีต
4. append เฉพาะแถวใหม่

ดังนั้น backend ควรส่งข้อมูลที่:

- เรียง header คงที่
- มี primary key ชัดเจน
- ไม่สลับตำแหน่งคอลัมน์ระหว่างรอบ sync

### 10. แนวทางสำหรับ Dashboard

`Dashboard` ไม่ควรให้ Apps Script เขียนข้อมูลรายงานทับทั้งหน้า

แนะนำให้ Apps Script เขียนเฉพาะ:

- `last_report_key`
- `last_rows_written`
- `last_generated_at`

ส่วน KPI และ chart ให้ใช้สูตรอ้างอิงจาก:

- `Members`
- `Leaderboard`
- `Reward_Claims_Current`
- `Daily_Summary`
- `Sync_Log`

### 11. ฟังก์ชันช่วย debug

```javascript
function testLeaderboardApi() {
  const config = getAppConfig();
  const result = getJson(config.apiBaseUrl + '/export', {
    reportKey: 'leaderboard',
    mode: 'full_refresh'
  });

  Logger.log(JSON.stringify(result, null, 2));
}
```

### 12. ข้อควรระวังใน Apps Script

1. อย่าเก็บ secret ไว้ในตัวแปร hardcode
2. อย่าให้ backend ส่งข้อมูลที่มีคอลัมน์ไม่ตรง header
3. ถ้าใช้ `append only` ต้องมี primary key เสมอ
4. ถ้าข้อมูลเยอะมาก ควรแยก sync เป็นหลายฟังก์ชัน
5. ถ้า timeout บ่อย ให้เปลี่ยนจาก Apps Script pull เป็น backend push
6. ชื่อ sheet ในไฟล์นี้ต้องตรงกับชื่อ tab จริงใน Google Sheet

### 13. Minimal Version ถ้าต้องการเริ่มเร็วที่สุด

ถ้าคุณต้องการเริ่มแบบเร็วมากใน Apps Script ให้เริ่มเพียงชุดนี้:

```javascript
function syncLeaderboard() {
  const props = PropertiesService.getScriptProperties();
  const apiBaseUrl = props.getProperty('API_BASE_URL');
  const apiToken = props.getProperty('API_TOKEN');

  const response = UrlFetchApp.fetch(apiBaseUrl + '/export', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + apiToken
    },
    payload: JSON.stringify({
      reportKey: 'leaderboard',
      mode: 'full_refresh'
    })
  });

  const result = JSON.parse(response.getContentText());
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leaderboard');

  sheet.clearContents();
  sheet.getRange(1, 1, 1, result.headers.length).setValues([result.headers]);
  if (result.rows.length) {
    sheet.getRange(2, 1, result.rows.length, result.headers.length).setValues(result.rows);
  }
}
```

จากนั้นค่อยขยายเป็น version เต็มด้านบน

## Backend Endpoint Spec ที่ Apps Script คาดหวัง

ถ้าคุณจะเอา Apps Script นี้ไปใช้ต่อ ฝั่ง backend ควรมี endpoint อย่างน้อย:

### Option A: Generic endpoint

`POST /api/admin/google-sheets/export`

request:

```json
{
  "reportKey": "leaderboard",
  "mode": "full_refresh"
}
```

### Option B: Endpoint แยกต่อรายงาน

- `POST /api/admin/google-sheets/export/leaderboard`
- `POST /api/admin/google-sheets/export/members`
- `POST /api/admin/google-sheets/export/reward-claims`
- `POST /api/admin/google-sheets/export/reward-claims-current`
- `POST /api/admin/google-sheets/export/transactions`
- `POST /api/admin/google-sheets/export/daily-summary`
- `POST /api/admin/google-sheets/export/branch-summary`
- `POST /api/admin/google-sheets/export/rewards-catalog`
- `POST /api/admin/google-sheets/export/sync-log`

ทั้งสองแบบใช้ได้ แต่ถ้ายังเริ่มต้นอยู่ `Generic endpoint` จะดูแลง่ายกว่า

## Mapping ระหว่างชีตกับ reportKey

| Sheet Name | reportKey | Sync Mode |
|---|---|---|
| Leaderboard | `leaderboard` | `full_refresh` |
| Members | `members` | `full_refresh` |
| Reward_Claims | `reward_claims` | `append_only` |
| Reward_Claims_Current | `reward_claims_current` | `full_refresh` |
| Transactions | `transactions` | `append_only` |
| Daily_Summary | `daily_summary` | `full_refresh` |
| Branch_Summary | `branch_summary` | `full_refresh` |
| Rewards_Catalog | `rewards_catalog` | `full_refresh` |
| Sync_Log | `sync_log` | `append_only` |

## การใส่ค่าจริงใน Apps Script

จากค่าที่คุณมีตอนนี้:

- Web App URL:
  `https://script.google.com/macros/s/AKfycbwDpdAnvsEPcJTpIuphI0AX5af-JwQtFHcWnD7JM8DUqJS_Cs-qoyRz9lw-QoR1FOo6/exec`
- Script ID:
  `1a35U5d616kpuSiZbnVXaZcKUmPDaR9OQ3oitGm_wfiL_vNLsTKqh37pd`
- Spreadsheet ID:
  `1LulNFgvejjEV0Hod3xMURSfHzBVXcw7EkhSZCpXqzKs`
- Google Sheet URL:
  `https://docs.google.com/spreadsheets/d/1LulNFgvejjEV0Hod3xMURSfHzBVXcw7EkhSZCpXqzKs/edit?gid=799177933#gid=799177933`

### ต้องเอาไปใส่ตรงไหน

ไปที่:

`Apps Script > Project Settings > Script properties`

แล้วเพิ่มค่าเหล่านี้:

| Key | Value |
|---|---|
| `API_BASE_URL` | `https://script.google.com/macros/s/AKfycbwDpdAnvsEPcJTpIuphI0AX5af-JwQtFHcWnD7JM8DUqJS_Cs-qoyRz9lw-QoR1FOo6/exec` |
| `SPREADSHEET_ID` | `1LulNFgvejjEV0Hod3xMURSfHzBVXcw7EkhSZCpXqzKs` |
| `TIMEZONE` | `Asia/Bangkok` |

ถ้าคุณมี token สำหรับป้องกัน API เพิ่มภายหลัง ให้ใส่เพิ่ม:

| Key | Value |
|---|---|
| `API_TOKEN` | `your-secret-token` |

### ค่าไหนยังไม่ต้องใส่ในโค้ด

`Script ID`

```text
1a35U5d616kpuSiZbnVXaZcKUmPDaR9OQ3oitGm_wfiL_vNLsTKqh37pd
```

ยังไม่จำเป็นต้องใช้ในโค้ด Apps Script ปกติ

จะใช้ก็ต่อเมื่อ:

- ใช้ `clasp`
- เรียก Apps Script API จากภายนอก
- อ้างอิงโปรเจกต์สคริปต์จากระบบอื่น

ดังนั้นสำหรับงาน sync Google Sheet ในรอบนี้ ให้ใช้แค่:

- `API_BASE_URL`
- `SPREADSHEET_ID`
- `TIMEZONE`
- `API_TOKEN` ถ้ามี

### หมายเหตุเรื่อง Google Sheet URL

ลิงก์นี้:

```text
https://docs.google.com/spreadsheets/d/1LulNFgvejjEV0Hod3xMURSfHzBVXcw7EkhSZCpXqzKs/edit?gid=799177933#gid=799177933
```

ในโค้ดไม่ต้องใช้ทั้ง URL

ให้ใช้เฉพาะ `Spreadsheet ID`:

```text
1LulNFgvejjEV0Hod3xMURSfHzBVXcw7EkhSZCpXqzKs
```

### ตัวอย่างโค้ดอ่านค่าจาก Script Properties

```javascript
function getAppConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    apiBaseUrl: props.getProperty('API_BASE_URL'),
    spreadsheetId: props.getProperty('SPREADSHEET_ID'),
    apiToken: props.getProperty('API_TOKEN') || '',
    timezone: props.getProperty('TIMEZONE') || 'Asia/Bangkok'
  };
}
```

### ตัวอย่างโค้ดเปิดไฟล์ Google Sheet ด้วย Spreadsheet ID

```javascript
function getSpreadsheet_() {
  const config = getAppConfig();
  return SpreadsheetApp.openById(config.spreadsheetId);
}
```

### ตัวอย่างเรียก Web App URL

```javascript
function testWebAppConnection() {
  const config = getAppConfig();

  const response = UrlFetchApp.fetch(config.apiBaseUrl, {
    method: 'get',
    muteHttpExceptions: true,
    headers: config.apiToken
      ? { Authorization: 'Bearer ' + config.apiToken }
      : {}
  });

  Logger.log(response.getResponseCode());
  Logger.log(response.getContentText());
}
```

### ค่าชุดนี้ควรเอาไปแทนตรงไหนใน template เดิม

ใน section `Google Apps Script Template` ด้านบน:

- `API_BASE_URL` ใช้แทนค่าที่อ่านใน `getAppConfig()`
- `SPREADSHEET_ID` ใช้ใน `SpreadsheetApp.openById(...)`
- `TIMEZONE` ใช้เป็น timezone กลางของ script
- `API_TOKEN` ใช้แนบ header ตอนยิง API

### สรุปสั้น ๆ

ค่าที่ต้องเอาไปใส่ใน Apps Script ตอนนี้คือ:

1. `API_BASE_URL`
2. `SPREADSHEET_ID`
3. `TIMEZONE`
4. `API_TOKEN` ถ้ามี

ส่วน `Script ID` เก็บไว้ได้เลย แต่ยังไม่ต้องใช้ใน flow นี้

### ตัวอย่างค่าที่พร้อมใช้งาน

```text
API_BASE_URL=https://script.google.com/macros/s/AKfycbwDpdAnvsEPcJTpIuphI0AX5af-JwQtFHcWnD7JM8DUqJS_Cs-qoyRz9lw-QoR1FOo6/exec
SPREADSHEET_ID=1LulNFgvejjEV0Hod3xMURSfHzBVXcw7EkhSZCpXqzKs
TIMEZONE=Asia/Bangkok
```

## ข้อสรุป

สถาปัตยกรรมที่เหมาะที่สุดสำหรับ `Kiss Me Ranking` คือ:

`PostgreSQL -> Node.js/Express Backend -> Google Sheets API -> Google Sheets`

พร้อมแนวทางเริ่มต้นดังนี้:

1. ใช้ backend ตัวเดิมเป็นตัวกลาง
2. ใช้ `Google Service Account` สำหรับเขียนข้อมูลลงชีต
3. เริ่มจาก `manual sync + full refresh`
4. จำกัดรายงานผ่าน `reportKey` ที่กำหนดไว้ล่วงหน้า
5. เพิ่ม log และ status endpoint ตั้งแต่รอบแรก
6. ค่อยต่อยอดเป็น scheduled sync และ incremental sync ภายหลัง

## ขั้นต่อไปที่แนะนำ

หลังจาก approve เอกสารนี้ ขั้นต่อไปควรทำตามลำดับ:

1. สร้าง `report definition` ชุดแรก
2. เพิ่ม package `googleapis`
3. สร้าง service สำหรับเขียน Google Sheets
4. เพิ่ม admin route สำหรับ sync
5. ทดสอบกับ 1 sheet และ 1 report ก่อน
