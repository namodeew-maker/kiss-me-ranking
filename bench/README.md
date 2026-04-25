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

## ตัวอย่างใช้งาน

```bash
k6 run bench/k6-public-read.js
```

หรือ override ด้วย env:

```bash
k6 run -e BASE_URL=https://ranking.kissme-vip.com -e VUS=80 -e DURATION=2m bench/k6-public-read.js
```

## สิ่งที่ควรดูระหว่างรัน

- response time avg / p95 / p99
- error rate
- HTTP 5xx
- CPU / RAM บน VPS
- PM2 restarts
- nginx upstream latency

## ข้อควรระวัง

- อย่ารัน benchmark หนักบน production ช่วงพีค
- เริ่มจาก load ต่ำก่อน เช่น `20-50 VUs`
- ถ้าจะไต่ไป `300-500 concurrent` ให้ทำทีละขั้น
