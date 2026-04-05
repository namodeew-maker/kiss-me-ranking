# Kiss Me Ranking — Project Documentation

> Gamified Loyalty & CRM System บน LINE LIFF + Telegram  
> เอกสารนี้สรุปโครงสร้างทั้งหมดเพื่อให้ผู้พัฒนาที่เข้ามาทำต่อเข้าใจระบบได้อย่างรวดเร็ว

---

## สารบัญ

1. [ภาพรวม](#1-ภาพรวม)
2. [สถาปัตยกรรมระบบ](#2-สถาปัตยกรรมระบบ)
3. [โครงสร้างไฟล์](#3-โครงสร้างไฟล์)
4. [Stack & Dependencies](#4-stack--dependencies)
5. [Environment Variables](#5-environment-variables)
6. [ฐานข้อมูล](#6-ฐานข้อมูล)
7. [API Endpoints](#7-api-endpoints)
8. [Frontend Pages](#8-frontend-pages)
9. [Business Logic](#9-business-logic)
10. [Unified Identity (Multi-OA + Telegram)](#10-unified-identity-multi-oa--telegram)
11. [วิธีรันโปรเจกต์](#11-วิธีรันโปรเจกต์)
12. [ไฟล์ตัวอย่าง (examples/)](#12-ไฟล์ตัวอย่าง-examples)

---

## 1. ภาพรวม

**Kiss Me Ranking** คือระบบ Loyalty สำหรับธุรกิจบริการ โดยลูกค้า:

1. **ล็อกอิน** ผ่าน LINE LIFF หรือ Telegram
2. **ส่งสลิป** พร้อมเลือกพนักงาน + ให้คะแนนลับ (admin มองไม่เห็น)
3. **สะสมหลอด** (0-5) จากสลิปที่ admin อนุมัติ — ต้องพนักงานไม่ซ้ำกัน 5 คน
4. **ทายเลข 2 หลัก** (00-99) เมื่อสะสมครบ 5 → ลุ้นรางวัล Cashback สูงสุด 50,000 บาท
5. **ไม่ถูกรางวัล** → รับ Gift Voucher 500 บาท

---

## 2. สถาปัตยกรรมระบบ

```
┌─────────────┐     ┌─────────────┐
│ LINE LIFF   │     │  Telegram   │
│ (ลูกค้า)     │     │  Widget     │
└──────┬──────┘     └──────┬──────┘
       │                   │
       └─────┬─────────────┘
             ▼
    ┌─────────────────┐
    │  index.html     │  ← หน้าลูกค้า
    │  script.js      │
    └────────┬────────┘
             │ fetch /api/*
             ▼
    ┌─────────────────┐       ┌──────────────────┐
    │  server.js      │──────▶│  PostgreSQL       │
    │  (Express.js)   │       │  (Neon / Local)   │
    │  port 3000      │       └──────────────────┘
    └────────┬────────┘
             │
     ┌───────┼───────────────┐
     │       │               │
     ▼       ▼               ▼
  Cloudflare   LINE         Telegram
  R2 (รูป)     Messaging    Bot API
               API (OA)
```

**Admin** เข้าผ่าน `admin-login.html` → `admin.html` ใช้ Token-based auth

---

## 3. โครงสร้างไฟล์

```
Kiss Me Ranking/
├── server.js               ← Backend หลัก (Express.js, ทุก endpoint อยู่ที่นี่)
├── package.json            ← Dependencies & scripts
├── .env                    ← Environment variables (ห้าม commit)
│
├── init-db.sql             ← Schema ตั้งต้น (users, staffs, transactions, ratings, lottery, admin)
├── migrate-unified.sql     ← Migration เพิ่ม unified identity (global_user_id, OA, points)
├── init-db-unified.sql     ← Schema ใหม่แบบ standalone (สำหรับ reference)
│
├── index.html              ← หน้าลูกค้า (login → เลือกพนักงาน → ส่งสลิป → ทายเลข)
├── script.js               ← JS ของ index.html (LIFF, Telegram, form submit, lottery grid)
├── styles.css              ← CSS หลัก (Neon futuristic theme)
│
├── profile.html            ← หน้าโปรไฟล์ลูกค้า (ประวัติ, หลอดสะสม, ผลทาย)
├── profile.js              ← JS ของ profile.html
├── profile.css             ← CSS ของ profile.html
│
├── admin-login.html        ← หน้า login admin
├── admin.html              ← หน้า dashboard admin (อนุมัติสลิป, จัดการเลข, ออกรางวัล)
├── admin.js                ← JS ของ admin.html
├── admin.css               ← CSS ของ admin.html
│
├── status.html             ← หน้าสถานะ transaction
├── seed-staff.js           ← Script สร้างข้อมูลพนักงานตัวอย่าง
│
├── Lotto_Project_Manual.md ← คู่มือโปรเจกต์เดิม
├── ข้อกฎหมาย.md              ← เงื่อนไขกฎหมาย/ข้อตกลง
├── PROJECT_DOCS.md         ← เอกสารนี้
│
├── uploads/                ← เก็บรูปสลิปแบบ local (fallback ถ้าไม่ใช้ R2)
│
└── examples/               ← ตัวอย่างโค้ดสำหรับ integration กับระบบบริษัท
    ├── line-points-gateway.js    ← Gateway: LINE OAuth + บวกแต้ม + forward
    ├── company-callback.js       ← Webhook receiver: บริษัทส่ง event กลับ
    ├── telegram-messaging.js     ← Service: ส่งข้อความ Telegram
    └── unified-queries.sql       ← ตัวอย่าง SQL query สำหรับ unified identity
```

---

## 4. Stack & Dependencies

| Package | เวอร์ชัน | หน้าที่ |
|---------|---------|--------|
| **express** | ^5.2.1 | Web framework |
| **pg** | ^8.20.0 | PostgreSQL client |
| **cors** | ^2.8.6 | Cross-origin |
| **dotenv** | ^17.4.0 | อ่าน .env |
| **bcryptjs** | ^3.0.3 | Hash password admin |
| **multer** | ^2.1.1 | Upload รูปสลิป |
| **@aws-sdk/client-s3** | ^3.1023.0 | Cloudflare R2 storage |

**Runtime:** Node.js (CommonJS, ไม่ใช้ TypeScript)  
**Database:** PostgreSQL (ใช้ Neon serverless)  
**CDN:** LINE LIFF SDK, Chart.js (admin), Google Fonts (Orbitron + Kanit)

---

## 5. Environment Variables

```env
# PostgreSQL
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
PORT=3000

# Cloudflare R2 — เก็บรูปสลิป (ถ้าไม่ตั้ง = ใช้ local /uploads/)
R2_ACCOUNT_ID=
R2_ACCESS_KEY=
R2_SECRET_KEY=
R2_BUCKET=lotto-uploads
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev

# LINE Login — สำหรับ server-side OAuth callback (ยังไม่ได้ตั้งค่า)
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
LINE_REDIRECT_URI=

# Company webhook — ส่ง event ไปบริษัท
COMPANY_WEBHOOK_URL=
COMPANY_WEBHOOK_TOKEN=

# Telegram Bot
TELEGRAM_BOT_TOKEN=
```

> **หมายเหตุ:** LINE LIFF ID (`2009696727-evibES3H`) ฝังใน script.js / profile.js โดยตรง ไม่ได้อยู่ใน .env

---

## 6. ฐานข้อมูล

### 6.1 ตารางจาก init-db.sql (ระบบหลัก)

| ตาราง | หน้าที่ | คอลัมน์สำคัญ |
|-------|--------|-------------|
| **users** | ข้อมูลลูกค้า | `id`, `platform` (line/telegram), `platform_id`, `display_name`, `picture_url`, `progress_count` (0-5), `global_user_id` (UUID) |
| **staffs** | ข้อมูลพนักงาน | `id`, `name`, `nickname`, `avatar_url`, `is_active` |
| **transactions** | บันทึกส่งสลิป | `id`, `user_id`, `staff_id`, `slip_image_url`, `status` (pending/approved/rejected), `round_label`, `reviewed_by`, `reject_reason` |
| **ratings** | คะแนนลับ 3 ด้าน (**admin มองไม่เห็น**) | `transaction_id`, `looks_score`, `service_score`, `value_score` (1-10 แต่ละด้าน) |
| **lottery_guesses** | ทายเลข 2 หลัก | `user_id`, `guess_number` (00-99), `round_label`, `result` (pending/won/lost), `reward_amount` |
| **sold_out** | เลขที่ถูกจองแล้วต่อรอบ | `number` (0-99), `round_label` |
| **admin_users** | ผู้ดูแลระบบ | `username`, `password_hash` (bcrypt) |

### 6.2 ตารางจาก migrate-unified.sql (Unified Identity)

| ตาราง | หน้าที่ | คอลัมน์สำคัญ |
|-------|--------|-------------|
| **oa_accounts** | ข้อมูล LINE Official Account แต่ละตัว | `oa_id`, `oa_name`, `channel_id`, `channel_secret`, `access_token`, `is_active` |
| **user_oa_mapping** | เชื่อมผู้ใช้กับ OA (oa_user_id ≠ line_login_user_id) | `global_user_id` (FK→users), `oa_id` (FK→oa_accounts), `oa_user_id` |
| **points** | คะแนนสะสมจากกิจกรรมต่างๆ | `global_user_id`, `activity_type`, `points`, `source_platform`, `source_oa_id`, `metadata` (JSONB) |

### 6.3 Constraints สำคัญ

- `UNIQUE (platform, platform_id)` — ป้องกัน user ซ้ำ
- `UNIQUE (user_id, staff_id, round_label) WHERE status <> 'rejected'` — ห้ามแจ้งพนักงานซ้ำในรอบเดียว
- `UNIQUE (user_id, round_label)` บน lottery_guesses — 1 คน 1 สิทธิ์ทายต่อรอบ
- `UNIQUE (number, round_label)` บน sold_out — 1 เลขต่อรอบ
- `UNIQUE (oa_id, oa_user_id)` — 1 OA user ต่อ OA
- `UNIQUE (global_user_id, oa_id)` — 1 user ต่อ OA

### 6.4 Admin User เริ่มต้น

| Username | Password |
|----------|----------|
| Kissmy456 | Kiss@456789 |

---

## 7. API Endpoints

### 7.1 Admin Authentication

| Method | Path | Auth | หน้าที่ |
|--------|------|------|--------|
| `POST` | `/api/login` | — | Login admin (username + password → token) |
| `GET` | `/api/auth/verify` | Bearer | ตรวจ token ยัง valid อยู่ไหม |
| `POST` | `/api/logout` | Bearer | Logout (ลบ token) |

### 7.2 Customer Authentication

| Method | Path | Auth | หน้าที่ |
|--------|------|------|--------|
| `POST` | `/api/auth/login` | — | ล็อกอิน/สมัครลูกค้า (LINE/Telegram) |
| `GET` | `/auth/line/callback` | — | OAuth2 callback จาก LINE Login (server-side flow) |

**Body ตัวอย่าง `/api/auth/login`:**
```json
{
  "platform": "line",
  "platform_id": "U1234abcd",
  "display_name": "สมชาย",
  "picture_url": "https://profile.line.me/..."
}
```

### 7.3 Staff

| Method | Path | Auth | หน้าที่ |
|--------|------|------|--------|
| `GET` | `/api/staffs` | — | รายชื่อพนักงานที่ active สำหรับ dropdown |

### 7.4 User & Progress

| Method | Path | Auth | หน้าที่ |
|--------|------|------|--------|
| `POST` | `/api/users/upsert` | — | สร้าง/อัปเดต user |
| `GET` | `/api/users/:platform_id/progress` | — | ดูหลอดสะสมรอบปัจจุบัน |
| `GET` | `/api/users/:platform_id/history` | — | ประวัติ transaction + lottery ทั้งหมด |

> Query param `?platform=line` (default) หรือ `?platform=telegram`

### 7.5 Transaction (ส่งสลิป)

| Method | Path | Auth | หน้าที่ |
|--------|------|------|--------|
| `POST` | `/api/transactions` | — | ลูกค้าส่งสลิป (multipart/form-data) |
| `GET` | `/api/history` | — | ดึงทุก transaction (admin dashboard) |
| `PUT` | `/api/history/:id/approve` | Bearer | อนุมัติ → progress +1 |
| `PUT` | `/api/history/:id/reject` | Bearer | ปฏิเสธ (พร้อมเหตุผล) |
| `DELETE` | `/api/history/:id` | Bearer | ลบ transaction |
| `GET` | `/api/history/pending/count` | — | นับรายการรออนุมัติ |

**Multipart body ตัวอย่าง `/api/transactions`:**
```
slip: (file)
staff_id: 3
platform_id: U1234abcd
platform: line
looks_score: 8
service_score: 9
value_score: 7
```

### 7.6 Lottery

| Method | Path | Auth | หน้าที่ |
|--------|------|------|--------|
| `POST` | `/api/lottery/guess` | — | ทายเลข (ต้องสะสมครบ 5 ก่อน) |
| `POST` | `/api/draw` | Bearer | ประกาศผลรางวัล |
| `GET` | `/api/sold-out` | — | เลขที่ถูกจองแล้ว (รอบปัจจุบัน) |
| `POST` | `/api/sold-out` | Bearer | เพิ่มเลขที่จอง |
| `DELETE` | `/api/sold-out/:number` | Bearer | ลบเลขที่จอง |

### 7.7 Round & Stats

| Method | Path | Auth | หน้าที่ |
|--------|------|------|--------|
| `GET` | `/api/round` | — | ข้อมูลรอบปัจจุบัน + วันออกรางวัล |
| `GET` | `/api/stats` | — | สถิติ Dashboard |
| `GET` | `/api/stats/guesses-by-number` | — | กราฟกระจาย (`?startDate=&endDate=`) |

### 7.8 Unified Identity & Points

| Method | Path | Auth | หน้าที่ |
|--------|------|------|--------|
| `POST` | `/api/points/activity` | — | บวกแต้ม + forward ไปบริษัท |
| `GET` | `/api/points/:global_user_id` | — | ยอดคะแนนสะสม + ประวัติล่าสุด |
| `GET` | `/api/unified/profile` | — | Unified profile lookup |
| `POST` | `/api/company/activity` | Webhook Token | บริษัท ส่ง event กลับ → reply ทาง LINE OA หรือ Telegram |
| `POST` | `/api/telegram/send` | — | ส่งข้อความผ่าน Telegram Bot |
| `GET` | `/api/oa-accounts` | Bearer | ดู OA ทั้งหมด |
| `POST` | `/api/oa-accounts` | Bearer | ลงทะเบียน OA ใหม่ |

**Unified profile query params:**
```
/api/unified/profile?by=line&id=U1234
/api/unified/profile?by=telegram&id=123456
/api/unified/profile?by=oa&oaId=OA_A&oaUserId=U9999
/api/unified/profile?by=global&id=uuid-here
```

---

## 8. Frontend Pages

### 8.1 index.html — หน้าลูกค้า

**Flow:**
```
เปิดหน้า → เช็ค LIFF auto-login → ยอมรับข้อตกลง → เลือก login (LINE/Telegram)
→ เข้าเนื้อหาหลัก → เลือกพนักงาน + อัปโหลดสลิป + ให้คะแนน → ส่ง
→ ถ้าสะสมครบ 5 → เลือกเลข 2 หลักจาก grid 00-99
```

**LIFF ID:** `2009696727-evibES3H` (ฝังใน script.js บรรทัด 20)

**SessionStorage:**
- `terms_accepted` — ยอมรับข้อตกลงแล้วหรือยัง
- `currentUser` — JSON ข้อมูล user ที่ล็อกอินอยู่

**CSS Theme:** Neon futuristic — สีหลัก `#ff3c3c` (แดง), `#00f0ff` (ฟ้า), `#00ffaa` (เขียว), พื้นหลัง `#060612`  
**Fonts:** Orbitron (หัวข้อ/ตัวเลข), Kanit (เนื้อหาภาษาไทย)

### 8.2 profile.html — หน้าโปรไฟล์

แสดง: User card (avatar, ชื่อ, platform badge) → หลอดสะสม (progress 5 จุด) → Tab สลิป / Tab ทายเลข

**เข้าถึง:** ปุ่ม profile บน index.html → `<a href="profile.html">`

### 8.3 admin-login.html → admin.html — หน้า Admin

**Login:** username + password → admin token (เก็บใน `localStorage`)

**Dashboard มี 6 Tab:**
1. อนุมัติสลิป (Pending queue)
2. ประวัติทั้งหมด (History table)
3. ทายเลข / ออกรางวัล (Draw management)
4. สรุป Cashback (Winners & losers summary)
5. เลขที่จอง (Sold-out grid)
6. สถิติ / กราฟ (Chart.js — กระจาย by เลข)

---

## 9. Business Logic

### 9.1 ระบบรอบ (Round)

| วันที่ | รอบ | วันออกรางวัล |
|-------|------|------------|
| 1–14 | Round A | วันที่ 16 เดือนเดียวกัน |
| 16–29 | Round B | วันที่ 1 เดือนถัดไป |
| 15 | ช่วงเปลี่ยนรอบ | Rollover → Round B |
| 30–31 | ช่วงเปลี่ยนรอบ | Rollover → Round A เดือนถัดไป |

**Round Label Format:** `YYYY-MM-A` หรือ `YYYY-MM-B` (เช่น `2026-04-A`)

### 9.2 Flow การสะสม

```
ลูกค้าเลือกพนักงาน + อัปโหลดสลิป + ให้คะแนนลับ
         ↓
สร้าง transaction (status: pending)
สร้าง rating (secret: admin ไม่เห็น)
         ↓
Admin ตรวจสอบ → approve หรือ reject
         ↓
ถ้า approve → progress_count + 1
ห้ามพนักงานซ้ำในรอบเดียวกัน (ต้อง 5 คนต่างกัน)
         ↓
progress_count == 5 → ปลดล็อกสิทธิ์ทายเลข
```

### 9.3 Flow ทายเลข

```
ลูกค้าเลือกเลข 00-99 จาก grid
(เลขที่ sold out จะกดไม่ได้)
         ↓
INSERT lottery_guesses (result: pending)
         ↓
Admin ประกาศเลขที่ถูก → POST /api/draw { winningNumber: "42" }
         ↓
ถูก → reward_amount = 50,000 ฿ (Cashback สูงสุด, หักภาษี 7%)
ผิด → reward_amount = 500 ฿ (Gift Voucher)
```

### 9.4 Image Storage

- ตั้ง R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY → อัปโหลดไป Cloudflare R2 CDN
- ไม่ตั้ง → เก็บไฟล์ลง `/uploads/` serve ผ่าน `/uploads/:filename`

### 9.5 Authentication

| ประเภท | วิธีการ | เก็บที่ |
|--------|--------|--------|
| ลูกค้า | LIFF auto-login / Telegram Widget → `POST /api/auth/login` | `sessionStorage.currentUser` |
| Admin | username + password → `POST /api/login` → token | `localStorage` + `Authorization: Bearer <token>` |

Admin token หมดอายุใน 8 ชั่วโมง

---

## 10. Unified Identity (Multi-OA + Telegram)

### 10.1 แนวคิด

ผู้ใช้คนเดียวอาจมีหลายตัวตน:
- **LINE Login user ID** — จากการ login ผ่าน LIFF
- **OA user ID** — user ID ที่ต่างกันไปตาม OA แต่ละตัว (OA_A, OA_B, OA_C)
- **Telegram user ID** — จาก Telegram

ระบบใช้ `global_user_id` (UUID) เป็นตัวกลางเชื่อมทุกตัวตนเข้าด้วยกัน

```
global_user_id (UUID)
    ├── users.platform = 'line',    platform_id = 'U_line_login_123'
    ├── users.platform = 'telegram', platform_id = '987654321'
    │
    ├── user_oa_mapping: oa_id = 'OA_A', oa_user_id = 'U_oa_a_456'
    ├── user_oa_mapping: oa_id = 'OA_B', oa_user_id = 'U_oa_b_789'
    └── user_oa_mapping: oa_id = 'OA_C', oa_user_id = 'U_oa_c_012'
```

### 10.2 การส่งข้อความกลับ

1. ถ้ามี `oaId` + `oaUserId` → ดึง `access_token` จาก `oa_accounts` → push ผ่าน LINE Messaging API
2. ถ้าไม่มี LINE OA → ตรวจว่ามี `telegram_user_id` ไหม → ส่งผ่าน Telegram Bot API
3. ถ้าไม่มีช่องทางเลย → return `channel: 'none'`

### 10.3 การลงทะเบียน OA

```bash
# Admin ลงทะเบียน OA ผ่าน API
POST /api/oa-accounts
{
  "oa_id": "OA_A",
  "oa_name": "Kiss Me สาขาสยาม",
  "channel_id": "1234567890",
  "channel_secret": "secret_here",
  "access_token": "long_lived_token"
}
```

### 10.4 SQL ตัวอย่าง

ดูไฟล์ `examples/unified-queries.sql` มี 4 query พร้อมใช้:
1. หาลูกค้าที่อยู่ในหลาย OA พร้อมกัน + มี Telegram
2. Unified profile lookup ด้วย LINE login user ID
3. Unified profile lookup ด้วย Telegram user ID
4. Unified profile lookup ด้วย (oa_id, oa_user_id)

---

## 11. วิธีรันโปรเจกต์

### 11.1 ครั้งแรก

```bash
# 1. Install dependencies
npm install

# 2. ตั้งค่า .env (copy จากตัวอย่างด้านบน หรือแก้ .env ที่มี)

# 3. สร้างฐานข้อมูล — รัน init-db.sql กับ PostgreSQL
psql $DATABASE_URL -f init-db.sql

# 4. รัน migration unified identity
psql $DATABASE_URL -f migrate-unified.sql

# 5. (optional) สร้างพนักงานตัวอย่าง
node seed-staff.js

# 6. Start server
node server.js
# → http://localhost:3000
```

### 11.2 Local Development + ngrok

```bash
# Terminal 1: Start server
node server.js

# Terminal 2: Start ngrok tunnel
ngrok http 3000
# → ได้ URL เช่น https://xxxx.ngrok-free.dev

# ตั้ง URL นี้เป็น Endpoint URL ใน LINE Developers Console (LIFF)
```

### 11.3 LIFF Configuration

| Setting | Value |
|---------|-------|
| LIFF ID | `2009696727-evibES3H` |
| Endpoint URL | `https://<ngrok-or-production-domain>` |
| LIFF URL | `https://liff.line.me/2009696727-evibES3H` |

---

## 12. ไฟล์ตัวอย่าง (examples/)

ไฟล์ใน `examples/` เป็นโค้ดตัวอย่างสำหรับ reference กรณีต้องการ deploy แยก service

| ไฟล์ | หน้าที่ | Port |
|------|--------|------|
| `line-points-gateway.js` | Gateway: LINE OAuth + บวกแต้ม + forward event ไปบริษัท | 3010 |
| `company-callback.js` | Webhook receiver: บริษัทส่ง event กลับมา → reply ลูกค้าทาง LINE OA / Telegram | 3020 |
| `telegram-messaging.js` | Service: ส่งข้อความผ่าน Telegram Bot API | 3030 |
| `unified-queries.sql` | SQL query ตัวอย่างสำหรับ unified identity lookup | — |

> **หมายเหตุ:** Route ทั้งหมดจาก examples/ ถูก**รวมเข้า server.js แล้ว** — ไฟล์ examples/ เก็บไว้เป็น reference เท่านั้น

---

## สิ่งที่ยังไม่ได้ตั้งค่า (รอข้อมูลจากบริษัท)

| รายการ | สถานะ | หมายเหตุ |
|--------|-------|---------|
| LINE OA 3 ตัว (OA_A, OA_B, OA_C) | ❌ รอข้อมูล | ต้องได้ channel_id, channel_secret, access_token จากบริษัท |
| LINE Login Channel ID/Secret | ❌ รอตั้งค่า | ได้จาก LINE Developers Console |
| Telegram Bot Token | ❌ รอตั้งค่า | ได้จาก @BotFather |
| Company Webhook URL | ❌ รอตั้งค่า | URL ระบบฝั่งบริษัท |
| Production domain | ❌ ใช้ ngrok อยู่ | ต้อง deploy แล้วอัปเดต LIFF Endpoint URL |

---

> **Last updated:** 5 เมษายน 2569 (2026)
