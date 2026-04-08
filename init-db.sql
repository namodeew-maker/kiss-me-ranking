-- ============================================
-- Kiss Me Ranking — Database Initialization
-- ระบบ Gamified Loyalty & CRM (Multi-Platform: LINE / Telegram)
-- รันบน Neon (หรือ PostgreSQL ใดๆ) เพื่อสร้างตาราง
-- ============================================

-- ============================================
-- 1. ตาราง users — ข้อมูลลูกค้าจากหลายแพลตฟอร์ม
-- รองรับ LINE, Telegram หรือแพลตฟอร์มอื่นๆ
-- platform_id = User ID ของแต่ละแพลตฟอร์ม
-- platform    = ชื่อแพลตฟอร์ม ('line', 'telegram', ...)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(20) NOT NULL DEFAULT 'line'    -- แพลตฟอร์ม: 'line', 'telegram', etc.
        CHECK (platform IN ('line', 'telegram')),
    platform_id VARCHAR(64) NOT NULL,               -- User ID ของแพลตฟอร์มนั้นๆ
    display_name VARCHAR(255) NOT NULL DEFAULT '',   -- ชื่อที่แสดง
    picture_url TEXT,                                -- URL รูปโปรไฟล์
    progress_count INTEGER NOT NULL DEFAULT 0        -- หลอดสะสม 0-5 ในรอบปัจจุบัน
        CHECK (progress_count >= 0 AND progress_count <= 5),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_platform_user UNIQUE (platform, platform_id)
);

-- Index สำหรับค้นหาเร็วตาม platform + platform_id
CREATE INDEX IF NOT EXISTS idx_users_platform_pid
    ON users (platform, platform_id);

-- ============================================
-- 2. ตาราง staffs — ข้อมูลพนักงาน (น้องๆ)
-- เก็บรายชื่อพนักงานและสถานะเข้าร่วมกิจกรรม
-- ============================================
CREATE TABLE IF NOT EXISTS staffs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,                     -- ชื่อพนักงาน
    nickname VARCHAR(100),                          -- ชื่อเล่น
    avatar_url TEXT,                                -- รูปประจำตัว
    is_active BOOLEAN NOT NULL DEFAULT TRUE,        -- สถานะเข้าร่วมกิจกรรม
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 3. ตาราง transactions — บันทึกการแจ้งใช้บริการ
-- ลูกค้ากรอกชื่อพนักงาน + อัปโหลดสลิป → Admin ตรวจสอบ
-- status: pending (รอตรวจ) / approved (อนุมัติ) / rejected (ปฏิเสธ)
-- ============================================
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    staff_id INTEGER NOT NULL REFERENCES staffs(id) ON DELETE RESTRICT,
    slip_image_url TEXT NOT NULL,                   -- URL รูปสลิปที่อัปโหลด
    service_date DATE,                              -- วันที่ลูกค้ามาใช้บริการจริง
    status VARCHAR(20) NOT NULL DEFAULT 'pending'   -- pending / approved / rejected
        CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by INTEGER,                            -- admin_users.id ที่ตรวจสอบ
    reviewed_at TIMESTAMP,                          -- เวลาที่ตรวจสอบ
    reject_reason TEXT,                             -- เหตุผลกรณีปฏิเสธ
    round_label VARCHAR(20),                        -- ป้ายรอบ เช่น '2026-04-A' (วันที่ 1-14) หรือ '2026-04-B' (วันที่ 16-29)
    created_at TIMESTAMP DEFAULT NOW()
);

-- ป้องกันลูกค้าแจ้งพนักงานซ้ำในรอบเดียวกัน (เฉพาะรายการที่ยังไม่ถูก reject)
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_staff_round
    ON transactions (user_id, staff_id, round_label)
    WHERE status <> 'rejected';

