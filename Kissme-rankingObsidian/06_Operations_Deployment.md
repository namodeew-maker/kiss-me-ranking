# Operations And Deployment

## Runtime Stack

- Node.js (CommonJS)
- Express
- PostgreSQL
- PM2
- Nginx
- Cloudflare R2 สำหรับ asset storage

## Important Files

- `package.json`
- `deploy/setup-vps.sh`
- `deploy/ecosystem.config.js`
- `deploy/ecosystem.cohost-kissme-for-web.config.js`
- `deploy/nginx-ranking.conf`
- `deploy/nginx-ranking.cohost-kissme-for-web.conf`
- `deploy/.env.production`

## Deployment Notes

จากไฟล์ `deploy/setup-vps.sh` ระบบคาดหวัง deployment แบบ Ubuntu VPS โดยมี:

- app directory ภายใต้ `/var/www/kiss-me-ranking`
- process manager เป็น PM2
- reverse proxy เป็น Nginx
- firewall ผ่าน UFW
- Node.js 20 LTS

## Storage Notes

- ถ้าตั้งค่า R2 ครบ ระบบพยายามใช้ Cloudflare R2
- ถ้าไม่พร้อม อาจ fallback ไป `uploads/`
- มี route สำหรับดูสถานะ storage และย้าย asset ขึ้น R2

## Environment Variables To Track

- `DATABASE_URL`
- `PORT`
- `NODE_ENV`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY`
- `R2_SECRET_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_URL`
- `REQUIRE_R2_STORAGE`
- `ADMIN_LOGIN_PATH`

## Operational Risks

- ถ้า environment ไม่ครบ อาจกระทบ upload/storage flow
- asset migration และ runtime upload ต้องสอดคล้องกัน
- monolith server ทำให้การ deploy และ rollback กระทบหลาย domain พร้อมกัน

## Suggested Ops Documentation To Add Later

- runbook การ deploy production
- backup/restore procedure ของ PostgreSQL
- asset migration checklist
- admin credential rotation policy
- release checklist ก่อน push main