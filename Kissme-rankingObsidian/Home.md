# Kiss Me Ranking — Analysis Vault

> **Stack:** Node.js + Express · PostgreSQL · LINE LIFF · Cloudflare R2
> **Last updated:** 2026-04-22

---

> [!tip] เริ่มต้นที่ไหน?
> - ไม่รู้จักระบบ → [[01_Project_Overview]] แล้วต่อด้วย [[02_System_Architecture]]
> - ไล่ bug / ดู API → [[03_Backend_API]] + [[05_Database_Schema]]
> - ดู business flow → [[10_Flow_Point_Ledger]] → [[11_Flow_Reward_Claim]] → [[12_Flow_Round_Logic]]
> - มีปัญหา production → [[16_Incident_Runbook]]

---

## 📖 ทำความเข้าใจระบบ

| ไฟล์ | เนื้อหา |
|------|---------|
| [[01_Project_Overview]] | ภาพรวม, user journey, core business rules |
| [[02_System_Architecture]] | สถาปัตยกรรม, stack, การไหลของข้อมูล |
| [[09_Data_Dictionary]] | คำนิยาม field/term ทั้งหมดในระบบ |
| [[13_Diagrams_ERD_and_Flows]] | ERD และ flow diagrams (ภาพรวม) |
| [[14_C4_Architecture_Diagrams]] | C4 diagrams: Context, Container, Component |

## 💻 สำหรับนักพัฒนา

| ไฟล์ | เนื้อหา |
|------|---------|
| [[03_Backend_API]] | API endpoints ทั้งหมด, request/response schema |
| [[04_Frontend_Pages]] | หน้าต่างๆ ใน frontend และ LIFF wiring |
| [[05_Database_Schema]] | ตาราง, column, constraint, index |
| [[15_SQL_Audit_Cheat_Sheet]] | SQL queries สำเร็จรูปสำหรับ audit/debug |

## 💰 Business Logic (flows)

| ไฟล์ | เนื้อหา |
|------|---------|
| [[10_Flow_Point_Ledger]] | วิธีสะสมและหัก point |
| [[11_Flow_Reward_Claim]] | flow การ claim รางวัล |
| [[12_Flow_Round_Logic]] | logic รอบทาย / ประกาศผล |

## ⚙️ Operations & Admin

| ไฟล์ | เนื้อหา |
|------|---------|
| [[06_Operations_Deployment]] | การ deploy, env, config |
| [[07_Integrations_Exports]] | Google Sheets, Excel export, integrations |
| [[16_Incident_Runbook]] | วิธีรับมือเมื่อมีปัญหา production |
| [[17_Dashboard_Query_Pack]] | SQL queries สำหรับ dashboard/reporting |

## 🗂️ แหล่งอ้างอิงนอก Vault

| แหล่ง | ใช้ตอน |
|-------|--------|
| `C:\Users\Dewkiad\Kiss Me Ranking\server.js` | implementation จริง |
| `init-db-unified.sql` | schema ล่าสุด |
| `deploy/` | deploy scripts |
| [[08_Known_Gaps_Backlog]] | ประเด็นที่ยังค้างอยู่ |

## 📝 พื้นที่ทำงาน

- [[Research/Future_Analysis_Inbox]] — บันทึกประเด็นใหม่ที่ยังไม่ได้วิเคราะห์
- [[Templates/Decision_Log_Template]] — ใช้เมื่อตัดสินใจเปลี่ยน architecture/business rule
- [[Templates/Analysis_Note_Template]] — template วิเคราะห์ feature

---

**→ [[../Dashboard|กลับ Dashboard]]** | **→ [[../@KissMeProject/Index|KissMe Project Docs]]**
