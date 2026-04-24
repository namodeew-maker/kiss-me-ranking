# System Architecture

## High-Level View

```text
LINE LIFF Client
   -> static HTML/CSS/JS pages
   -> fetch /api/*
Express app (server.js)
   -> auth
   -> transaction review
   -> ranking
   -> points ledger
   -> lottery logic
   -> exports/imports
PostgreSQL
   -> users, staffs, transactions, ratings
   -> lottery_guesses, lottery_reward_claims, sold_out
   -> points, app_settings, admin_users
Object Storage
   -> Cloudflare R2 preferred
   -> local uploads fallback
```

## Entry Points

- Customer: `index.html`
- Customer profile/history: `profile.html`
- Public ranking: `ranking.html`
- Admin login: `admin-login.html`
- Admin panel structure: `admin/index.html`, `admin/panel/index.html`

## Backend Ownership

Implementation ถูกรวมอยู่ใน `server.js` โดยมีหน้าที่หลักดังนี้:

- ตั้งค่า Express middleware
- จัดการ auth ของ admin และ customer
- ดูแล staff CRUD
- รับสลิปและคะแนนลับ
- อนุมัติ/ปฏิเสธ transaction
- คำนวณ points และ guess credits
- จัดการ lottery, draw, reward claims
- export/import ข้อมูล Excel
- ให้ payload สำหรับ Google Sheets export
- ดูแล asset migration ไป R2

## Architectural Characteristics

- เป็น monolith ฝั่ง backend
- business rules อยู่ติดกับ route handlers หลายส่วน
- schema evolve ผ่าน SQL migration files แยกจาก runtime
- frontend เป็น static pages ที่เรียก API โดยตรง
- มี legacy surface ที่ยังคงอยู่เพื่อ compatibility แต่บาง route ถูกปิดถาวรแล้ว

## Active Vs Legacy

### Active

- LINE LIFF login
- PostgreSQL-backed transaction flow
- Reward claim management
- Excel export/import
- Google Sheets export payload generation
- R2/local upload handling

### Legacy/Disabled

- Telegram login
- Telegram messaging route
- Company webhook flow
- server-side LINE callback flow
- unified profile API บางส่วนที่ return 410

## Key Risk Areas

- `server.js` มีขนาดใหญ่และรวมหลาย domain
- SQL กับ business rules ผูกแน่นใน route layer
- frontend ไม่มี typed contract กับ backend
- migration และ runtime assumptions ต้องสอดคล้องกันเอง

## Refactor Opportunities

- แยก `server.js` เป็น modules ตาม domain
- ดึง query สำคัญออกเป็น data access layer
- สร้าง API contract doc ที่ผูกกับ route จริง
- แยก analytics/export/report logic ออกจาก request layer