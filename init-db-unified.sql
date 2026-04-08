-- Unified identity schema for LINE Login + Telegram
-- PostgreSQL 14+

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    global_user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_login_user_id VARCHAR(64) UNIQUE,
    telegram_user_id VARCHAR(64) UNIQUE,
    display_name VARCHAR(255) NOT NULL DEFAULT '',
    picture_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT users_has_identity CHECK (
        line_login_user_id IS NOT NULL OR telegram_user_id IS NOT NULL
    )
);

CREATE TABLE IF NOT EXISTS points (
    id BIGSERIAL PRIMARY KEY,
    global_user_id UUID NOT NULL REFERENCES users(global_user_id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    points INTEGER NOT NULL,
    source_platform VARCHAR(20) NOT NULL CHECK (source_platform IN ('line', 'telegram')),
    source_oa_id VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_line_login ON users(line_login_user_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_points_user_created ON points(global_user_id, created_at DESC);

-- Optional trigger to keep updated_at current.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
