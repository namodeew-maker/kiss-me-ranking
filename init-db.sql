-- ============================================
-- Lotto Project - Database Initialization
-- Run this on Neon (or any PostgreSQL) to set up tables
-- ============================================

-- 1. Sold Out Numbers
CREATE TABLE IF NOT EXISTS sold_out (
    id SERIAL PRIMARY KEY,
    number INTEGER NOT NULL UNIQUE CHECK (number >= 0 AND number <= 99),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. User Permissions
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slots INTEGER NOT NULL DEFAULT 3,
    used INTEGER NOT NULL DEFAULT 0,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Guess History
CREATE TABLE IF NOT EXISTS history (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    number VARCHAR(2) NOT NULL,
    date TIMESTAMP DEFAULT NOW(),
    won BOOLEAN,
    approved VARCHAR(20) DEFAULT 'pending',
    image_path VARCHAR(255) DEFAULT NULL
);

-- 4. Admin Users
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Seed admin user (username: Kissmy456, password: Kiss@456789)
--    bcrypt hash for Kiss@456789
INSERT INTO admin_users (username, password_hash)
VALUES ('Kissmy456', '$2b$10$CknkjBWTxbRtS3dN0jLiuuqM.Orrl4W0FcwfIosLqhY30/A4IIp4W')
ON CONFLICT (username) DO NOTHING;
