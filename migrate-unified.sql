-- ============================================
-- Migration: Add Global Identity + Points (LINE Login + Telegram)
-- รันหลังจาก init-db.sql เดิม — ไม่ทำลายข้อมูลที่มีอยู่
-- ============================================

-- 1. เพิ่ม global_user_id ลง users เดิม
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS global_user_id UUID DEFAULT gen_random_uuid();

-- backfill global_user_id สำหรับ row ที่มีอยู่แล้ว
UPDATE users SET global_user_id = gen_random_uuid() WHERE global_user_id IS NULL;

-- ตั้งเป็น NOT NULL + UNIQUE หลัง backfill
ALTER TABLE users ALTER COLUMN global_user_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_global_user_id ON users(global_user_id);

-- 2. ตาราง points — คะแนนสะสม (แยกจาก progress_count เดิม)
CREATE TABLE IF NOT EXISTS points (
    id BIGSERIAL PRIMARY KEY,
    global_user_id UUID NOT NULL,
    activity_type VARCHAR(50) NOT NULL,
    points INTEGER NOT NULL,
    source_platform VARCHAR(20) NOT NULL DEFAULT 'line'
        CHECK (source_platform IN ('line', 'telegram')),
    source_oa_id VARCHAR(50), -- legacy column, currently unused in active flow
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_points_user'
          AND table_name = 'points'
    ) THEN
        ALTER TABLE points
            ADD CONSTRAINT fk_points_user
            FOREIGN KEY (global_user_id) REFERENCES users(global_user_id) ON DELETE CASCADE;
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_points_user_created ON points(global_user_id, created_at DESC);
