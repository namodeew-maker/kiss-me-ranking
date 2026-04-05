-- ============================================
-- Migration: Add Unified Identity (Multi-OA + Telegram)
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

-- 2. ตาราง oa_accounts — เก็บข้อมูล LINE OA แต่ละตัว
CREATE TABLE IF NOT EXISTS oa_accounts (
    oa_id VARCHAR(50) PRIMARY KEY,
    oa_name VARCHAR(255) NOT NULL,
    channel_id VARCHAR(50) NOT NULL,
    channel_secret VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. ตาราง user_oa_mapping — เชื่อม user กับ OA (oa_user_id ≠ line_login_user_id)
CREATE TABLE IF NOT EXISTS user_oa_mapping (
    id BIGSERIAL PRIMARY KEY,
    global_user_id UUID NOT NULL,
    oa_id VARCHAR(50) NOT NULL REFERENCES oa_accounts(oa_id) ON DELETE RESTRICT,
    oa_user_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_oa_user UNIQUE (oa_id, oa_user_id),
    CONSTRAINT uq_user_per_oa UNIQUE (global_user_id, oa_id)
);

-- FK to users.global_user_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_mapping_user'
          AND table_name = 'user_oa_mapping'
    ) THEN
        ALTER TABLE user_oa_mapping
            ADD CONSTRAINT fk_mapping_user
            FOREIGN KEY (global_user_id) REFERENCES users(global_user_id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. ตาราง points — คะแนนสะสม (แยกจาก progress_count เดิม)
CREATE TABLE IF NOT EXISTS points (
    id BIGSERIAL PRIMARY KEY,
    global_user_id UUID NOT NULL,
    activity_type VARCHAR(50) NOT NULL,
    points INTEGER NOT NULL,
    source_platform VARCHAR(20) NOT NULL DEFAULT 'line'
        CHECK (source_platform IN ('line', 'telegram')),
    source_oa_id VARCHAR(50),
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
CREATE INDEX IF NOT EXISTS idx_mapping_global_user ON user_oa_mapping(global_user_id);
CREATE INDEX IF NOT EXISTS idx_mapping_oa ON user_oa_mapping(oa_id);
CREATE INDEX IF NOT EXISTS idx_points_user_created ON points(global_user_id, created_at DESC);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_oa_accounts_updated_at ON oa_accounts;
CREATE TRIGGER trg_oa_accounts_updated_at
BEFORE UPDATE ON oa_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_oa_mapping_updated_at ON user_oa_mapping;
CREATE TRIGGER trg_user_oa_mapping_updated_at
BEFORE UPDATE ON user_oa_mapping FOR EACH ROW EXECUTE FUNCTION set_updated_at();
