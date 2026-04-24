# Project Overview

## What This Project Is

`Kiss Me Ranking` คือระบบ loyalty + CRM + reward game สำหรับลูกค้าที่ใช้งานผ่าน LINE LIFF โดย flow หลักใน production ตอนนี้เป็น LINE-only และปิด Telegram / server-side LINE callback แบบ legacy แล้ว

## Main User Journey

1. ลูกค้าเข้า `index.html`
2. ล็อกอินผ่าน LINE LIFF
3. ส่งรายการใช้บริการโดยเลือกพนักงาน, ระบุวันที่ใช้บริการ, แนบสลิป, และให้คะแนนลับ 3 ด้าน
4. แอดมินตรวจสอบสลิปใน backend
5. ถ้าอนุมัติ ระบบเพิ่ม point ใน ledger
6. ลูกค้าใช้ 5 พ้อยต่อ 1 สิทธิ์ในการทายเลข 2 หลัก
7. แอดมินประกาศผลรอบ และระบบแยกสิทธิ์รางวัลเป็น Cashback หรือ Gift Voucher
8. แอดมินติดตามการ claim สิทธิ์และยอดคงเหลือได้

## Core Business Rules

- ลูกค้าใช้งานผ่าน LINE เท่านั้น
- คะแนนโหวตเป็นความลับ แอดมินไม่ควรเห็นคะแนนรายด้าน
- สลิปที่อนุมัติ 1 รายการ = 1 พ้อย
- 5 พ้อย = ทายเลขได้ 1 ครั้ง
- เลขเดิมในรอบเดียวกัน ทายซ้ำโดยผู้ใช้คนเดิมไม่ได้
- เลข sold-out ในรอบเดียวกันถูกกันซ้ำทั้งระบบ
- รางวัลแบ่งเป็น:
  - ถูก: Cashback 5,000 บาท
  - ไม่ถูก: Gift Voucher 300 บาท

## Main Technical Surfaces

- `server.js`: backend, routes, business rules, auth, exports, reward management
- `script.js`: หน้าใช้งานหลักของลูกค้า
- `profile.js`: หน้าโปรไฟล์และประวัติ
- `ranking.js`: leaderboard ฝั่งลูกค้า
- `admin.js`: logic หน้า admin แบบ legacy/login support
- `admin/panel/index.html`: entry ฝั่งแอดมินแบบใหม่

## Important Docs Already In Repo

- `PROJECT_DOCS.md`: ภาพรวมโปรเจ็กต์ระดับกว้าง
- `EXCEL_ADMIN_GUIDE.md`: วิธีใช้งาน export/import จาก Excel
- `POSTGRES_TO_GOOGLE_SHEETS_ARCHITECTURE.md`: แนวทาง sync ข้อมูลออกไป Google Sheets
- `ข้อกฎหมาย.md`: เงื่อนไข/กติกาทางกฎหมายของกิจกรรม

## Practical Reading Order

1. `PROJECT_DOCS.md`
2. `server.js`
3. `init-db.sql`
4. `EXCEL_ADMIN_GUIDE.md`
5. `POSTGRES_TO_GOOGLE_SHEETS_ARCHITECTURE.md`

## Current System Shape

- Monolithic Node.js app
- HTML/CSS/JS แบบไม่ใช้ framework
- Route logic จำนวนมากอยู่รวมในไฟล์เดียว
- SQL query เขียน inline ใน backend
- มีทั้ง runtime documentation และ operational notes อยู่ใน repo แล้ว