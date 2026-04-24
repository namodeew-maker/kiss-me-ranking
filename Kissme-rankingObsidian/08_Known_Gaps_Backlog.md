# Known Gaps And Backlog

## Technical Gaps Seen From Current Structure

- `server.js` เป็นไฟล์ใหญ่และรวมหลาย domain มาก
- query SQL จำนวนมากถูกฝังใน route handlers
- frontend ไม่มี schema validation ระหว่าง client/server
- มี legacy path และ disabled flow หลายจุดที่ยังต้องรักษา compatibility
- documentation กระจายหลายไฟล์และยังไม่ได้แยก canonical ownership ชัดทุกประเด็น

## Product/Process Gaps

- ยังไม่มี test suite ที่ชัดเจนใน `package.json`
- ยังไม่มี documented analytics model สำหรับ business reporting ระยะยาว
- ยังไม่มี central data dictionary ใน repo เดิม
- ยังไม่มี decision log แยกจาก docs เชิงบรรยาย

## Suggested Backlog Themes

### Architecture

- แยก backend เป็น modules: auth, transactions, rewards, exports, users
- สร้าง service layer และ repository/query layer

### Data

- ทำ ERD จริงจาก schema ล่าสุด
- ทำ dictionary ของทุก field สำคัญใน export และ API
- audit เรื่อง `global_user_id` consistency

### Quality

- เพิ่ม syntax/lint/test workflow
- เพิ่ม regression checks สำหรับ reward calculation และ point reconciliation

### Operations

- สร้าง deployment checklist แบบ step-by-step
- แยก env variables ตาม environment ให้ชัดขึ้น

## Questions Worth Investigating Next

- จุดไหนใน `server.js` เสี่ยง side effect สูงสุด
- reward accounting ปลอดภัยพอสำหรับ partial claim ทุก case หรือยัง
- migration ชุดไหนบังคับต้องรันใน production ตามลำดับเท่าไร
- export/import logic มี duplicate logic กับ admin UI หรือไม่