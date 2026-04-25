# Kiss Me Ranking Capacity Plan (500+ Concurrent Users)

อัปเดตล่าสุด: 2026-04-25

## Current Production Baseline

Production ปัจจุบันของ `ranking.kissme-vip.com` ใช้สถาปัตยกรรม:

- `VPS + Nginx + PM2 + external PostgreSQL (Neon)`
- Node/Express app รันที่ `PORT=3010`
- PM2 รัน `kiss-me-ranking` แบบ `cluster` จำนวน `3 instances`
- ฐานข้อมูล production ของโปรเจกต์นี้ชี้ไปที่ `Neon pooler`

### Important Shared-VPS Note

VPS เครื่องนี้ยังมีอีกโปรเจกต์หนึ่งคือ `kissme-vip.com / kissme-for-web`

- `Kiss Me Ranking` ใช้ app/runtime บน VPS แต่ใช้ DB ภายนอก
- `kissme-for-web` ใช้ app/runtime บน VPS และใช้ PostgreSQL local ของเครื่อง
- ดังนั้นการกิน CPU/RAM ของ `Kiss Me Ranking` ยังแชร์กับอีกโปรเจกต์
- แต่การใช้ DB connection ของ `Kiss Me Ranking` ไม่ได้แย่ง PostgreSQL local โดยตรง

### VPS Spec

- CPU: `6 vCPU`
- RAM: `11 GiB`
- Disk: `193 GiB`
- Swap: `4 GiB`
- OS: `Ubuntu 24.04.4 LTS`

### PM2 / App Runtime

- app process: `3` instances
- memory ต่อ instance โดยประมาณ: `108-110 MB`
- Node version: `22.22.2`

### PostgreSQL Tuning Applied on VPS

ค่าที่ใช้งานจริงหลังจูนแล้ว:

- `max_connections = 120`
- `shared_buffers = 1GB`
- `effective_cache_size = 6GB`
- `work_mem = 8MB`
- `maintenance_work_mem = 256MB`
- `checkpoint_completion_target = 0.9`
- `wal_compression = on`
- `shared_preload_libraries = pg_stat_statements`

หมายเหตุ:

- ค่ากลุ่มนี้มีผลกับ PostgreSQL local บน VPS ซึ่งใช้โดย `kissme-for-web`
- production ของ `Kiss Me Ranking` ใช้ `Neon` จึงไม่ได้รับผลจาก tuning ชุดนี้โดยตรง
- app default `PG_POOL_MAX` ในโค้ดยังเป็น `20` ต่อ process
- ถ้าใช้ `3 instances` จะมีเพดาน theoretical ของ app-side pool ราว `60 connections` ไปที่ `Neon`

## Practical Capacity Estimate

ตัวเลขนี้เป็นการประเมินจากสเปกจริง + config ปัจจุบัน + รูปแบบ endpoint ในระบบ ไม่ใช่ stress test เต็มรูปแบบ

การประเมินนี้คิดเผื่อว่า VPS ยังต้องเหลือ headroom ให้ `kissme-for-web` อยู่ด้วย

### Safe Range

- `120-220 concurrent users`
  สำหรับ mixed usage แบบใช้งานจริง มีทั้งอ่านและเขียนข้อมูล

### Likely Range

- `250-400 concurrent users`
  สำหรับ read-heavy traffic เช่นเปิดหน้า ranking, ดูข้อมูล, refresh หน้า, เช็กสถานะ

### Risk Zone

- `400+ concurrent users`
  จะเริ่มเสี่ยงถ้าเป็น personalized endpoints หรือ write-heavy burst พร้อมกัน

### Main Bottlenecks Right Now

- personalized queries หลายตัวคำนวณสดจากหลายตาราง
- write path ยังชนกับ DB โดยตรง
- report/export/import ยังใช้ process เดียวกับ web app
- app ยังไม่มี dedicated background worker
- ยังไม่มี materialized summary สำหรับ leaderboard / dashboard
- production DB ของโปรเจกต์นี้อยู่ที่ `Neon` ดังนั้น latency ภายนอกและ pooler behavior มีผลกับเพดานจริงด้วย

## Highest-Impact Endpoints to Optimize First

### Tier 1: Public Read Heavy

กลุ่มนี้ควร cache หรือทำ summary table ก่อน เพราะโดนเรียกบ่อยและเหมาะกับ read optimization มากที่สุด

1. `/api/ranking/staff`
2. `/api/ranking/customers`
3. `/api/stats`
4. `/api/sold-out`
5. `/api/round`
6. `/api/stats/guesses-by-number`

แนวทาง:

- เพิ่ม cache TTL ที่ edge / nginx / app ให้ชัดขึ้น
- เปลี่ยน query รวมคะแนนหรือ aggregation หนักให้ไปอ่านจาก summary table
- ถ้า leaderboard ไม่จำเป็นต้อง real-time ระดับวินาที ให้ refresh ทุก `15-60 วินาที`

### Tier 2: Personalized Read

กลุ่มนี้โดนต่อ user และกิน DB มากกว่ากลุ่ม public:

1. `/api/users/:platform_id/progress`
2. `/api/users/:platform_id/history`
3. `/api/points/:global_user_id`
4. `/api/unified/profile`

แนวทาง:

- ทำ response cache สั้น ๆ ระดับ `5-15 วินาที` สำหรับ key ตาม user
- ลด query ซ้ำ เช่น current round progress / points / guess cycle
- รวมบางค่าไว้ใน summary table หรือ denormalized state

### Tier 3: Admin / Internal Heavy

กลุ่มนี้ไม่จำเป็นต้อง optimize ก่อน public traffic แต่ถ้า admin ใช้งานพร้อมกันมากจะกระทบระบบได้

