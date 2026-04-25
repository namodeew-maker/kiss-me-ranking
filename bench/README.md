# Benchmark Starter Kit

ไฟล์ในโฟลเดอร์นี้เป็น starter kit สำหรับวัด capacity ของ `Kiss Me Ranking`

โฟลเดอร์นี้ตั้งใจให้เบาและเริ่มใช้ได้เร็ว โดยไม่ผูกกับ CI หรือ production deploy โดยตรง

## เป้าหมาย

- วัด public read-heavy traffic
- วัด mixed usage เบื้องต้น
- ใช้เป็น baseline ก่อนสรุปว่าระบบพร้อมสำหรับ `500+ concurrent users`

## แนะนำเครื่องมือ

- `k6`
- หรือ `autocannon` ถ้าต้องการทดสอบ Node/HTTP แบบเร็ว

## ไฟล์ที่มีตอนนี้

- `k6-public-read.js`
- `http-stage-bench.mjs`
- `http-write-safe-bench.mjs`
- `neon-latency.mjs`
- `summarize-nginx-timing.py`

## ตัวอย่างใช้งาน

```bash
k6 run bench/k6-public-read.js
```

หรือ override ด้วย env:

```bash
k6 run -e BASE_URL=https://ranking.kissme-vip.com -e VUS=80 -e DURATION=2m bench/k6-public-read.js
```

Benchmark แบบ stage โดยไม่ต้องติดตั้งเครื่องมือเพิ่ม:

```bash
node bench/http-stage-bench.mjs
```

หรือกำหนด stage เอง:

```bash
BASE_URL=https://ranking.kissme-vip.com STAGES=50:20,100:20,200:20,300:20 node bench/http-stage-bench.mjs
```

Write-safe benchmark:

```bash
BASE_URL=https://ranking.kissme-vip.com STAGES=20:20,40:20,80:20,120:20 node bench/http-write-safe-bench.mjs
```

Neon latency probe:

```bash
DATABASE_URL=... node bench/neon-latency.mjs
```

สรุป `request_time` / `upstream_response_time` จาก nginx access log:

```bash
python3 bench/summarize-nginx-timing.py /var/log/nginx/ranking.kissme-vip.com.access.log
```

## สิ่งที่ควรดูระหว่างรัน

- response time avg / p95 / p99
- error rate
- HTTP 5xx
- CPU / RAM บน VPS
- PM2 restarts
- nginx upstream latency
- Neon baseline latency

## ข้อควรระวัง

- อย่ารัน benchmark หนักบน production ช่วงพีค
- เริ่มจาก load ต่ำก่อน เช่น `20-50 VUs`
- ถ้าจะไต่ไป `300-500 concurrent` ให้ทำทีละขั้น
