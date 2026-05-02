-- ============================================
-- Migration: Custom Display Name + Cooldown + Admin Lock
-- ============================================
-- จุดประสงค์:
--   - แยก "ชื่อจาก LINE" (display_name, sync อัตโนมัติ) ออกจาก
--     "ชื่อที่ user ตั้งเอง" (custom_display_name)
--   - User เห็น/Public เห็น = effective name (custom ถ้ามี, ไม่งั้น LINE)
--   - Admin เห็น = LINE name เป็นหลัก (เพื่อ verify slip การจอง)
--   - Cooldown 7 วัน ระหว่างการเปลี่ยนชื่อ
--   - Admin lock ได้ 15 วัน ถ้าชื่อหยาบคาย/spam
--   - Idempotent: รันซ้ำได้ไม่พัง
-- ============================================

-- 1. เพิ่ม columns ในตาราง users
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS custom_display_name VARCHAR(50),
    ADD COLUMN IF NOT EXISTS custom_display_name_updated_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS custom_display_name_locked_until TIMESTAMP;

-- 2. Index สำหรับ admin search ทั้ง 2 ชื่อ
CREATE INDEX IF NOT EXISTS idx_users_custom_display_name
    ON users (custom_display_name)
    WHERE custom_display_name IS NOT NULL;

-- 3. ตาราง history ประวัติเปลี่ยนชื่อ (เบาๆ)
CREATE TABLE IF NOT EXISTS user_name_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    custom_display_name VARCHAR(50),                    -- NULL = clear ชื่อ custom (revert to LINE)
    changed_by_type VARCHAR(20) NOT NULL                 -- 'user' | 'admin'
        CHECK (changed_by_type IN ('user', 'admin')),
    changed_by_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    action VARCHAR(20) NOT NULL                          -- 'set' | 'clear' | 'admin_clear' | 'admin_lock' | 'admin_unlock'
        CHECK (action IN ('set', 'clear', 'admin_clear', 'admin_lock', 'admin_unlock')),
    note TEXT,                                           -- เหตุผล (ถ้า admin ใส่)
    changed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_name_history_user
    ON user_name_history (user_id, changed_at DESC);

-- 4. Settings: Cooldown days (แอดมินปรับได้ภายหลัง)
INSERT INTO app_settings (key, value)
VALUES ('name_change_cooldown_days', '7')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value)
VALUES ('name_change_admin_lock_days', '15')
ON CONFLICT (key) DO NOTHING;