1. `/api/admin/users`
2. `/api/history`
3. `/api/admin/rewards/ledger`
4. `/api/admin/export/*`
5. `/api/admin/import/*`

แนวทาง:

- export/import ให้รันแบบ background job
- admin listing หนัก ๆ ควรทำ pagination + summary precompute
- ถ้า query ข้ามหลายตาราง ให้จับ slow query จริงก่อน

## Step-by-Step Plan to Reach 500+ Concurrent Users

## Step 1: Stabilize the Current Single-Node Setup

เป้าหมาย: ให้ production เด้งน้อยและเก็บ metric ได้พอ

- เพิ่ม `swap 4 GB`
- จูน PostgreSQL local ตาม RAM จริงเพื่อไม่ให้กระทบ `kissme-for-web`
- ยืนยันว่า PM2 / Nginx / Postgres restart ได้ปลอดภัย
- เก็บ baseline metric ช่วงใช้งานจริง

สถานะ:

- ทำแล้วในวันที่ `2026-04-25`
- เปิด `pg_stat_statements` บน PostgreSQL local แล้ว

## Step 2: Measure Before Guessing

เป้าหมาย: ให้รู้ว่าตันตรงไหนจริง

เก็บ metric ต่อไปนี้อย่างน้อย `3-7 วัน`

- CPU utilization
- RAM usage
- swap usage
- nginx upstream response time
- PostgreSQL active connections
- PostgreSQL slow queries
- PM2 restarts
- app p95 / p99 latency
- request rate ต่อ endpoint

ถ้าไม่มี APM เต็มระบบ อย่างน้อยควรมี:

- `pm2 monit`
- nginx access log
- PostgreSQL `pg_stat_statements`

## Step 3: Optimize Read Path First

เป้าหมาย: ดัน public traffic ให้ไปใกล้ `500 concurrent`

- ทำ summary table สำหรับ leaderboard / customer ranking / stats
- ใช้ cron refresh summary ทุก `15-60 วินาที`
- เพิ่ม cache TTL สำหรับ public GET endpoints
- กัน admin/auth/write endpoints ออกจาก cache

ผลที่คาด:

- `250-400 concurrent` จะนิ่งขึ้น
- read-heavy traffic มีโอกาสแตะ `400-500` ได้

## Step 4: Separate Heavy Admin Jobs

เป้าหมาย: อย่าให้ export/import/report generation ดึงทรัพยากรจาก web app โดยตรง

- ย้าย Excel export/import ไป worker process หรือ queue
- แยก backup/report job ออกจาก web process
- ตั้ง schedule งานหนักให้อยู่นอกช่วงพีค

ผลที่คาด:

- ลด latency spike บน user-facing endpoints
- ลดโอกาส request timeout ตอนแอดมินใช้งานหนัก

## Step 5: Tune App Concurrency Against DB Connections

เป้าหมาย: balance ระหว่าง PM2 instances กับ PostgreSQL pool

แนวทางทดลอง:

1. benchmark แบบ `3 instances + pool 20`
2. benchmark แบบ `4 instances + pool 15`
3. benchmark แบบ `6 instances + pool 10-12`

ข้อสำคัญ:

- อย่าเพิ่ม PM2 instances อย่างเดียวโดยไม่ลด `PG_POOL_MAX`
- จำนวน process มากเกินไปจะไม่ได้แปลว่ารับคนได้มากขึ้น ถ้า DB กลายเป็นคอขวดแทน

## Step 6: Scale Up When the Metrics Demand It

ถ้า Step 1-5 ทำแล้ว traffic ยังชนเพดาน:

- ขยับ VPS เป็น `8 vCPU / 16 GB RAM`
- หรือแยก PostgreSQL ออกอีกเครื่อง

เป้าหมายหลัง scale:

- `500+ mixed concurrent users`
- `700-1000 read-heavy concurrent users` มีความเป็นไปได้มากขึ้น ถ้า summary/cache มาดีจริง

## Benchmark Checklist

ใช้ checklist นี้ทุกครั้งก่อนสรุปว่า "รองรับ 500 concurrent แล้ว"

### Test Scenarios

1. Public read-heavy
   - hit `/`, `/ranking.html`, `/api/ranking/staff`, `/api/ranking/customers`, `/api/stats`

2. Logged-in customer mix
   - hit `/api/users/:platform_id/progress`
   - hit `/api/users/:platform_id/history`
   - hit `/api/points/:global_user_id`

3. Write burst
   - hit `/api/transactions`
   - hit `/api/lottery/guess`
   - hit `/api/points/activity`

4. Admin mixed
   - hit `/ranking-admin`
   - hit `/api/history`
   - hit `/api/admin/users`

### Metrics to Capture

- average latency
- p95 latency
- p99 latency
- request success rate
- 5xx count
- nginx upstream time
- PostgreSQL active connections
- PostgreSQL slow statements
- PM2 memory per process
- CPU saturation

### Minimum Success Criteria for “500+ Ready”

- error rate `< 1%`
- p95 public read `< 600 ms`
- p95 mixed API `< 1200 ms`
- no sustained DB connection starvation
- no PM2 restart loop
- no swap thrashing

## Recommended Next Changes in Code / Infra

ลำดับที่แนะนำถ้าจะลงมือรอบต่อไป:

1. ทำ summary table สำหรับ:
   - ranking staff
   - ranking customers
   - dashboard stats

2. เพิ่ม lightweight benchmark script หรือ k6 scenario

3. เปิด `pg_stat_statements` และเก็บ top slow queries

4. แยก Excel export/import เป็น background worker

5. ปรับ env production ให้ควบคุม `PG_POOL_MAX` ชัดเจนแทนการใช้ default
6. วัดจริงทั้ง `VPS resource` และ `Neon query latency` พร้อมกัน
