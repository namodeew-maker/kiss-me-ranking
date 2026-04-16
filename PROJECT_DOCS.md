# Kiss Me Ranking — Project Documentation

> Gamified Loyalty & CRM System บน LINE LIFF (LINE Only)  
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
10. [Identity & Points (LINE Login Only)](#10-identity--points-line-login-only)
11. [วิธีรันโปรเจกต์](#11-วิธีรันโปรเจกต์)
12. [ไฟล์ตัวอย่าง (examples/)](#12-ไฟล์ตัวอย่าง-examples)
13. [รายการที่ปรับแก้ล่าสุด](#13-รายการที่ปรับแก้ล่าสุด)
14. [รายการที่ยังไม่ได้หรือยังค้างอยู่](#14-รายการที่ยังไม่ได้หรือยังค้างอยู่)

---

## 1. ภาพรวม

**Kiss Me Ranking** คือระบบ Loyalty สำหรับธุรกิจบริการ โดยลูกค้า:

1. **ล็อกอิน** ผ่าน LINE LIFF เท่านั้น (Telegram login ถูกปิดแล้ว)
2. **ส่งสลิป** พร้อมเลือกพนักงาน + ให้คะแนนลับ 10 ดาว (admin มองไม่เห็น)
3. **ได้พ้อยทายเลข** จากสลิปที่ admin อนุมัติ รายการละ 1 พ้อย คำนวณภายในรอบสะสม 1 เดือนที่แอดมินกำหนด
4. **ทายเลข 2 หลัก** (00-99) โดยใช้ 5 พ้อยต่อ 1 เลข สามารถทายได้หลายเลขในรอบเดียวกันถ้าพ้อยพอ
5. **ถูกรางวัล** → Cashback 5,000 ฿ (ถอนเงินสดหัก 10% หรือเก็บใช้ซ้ำเต็มจำนวน)
6. **ไม่ถูกรางวัล** → รับ Gift Voucher 300 บาท
7. **โหวตซ้ำหลังทายเลข** — เมื่อทายเลขแล้ว สามารถโหวตพนักงานที่เคยโหวตแล้วได้อีกรอบ (guess_cycle)

---

## 2. สถาปัตยกรรมระบบ

```
┌─────────────┐
│ LINE LIFF   │  ← ลูกค้าล็อกอินผ่าน LINE เท่านั้น
│ (ลูกค้า)     │    (Telegram ถูกปิดแล้ว)
└──────┬──────┘
       │
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
     ┌───────┤
     │       │
     ▼       ▼
  Cloudflare   LINE
  R2 (รูป)     Messaging
               API (OA)
```

**Admin** เข้าผ่าน `/admin` → `/admin/panel` ใช้ Token-based auth  
legacy path `admin-login.html` และ `admin.html` ยัง redirect มา path ใหม่ได้

---

## 3. โครงสร้างไฟล์

```
Kiss Me Ranking/
├── .codacy/                        ← ไฟล์/สคริปต์ที่ใช้กับ Codacy CLI ใน repo นี้
├── .env                            ← Environment variables สำหรับ local
├── .env.example                    ← ตัวอย่างค่าตั้งต้นของ environment variables
├── .git/                           ← Git metadata
├── .github/
│   └── instructions/
│       └── codacy.instructions.md  ← กติกาการใช้งาน Codacy MCP / CLI
├── .gitignore                      ← รายการไฟล์ที่ไม่ให้ commit
├── .vscode/
│   ├── settings.json               ← Workspace settings
│   └── tasks.json                  ← VS Code tasks
├── admin-login.html                ← หน้า login admin
├── admin.css                       ← CSS ของ admin dashboard
├── admin.html                      ← หน้า dashboard admin
├── admin.js                        ← JS ของ admin dashboard
├── deploy/                         ← ไฟล์ช่วย deploy ขึ้น VPS / Nginx / PM2
│   ├── .env.production             ← template env สำหรับ production บน VPS
│   ├── ecosystem.config.js         ← PM2 config สำหรับ production
│   ├── nginx-ranking.conf          ← Nginx reverse proxy config สำหรับ ranking.kissme-vip.com
│   └── setup-vps.sh                ← shell script ช่วย setup Ubuntu VPS เบื้องต้น
├── examples/                       ← ตัวอย่างโค้ด integration / legacy reference
│   ├── company-callback.js         ← Webhook receiver ฝั่งบริษัท
│   ├── line-points-gateway.js      ← Gateway: LINE OAuth + points forward
│   ├── telegram-messaging.js       ← Service ส่งข้อความ Telegram
│   └── unified-queries.sql         ← ตัวอย่าง SQL สำหรับ identity lookup
├── index.html                      ← หน้าลูกค้า
├── init-db-unified.sql             ← Unified schema แบบ standalone
├── init-db.sql                     ← Schema ตั้งต้นของระบบหลัก
├── Lotto_Project_Manual.md         ← คู่มือโปรเจกต์เดิม
├── migrate-guess-cycle.sql          ← Migration สำหรับระบบ re-vote หลังทายเลข (guess_cycle)
├── migrate-rating-scale-10.sql       ← Migration ปรับ constraint คะแนนลับเป็น 1-10
├── migrate-reward-claim-mode.sql    ← Migration เพิ่ม claim_mode (withdraw/reuse) ใน lottery_reward_claims
├── migrate-sold-out-round.sql       ← Migration แก้ Sold Out ให้ unique ต่อ (number, round_label)
├── migrate-unified.sql             ← Migration เพิ่ม global_user_id / points / โครงสร้าง identity เพิ่มเติม
├── node_modules/                   ← Dependencies ที่ติดตั้งจาก npm
├── package-lock.json               ← Lockfile ของ npm
├── package.json                    ← Dependencies และ scripts
├── profile.css                     ← CSS ของหน้า profile
├── profile.html                    ← หน้าโปรไฟล์ลูกค้า
├── profile.js                      ← JS ของหน้า profile
├── PROJECT_DOCS.md                 ← เอกสารนี้
├── ranking.css                     ← CSS ของหน้า ranking
├── ranking.html                    ← หน้า leaderboard / ranking
├── ranking.js                      ← JS ของหน้า ranking
├── script.js                       ← JS หลักของ index.html
├── seed-staff.js                   ← Script สร้างข้อมูลพนักงานตัวอย่าง
├── server.js                       ← Backend หลัก (Express.js, ทุก endpoint อยู่ที่นี่)
├── status.html                     ← หน้าสถานะ transaction
├── styles.css                      ← CSS หลักของหน้าลูกค้า
├── uploads/                        ← local uploads fallback
│   ├── 1775058350403-440250.jpg
│   ├── 1775121303654-908880.png
│   ├── 1775121321627-511087.jpg
│   ├── 1775121339964-133120.jpg
│   └── 1775121359444-559828.png
└── ข้อกฎหมาย.md                   ← เงื่อนไขกฎหมาย/ข้อตกลง
```

> หมายเหตุ: tree ด้านบนอ้างอิงจากไฟล์ที่มีอยู่จริงใน workspace ปัจจุบัน หากติดตั้ง dependency ใหม่หรือมีไฟล์ generated เพิ่มเข้ามา รายการนี้ควรอัปเดตตาม repo อีกครั้ง

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
| **helmet** | ^8.1.0 | Security headers ฝั่ง Express |
| **express-rate-limit** | ^8.3.2 | Rate limit และช่วยกัน brute force |
| **@aws-sdk/client-s3** | ^3.1023.0 | Cloudflare R2 storage |

**Runtime:** Node.js (CommonJS, ไม่ใช้ TypeScript)  
**Database:** PostgreSQL (ใช้ Neon serverless)  
**CDN:** LINE LIFF SDK, Chart.js (admin), Google Fonts (Orbitron + Kanit)

---

## 5. Environment Variables

```env
# Server
NODE_ENV=production

# PostgreSQL
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
PORT=3000

# Cloudflare R2 — เก็บรูปสลิป (ถ้าไม่ตั้ง = ใช้ local /uploads/)
R2_ACCOUNT_ID=
R2_ACCESS_KEY=
R2_SECRET_KEY=
R2_BUCKET=lotto-uploads
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
REQUIRE_R2_STORAGE=true

# Admin path
ADMIN_LOGIN_PATH=admin

# LINE Login — สำหรับ server-side OAuth callback (ยังไม่ได้ตั้งค่า)
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
LINE_REDIRECT_URI=

# Company webhook — ส่ง event ไปบริษัท
COMPANY_WEBHOOK_URL=
COMPANY_WEBHOOK_TOKEN=

# Telegram Bot (legacy / optional)
TELEGRAM_BOT_TOKEN=
```

> **หมายเหตุ:** LINE LIFF ID (`2009696727-evibES3H`) ฝังใน script.js / profile.js โดยตรง ไม่ได้อยู่ใน .env และ `TELEGRAM_BOT_TOKEN` ไม่ใช่ค่าที่จำเป็นต่อ customer flow ปัจจุบันแล้ว

---

## 6. ฐานข้อมูล

### 6.1 ตารางจาก init-db.sql (ระบบหลัก)

| ตาราง | หน้าที่ | คอลัมน์สำคัญ |
|-------|--------|-------------|
| **users** | ข้อมูลลูกค้า | `id`, `platform` (line/telegram), `platform_id`, `display_name`, `picture_url`, `progress_count` (legacy progress UI), `global_user_id` (UUID) |
| **staffs** | ข้อมูลพนักงาน | `id`, `name`, `nickname`, `avatar_url`, `is_active` |
| **transactions** | บันทึกส่งสลิป | `id`, `user_id`, `staff_id`, `slip_image_url`, `status` (pending/approved/rejected), `round_label`, `reviewed_by`, `reject_reason`, `guess_cycle` (INT — ระบุว่าเป็นชุดโหวตรอบที่เท่าไร) |
| **ratings** | คะแนนลับ 3 ด้าน (**admin มองไม่เห็น**) | `transaction_id`, `looks_score`, `service_score`, `value_score` (1-10 แต่ละด้าน) |
| **lottery_guesses** | ทายเลข 2 หลัก | `user_id`, `guess_number` (00-99), `round_label`, `result` (pending/won/lost), `reward_amount` |
| **lottery_reward_claims** | บันทึกการใช้สิทธิ์ Cashback / GV แบบทยอยใช้ | `lottery_guess_id`, `user_id`, `reward_type` (cashback/gv), `amount`, `note`, `redeemed_by`, `redeemed_at`, `claim_mode` (withdraw/reuse — เฉพาะ Cashback) |
| **sold_out** | เลขที่ถูกจองแล้วต่อรอบ | `number` (0-99), `round_label` |
| **admin_users** | ผู้ดูแลระบบ | `username`, `password_hash` (bcrypt) |

### 6.2 ตารางจาก migrate-unified.sql (Identity & Points)

| ตาราง | หน้าที่ | คอลัมน์สำคัญ |
|-------|--------|-------------|
| **points** | คะแนนสะสมจากกิจกรรมต่างๆ | `global_user_id`, `activity_type`, `points`, `source_platform`, `source_oa_id`, `metadata` (JSONB) |

> หมายเหตุ: migration และ setup ปัจจุบันโฟกัสที่ LINE Login + points ledger เป็นหลัก โดยใช้ `platform_id` / `User ID` ที่ลูกค้าคัดลอกจากหน้า profile มาให้แอดมินแทน ส่วนข้อมูล Telegram จัดเป็น legacy compatibility

### 6.3 Constraints สำคัญ

- `UNIQUE (platform, platform_id)` — ป้องกัน user ซ้ำ
- `UNIQUE (user_id, staff_id, round_label, guess_cycle) WHERE status <> 'rejected'` — ห้ามแจ้งพนักงานซ้ำในชุดโหวตเดียวกัน (เมื่อทายเลขแล้ว guess_cycle +1 จะเริ่มชุดใหม่ได้)
- `UNIQUE (user_id, round_label, guess_number)` บน lottery_guesses — คนเดิมห้ามทายเลขเดิมซ้ำในรอบเดียวกัน แต่ยังทายหลายเลขได้
- `lottery_reward_claims.amount > 0` — ทุกการใช้สิทธิ์ต้องเป็นยอดบวก
- `UNIQUE (number, round_label)` บน sold_out — 1 เลขต่อรอบ

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
| `POST` | `/api/auth/login` | — | ล็อกอิน/สมัครลูกค้า (LINE เท่านั้น — Telegram ถูกปิดแล้ว) |
| `GET` | `/auth/line/callback` | — | OAuth2 callback จาก LINE Login (server-side flow) |
| `GET` | `/api/auth/telegram/config` | — | ❌ ปิดแล้ว — return 410 |
| `POST` | `/api/auth/telegram` | — | ❌ ปิดแล้ว — return 410 |

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
| `GET` | `/api/users/:platform_id/progress` | — | ดูพ้อยรอบปัจจุบัน, progress UI และสิทธิ์ทายที่คำนวณจากพ้อย |
| `GET` | `/api/users/:platform_id/history` | — | ประวัติ transaction + lottery ทั้งหมด |
| `POST` | `/api/users/:platform_id/avatar` | — | อัปโหลด/เปลี่ยนรูปโปรไฟล์ของลูกค้า (LINE เท่านั้น) |

> Query param หลักที่ใช้งานจริงคือ `?platform=line` โดยข้อมูล Telegram ที่ยังมีอยู่ใช้เพื่อ lookup ข้อมูล legacy เท่านั้น

### 7.5 Transaction (ส่งสลิป)

| Method | Path | Auth | หน้าที่ |
|--------|------|------|--------|
| `POST` | `/api/transactions` | — | ลูกค้าส่งสลิป (multipart/form-data) |
| `GET` | `/api/history` | — | ดึง activity ทั้งหมดของ admin รวม transaction และ guess-only rows |
| `PUT` | `/api/history/:id/approve` | Bearer | อนุมัติรายการส่งสลิป → เพิ่ม 1 พ้อยในรอบนั้น |
| `PUT` | `/api/history/:id/reject` | Bearer | ปฏิเสธ (พร้อมเหตุผล) |
| `DELETE` | `/api/history/:id` | Bearer | ลบ transaction |
| `GET` | `/api/history/pending/count` | — | นับรายการรออนุมัติ |

**Multipart body ตัวอย่าง `/api/transactions`:**
```
slip: (file)
staff_id: 3
platform_id: U1234abcd
platform: line
looks_score: 4
service_score: 5
value_score: 8
```

### 7.6 Lottery

| Method | Path | Auth | หน้าที่ |
|--------|------|------|--------|
| `POST` | `/api/lottery/guess` | — | ทายเลขโดยใช้ 5 พ้อยต่อ 1 เลข |
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

### 7.8 Reward Ledger (Admin)

| Method | Path | Auth | หน้าที่ |
|--------|------|------|--------|
| `GET` | `/api/admin/rewards/ledger` | Bearer | ดูสรุปสิทธิ์ Cashback / GV ที่ยังค้าง, ใช้แล้ว, คงเหลือ (รวม claim_mode) |
| `POST` | `/api/admin/rewards/claims` | Bearer | บันทึกการใช้สิทธิ์ 1 ครั้ง (รองรับทยอยใช้, `redeemed_at`, และ `claim_mode` สำหรับ Cashback) |
| `DELETE` | `/api/admin/rewards/claims/:id` | Bearer | ลบรายการบันทึกการใช้สิทธิ์ย้อนหลัง |

### 7.10 Guess-Point Cycle (Admin)

| Method | Path | Auth | หน้าที่ |
|--------|------|------|--------|
| `GET` | `/api/admin/guess-points/cycle` | Bearer | ดูรอบสะสมแต้มทายเลขปัจจุบัน (start/end date) |
| `POST` | `/api/admin/guess-points/cycle` | Bearer | ตั้งค่าวันเริ่มรอบสะสมแต้มทายเลข |
| `POST` | `/api/admin/guess-points/reconcile` | Bearer | รีเช็ค ledger พ้อยทายเลขจากสลิปอนุมัติ: เติม point ที่ตกหล่น, ลบรายการ point ที่ไม่มีข้อมูลจริงรองรับ, และ sync progress user |

### 7.11 Ranking

| Method | Path | Auth | หน้าที่ |
|--------|------|------|--------|
| `GET` | `/api/ranking/customers` | — | อันดับลูกค้า จัดตาม Rank EXP จากสลิปอนุมัติหลังวันที่รีแรงค์ลูกค้า |
| `GET` | `/api/ranking/staff` | — | อันดับพนักงาน จัดตามรายการอนุมัติหลังวันที่รีอันดับพนักงาน ใช้แสดงในหน้า Admin |
| `GET` | `/api/admin/customers/reset-rank` | Bearer | ดูวันที่เริ่มนับ Rank EXP ลูกค้าปัจจุบัน |
| `POST` | `/api/admin/customers/reset-rank` | Bearer | ตั้งวันที่เริ่มนับ Rank EXP ลูกค้าใหม่ โดยไม่ลบประวัติสลิปเดิม |

### 7.9 Identity & Points

| Method | Path | Auth | หน้าที่ |
|--------|------|------|--------|
| `POST` | `/api/points/activity` | — | บวกแต้ม + forward ไปบริษัท |
| `POST` | `/api/admin/points/redeem` | Bearer | ปิดใช้แล้ว — runtime ปัจจุบัน return 409 เพราะพ้อยใช้สำหรับระบบทายเลขอัตโนมัติเท่านั้น |
| `GET` | `/api/points/:global_user_id` | — | ยอดคะแนนสะสม + ประวัติล่าสุด |
| `GET` | `/api/unified/profile` | — | Unified profile lookup |
| `POST` | `/api/company/activity` | Webhook Token | บริษัท ส่ง event กลับ → reply กลับตาม channel ที่ยังเชื่อมอยู่ |
| `POST` | `/api/telegram/send` | — | ส่งข้อความผ่าน Telegram Bot |

**Unified profile query params:**
```
/api/unified/profile?by=line&id=U1234
/api/unified/profile?by=telegram&id=123456
/api/unified/profile?by=global&id=uuid-here
```

**การใช้งานจริงสำหรับแอดมินตอนนี้:**
- ลูกค้าเปิดหน้า profile
- ก็อปปี้ `User ID` ของตัวเอง (`platform_id`)
- ส่งให้แอดมินเพื่อตรวจสอบยอดพ้อย / Cashback / GV
- แอดมินค้นหาจากหน้า User Management แล้วเปิด modal เพื่อหักสิทธิ์ให้ลูกค้า

---

## 8. Frontend Pages

### 8.1 index.html — หน้าลูกค้า

**Flow:**
```
เปิดหน้า → เช็ค LIFF auto-login → ยอมรับข้อตกลง → ล็อกอินผ่าน LINE เท่านั้น
→ เข้าเนื้อหาหลัก → เลือกพนักงาน + อัปโหลดสลิป + ให้คะแนน 10 ดาว → ส่ง
→ เมื่อมีพ้อยครบ 5 ขึ้นไป → เลือกเลข 2 หลักจาก grid 00-99 และใช้เลขละ 5 พ้อย
→ เมื่อทายเลขแล้ว สามารถโหวตพนักงานที่เคยโหวตในชุดเดิมได้อีกครั้ง (re-vote)
```

**LIFF ID:** `2009696727-evibES3H` (ฝังใน script.js บรรทัด 20)

**SessionStorage:**
- `terms_accepted` — ยอมรับข้อตกลงแล้วหรือยัง
- `currentUser` — JSON ข้อมูล user ที่ล็อกอินอยู่

**จุดที่อัปเดตล่าสุดบนหน้า index:**
- คะแนนลับใช้สเกล 1-10 แบบ 10 ปุ่มใน 1 แถวบน desktop
- ช่องวันที่มาใช้บริการมีปุ่ม `เปิดปฏิทิน` และ shortcut `วันนี้`, `เมื่อวาน`, `3 วันที่แล้ว`, `7 วันที่แล้ว`
- หลังส่งฟอร์มสำเร็จ ระบบรีเซ็ตคะแนนกลับไปค่าเริ่มต้น 5/10 และรีเซ็ตวันที่กลับเป็นวันนี้

**CSS Theme:** Neon futuristic — สีหลัก `#ff3c3c` (แดง), `#00f0ff` (ฟ้า), `#00ffaa` (เขียว), พื้นหลัง `#060612`  
**Fonts:** Orbitron (หัวข้อ/ตัวเลข), Kanit (เนื้อหาภาษาไทย)

### 8.2 profile.html — หน้าโปรไฟล์

แสดง: User card (avatar, ชื่อ, platform badge) → block `User ID สำหรับส่งให้แอดมิน` พร้อมปุ่มคัดลอก → ปุ่มอัปโหลด `เปลี่ยนรูปโปรไฟล์` → แถบพ้อยรอบนี้ → สรุปรางวัล → section `📊 ประวัติการใช้บริการ & ผลทายเลข` แบบรวม → Tab สลิป / Tab ทายเลข

หน้า profile ถูกจัดใหม่เป็น layout 2 คอลัมน์เพื่อให้ card หลัก, progress, rank, reward summary และ combined activity feed อ่านง่ายขึ้นบน desktop และยังยุบเป็นคอลัมน์เดียวบน mobile

**เข้าถึง:** ปุ่ม profile บน index.html → `<a href="profile.html">`

### 8.3 /admin → /admin/panel — หน้า Admin

**Login:** username + password → admin token (เก็บใน `sessionStorage`)

**Dashboard มีหลาย Tab หลัก + panel จัดการเพิ่มเติมในหน้า Overview/User/Lottery:**
1. Overview: สถิติรวม, สรุป Cashback / GV, reward ledger, สถานะที่เก็บรูป
2. Users: ค้นหา user, ดูรายละเอียด, ดูพ้อยทายเลข, Rank EXP, Cashback / GV และตั้งค่าวันรีแรงค์ลูกค้า
3. Staff: จัดการพนักงาน + อันดับพนักงาน + รีอันดับพนักงาน
4. Approval: คิวรออนุมัติ + ประวัติทั้งหมด
5. Lottery: sold-out, กราฟ, ประกาศผล, **ตั้งค่ารอบสะสมแต้มทายเลข** และปุ่มรีเช็คพ้อยทายเลข

**ใน Overview มี panel “จัดการการใช้สิทธิ์ Cashback / GV” เพิ่มเติม:**
- สรุปสิทธิ์ที่ยังค้างทั้งหมด
- ตารางสิทธิ์ต่อ user / ต่อรอบ
- ฟอร์มบันทึกการใช้สิทธิ์ทีละยอด
- รายการย้อนหลังว่าใครใช้ไปเท่าไร เมื่อไร และแอดมินคนไหนบันทึก

**ใน User Management มีส่วนแยกพ้อยทายเลขกับ Rank EXP:**
- พ้อยทายเลขเป็นรอบสั้นสำหรับสิทธิ์ทายเลข: สลิปอนุมัติ 1 ครั้ง = 1 พ้อย, ใช้ 5 พ้อยต่อ 1 เลข
- Rank EXP เป็นคะแนนสะสมระยะยาวของโปรไฟล์: สลิปอนุมัติ 1 ครั้ง = 1 EXP และนับตามวันที่รีแรงค์ลูกค้าที่แอดมินกำหนด
- User Detail Modal แสดงทั้งพ้อยทายเลข, พ้อยรวม, Rank EXP, วันที่รีแรงค์ และประวัติพ้อยล่าสุด
- ระบบแอดมินหักพ้อยแบบ manual ถูกปิดแล้ว เพราะพ้อยถูกใช้กับการทายเลขอัตโนมัติเท่านั้น

**ใน Staff มีอันดับพนักงาน:**
- อันดับพนักงานถูกย้ายมาไว้ในหน้า Admin
- มีปุ่ม `เช็กอันดับล่าสุด` เพื่อ reload อันดับจาก `/api/ranking/staff`
- มี highlight top 3 และตารางอันดับที่นับจากรายการอนุมัติหลังวันที่รีอันดับพนักงาน

**ในแท็บ Lottery มีระบบรีเช็คพ้อยทายเลข:**
- ปุ่ม `รีเช็คพ้อยทายเลข` เรียก `/api/admin/guess-points/reconcile`
- ระบบเติม point จากสลิปอนุมัติที่ตกหล่น
- ระบบลบ point ที่ไม่มี transaction/guess จริงรองรับ
- ระบบ sync progress ของ user หลังรีเช็ค

**ใน User Detail Modal มีส่วน “บันทึกการใช้สิทธิ์ของ user นี้” เพิ่มเติม:**
- เลือก reward row ของลูกค้าจากรายการ Cashback / GV ที่คงเหลือ
- เห็นยอดคงเหลือทันทีทั้งแบบ gross และ net สำหรับ Cashback
- ระบุวันที่ใช้สิทธิ์ (`redeemed_at`) ได้เอง
- กรอกยอดที่จะใช้และ note แล้วบันทึกตัดยอดจากหน้า user ได้โดยตรง

**ในแท็บ Approval มีตารางประวัติรวมเพิ่มเติม:**
- แสดงทั้งรายการส่งสลิปและ guess-only rows ในตารางเดียว
- guess-only rows จะแสดงเป็น `บันทึกการทายเลข`, `ไม่มีสลิป`, ผลรางวัล และปุ่ม `ดู user`
- ตาราง user management และ history ถูกห่อด้วย scroll container เพื่อลดอาการ layout ล้นบนข้อมูลยาว

**Flow ใหม่ของการใช้สิทธิ์:**
- ลูกค้าดู `User ID` จากหน้าโปรไฟล์ของตัวเอง
- ส่ง `User ID` ให้แอดมิน
- แอดมินค้นหา user ด้วย `platform_id`
- ตรวจสอบยอดคงเหลือและหักสิทธิ์ให้จากหน้า admin โดยตรง

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
ถ้า approve → ได้ 1 พ้อยทายเลข
ห้ามพนักงานซ้ำในชุดโหวตเดียวกัน (ดู guess_cycle)
         ↓
ทุก 5 พ้อย = ทายเลขได้ 1 ครั้ง
เมื่อทายจริง ระบบจะหัก 5 พ้อยทันที
และเริ่มชุดโหวตใหม่ (guess_cycle +1) ทำให้โหวตพนักงานเดิมได้อีก
```

### 9.3 Flow ทายเลข

```
ลูกค้าเลือกเลข 00-99 จาก grid
(เลขที่ sold out จะกดไม่ได้)
         ↓
ระบบตรวจว่า current_round_points คงเหลืออย่างน้อย 5
         ↓
INSERT lottery_guesses (result: pending)
หักพ้อย 5 แต้มทันที
         ↓
Admin ประกาศเลขที่ถูก → POST /api/draw { winningNumber: "42" }
         ↓
ถูก → reward_amount = 5,000 ฿ (Cashback)
       → ลูกค้าเลือกได้: ถอนเงินสดหัก 10% หรือเก็บใช้ซ้ำเต็มจำนวน
ผิด → reward_amount = 300 ฿ (Gift Voucher)
```

หมายเหตุ:
- ผู้ใช้ 1 คนทายได้หลายเลขในรอบเดียวกัน ถ้าพ้อยยังพอ
- แต่คนเดิมห้ามทายเลขเดิมซ้ำในรอบเดียวกัน
- พ้อยทายเลขคำนวณภายในรอบสะสม 1 เดือนที่แอดมินตั้งค่าผ่าน admin panel (ไม่ได้ผูกกับ round label อีกแล้ว)
- เมื่อทายเลขแล้ว ระบบจะเข้าสู่ชุดโหวตใหม่ (guess_cycle +1) ทำให้สามารถโหวตพนักงานที่เคยโหวตในชุดก่อนได้อีกรอบ

### 9.4 เกณฑ์การจัดแรงค์ / Rank EXP (Rank Criteria)

ระบบแรงค์ใช้ **Rank EXP จากสลิปที่อนุมัติ** เป็นเกณฑ์เดียว โดยแยกจากพ้อยทายเลข:

- สลิปอนุมัติ 1 ครั้ง = 1 Rank EXP
- นับตามวันที่รีแรงค์ลูกค้าที่แอดมินกำหนดในหน้า User Management
- ค่า setting เก็บใน `app_settings` key `customer_rank_reset_date`
- ถ้ายังไม่ตั้งวันที่รีแรงค์ ระบบจะนับจากสลิปอนุมัติทั้งหมด
- หน้า profile และ ranking ใช้ยอดที่นับหลังวันที่รีแรงค์นี้ ไม่ใช้ยอดพ้อยทายเลข

| Rank | เงื่อนไขสลิปอนุมัติสะสม |
|------|----------------------|
| Unranked | 0 |
| Bronze | 3 |
| Silver | 6 |
| Gold | 12 |
| Platinum | 24 |
| Diamond | 48 |
| Master | 90 |
| Grandmaster | 150 |

**ตัวอย่าง:**
- สลิปอนุมัติสะสม `2` → ยังเป็น `Unranked`
- สลิปอนุมัติสะสม `3` → ได้ `Bronze`
- สลิปอนุมัติสะสม `48` → ได้ `Diamond`
- สลิปอนุมัติสะสม `90` → ได้ `Master`

Frontend ที่ใช้เกณฑ์นี้อยู่ใน `profile.js` และ `ranking.js` โดยใช้เงื่อนไขเดียวกัน

> **หมายเหตุ:** หน้า ranking สาธารณะ (`ranking.html`) แสดงเฉพาะอันดับลูกค้า ส่วนอันดับพนักงานถูกย้ายไปในหน้า Admin แล้ว

### 9.5 Flow พ้อยทายเลขและการรีเช็คพ้อยโดยแอดมิน

ระบบนี้ใช้ `points` เป็น ledger สำหรับสิทธิ์ทายเลขอัตโนมัติ:

- พ้อยบวก = `transaction_approved` จากสลิปที่ admin อนุมัติ
- พ้อยลบ = `lottery_guess_spend` เมื่อผู้ใช้ทายเลขจริง ระบบหัก 5 พ้อยทันที
- ไม่รองรับการหักพ้อย manual จาก admin แล้ว (`POST /api/admin/points/redeem` return 409)

หลักการสะสม:

```text
Admin อนุมัติสลิป
  ↓
INSERT points +1 (activity_type = transaction_approved)
  ↓
สะสมครบ 5 พ้อยในรอบสะสมทายเลข
  ↓
ผู้ใช้ทายเลข 1 ครั้ง
  ↓
INSERT points -5 (activity_type = lottery_guess_spend)
```

ระบบรีเช็คพ้อย:

- อยู่ใน Admin แท็บ Lottery ปุ่ม `รีเช็คพ้อยทายเลข`
- เรียก `POST /api/admin/guess-points/reconcile`
- เติม `transaction_approved` point ที่ตกหล่นจากสลิป approved
- ลบ `transaction_approved` point ที่ไม่มี transaction approved จริงรองรับ
- ลบ `lottery_guess_spend` point ที่ไม่มี lottery guess จริงรองรับ
- sync `users.progress_count` ตามข้อมูลรอบปัจจุบัน

สิ่งที่แอดมินเห็นได้:

- พ้อยทายเลขรอบปัจจุบัน
- จำนวนสิทธิ์ทายเลขที่คำนวณได้จากพ้อย
- ประวัติพ้อยล่าสุดทั้งบวกและลบ
- Rank EXP ของ user และวันที่รีแรงค์ที่ใช้นับ

**ตัวอย่างพ้อยทายเลข:**

```text
ลูกค้ามีสลิปอนุมัติในรอบทายเลขปัจจุบัน 5 ครั้ง
ระบบบันทึก points +1 จำนวน 5 รายการ
ลูกค้าทายเลข 1 ครั้ง
ระบบบันทึก points -5
พ้อยคงเหลือในรอบนี้ = 0
```

### 9.6 Flow การจัดการ Cashback / Gift Voucher ในหน้า Admin

หลังประกาศผลรางวัล ระบบจะแยกเป็น 2 ชั้นข้อมูล:

1. `lottery_guesses.reward_amount`
ความหมาย: ยอดสิทธิ์ต้นทางที่ลูกค้าได้รับจากงวดนั้น

2. `lottery_reward_claims`
ความหมาย: รายการบันทึกการใช้สิทธิ์แต่ละครั้งของลูกค้า

หลักการทำงาน:

```text
ประกาศผลรางวัล
  ↓
ถ้าถูก → สร้างสิทธิ์ Cashback ต้นทางใน lottery_guesses
ถ้าผิด → สร้างสิทธิ์ GV ต้นทางใน lottery_guesses
  ↓
แอดมินเปิดหน้า Overview → panel จัดการ Cashback / GV
  ↓
เลือกสิทธิ์ของลูกค้าจากตาราง
  ↓
กรอกยอดที่ลูกค้าจะใช้ในครั้งนั้น + ใส่ note
  ↓
ระบบบันทึกลง lottery_reward_claims
  ↓
ยอดคงเหลือ = reward_amount - SUM(claim.amount)
```

สิ่งที่แอดมินเห็นได้ใน panel นี้:

- ได้รับทั้งหมด: ยอดสิทธิ์ต้นทาง
- ใช้แล้ว: ผลรวมยอดที่เคยบันทึกใช้สิทธิ์
- คงเหลือ: ยอดที่ยังใช้ได้
- ใช้แล้วกี่ครั้ง: จำนวนรายการใน ledger
- ประวัติย้อนหลัง: ใครใช้, ใช้เมื่อไร, ใช้เท่าไร, note อะไร

### 9.7 ตัวอย่างการจัดการยอด 1,000 บาท

สมมุติลูกค้าคนหนึ่งมีสิทธิ์ดังนี้:

- Gift Voucher คงเหลือ `1,000` บาท
- Cashback คงเหลือ `1,000` บาท

กรณีลูกค้าใช้ **Gift Voucher 400 บาท**:

```text
ยอดเดิม 1,000
ใช้ครั้งที่ 1 = 400
คงเหลือ = 600
```

แอดมินจะบันทึก 1 รายการใน `lottery_reward_claims` ด้วย `reward_type = 'gv'` และ `amount = 400`

กรณีลูกค้าใช้ **Cashback 300 บาท**:

```text
ยอดเดิม 1,000
ใช้ครั้งที่ 1 = 300
คงเหลือ = 700
```

แอดมินจะบันทึก 1 รายการใน `lottery_reward_claims` ด้วย `reward_type = 'cashback'` และ `amount = 300`

ถ้าลูกค้ากลับมาใช้อีก:

```text
Cashback คงเหลือ 700
ใช้ครั้งที่ 2 = 200
คงเหลือ = 500
```

ระบบจะไม่ทับรายการเดิม แต่จะเพิ่ม ledger แถวใหม่ ทำให้ตรวจสอบย้อนหลังได้ครบ

ใน flow ล่าสุด แอดมินสามารถทำรายการนี้ได้ 2 จุด:
- จาก panel กลางใน Overview สำหรับดู ledger รวมทุก user
- จาก User Detail Modal ของลูกค้าคนนั้นโดยตรง พร้อมระบุวันที่ใช้สิทธิ์ได้

### 9.8 Image Storage

- ตั้ง R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY → อัปโหลดไป Cloudflare R2 CDN
- ไม่ตั้ง → เก็บไฟล์ลง `/uploads/` serve ผ่าน `/uploads/:filename`

### 9.9 Authentication

| ประเภท | วิธีการ | เก็บที่ |
|--------|--------|--------|
| ลูกค้า | LIFF auto-login → `POST /api/auth/login` (LINE เท่านั้น) | `sessionStorage.currentUser` |
| Admin | username + password → `POST /api/login` → token | `sessionStorage.admin_token` + `Authorization: Bearer <token>` |

Admin token หมดอายุใน 8 ชั่วโมง และจะหายเมื่อ browser session ใหม่หรือเมื่อ restart server local ที่เก็บ token แบบ in-memory

> **หมายเหตุ:** Telegram login ถูกปิดแล้ว — endpoint `/api/auth/telegram` และ `/api/auth/telegram/config` return HTTP 410 Gone หน้า login ลูกค้าแสดงปุ่ม LINE เท่านั้น

### 9.10 Cashback Claim Mode

เมื่อลูกค้าถูกรางวัลได้ Cashback 5,000 ฿ แอดมินสามารถเลือก `claim_mode` ได้ 2 แบบ:

| Mode | ค่าธรรมเนียม | ยอดที่ได้รับ | กรณีใช้ |
|------|------------|-----------|--------|
| `withdraw` (ถอนเงินสด) | หัก 10% | 4,500 ฿ จากยอด 5,000 | ลูกค้าต้องการเงินสด |
| `reuse` (ใช้ซ้ำ) | ไม่หัก | 5,000 ฿ เต็มจำนวน | ลูกค้านำกลับมาใช้บริการ |

ระบบบันทึก `claim_mode` ทุกครั้งที่แอดมินตัดยอด Cashback ลง `lottery_reward_claims`

### 9.11 รอบสะสมแต้มทายเลข (Guess-Point Cycle)

พ้อยทายเลข**ไม่ได้ผูกกับ round label (A/B)** อีกแล้ว แต่ใช้ระบบรอบสะสม 1 เดือนที่แอดมินกำหนด:

- แอดมินตั้งค่า "วันเริ่มนับแต้มทายเลข" ผ่าน admin panel (แท็บ 🎯 การทายเลข)
- ระบบคำนวณวันสิ้นสุดอัตโนมัติ = วันเริ่ม + 1 เดือน
- พ้อยที่ได้ก่อนวันเริ่มรอบจะไม่นำมาคิดสิทธิ์ทายเลข
- ค่าเก็บใน `app_settings` key `guess_points_cycle_start_date`
- API: `GET/POST /api/admin/guess-points/cycle`
- มีปุ่ม `รีเช็คพ้อยทายเลข` ใน Admin เพื่อ sync ledger จากข้อมูล transaction/guess จริง (`POST /api/admin/guess-points/reconcile`)

### 9.12 ระบบ Re-Vote หลังทายเลข (Guess Cycle)

เมื่อลูกค้าทายเลขครบ (ใช้ 5 พ้อย) ระบบจะเข้าสู่ชุดโหวตใหม่:

```text
ชุดโหวตที่ 0: โหวตพนักงาน A, B, C, D, E → ครบ 5 → ทายเลข
                                               ↓
ชุดโหวตที่ 1: สามารถโหวตพนักงาน A, B, C, D, E ซ้ำได้อีก
```

- `transactions.guess_cycle` ระบุว่าอยู่ในชุดโหวตไหน
- Unique constraint ตรวจสอบ `(user_id, staff_id, round_label, guess_cycle)`
- Migration: `migrate-guess-cycle.sql`

---

## 10. Identity & Points (LINE Login Only)

### 10.1 แนวคิด

ระบบปัจจุบันรองรับเฉพาะ **LINE Login** เท่านั้น (Telegram login ถูกปิดแล้ว)

- **LINE Login user ID** — จากการ login ผ่าน LIFF

ระบบใช้ `global_user_id` (UUID) เป็นตัวกลาง และใช้ `platform_id` เป็นค่าที่ลูกค้าสามารถก็อปปี้ส่งให้แอดมินเพื่อเช็กสิทธิ์ได้โดยตรง

```
global_user_id (UUID)
    └── users.platform = 'line',    platform_id = 'U_line_login_123'
```

> **หมายเหตุ:** ข้อมูล user ที่เคยล็อกอินผ่าน Telegram ยังอยู่ในฐานข้อมูล แต่ระบบไม่อนุญาตให้ล็อกอินด้วย Telegram อีกแล้ว

### 10.2 การส่งข้อความกลับ

1. กรณี LINE/ระบบบริษัท → ใช้ flow ที่ผูกกับ LINE Login / webhook ที่มีอยู่
2. กรณี Telegram → จัดเป็น legacy integration ที่ยังอาจถูกเรียกใช้จากระบบภายนอกบางส่วน
3. ถ้าไม่มีช่องทางเลย → return `channel: 'none'`

### 10.3 หมายเหตุเรื่องโครงสร้างใหม่

โค้ด runtime และ setup หลักของโปรเจกต์ถูกปรับให้ไม่ใช้ OA หลายตัวแล้ว โดยหน้าแอดมินและหน้าโปรไฟล์ใช้ `platform_id` / `User ID` เป็นตัวหลักในการตรวจสอบสิทธิ์, หักพ้อย, และหัก Cashback หรือ Gift Voucher

หน้าแอดมินใน User Detail Modal จะแสดง `ID ที่ใช้ค้นหาในแอดมิน` เพื่อย้ำว่าการทำงานจริงใช้ LINE User ID หรือ Global User ID ของลูกค้าเป็นหลัก ส่วน Telegram จัดเป็นข้อมูล legacy

workflow หลักที่ใช้จริงคือ:

```text
ลูกค้าเปิด profile
  ↓
คัดลอก User ID
  ↓
ส่งให้แอดมิน
  ↓
แอดมินค้นหา user ใน admin panel
  ↓
ตรวจยอด / หักสิทธิ์ / บันทึก ledger
```

### 10.4 SQL ตัวอย่าง

ดูไฟล์ `examples/unified-queries.sql` เป็น reference สำหรับ query identity/points เพิ่มเติม โดย workflow หลักตอนนี้เน้น lookup ด้วย LINE user ID หรือ `global_user_id`

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
| `company-callback.js` | Webhook receiver: บริษัทส่ง event กลับมา → reply ลูกค้าผ่าน Telegram ถ้ามีช่องทาง | 3020 |
| `telegram-messaging.js` | Service: ส่งข้อความผ่าน Telegram Bot API | 3030 |
| `unified-queries.sql` | SQL query ตัวอย่างสำหรับ identity / points lookup | — |

> **หมายเหตุ:** Route ทั้งหมดจาก examples/ ถูก**รวมเข้า server.js แล้ว** — ไฟล์ examples/ เก็บไว้เป็น reference เท่านั้น

---

## 13. รายการที่ปรับแก้ล่าสุด

อัปเดตที่สะท้อนใน runtime ปัจจุบันแล้ว:

### 13.1 ฟีเจอร์เดิมที่ยังคงอยู่

- ระบบทายเลขเปลี่ยนเป็น point-based: อนุมัติ 1 รายการ = 1 พ้อย, ใช้ 5 พ้อยต่อ 1 การทาย, ทายหลายเลขต่อรอบได้
- `/api/history` ของ admin รวมทั้ง transaction และ guess-only rows ทำให้ประวัติการทายขึ้นในหน้า Admin แล้ว
- หน้า profile มี section `📊 ประวัติการใช้บริการ & ผลทายเลข` แบบรวม transaction และ lottery history
- หน้า profile ถูกจัด layout ใหม่เป็น 2 คอลัมน์บน desktop
- User Detail Modal ของ admin รองรับการตัด Cashback / GV ตาม user + ระบุวันที่ใช้สิทธิ์ได้
- หน้า index/profile/admin ใช้ `platform_id` หรือ `User ID` เป็นคีย์หลัก

### 13.2 ปรับแก้รอบล่าสุด (เมษายน 2569)

**ระบบรางวัลและ Cashback:**
- เปลี่ยนมูลค่ารางวัล: ทายถูก = Cashback **5,000 ฿** (จากเดิม 50,000), ทายผิด = GV **300 ฿** (จากเดิม 500)
- Cashback รองรับ **claim_mode**: `withdraw` (ถอนเงินสดหัก 10%) หรือ `reuse` (ใช้ซ้ำเต็มจำนวนไม่หัก)
- Admin UI มี select เลือก mode ทั้งใน reward ledger หลักและ User Detail Modal
- Migration: `migrate-reward-claim-mode.sql`

**ระบบ Re-Vote หลังทายเลข:**
- เพิ่ม `transactions.guess_cycle` เพื่อให้โหวตพนักงานเดิมได้อีกหลังจากทายเลขแล้ว
- Unique index เปลี่ยนจาก `(user_id, staff_id, round_label)` เป็น `(user_id, staff_id, round_label, guess_cycle)`
- Migration: `migrate-guess-cycle.sql`

**ระบบจัดอันดับลูกค้า:**
- แยกอันดับลูกค้าออกจากพ้อยทายเลข — ranking ใช้ Rank EXP จากสลิปอนุมัติ ไม่ใช้ points
- เพิ่มระบบรีแรงค์ลูกค้าในหน้า Admin แถบ User Management โดยเก็บวันที่เริ่มนับใน `app_settings.customer_rank_reset_date`
- หน้า ranking สาธารณะแสดงเฉพาะลูกค้า ส่วนอันดับพนักงานย้ายเข้า admin
- `/api/ranking/customers` return `total_approved`, `total_lifetime_approved`, `rank_reset_date`, และ `last_service_at`
- หน้า profile และ ranking แสดงคำว่า `Rank EXP` เพื่อแยกจากพ้อยทายเลขชัดเจน

**ระบบจัดอันดับพนักงาน:**
- อันดับพนักงานอยู่ในหน้า Admin แท็บ Staff เท่านั้น
- ซ่อม markup ของ highlight grid และเพิ่มปุ่ม `เช็กอันดับล่าสุด`
- ตารางอันดับพนักงานแสดงอันดับ, พนักงาน, รายการอนุมัติ และใช้งานล่าสุด

**รอบสะสมแต้มทายเลข:**
- พ้อยทายเลขไม่ผูกกับ round label อีก — ใช้รอบสะสม 1 เดือนที่แอดมินกำหนดแทน
- Admin panel มี section "🗓️ รอบสะสมแต้มทายเลข" ในแท็บ การทายเลข
- API: `GET/POST /api/admin/guess-points/cycle`
- เพิ่ม API/ปุ่ม `POST /api/admin/guess-points/reconcile` สำหรับรีเช็คพ้อยทายเลขจาก ledger จริง

**ระบบล็อกอิน:**
- ปรับเป็น **LINE เท่านั้น** — ปุ่ม Telegram ถูกลบจาก UI, endpoint Telegram login return 410
- `/api/auth/login` และ `/api/users/upsert` ปฏิเสธ platform อื่นที่ไม่ใช่ `line`

**UI/UX:**
- ปรับหน้า customer กลับไปใช้ **10 ดาว** (สเกล 1-10) พร้อม hidden input ค่าเริ่มต้น `5`
- ช่อง "วันที่มาใช้บริการ" ปรับให้เด่นขึ้น, จัดกึ่งกลาง, เพิ่มปุ่ม `เปิดปฏิทิน` และ shortcut เลือกวันแบบเร็ว
- ปรับ UI หน้าโปรไฟล์ให้กระชับและเหมาะกับมือถือมากขึ้น
- ปรับ visual ของ Rank/logo ให้เด่นขึ้นบน profile และ ranking
- บนมือถือ ปุ่มทายเลขถูกย้ายไปอยู่ข้างปุ่มกติกาใน footer เพื่อลดการบังข้อมูลหน้าแรก
- เพิ่มปุ่ม `เปลี่ยนรูปโปรไฟล์` บนหน้า profile เพื่อให้ลูกค้าอัปโหลด avatar ใหม่ได้โดยไม่ต้องผ่าน flow หน้า ranking
- เพิ่ม API `POST /api/users/:platform_id/avatar` สำหรับอัปโหลดรูปโปรไฟล์ฝั่งลูกค้า
- ปรับการแสดงรูป avatar ให้ fallback กลับไปใช้ ui-avatars ได้เสมอถ้ายังไม่มีรูปจริง
- แก้ layout card สรุป Cashback / GV บนหน้า admin ไม่ให้ข้อความหรือตัวเลขยาวล้นกรอบ
- Admin modal ขยายความกว้างเป็น 1240px และยุบเป็น 1 คอลัมน์เมื่อจอ < 1180px
- ปรับ responsive ของหน้า Admin สำหรับมือถือและ PC: tab เลื่อนง่ายขึ้น, table มี horizontal scroll, panel/padding/ปุ่มใน Staff Ranking เหมาะกับจอเล็กขึ้น
- Server validation สำหรับคะแนนลับปรับเป็น 1-10 และ `ensureDatabaseStructure()` จะ rewrite check constraint ให้ตรงอัตโนมัติ

**Schema / Migration:**
- `init-db.sql` ปรับ comment และ check constraint ของ `ratings` เป็น 1-10
- `init-db.sql` ระบุ `app_settings` ใช้เก็บทั้งวันที่รีอันดับพนักงานและวันที่รีแรงค์ลูกค้า
- เพิ่ม `migrate-rating-scale-10.sql` สำหรับอัปเดต constraint ของฐานข้อมูลเดิม

**สิ่งที่ถูกเอาออกหรือเลิกใช้ในรอบนี้:**
- ยกเลิกเอกสารอ้างอิงเดิมที่บอกว่าคะแนนลับเป็น 5 ดาว / 1-5 เพราะไม่ตรงกับ runtime ปัจจุบันแล้ว
- ยกเลิก assumption ว่าลูกค้าต้องไปหน้าอื่นก่อนจึงจะเปลี่ยนรูปโปรไฟล์ได้ ตอนนี้ทำได้ตรงจาก `profile.html`

**แก้บั๊ก Sold Out:**
- เลขที่ปิดขาย (Sold Out) แก้ schema/index ให้ unique per `(number, round_label)` ถูกต้อง
- Migration: `migrate-sold-out-round.sql`

---

## 14. รายการที่ยังไม่ได้หรือยังค้างอยู่

### 14.1 งานระบบ / product

- ข้อความอธิบายบางส่วนใน schema เดิม เช่น `progress_count` และคอมเมนต์ใน `init-db.sql` ยังสะท้อน model เก่าอยู่ แม้ runtime ปัจจุบันใช้ point-based flow แล้ว
- การตรวจ production แบบ end-to-end หลัง deploy ล่าสุดยังควรทวนอีกครั้ง โดยเฉพาะหน้า admin history และ profile combined activity feed บน environment production
- ฝั่ง auth admin ยังเป็น token ใน memory ของ server local จึงหลุด session เมื่อ restart server ระหว่างทดสอบ

### 14.2 งานโครงสร้าง / configuration

- LINE Login Channel ID/Secret ยังรอข้อมูลจริงจากฝั่งบริษัท
- `TELEGRAM_BOT_TOKEN` ไม่ใช่ค่าที่จำเป็นต่อ customer flow ปัจจุบันแล้ว และควรถือเป็น legacy integration
- Company Webhook URL ยังรอข้อมูลจริงจากฝั่งบริษัท
- หากต้องการให้ local Codacy workflow ใช้งานได้ ต้องแก้ปัญหา environment ของ `wsl .codacy/cli.sh analyze ...` ที่ล้มอยู่ในเครื่องพัฒนา

### 14.3 หมายเหตุการ deploy ปัจจุบัน

- Public production ปัจจุบัน: `https://ranking.kissme-vip.com`
- Origin production ปัจจุบัน: `VPS + Nginx + PM2` โดย Node/Express เสิร์ฟทั้ง frontend และ `/api` จาก origin เดียว
- DNS production ปัจจุบันใช้ `A record` ชื่อ `ranking` → `185.182.184.180` บน Cloudflare
- TLS production ปัจจุบันใช้ `Let's Encrypt` บน VPS และ Cloudflare ควรตั้ง `SSL/TLS = Full (strict)` เมื่อเปิด proxy
- Legacy deployment เดิมยังเก็บไว้เป็น reference/rollback path: Frontend `https://namodeew-maker.github.io/kiss-me-ranking/` และ Backend `https://kiss-me-ranking.onrender.com/api`
- ถ้ามีการเปลี่ยน domain หรือ backend host ต้องอัปเดต LIFF Endpoint URL, `LINE_REDIRECT_URI`, และจุด auto-detect ของ `API_BASE` ใน frontend ให้สอดคล้องกัน

### 14.4 บันทึกงานวันที่ 11 เมษายน 2569

สิ่งที่ทำวันนี้บน production:
- ตรวจและแก้ปัญหา Cloudflare `521` โดยพบว่า `Nginx` ขึ้นปกติ แต่ origin app ยังไม่ถูก reverse proxy ถึงเพราะ process ไม่ได้รันตรง port ที่ Nginx ใช้
- ยกแอป `kiss-me-ranking` ขึ้นบน VPS ด้วย `PM2` และปรับ production `.env` ให้ใช้ `PORT=3000` ให้ตรงกับ Nginx
- ตรวจและยืนยันว่า `Nginx -> 127.0.0.1:3000 -> Node/Express` ตอบ `200 OK` ได้จริง
- ติดตั้ง `certbot` และออกใบรับรอง `Let's Encrypt` ให้ `ranking.kissme-vip.com`
- ตั้ง `HTTP -> HTTPS` บน origin และทดสอบว่า `https://ranking.kissme-vip.com` ตอบ `200 OK`
- ตรวจ Cloudflare DNS/SSL จนได้ flow ที่ถูกต้องสำหรับ VPS: `A record + DNS only` ตอนออก cert และค่อยกลับไป `Proxied + Full (strict)` หลัง origin พร้อม

จุดที่ปรับแก้ใน repo รอบนี้:
- [server.js](/c:/Users/Dewkiad/Kiss Me Ranking/server.js:1): เพิ่ม `helmet`, `express-rate-limit`, `trust proxy`, login rate limit / lockout, เพิ่ม CORS ให้ `https://ranking.kissme-vip.com`, และข้าม Render redirect เมื่อรันบน custom domain / VPS
- [package.json](/c:/Users/Dewkiad/Kiss Me Ranking/package.json:1), [package-lock.json](/c:/Users/Dewkiad/Kiss Me Ranking/package-lock.json:1): เพิ่ม dependency สำหรับ security middleware (`helmet`, `express-rate-limit`)
- [deploy/.env.production](/c:/Users/Dewkiad/Kiss Me Ranking/deploy/.env.production:1): เพิ่ม template env สำหรับ production บน VPS ให้ตรงกับ flow จริง
- [deploy/ecosystem.config.js](/c:/Users/Dewkiad/Kiss Me Ranking/deploy/ecosystem.config.js:1): ใช้เป็น baseline สำหรับรันแอปผ่าน PM2 ใน production
- [deploy/nginx-ranking.conf](/c:/Users/Dewkiad/Kiss Me Ranking/deploy/nginx-ranking.conf:1): template Nginx reverse proxy สำหรับ `ranking.kissme-vip.com`
- [deploy/setup-vps.sh](/c:/Users/Dewkiad/Kiss Me Ranking/deploy/setup-vps.sh:1): shell script ช่วย setup Ubuntu VPS เบื้องต้น
- [PROJECT_DOCS.md](/c:/Users/Dewkiad/Kiss Me Ranking/PROJECT_DOCS.md:1): อัปเดตเอกสารให้สะท้อน deployment ใหม่, path admin ใหม่, dependency ใหม่, และบันทึกงานวันนี้

### 14.5 ชุด config สำหรับแยกจาก `kissme-for-web`

ถ้าต้องรัน `Kiss Me Ranking` คู่กับ `kissme-for-web` บน VPS เดียวกัน ห้ามใช้โฟลเดอร์, port, และ admin path ซ้ำกัน เพราะสองโปรเจกต์มี `server.js`, `index.html`, `admin.html` และ flow login/admin คนละระบบ

ค่าที่แนะนำให้ใช้:
- `kissme-for-web` คงไว้ที่ `PORT=3000`
- `Kiss Me Ranking` ย้ายไป `PORT=3010`
- `Kiss Me Ranking` ใช้ PM2 name เป็น `kiss-me-ranking-prod`
- `Kiss Me Ranking` ใช้ admin path เป็น `/ranking-admin`
- แยกโฟลเดอร์เป็น `/opt/kissme-for-web` และ `/var/www/kiss-me-ranking`

ไฟล์ template ที่เพิ่มไว้สำหรับโหมดนี้:
- [deploy/.env.cohost-kissme-for-web.production](/c:/Users/Dewkiad/Kiss Me Ranking/deploy/.env.cohost-kissme-for-web.production:1)
- [deploy/ecosystem.cohost-kissme-for-web.config.js](/c:/Users/Dewkiad/Kiss Me Ranking/deploy/ecosystem.cohost-kissme-for-web.config.js:1)
- [deploy/nginx-ranking.cohost-kissme-for-web.conf](/c:/Users/Dewkiad/Kiss Me Ranking/deploy/nginx-ranking.cohost-kissme-for-web.conf:1)

คำสั่งใช้งานฝั่ง `Kiss Me Ranking`:

```bash
cp deploy/.env.cohost-kissme-for-web.production /var/www/kiss-me-ranking/.env
npm install --omit=dev
pm2 start deploy/ecosystem.cohost-kissme-for-web.config.js
pm2 save
sudo cp deploy/nginx-ranking.cohost-kissme-for-web.conf /etc/nginx/sites-available/ranking.kissme-vip.com
sudo ln -sf /etc/nginx/sites-available/ranking.kissme-vip.com /etc/nginx/sites-enabled/ranking.kissme-vip.com
sudo nginx -t && sudo systemctl reload nginx
```

จุดที่ต้องตรวจหลังแยกเสร็จ:
- `kissme-for-web` ยังฟังที่ `127.0.0.1:3000`
- `Kiss Me Ranking` ฟังที่ `127.0.0.1:3010`
- `ranking.kissme-vip.com` proxy ไป `3010`
- หน้า admin ของ `Kiss Me Ranking` เปิดผ่าน `/ranking-admin`

### 14.6 หมายเหตุ admin path และ PM2 หลังแยกโปรเจกต์

หลังย้าย `Kiss Me Ranking` ไปอยู่ `PORT=3010` และเปลี่ยน admin path เป็น `/ranking-admin` แล้ว มีข้อกำหนดที่ต้องจำเพิ่มดังนี้:

- หน้า login admin ปัจจุบันคือ `https://ranking.kissme-vip.com/ranking-admin`
- หน้า panel ปัจจุบันคือ `https://ranking.kissme-vip.com/ranking-admin/panel`
- path เก่า `/admin`, `/admin/`, `/admin/index.html`, `/admin/panel`, `/admin/panel/`, `/admin/panel/index.html` ถูก redirect ไป path ใหม่ เพื่อไม่ให้ลิงก์เก่าหรือ bookmark เก่าหลุดไปหน้า ranking หลัก
- ปุ่ม `กลับหน้าหลัก` ในหน้า `admin-login.html` และ `admin.html` ชี้กลับไป `https://ranking.kissme-vip.com/` โดยตรง

ข้อจำกัดปัจจุบันของ PM2:

- production ของ `Kiss Me Ranking` ต้องรันแบบ `instances: 1` และ `exec_mode: 'fork'`
- สาเหตุคือ admin auth token ยังเก็บใน memory ของ Node process ถ้ารันหลาย instance จะมีโอกาส login ผ่าน worker หนึ่ง แต่ request ตรวจ session ไปตกอีก worker แล้วเด้งกลับหน้า login
- ถ้าต้องการกลับไปใช้หลาย instance ในอนาคต ควรย้าย admin session/token ไปไว้ใน shared store เช่น PostgreSQL หรือ Redis ก่อน

---

## สิ่งที่ยังไม่ได้ตั้งค่า (รอข้อมูลจากบริษัท)

| รายการ | สถานะ | หมายเหตุ |
|--------|-------|---------|
| LINE Login Channel ID/Secret | ❌ รอตั้งค่า | ได้จาก LINE Developers Console |
| Telegram Bot Token (legacy) | ⏸️ ไม่จำเป็นต่อ flow หลัก | ใช้เฉพาะกรณีต้องคง integration เก่าไว้ |
| Company Webhook URL | ❌ รอตั้งค่า | URL ระบบฝั่งบริษัท |
| Production frontend/backend | ✅ มีแล้ว | Public production ปัจจุบันใช้ `ranking.kissme-vip.com` บน VPS + Cloudflare; legacy GitHub Pages + Render ยังเก็บไว้เป็น reference |

---

> **Last updated:** 16 เมษายน 2569 (2026) — อัปเดตเอกสารหลังเพิ่มชุด config สำหรับแยก `Kiss Me Ranking` ออกจาก `kissme-for-web` บน VPS เดียวกัน, ปรับ admin path เป็น `/ranking-admin`, และบันทึกข้อจำกัดการรัน PM2 แบบ single instance ใน production ปัจจุบัน
