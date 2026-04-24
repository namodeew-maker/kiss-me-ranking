# Frontend Pages

## Frontend Style

Frontend เป็น static multi-page app ใช้ HTML/CSS/vanilla JS โดยมี visual style แบบ futuristic และโหลดฟอนต์จาก Google Fonts

## Main Pages

### `index.html` + `script.js` + `styles.css`

หน้าหลักของลูกค้า ใช้สำหรับ:

- เปิดกติกา/terms
- ล็อกอินผ่าน LINE LIFF
- ดูสถานะรอบ
- ส่งสลิป
- เลือกพนักงาน
- ให้คะแนนลับ 3 ด้าน
- ทายเลข

ข้อสังเกต:

- มี terms gate เป็นส่วนหนึ่งของ UX
- ฝัง LINE LIFF SDK ที่หน้าโดยตรง

### `profile.html` + `profile.js` + `profile.css`

ใช้สำหรับ:

- ดูข้อมูลผู้ใช้
- แสดง user ID สำหรับส่งให้แอดมิน
- อัปโหลด avatar ใหม่
- ดูประวัติ transaction และผลการทายเลข
- ดูสถิติส่วนตัวและยอดแต้ม

### `ranking.html` + `ranking.js` + `ranking.css`

หน้าสาธารณะสำหรับ leaderboard โดยมี tab หลัก:

- อันดับลูกค้า
- อันดับยอดแจ้งใช้บริการน้องๆ

### `admin-login.html` / `admin.html` / `admin.js` / `admin.css`

พื้นผิวฝั่งแอดมินแบบ legacy และ login flow ดั้งเดิม โดย runtime ปัจจุบันยังรองรับ redirect ไป path ใหม่

### `admin/index.html` และ `admin/panel/index.html`

เป็นโครงสร้าง path ใหม่ฝั่ง admin panel ที่ route ปัจจุบันใช้งาน

## Frontend Data Dependencies

- ทุกหน้าพึ่ง API จาก `server.js`
- หน้า profile ใช้ข้อมูลจาก user history/progress endpoints
- หน้า ranking ใช้ ranking endpoints
- หน้า index ใช้ staff list, transaction submit, lottery, round info, sold-out info

## Frontend Risks

- ไม่มี component isolation หรือ shared state framework
- logic ฝั่ง client อาจกระจายข้ามหลายไฟล์ JS
- version query string ใน asset ถูกอัปเดตแบบ manual
- contract ระหว่าง DOM และ JS ค่อนข้างแน่น

## Frontend Analysis Questions

- หน้าไหนโหลดข้อมูลซ้ำมากเกินไป
- มีการ validate ฝั่ง client กับ server ซ้ำหรือต่างกันหรือไม่
- UX สำหรับ error state และ retry พอหรือยัง
- การจัดการ auth/session ฝั่งลูกค้ามี edge case อะไรบ้าง