-- ============================================
-- 4. ตาราง ratings — คะแนนลับ 3 ด้าน
-- Admin จะมองไม่เห็นคะแนนเหล่านี้
-- คะแนน 1-5 ต่อด้าน: หน้าตา / บริการ / ความคุ้มค่า
-- ============================================
CREATE TABLE IF NOT EXISTS ratings (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
    looks_score SMALLINT NOT NULL CHECK (looks_score BETWEEN 1 AND 10),    -- คะแนนหน้าตา
    service_score SMALLINT NOT NULL CHECK (service_score BETWEEN 1 AND 10), -- คะแนนบริการ
    value_score SMALLINT NOT NULL CHECK (value_score BETWEEN 1 AND 10),     -- คะแนนความคุ้มค่า
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 5. ตาราง lottery_guesses — ทายเลขท้าย 2 ตัว
-- ปลดล็อกเมื่อหลอดสะสมเต็ม 5/5 (พนักงานไม่ซ้ำ) ในรอบเวลา
-- ผลลัพธ์: pending (รอผล) / won (ถูก → Cashback สูงสุด 50,000 หักภาษี 7%)
--           / lost (ผิด → รับ GV 500 บาท)
-- ============================================
CREATE TABLE IF NOT EXISTS lottery_guesses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guess_number VARCHAR(2) NOT NULL               -- เลข 2 หลักที่ทาย (00-99)
        CHECK (guess_number ~ '^\d{2}$'),
    round_label VARCHAR(20) NOT NULL,              -- รอบเดียวกับ transactions.round_label
    result VARCHAR(10) NOT NULL DEFAULT 'pending'  -- pending / won / lost
        CHECK (result IN ('pending', 'won', 'lost')),
    reward_amount NUMERIC(10,2) DEFAULT 0,         -- จำนวนเงินรางวัลจริงที่ได้รับ (หลังหักภาษี)
    created_at TIMESTAMP DEFAULT NOW()
);

-- ป้องกันทายเลขเดิมซ้ำในรอบเดียวกัน แต่ยังเปิดให้ 1 คนทายได้หลายเลขต่อรอบ
DROP INDEX IF EXISTS uq_user_lottery_round;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_lottery_round_number
    ON lottery_guesses (user_id, round_label, guess_number);

-- ============================================
-- 5.1 ตาราง lottery_reward_claims — บันทึกการใช้สิทธิ์รางวัล
-- รองรับการทยอยใช้ Cashback / GV หลายครั้ง และให้แอดมินตรวจสอบยอดคงเหลือได้
-- ============================================
CREATE TABLE IF NOT EXISTS lottery_reward_claims (
    id SERIAL PRIMARY KEY,
    lottery_guess_id INTEGER NOT NULL REFERENCES lottery_guesses(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_type VARCHAR(20) NOT NULL
        CHECK (reward_type IN ('cashback', 'gv')),
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    note TEXT,
    redeemed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    redeemed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reward_claims_guess
    ON lottery_reward_claims (lottery_guess_id);

CREATE INDEX IF NOT EXISTS idx_reward_claims_user
    ON lottery_reward_claims (user_id, redeemed_at DESC);

-- ============================================
-- 6. ตาราง sold_out — เลขที่ถูกจองแล้วในแต่ละรอบ
-- (ถ้าต้องการจำกัดจำนวนคนทายเลขเดียวกัน)
-- ============================================
CREATE TABLE IF NOT EXISTS sold_out (
    id SERIAL PRIMARY KEY,
    number INTEGER NOT NULL CHECK (number >= 0 AND number <= 99),
    round_label VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (number, round_label)
);

-- ============================================
-- 7.1 ตาราง app_settings — ค่าตั้งค่าระดับระบบ
-- ใช้เก็บวันที่รีอันดับ และ settings อื่นในอนาคต
-- ============================================
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 8. ตาราง admin_users — ผู้ดูแลระบบ (Auditor)
-- ใช้ตรวจสอบสลิปและจัดการข้อมูล
-- ============================================
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 9. Seed ข้อมูลเริ่มต้น — Admin User
-- username: Kissmy456 / password: Kiss@456789
-- ============================================
INSERT INTO admin_users (username, password_hash)
VALUES ('Kissmy456', '$2b$10$NLGaIVss43MdXEgjmKfN0O0WuaJf4uQWtFtEnvCBz8Y4zbhc4WrvS')
ON CONFLICT (username) DO NOTHING;
