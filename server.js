const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Load .env if present
try { require('dotenv').config(); } catch { /* dotenv optional locally */ }

const app = express();
const PORT = process.env.PORT || 3000;
const CASHBACK_REWARD_AMOUNT = 5000;
const GV_REWARD_AMOUNT = 300;
const CASHBACK_WITHDRAWAL_RATE = 0.9;
const DEFAULT_ADMIN_LOGIN_SLUG = 'admin';

function normalizeAdminLoginSlug(value) {
    const normalized = String(value || '').trim().replace(/^\/+|\/+$/g, '');
    if (!normalized) return DEFAULT_ADMIN_LOGIN_SLUG;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(normalized)) {
        console.warn(`Invalid ADMIN_LOGIN_PATH "${value}" - falling back to "${DEFAULT_ADMIN_LOGIN_SLUG}"`);
        return DEFAULT_ADMIN_LOGIN_SLUG;
    }
    return normalized;
}

const ADMIN_LOGIN_SLUG = normalizeAdminLoginSlug(process.env.ADMIN_LOGIN_PATH || DEFAULT_ADMIN_LOGIN_SLUG);
const ADMIN_LOGIN_ROUTE = `/${ADMIN_LOGIN_SLUG}`;
const ADMIN_PANEL_ROUTE = `${ADMIN_LOGIN_ROUTE}/panel`;
const ADMIN_SHARED_ASSET_PATHS = new Set(['/styles.css', '/admin.css', '/admin.js']);

function normalizeRequestPath(value) {
    return String(value || '').replace(/\/+$/, '') || '/';
}

function isAdminRouteRequest(requestPath) {
    const normalized = normalizeRequestPath(requestPath);
    return normalized === ADMIN_LOGIN_ROUTE
        || normalized === ADMIN_PANEL_ROUTE
        || normalized === `${ADMIN_LOGIN_ROUTE}/styles.css`
        || normalized === `${ADMIN_LOGIN_ROUTE}/admin.css`
        || normalized === `${ADMIN_LOGIN_ROUTE}/admin.js`
        || normalized === `${ADMIN_LOGIN_ROUTE}/index.html`;
}

// ============ CLOUDFLARE R2 CONFIG ============

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'kissme-uploads';
const R2_PUBLIC_URL = String(process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
const REQUIRE_R2_STORAGE = String(process.env.REQUIRE_R2_STORAGE || 'true').toLowerCase() !== 'false';

const hasR2Credentials = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY && R2_SECRET_KEY);
const useR2 = hasR2Credentials && !!R2_PUBLIC_URL;

if (REQUIRE_R2_STORAGE && !useR2) {
    throw new Error(
        'R2 storage is required. Please configure R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, and R2_PUBLIC_URL.'
    );
}

let s3Client;
if (useR2) {
    s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: R2_ACCESS_KEY,
            secretAccessKey: R2_SECRET_KEY,
        },
    });
} else if (hasR2Credentials && !R2_PUBLIC_URL) {
    console.warn('R2 credentials found but R2_PUBLIC_URL is missing. Falling back to local uploads.');
}

// Ensure local uploads directory exists (fallback)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Multer config: memory for R2, disk for local
const storage = useR2
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            const safeName = Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
            cb(null, safeName);
        }
    });
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
        const mimeOk = allowed.test(file.mimetype);
        cb(null, extOk && mimeOk);
    }
});

// Helper: upload buffer to R2
async function uploadToR2(buffer, filename, mimetype) {
    await s3Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: filename,
        Body: buffer,
        ContentType: mimetype,
    }));
    return `${R2_PUBLIC_URL}/${filename}`;
}

function getMimeTypeFromFilename(filename) {
    const ext = path.extname(String(filename || '')).toLowerCase();
    switch (ext) {
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.gif':
            return 'image/gif';
        case '.webp':
            return 'image/webp';
        default:
            return 'application/octet-stream';
    }
}

function getExtensionFromMimeType(mimeType) {
    switch (String(mimeType || '').toLowerCase()) {
        case 'image/jpeg':
            return '.jpg';
        case 'image/png':
            return '.png';
        case 'image/gif':
            return '.gif';
        case 'image/webp':
            return '.webp';
        default:
            return '';
    }
}

function buildR2FilenameFromExternalUrl(assetUrl, mimeType) {
    let extension = '';

    try {
        const parsedUrl = new URL(assetUrl);
        extension = path.extname(parsedUrl.pathname || '');
    } catch {
        extension = '';
    }

    if (!extension) {
        extension = getExtensionFromMimeType(mimeType);
    }

    return `external-${Date.now()}-${crypto.randomUUID()}${extension}`;
}

async function uploadExternalAssetToR2(assetUrl) {
    const response = await fetch(assetUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch external asset: ${response.status} ${response.statusText}`);
    }

    const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)) {
        throw new Error(`Unsupported external asset content type: ${mimeType || 'unknown'}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = buildR2FilenameFromExternalUrl(assetUrl, mimeType);
    const publicUrl = await uploadToR2(buffer, filename, mimeType);

    return publicUrl;
}

function isR2ManagedUrl(value) {
    if (!value || !R2_PUBLIC_URL) return false;
    return String(value).trim().startsWith(`${R2_PUBLIC_URL}/`);
}

function extractLocalUploadFilename(value) {
    if (!value) return null;
    const normalized = String(value).trim();
    if (!normalized || isR2ManagedUrl(normalized)) return null;

    if (/^https?:\/\//i.test(normalized)) {
        try {
            const url = new URL(normalized);
            const uploadMatch = url.pathname.match(/\/uploads\/([^?#]+)/i);
            return uploadMatch ? decodeURIComponent(uploadMatch[1]) : null;
        } catch {
            return null;
        }
    }

    if (normalized.startsWith('/uploads/')) {
        return decodeURIComponent(normalized.slice('/uploads/'.length));
    }

    if (normalized.startsWith('uploads/')) {
        return decodeURIComponent(normalized.slice('uploads/'.length));
    }

    if (/^[A-Za-z0-9._%-]+\.(jpg|jpeg|png|gif|webp)$/i.test(normalized)) {
        return decodeURIComponent(normalized);
    }

    const embeddedUploadMatch = normalized.match(/\/uploads\/([^?#]+)/i);
    return embeddedUploadMatch ? decodeURIComponent(embeddedUploadMatch[1]) : null;
}

const ASSET_REFERENCE_CONFIG = [
    { table: 'staffs', column: 'avatar_url', label: 'รูปพนักงาน' },
    { table: 'transactions', column: 'slip_image_url', label: 'รูปหลักฐาน' },
    { table: 'users', column: 'picture_url', label: 'รูปผู้ใช้' }
];

async function loadAssetReferences() {
    const refs = [];
    for (const config of ASSET_REFERENCE_CONFIG) {
        const result = await pool.query(
            `SELECT id, ${config.column} AS asset_value FROM ${config.table} WHERE ${config.column} IS NOT NULL AND ${config.column} <> ''`
        );
        result.rows.forEach((row) => {
            refs.push({
                table: config.table,
                column: config.column,
                label: config.label,
                id: row.id,
                value: row.asset_value
            });
        });
    }
    return refs;
}

function createAssetTableSummary() {
    return {
        total: 0,
        r2: 0,
        local_existing: 0,
        local_missing: 0,
        external: 0
    };
}

async function summarizeAssetStorage() {
    const refs = await loadAssetReferences();
    const summary = {
        storage: {
            mode: useR2 ? 'r2' : 'local',
            r2_enabled: useR2,
            r2_public_url: R2_PUBLIC_URL || null,
            bucket: useR2 ? R2_BUCKET : null,
            local_upload_files: fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir).length : 0
        },
        counts: {
            total: 0,
            r2: 0,
            local_existing: 0,
            local_missing: 0,
            external: 0
        },
        tables: {},
        missing_samples: []
    };

    for (const config of ASSET_REFERENCE_CONFIG) {
        summary.tables[config.table] = createAssetTableSummary();
    }

    refs.forEach((ref) => {
        const tableSummary = summary.tables[ref.table] || createAssetTableSummary();
        summary.counts.total += 1;
        tableSummary.total += 1;

        if (isR2ManagedUrl(ref.value)) {
            summary.counts.r2 += 1;
            tableSummary.r2 += 1;
            summary.tables[ref.table] = tableSummary;
            return;
        }

        const filename = extractLocalUploadFilename(ref.value);
        if (filename) {
            const localPath = path.join(uploadsDir, filename);
            if (fs.existsSync(localPath)) {
                summary.counts.local_existing += 1;
                tableSummary.local_existing += 1;
            } else {
                summary.counts.local_missing += 1;
                tableSummary.local_missing += 1;
                if (summary.missing_samples.length < 8) {
                    summary.missing_samples.push({
                        table: ref.table,
                        id: ref.id,
                        filename
                    });
                }
            }
            summary.tables[ref.table] = tableSummary;
            return;
        }

        summary.counts.external += 1;
        tableSummary.external += 1;
        summary.tables[ref.table] = tableSummary;
    });

    return summary;
}

async function migrateLocalAssetsToR2() {
    if (!useR2) {
        throw new Error('R2 storage is not configured');
    }

    const refs = await loadAssetReferences();
    const uploadCache = new Map();
    const result = {
        scanned: refs.length,
        migrated_rows: 0,
        uploaded_files: 0,
        already_r2: 0,
        external_skipped: 0,
        external_migrated: 0,
        missing_files: [],
        failed_rows: []
    };

    for (const ref of refs) {
        if (isR2ManagedUrl(ref.value)) {
            result.already_r2 += 1;
            continue;
        }

        const filename = extractLocalUploadFilename(ref.value);
        if (!filename) {
            if (!/^https?:\/\//i.test(String(ref.value || '').trim())) {
                result.external_skipped += 1;
                continue;
            }

            try {
                const publicUrl = await uploadExternalAssetToR2(ref.value);
                await pool.query(
                    `UPDATE ${ref.table} SET ${ref.column} = $1 WHERE id = $2`,
                    [publicUrl, ref.id]
                );
                result.external_migrated += 1;
                result.migrated_rows += 1;
            } catch (err) {
                if (result.failed_rows.length < 20) {
                    result.failed_rows.push({
                        table: ref.table,
                        id: ref.id,
                        filename: ref.value,
                        error: err.message
                    });
                }
            }
            continue;
        }

        let cachedUpload = uploadCache.get(filename);
        if (!cachedUpload) {
            const filePath = path.join(uploadsDir, filename);
            if (!fs.existsSync(filePath)) {
                cachedUpload = { status: 'missing' };
            } else {
                const fileBuffer = await fs.promises.readFile(filePath);
                const publicUrl = await uploadToR2(fileBuffer, filename, getMimeTypeFromFilename(filename));
                cachedUpload = { status: 'uploaded', url: publicUrl };
                result.uploaded_files += 1;
            }
            uploadCache.set(filename, cachedUpload);
        }

        if (cachedUpload.status !== 'uploaded') {
            if (result.missing_files.length < 20) {
                result.missing_files.push({ table: ref.table, id: ref.id, filename });
            }
            continue;
        }

        try {
            await pool.query(
                `UPDATE ${ref.table} SET ${ref.column} = $1 WHERE id = $2`,
                [cachedUpload.url, ref.id]
            );
            result.migrated_rows += 1;
        } catch (err) {
            if (result.failed_rows.length < 20) {
                result.failed_rows.push({
                    table: ref.table,
                    id: ref.id,
                    filename,
                    error: err.message
                });
            }
        }
    }

    return result;
}

// Helper: resolve slip image path for local files
async function resolveSlipUrl(file) {
    if (!file) return null;
    if (useR2) {
        const ext = path.extname(file.originalname);
        const filename = Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
        return uploadToR2(file.buffer, filename, file.mimetype);
    }
    if (REQUIRE_R2_STORAGE) {
        throw new Error('R2 storage is required for all uploads');
    }
    return file.filename; // local: just the filename, served via /uploads/:name
}

async function migrateAssetsToR2OnStartup() {
    if (!useR2) {
        return {
            skipped: true,
            reason: 'R2 storage is not configured'
        };
    }

    const migration = await migrateLocalAssetsToR2();
    const summary = await summarizeAssetStorage();

    return {
        skipped: false,
        migration,
        summary
    };
}

// ============ POSTGRESQL ============

const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: true })
    : new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'kissme_ranking',
        password: process.env.DB_PASSWORD || '',
        port: parseInt(process.env.DB_PORT, 10) || 5432,
    });

app.use(cors({
    origin: [
        'https://namodeew-maker.github.io',
        'http://localhost:3000',
        /\.trycloudflare\.com$/,
        /\.ngrok-free\.dev$/
    ],
    credentials: true
}));
app.use(express.json());

// Skip ngrok browser warning for all requests (especially LIFF redirects)
app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
});

app.use((req, res, next) => {
    const host = req.get('host') || '';
    const isRenderHost = host.includes('kiss-me-ranking.onrender.com');
    const isApiRequest = req.path.startsWith('/api');
    const isUploadRequest = req.path.startsWith('/uploads');
    const isLineCallback = req.path.startsWith('/auth/line/callback');
    const normalizedPath = normalizeRequestPath(req.path);
    const isAdminRequest = isAdminRouteRequest(normalizedPath);
    const isSharedAdminAssetRequest = ADMIN_SHARED_ASSET_PATHS.has(normalizedPath);

    if (!isRenderHost || req.method !== 'GET' || isApiRequest || isUploadRequest || isLineCallback || isAdminRequest || isSharedAdminAssetRequest) {
        return next();
    }

    const targetPath = req.path === '/' ? '/index.html' : req.path;
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return res.redirect(302, `https://namodeew-maker.github.io/kiss-me-ranking${targetPath}${query}`);
});

const sendProjectFile = (filename) => (req, res) => res.sendFile(path.join(__dirname, filename));

app.get(ADMIN_LOGIN_ROUTE, sendProjectFile('admin-login.html'));
app.get(ADMIN_PANEL_ROUTE, sendProjectFile('admin.html'));
app.get(`${ADMIN_LOGIN_ROUTE}/styles.css`, sendProjectFile('styles.css'));
app.get(`${ADMIN_LOGIN_ROUTE}/admin.css`, sendProjectFile('admin.css'));
app.get(`${ADMIN_LOGIN_ROUTE}/admin.js`, sendProjectFile('admin.js'));
app.get(`${ADMIN_LOGIN_ROUTE}/index.html`, sendProjectFile('index.html'));

const legacyAdminRedirectTarget = ADMIN_LOGIN_ROUTE === '/admin' ? ADMIN_LOGIN_ROUTE : '/index.html';
const legacyAdminPanelRedirectTarget = ADMIN_LOGIN_ROUTE === '/admin' ? ADMIN_PANEL_ROUTE : '/index.html';
app.get('/admin-login.html', (req, res) => res.redirect(302, legacyAdminRedirectTarget));
app.get('/admin.html', (req, res) => res.redirect(302, legacyAdminPanelRedirectTarget));

app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(uploadsDir));

async function ensureDatabaseStructure() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'admin'");
        await pool.query("UPDATE admin_users SET role = 'admin' WHERE role IS NULL OR TRIM(role) = '' OR LOWER(role) NOT IN ('admin', 'editor')");
        await pool.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'admin_users'::regclass
                      AND conname = 'admin_users_role_check'
                ) THEN
                    ALTER TABLE admin_users DROP CONSTRAINT admin_users_role_check;
                END IF;

                ALTER TABLE admin_users
                    ADD CONSTRAINT admin_users_role_check
                    CHECK (role IN ('admin', 'editor'));
            END $$;
        `);
        await pool.query(`
            INSERT INTO admin_users (username, password_hash, role)
            VALUES ('Kissmy456', '$2b$10$NLGaIVss43MdXEgjmKfN0O0WuaJf4uQWtFtEnvCBz8Y4zbhc4WrvS', 'admin')
            ON CONFLICT (username) DO NOTHING
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS app_settings (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS lottery_reward_claims (
                id SERIAL PRIMARY KEY,
                lottery_guess_id INTEGER NOT NULL REFERENCES lottery_guesses(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                reward_type VARCHAR(20) NOT NULL
                    CHECK (reward_type IN ('cashback', 'gv')),
                claim_mode VARCHAR(20),
                amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
                note TEXT,
                redeemed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
                redeemed_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_reward_claims_guess ON lottery_reward_claims (lottery_guess_id)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_reward_claims_user ON lottery_reward_claims (user_id, redeemed_at DESC)');
        await pool.query('ALTER TABLE lottery_reward_claims ADD COLUMN IF NOT EXISTS claim_mode VARCHAR(20)');
        await pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS service_date DATE');
        await pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS guess_cycle INTEGER NOT NULL DEFAULT 0');
        await pool.query('ALTER TABLE sold_out ADD COLUMN IF NOT EXISTS round_label VARCHAR(20)');
        await pool.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'sold_out'::regclass
                      AND conname = 'sold_out_number_key'
                ) THEN
                    ALTER TABLE sold_out DROP CONSTRAINT sold_out_number_key;
                END IF;
            END $$;
        `);
        await pool.query('DROP INDEX IF EXISTS uq_sold_out_number_round');
        await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_sold_out_number_round ON sold_out (number, round_label)');
        await pool.query('DROP INDEX IF EXISTS uq_user_staff_round');
        await pool.query('DROP INDEX IF EXISTS uq_user_staff_round_cycle');
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS uq_user_staff_round_cycle
            ON transactions (user_id, staff_id, round_label, guess_cycle)
            WHERE status <> 'rejected'
        `);
        await pool.query('DROP INDEX IF EXISTS uq_user_lottery_round');
        await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_user_lottery_round_number ON lottery_guesses (user_id, round_label, guess_number)');
        await pool.query(`
            DO $$
            BEGIN
                IF to_regclass('public.ratings') IS NOT NULL THEN
                    ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_looks_score_check;
                    ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_service_score_check;
                    ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_value_score_check;

                    ALTER TABLE ratings ADD CONSTRAINT ratings_looks_score_check CHECK (looks_score BETWEEN 1 AND 10);
                    ALTER TABLE ratings ADD CONSTRAINT ratings_service_score_check CHECK (service_score BETWEEN 1 AND 10);
                    ALTER TABLE ratings ADD CONSTRAINT ratings_value_score_check CHECK (value_score BETWEEN 1 AND 10);
                END IF;
            END $$;
        `);
        await pool.query(`
            UPDATE transactions t
            SET guess_cycle = COALESCE((
                SELECT COUNT(*)::int
                FROM lottery_guesses lg
                WHERE lg.user_id = t.user_id
                  AND lg.round_label = t.round_label
                  AND lg.created_at <= t.created_at
            ), 0)
        `);
        await pool.query(
            "UPDATE sold_out SET round_label = $1 WHERE round_label IS NULL OR round_label = ''",
            [getCurrentRoundLabel()]
        );
        await pool.query(
            "UPDATE lottery_reward_claims SET claim_mode = 'withdraw' WHERE reward_type = 'cashback' AND COALESCE(claim_mode, '') = ''"
        );
    } catch (err) {
        console.error('Database bootstrap error:', err);
        throw err;
    }
}

async function getRankingResetDate() {
    const result = await pool.query(
        "SELECT value FROM app_settings WHERE key = 'ranking_reset_date' LIMIT 1"
    );
    return result.rows[0]?.value || null;
}

async function getCustomerRankResetDate() {
    const result = await pool.query(
        "SELECT value FROM app_settings WHERE key = 'customer_rank_reset_date' LIMIT 1"
    );
    return result.rows[0]?.value || null;
}

// ============ ROUND LOGIC ============
// Round A: day 1-14, draw on 16th
// Round B: day 16-29, draw on 1st of next month
// Out-of-window (day 15 or 30-31): rollover to next round

function getCurrentRoundLabel(dateOverride) {
    const now = dateOverride || new Date();
    const day = now.getDate();
    const month = now.getMonth() + 1; // 1-12
    const year = now.getFullYear();

    if (day >= 1 && day <= 14) {
        // Round A of this month
        return `${year}-${String(month).padStart(2, '0')}-A`;
    } else if (day >= 16 && day <= 29) {
        // Round B of this month
        return `${year}-${String(month).padStart(2, '0')}-B`;
    } else if (day === 15) {
        // Between rounds — rollover to Round B of this month
        return `${year}-${String(month).padStart(2, '0')}-B`;
    } else {
        // Day 30 or 31 — rollover to Round A of next month
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        return `${nextYear}-${String(nextMonth).padStart(2, '0')}-A`;
    }
}

function isRoundOpen() {
    const day = new Date().getDate();
    return (day >= 1 && day <= 14) || (day >= 16 && day <= 29);
}

function parseRoundLabel(roundLabel) {
    const match = String(roundLabel || '').match(/^(\d{4})-(\d{2})-([AB])$/);
    if (!match) return null;
    return {
        year: Number(match[1]),
        month: Number(match[2]),
        slot: match[3]
    };
}

function getRoundWindowFromLabel(roundLabel) {
    const parsed = parseRoundLabel(roundLabel);
    if (!parsed) return null;

    if (parsed.slot === 'A') {
        return {
            label: roundLabel,
            startAt: new Date(parsed.year, parsed.month - 1, 1, 0, 0, 0, 0),
            endAt: new Date(parsed.year, parsed.month - 1, 15, 0, 0, 0, 0)
        };
    }

    return {
        label: roundLabel,
        startAt: new Date(parsed.year, parsed.month - 1, 16, 0, 0, 0, 0),
        endAt: new Date(parsed.year, parsed.month - 1, 30, 0, 0, 0, 0)
    };
}

function getCurrentRoundWindow(dateOverride) {
    return getRoundWindowFromLabel(getCurrentRoundLabel(dateOverride));
}

function getRoundScopedPointsClause(roundLabelParamIndex, startAtParamIndex, endAtParamIndex) {
    return `(
        COALESCE(metadata->>'round_label', '') = $${roundLabelParamIndex}
        OR (
            COALESCE(metadata->>'round_label', '') = ''
            AND created_at >= $${startAtParamIndex}
            AND created_at < $${endAtParamIndex}
        )
    )`;
}

function getGuessCreditsFromPoints(pointBalance) {
    return Math.max(0, Math.floor(Number(pointBalance || 0) / 5));
}

function getPointsNeededForNextGuess(pointBalance) {
    const normalized = Math.max(0, Number(pointBalance || 0));
    const remainder = normalized % 5;
    return remainder === 0 ? 0 : 5 - remainder;
}

function formatDateOnly(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function addMonths(date, months) {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
}

function getDefaultGuessPointCycleStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

async function getGuessPointCycleConfig(queryable = pool) {
    const result = await queryable.query(
        "SELECT value FROM app_settings WHERE key = 'guess_points_cycle_start_date' LIMIT 1"
    );

    const savedValue = String(result.rows[0]?.value || '').trim();
    const hasValidSavedDate = /^\d{4}-\d{2}-\d{2}$/.test(savedValue);
    const startAt = hasValidSavedDate
        ? new Date(`${savedValue}T00:00:00`)
        : getDefaultGuessPointCycleStart();
    const endAt = addMonths(startAt, 1);

    return {
        start_date: hasValidSavedDate ? savedValue : formatDateOnly(startAt),
        end_date: formatDateOnly(endAt),
        startAt,
        endAt
    };
}

// ============ AUTH ============

const authTokens = new Map();
const TOKEN_EXPIRY_MS = 8 * 60 * 60 * 1000; // 8 hours
const ADMIN_ROLES = ['admin', 'editor'];

function cleanExpiredTokens() {
    const now = Date.now();
    for (const [token, data] of authTokens) {
        if (now - data.createdAt > TOKEN_EXPIRY_MS) authTokens.delete(token);
    }
}

function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
    }
    const token = authHeader.slice(7);
    cleanExpiredTokens();
    const session = authTokens.get(token);
    if (!session) {
        return res.status(401).json({ error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' });
    }
    req.adminUser = session.username;
    req.adminUserId = session.userId;
    req.adminRole = session.role || 'admin';
    next();
}

function normalizeAdminRole(role) {
    const normalized = String(role || '').trim().toLowerCase();
    return ADMIN_ROLES.includes(normalized) ? normalized : null;
}

function requireAdminManager(req, res, next) {
    if (req.adminRole !== 'admin') {
        return res.status(403).json({ error: 'เฉพาะแอดมินหลักเท่านั้นที่จัดการบัญชีผู้ดูแลได้' });
    }
    next();
}

async function tableExists(client, tableName) {
    const result = await client.query('SELECT to_regclass($1) AS regclass', [`public.${tableName}`]);
    return Boolean(result.rows[0]?.regclass);
}

function getRewardTypeFromResult(result) {
    return result === 'won' ? 'cashback' : result === 'lost' ? 'gv' : null;
}

async function getTotalPointsForGlobalUser(client, globalUserId) {
    if (!globalUserId) return 0;
    const result = await client.query(
        `SELECT COALESCE(SUM(points), 0)::int AS total_points
         FROM points
         WHERE global_user_id = $1`,
        [globalUserId]
    );
    return Number(result.rows[0]?.total_points || 0);
}

async function getRoundPointsForGlobalUser(client, globalUserId, roundLabel = getCurrentRoundLabel()) {
    if (!globalUserId || !(await tableExists(client, 'points'))) return 0;

    const guessPointCycle = await getGuessPointCycleConfig(client);

    const result = await client.query(
        `SELECT COALESCE(SUM(points), 0)::int AS total_points
         FROM points
         WHERE global_user_id = $1
           AND created_at >= $2
           AND created_at < $3`,
        [globalUserId, guessPointCycle.startAt, guessPointCycle.endAt]
    );
    return Number(result.rows[0]?.total_points || 0);
}

async function getRecentPointsForGlobalUser(client, globalUserId, limit = 10) {
    if (!globalUserId || !(await tableExists(client, 'points'))) return [];

    const result = await client.query(
        `SELECT id, activity_type, points, source_platform, source_oa_id, metadata, created_at
         FROM points
         WHERE global_user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [globalUserId, limit]
    );

    return result.rows;
}

async function addApprovedTransactionPoint(queryable, transactionRow, createdAtOverride = null) {
    if (!transactionRow?.user_id || !(await tableExists(queryable, 'points'))) return false;

    const userResult = await queryable.query(
        'SELECT global_user_id, platform, platform_id, display_name FROM users WHERE id = $1',
        [transactionRow.user_id]
    );
    const user = userResult.rows[0];
    if (!user?.global_user_id) return false;

    const existingResult = await queryable.query(
        `SELECT id
         FROM points
         WHERE global_user_id = $1
           AND activity_type = 'transaction_approved'
           AND metadata->>'transaction_id' = $2
         LIMIT 1`,
        [user.global_user_id, String(transactionRow.id)]
    );
    if (existingResult.rows.length > 0) return false;

    const pointCreatedAt = createdAtOverride || transactionRow.reviewed_at || null;

    await queryable.query(
        `INSERT INTO points (global_user_id, activity_type, points, source_platform, source_oa_id, metadata, created_at)
         VALUES ($1, 'transaction_approved', 1, $2, NULL, $3, COALESCE($4::timestamp, NOW()))`,
        [
            user.global_user_id,
            user.platform || 'line',
            JSON.stringify({
                transaction_id: String(transactionRow.id),
                round_label: transactionRow.round_label,
                staff_id: transactionRow.staff_id,
                platform_id: user.platform_id,
                display_name: user.display_name || null,
                event_type: 'approved_transaction_point'
            }),
            pointCreatedAt
        ]
    );

    return true;
}

async function removeApprovedTransactionPoint(queryable, userId, transactionId) {
    if (!userId || !transactionId || !(await tableExists(queryable, 'points'))) return 0;

    const userResult = await queryable.query('SELECT global_user_id FROM users WHERE id = $1', [userId]);
    const globalUserId = userResult.rows[0]?.global_user_id;
    if (!globalUserId) return 0;

    const result = await queryable.query(
        `DELETE FROM points
         WHERE global_user_id = $1
           AND activity_type = 'transaction_approved'
           AND metadata->>'transaction_id' = $2`,
        [globalUserId, String(transactionId)]
    );

    return result.rowCount || 0;
}

async function removeLotteryGuessSpendPoint(queryable, globalUserId, lotteryGuessId) {
    if (!globalUserId || !lotteryGuessId || !(await tableExists(queryable, 'points'))) return 0;

    const result = await queryable.query(
        `DELETE FROM points
         WHERE global_user_id = $1
           AND activity_type = 'lottery_guess_spend'
           AND metadata->>'lottery_guess_id' = $2`,
        [globalUserId, String(lotteryGuessId)]
    );

    return result.rowCount || 0;
}

async function reconcileRoundGuessBalance(queryable, userId, globalUserId, roundLabel = getCurrentRoundLabel()) {
    if (!userId || !globalUserId) {
        return { revokedGuessCount: 0, currentPointBalance: 0 };
    }

    let currentPointBalance = await getRoundPointsForGlobalUser(queryable, globalUserId, roundLabel);
    let revokedGuessCount = 0;

    while (currentPointBalance < 0) {
        const latestGuessResult = await queryable.query(
            `SELECT id
             FROM lottery_guesses
             WHERE user_id = $1 AND round_label = $2
             ORDER BY created_at DESC, id DESC
             LIMIT 1`,
            [userId, roundLabel]
        );

        const latestGuess = latestGuessResult.rows[0];
        if (!latestGuess) break;

        await queryable.query('DELETE FROM lottery_guesses WHERE id = $1', [latestGuess.id]);
        await removeLotteryGuessSpendPoint(queryable, globalUserId, latestGuess.id);
        revokedGuessCount += 1;
        currentPointBalance = await getRoundPointsForGlobalUser(queryable, globalUserId, roundLabel);
    }

    return {
        revokedGuessCount,
        currentPointBalance
    };
}

function formatRewardSnapshotRow(row) {
    return {
        lottery_guess_id: row.lottery_guess_id,
        user_id: row.user_id,
        display_name: row.display_name,
        platform: row.platform,
        platform_id: row.platform_id,
        global_user_id: row.global_user_id,
        round_label: row.round_label,
        result: row.result,
        reward_type: row.reward_type,
        total_amount: Number(row.total_amount || 0),
        redeemed_amount: Number(row.redeemed_amount || 0),
        remaining_amount: Number(row.remaining_amount || 0),
        total_net_amount: Number(row.total_net_amount || 0),
        redeemed_net_amount: Number(row.redeemed_net_amount || 0),
        remaining_net_amount: Number(row.remaining_net_amount || 0),
        last_claim_mode: row.last_claim_mode || null,
        claim_count: Number(row.claim_count || 0),
        created_at: row.created_at
    };
}

function buildRewardBaseQuery(userIds = []) {
    const params = [];
    const whereClauses = ["lg.result IN ('won', 'lost')"];

    if (Array.isArray(userIds) && userIds.length > 0) {
        params.push(userIds);
        whereClauses.push(`lg.user_id = ANY($${params.length}::int[])`);
    }

    return {
        params,
        sql: `
            WITH claim_totals AS (
                SELECT
                    lottery_guess_id,
                    COALESCE(SUM(amount), 0)::numeric(10,2) AS redeemed_amount,
                    COALESCE(SUM(
                        CASE
                            WHEN reward_type = 'cashback' AND claim_mode = 'withdraw' THEN amount * ${CASHBACK_WITHDRAWAL_RATE}
                            ELSE amount
                        END
                    ), 0)::numeric(10,2) AS redeemed_net_amount,
                    MAX(claim_mode) FILTER (WHERE claim_mode IS NOT NULL) AS last_claim_mode,
                    COUNT(*)::int AS claim_count
                FROM lottery_reward_claims
                GROUP BY lottery_guess_id
            ),
            reward_rows AS (
                SELECT
                    lg.id AS lottery_guess_id,
                    lg.user_id,
                    u.display_name,
                    u.platform,
                    u.platform_id,
                    u.global_user_id,
                    lg.round_label,
                    lg.result,
                    CASE WHEN lg.result = 'won' THEN 'cashback' ELSE 'gv' END AS reward_type,
                    COALESCE(lg.reward_amount, 0)::numeric(10,2) AS total_amount,
                    COALESCE(ct.redeemed_amount, 0)::numeric(10,2) AS redeemed_amount,
                    GREATEST(COALESCE(lg.reward_amount, 0) - COALESCE(ct.redeemed_amount, 0), 0)::numeric(10,2) AS remaining_amount,
                    CASE WHEN lg.result = 'won'
                        THEN (COALESCE(lg.reward_amount, 0) * ${CASHBACK_WITHDRAWAL_RATE})::numeric(10,2)
                        ELSE COALESCE(lg.reward_amount, 0)::numeric(10,2)
                    END AS total_net_amount,
                    COALESCE(ct.redeemed_net_amount, 0)::numeric(10,2) AS redeemed_net_amount,
                    CASE WHEN lg.result = 'won'
                        THEN GREATEST((COALESCE(lg.reward_amount, 0) * ${CASHBACK_WITHDRAWAL_RATE}) - COALESCE(ct.redeemed_net_amount, 0), 0)::numeric(10,2)
                        ELSE GREATEST(COALESCE(lg.reward_amount, 0) - COALESCE(ct.redeemed_amount, 0), 0)::numeric(10,2)
                    END AS remaining_net_amount,
                    ct.last_claim_mode,
                    COALESCE(ct.claim_count, 0)::int AS claim_count,
                    lg.created_at
                FROM lottery_guesses lg
                JOIN users u ON u.id = lg.user_id
                LEFT JOIN claim_totals ct ON ct.lottery_guess_id = lg.id
                WHERE ${whereClauses.join(' AND ')}
            )
        `
    };
}

async function getRewardManagementSnapshot(client, options = {}) {
    const { userIds = [], onlyOutstanding = false, rewardLimit = 150, claimLimit = 25 } = options;
    const base = buildRewardBaseQuery(userIds);

    const summaryResult = await client.query(
        `${base.sql}
         SELECT
            COUNT(*)::int AS total_rewards,
            COUNT(*) FILTER (WHERE reward_type = 'cashback')::int AS cashback_rewards,
            COUNT(*) FILTER (WHERE reward_type = 'gv')::int AS gv_rewards,
            COUNT(*) FILTER (WHERE remaining_amount > 0)::int AS open_rewards,
            COUNT(*) FILTER (WHERE remaining_amount <= 0)::int AS closed_rewards,
            COALESCE(SUM(CASE WHEN reward_type = 'cashback' THEN total_amount ELSE 0 END), 0)::numeric(10,2) AS cashback_total,
            COALESCE(SUM(CASE WHEN reward_type = 'cashback' THEN redeemed_amount ELSE 0 END), 0)::numeric(10,2) AS cashback_redeemed,
            COALESCE(SUM(CASE WHEN reward_type = 'cashback' THEN remaining_amount ELSE 0 END), 0)::numeric(10,2) AS cashback_remaining,
            COALESCE(SUM(CASE WHEN reward_type = 'cashback' THEN total_net_amount ELSE 0 END), 0)::numeric(10,2) AS cashback_total_net,
            COALESCE(SUM(CASE WHEN reward_type = 'cashback' THEN redeemed_net_amount ELSE 0 END), 0)::numeric(10,2) AS cashback_redeemed_net,
            COALESCE(SUM(CASE WHEN reward_type = 'cashback' THEN remaining_net_amount ELSE 0 END), 0)::numeric(10,2) AS cashback_remaining_net,
            COALESCE(SUM(CASE WHEN reward_type = 'gv' THEN total_amount ELSE 0 END), 0)::numeric(10,2) AS gv_total,
            COALESCE(SUM(CASE WHEN reward_type = 'gv' THEN redeemed_amount ELSE 0 END), 0)::numeric(10,2) AS gv_redeemed,
            COALESCE(SUM(CASE WHEN reward_type = 'gv' THEN remaining_amount ELSE 0 END), 0)::numeric(10,2) AS gv_remaining,
            COALESCE(SUM(claim_count), 0)::int AS claim_count
         FROM reward_rows`,
        base.params
    );

    const rewardParams = [...base.params, rewardLimit];
    const rewardsResult = await client.query(
        `${base.sql}
         SELECT *
         FROM reward_rows
         ${onlyOutstanding ? 'WHERE remaining_amount > 0' : ''}
         ORDER BY remaining_amount DESC, created_at DESC
         LIMIT $${rewardParams.length}`,
        rewardParams
    );

    const claimParams = [];
    const claimWhere = [];
    if (Array.isArray(userIds) && userIds.length > 0) {
        claimParams.push(userIds);
        claimWhere.push(`rc.user_id = ANY($${claimParams.length}::int[])`);
    }
    claimParams.push(claimLimit);

    const claimsResult = await client.query(
        `SELECT
            rc.id,
            rc.lottery_guess_id,
            rc.user_id,
            rc.reward_type,
            rc.claim_mode,
            rc.amount,
            rc.note,
            rc.redeemed_at,
            rc.redeemed_by,
            COALESCE(au.username, 'system') AS redeemed_by_name,
            lg.round_label,
            lg.result,
            u.display_name,
            u.platform,
            u.platform_id
         FROM lottery_reward_claims rc
         JOIN lottery_guesses lg ON lg.id = rc.lottery_guess_id
         JOIN users u ON u.id = rc.user_id
         LEFT JOIN admin_users au ON au.id = rc.redeemed_by
         ${claimWhere.length ? `WHERE ${claimWhere.join(' AND ')}` : ''}
         ORDER BY rc.redeemed_at DESC, rc.id DESC
         LIMIT $${claimParams.length}`,
        claimParams
    );

    return {
        summary: {
            total_rewards: Number(summaryResult.rows[0]?.total_rewards || 0),
            cashback_rewards: Number(summaryResult.rows[0]?.cashback_rewards || 0),
            gv_rewards: Number(summaryResult.rows[0]?.gv_rewards || 0),
            open_rewards: Number(summaryResult.rows[0]?.open_rewards || 0),
            closed_rewards: Number(summaryResult.rows[0]?.closed_rewards || 0),
            cashback_total: Number(summaryResult.rows[0]?.cashback_total || 0),
            cashback_redeemed: Number(summaryResult.rows[0]?.cashback_redeemed || 0),
            cashback_remaining: Number(summaryResult.rows[0]?.cashback_remaining || 0),
            cashback_total_net: Number(summaryResult.rows[0]?.cashback_total_net || 0),
            cashback_redeemed_net: Number(summaryResult.rows[0]?.cashback_redeemed_net || 0),
            cashback_remaining_net: Number(summaryResult.rows[0]?.cashback_remaining_net || 0),
            gv_total: Number(summaryResult.rows[0]?.gv_total || 0),
            gv_redeemed: Number(summaryResult.rows[0]?.gv_redeemed || 0),
            gv_remaining: Number(summaryResult.rows[0]?.gv_remaining || 0),
            claim_count: Number(summaryResult.rows[0]?.claim_count || 0)
        },
        rewards: rewardsResult.rows.map(formatRewardSnapshotRow),
        recentClaims: claimsResult.rows.map((row) => ({
            id: row.id,
            lottery_guess_id: row.lottery_guess_id,
            user_id: row.user_id,
            reward_type: row.reward_type,
            claim_mode: row.claim_mode || null,
            amount: Number(row.amount || 0),
            net_amount: row.reward_type === 'cashback'
                ? Number((row.claim_mode === 'withdraw' ? Number(row.amount || 0) * CASHBACK_WITHDRAWAL_RATE : Number(row.amount || 0)) || 0)
                : Number(row.amount || 0),
            note: row.note,
            redeemed_at: row.redeemed_at,
            redeemed_by: row.redeemed_by,
            redeemed_by_name: row.redeemed_by_name,
            round_label: row.round_label,
            result: row.result,
            display_name: row.display_name,
            platform: row.platform,
            platform_id: row.platform_id
        }))
    };
}

async function getRewardRowByGuessId(client, lotteryGuessId) {
    const base = buildRewardBaseQuery();
    const params = [...base.params, lotteryGuessId];
    const result = await client.query(
        `${base.sql}
         SELECT *
         FROM reward_rows
         WHERE lottery_guess_id = $${params.length}
         LIMIT 1`,
        params
    );
    return result.rows[0] ? formatRewardSnapshotRow(result.rows[0]) : null;
}

// POST /api/login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'กรุณากรอก username และ password' });
    }
    try {
        const result = await pool.query('SELECT * FROM admin_users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }
        const role = normalizeAdminRole(user.role) || 'admin';
        const token = crypto.randomBytes(32).toString('hex');
        authTokens.set(token, { username: user.username, userId: user.id, role, createdAt: Date.now() });
        res.json({ token, username: user.username, role });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
    }
});

// GET /api/auth/verify
app.get('/api/auth/verify', requireAuth, (req, res) => {
    res.json({ valid: true, username: req.adminUser, user_id: req.adminUserId, role: req.adminRole });
});

app.get('/api/admin/accounts', requireAuth, requireAdminManager, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, username, role, created_at
             FROM admin_users
             ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, username ASC`
        );

        res.json({
            accounts: result.rows.map((row) => ({
                id: row.id,
                username: row.username,
                role: normalizeAdminRole(row.role) || 'admin',
                created_at: row.created_at,
                is_current: row.id === req.adminUserId
            })),
            current: {
                id: req.adminUserId,
                username: req.adminUser,
                role: req.adminRole
            }
        });
    } catch (err) {
        console.error('Admin accounts fetch error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดรายชื่อผู้ดูแลได้' });
    }
});

app.post('/api/admin/accounts', requireAuth, requireAdminManager, async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const role = normalizeAdminRole(req.body?.role);

    if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) {
        return res.status(400).json({ error: 'Username ต้องยาว 3-50 ตัว และใช้ได้เฉพาะ a-z, A-Z, 0-9, จุด, ขีดกลาง หรือ _' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
    }
    if (!role) {
        return res.status(400).json({ error: 'กรุณาเลือก role ของผู้ดูแล' });
    }

    try {
        const duplicateResult = await pool.query(
            'SELECT id FROM admin_users WHERE LOWER(username) = LOWER($1) LIMIT 1',
            [username]
        );
        if (duplicateResult.rows.length > 0) {
            return res.status(409).json({ error: 'Username นี้ถูกใช้แล้ว' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO admin_users (username, password_hash, role)
             VALUES ($1, $2, $3)
             RETURNING id, username, role, created_at`,
            [username, passwordHash, role]
        );

        res.status(201).json({
            success: true,
            account: {
                ...result.rows[0],
                role: normalizeAdminRole(result.rows[0].role) || 'admin',
                is_current: false
            }
        });
    } catch (err) {
        console.error('Admin account create error:', err);
        res.status(500).json({ error: 'ไม่สามารถสร้างผู้ดูแลใหม่ได้' });
    }
});

app.put('/api/admin/accounts/:id', requireAuth, requireAdminManager, async (req, res) => {
    const accountId = parseInt(req.params.id, 10);
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const role = normalizeAdminRole(req.body?.role);

    if (Number.isNaN(accountId)) {
        return res.status(400).json({ error: 'ไม่พบบัญชีผู้ดูแลที่ต้องการแก้ไข' });
    }
    if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) {
        return res.status(400).json({ error: 'Username ต้องยาว 3-50 ตัว และใช้ได้เฉพาะ a-z, A-Z, 0-9, จุด, ขีดกลาง หรือ _' });
    }
    if (password && password.length < 8) {
        return res.status(400).json({ error: 'ถ้าจะเปลี่ยนรหัสผ่าน ต้องมีอย่างน้อย 8 ตัวอักษร' });
    }
    if (!role) {
        return res.status(400).json({ error: 'กรุณาเลือก role ของผู้ดูแล' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const targetResult = await client.query(
            'SELECT id, username, role FROM admin_users WHERE id = $1 LIMIT 1',
            [accountId]
        );
        const target = targetResult.rows[0];
        if (!target) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'ไม่พบบัญชีผู้ดูแล' });
        }

        const duplicateResult = await client.query(
            'SELECT id FROM admin_users WHERE LOWER(username) = LOWER($1) AND id <> $2 LIMIT 1',
            [username, accountId]
        );
        if (duplicateResult.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Username นี้ถูกใช้แล้ว' });
        }

        if ((normalizeAdminRole(target.role) || 'admin') === 'admin' && role !== 'admin') {
            const adminCountResult = await client.query(
                "SELECT COUNT(*)::int AS total FROM admin_users WHERE role = 'admin'"
            );
            const adminCount = Number(adminCountResult.rows[0]?.total || 0);
            if (adminCount <= 1) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'ต้องมีบัญชี role admin อย่างน้อย 1 บัญชีเสมอ' });
            }
        }

        if (password) {
            const passwordHash = await bcrypt.hash(password, 10);
            await client.query(
                `UPDATE admin_users
                 SET username = $1, role = $2, password_hash = $3
                 WHERE id = $4`,
                [username, role, passwordHash, accountId]
            );
        } else {
            await client.query(
                `UPDATE admin_users
                 SET username = $1, role = $2
                 WHERE id = $3`,
                [username, role, accountId]
            );
        }

        await client.query('COMMIT');

        for (const [token, session] of authTokens.entries()) {
            if (session.userId === accountId) {
                authTokens.set(token, { ...session, username, role });
            }
        }

        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Admin account update error:', err);
        res.status(500).json({ error: 'ไม่สามารถอัปเดตผู้ดูแลได้' });
    } finally {
        client.release();
    }
});

app.delete('/api/admin/accounts/:id', requireAuth, requireAdminManager, async (req, res) => {
    const accountId = parseInt(req.params.id, 10);
    if (Number.isNaN(accountId)) {
        return res.status(400).json({ error: 'ไม่พบบัญชีผู้ดูแลที่ต้องการลบ' });
    }
    if (accountId === req.adminUserId) {
        return res.status(400).json({ error: 'ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const targetResult = await client.query(
            'SELECT id, role FROM admin_users WHERE id = $1 LIMIT 1',
            [accountId]
        );
        const target = targetResult.rows[0];
        if (!target) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'ไม่พบบัญชีผู้ดูแล' });
        }

        if ((normalizeAdminRole(target.role) || 'admin') === 'admin') {
            const adminCountResult = await client.query(
                "SELECT COUNT(*)::int AS total FROM admin_users WHERE role = 'admin'"
            );
            const adminCount = Number(adminCountResult.rows[0]?.total || 0);
            if (adminCount <= 1) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'ต้องมีบัญชี role admin อย่างน้อย 1 บัญชีเสมอ' });
            }
        }

        await client.query('DELETE FROM admin_users WHERE id = $1', [accountId]);
        await client.query('COMMIT');

        for (const [token, session] of authTokens.entries()) {
            if (session.userId === accountId) {
                authTokens.delete(token);
            }
        }

        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Admin account delete error:', err);
        res.status(500).json({ error: 'ไม่สามารถลบผู้ดูแลได้' });
    } finally {
        client.release();
    }
});

app.get('/api/admin/storage/status', requireAuth, async (req, res) => {
    try {
        const summary = await summarizeAssetStorage();
        res.json(summary);
    } catch (err) {
        console.error('Storage status error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดสถานะ storage ได้' });
    }
});

app.post('/api/admin/storage/migrate', requireAuth, async (req, res) => {
    if (!useR2) {
        return res.status(400).json({
            error: 'R2 storage ยังไม่พร้อมใช้งาน กรุณาตั้งค่า R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY และ R2_PUBLIC_URL ก่อน'
        });
    }

    try {
        const migration = await migrateLocalAssetsToR2();
        const summary = await summarizeAssetStorage();
        res.json({ success: true, migration, summary });
    } catch (err) {
        console.error('Storage migrate error:', err);
        res.status(500).json({ error: 'ไม่สามารถย้ายไฟล์ขึ้น R2 ได้', detail: err.message });
    }
});

app.get('/api/admin/rewards/ledger', requireAuth, async (req, res) => {
    try {
        const snapshot = await getRewardManagementSnapshot(pool, {
            onlyOutstanding: String(req.query.scope || 'outstanding') !== 'all',
            rewardLimit: Math.min(Math.max(parseInt(req.query.limit, 10) || 150, 1), 500),
            claimLimit: Math.min(Math.max(parseInt(req.query.claimLimit, 10) || 25, 1), 100)
        });
        res.json(snapshot);
    } catch (err) {
        console.error('Reward ledger error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลสิทธิ์รางวัลได้' });
    }
});

app.post('/api/admin/rewards/claims', requireAuth, async (req, res) => {
    const lotteryGuessId = parseInt(req.body?.lottery_guess_id, 10);
    const amount = Number(req.body?.amount || 0);
    const note = String(req.body?.note || '').trim();
    const redeemedAtInput = String(req.body?.redeemed_at || '').trim();
    const claimModeInput = String(req.body?.claim_mode || '').trim().toLowerCase();

    if (isNaN(lotteryGuessId)) {
        return res.status(400).json({ error: 'ไม่พบรายการรางวัลที่ต้องการบันทึก' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'กรุณาระบุยอดที่ใช้สิทธิ์ให้มากกว่า 0' });
    }
    if (redeemedAtInput && !/^\d{4}-\d{2}-\d{2}$/.test(redeemedAtInput)) {
        return res.status(400).json({ error: 'รูปแบบวันที่ใช้สิทธิ์ไม่ถูกต้อง' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const guessResult = await client.query(
            `SELECT id, user_id, result, reward_amount
             FROM lottery_guesses
             WHERE id = $1
             FOR UPDATE`,
            [lotteryGuessId]
        );
        const guess = guessResult.rows[0];
        if (!guess) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'ไม่พบรายการรางวัล' });
        }

        const rewardType = getRewardTypeFromResult(guess.result);
        if (!rewardType) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'รายการนี้ยังไม่พร้อมบันทึกการใช้สิทธิ์' });
        }

        const claimMode = rewardType === 'cashback'
            ? (claimModeInput || 'reuse')
            : null;

        if (rewardType === 'cashback' && !['withdraw', 'reuse'].includes(claimMode)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cashback ต้องเลือกวิธีใช้สิทธิ์เป็น withdraw หรือ reuse' });
        }

        const claimedResult = await client.query(
            'SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS claimed_amount FROM lottery_reward_claims WHERE lottery_guess_id = $1',
            [lotteryGuessId]
        );
        const claimedAmount = Number(claimedResult.rows[0]?.claimed_amount || 0);
        const totalAmount = Number(guess.reward_amount || 0);
        const remainingAmount = Math.max(totalAmount - claimedAmount, 0);

        if (amount > remainingAmount + 0.0001) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: rewardType === 'cashback'
                    ? `ยอดเกินวงเงินคงเหลือ (${remainingAmount.toFixed(2)} บาท ก่อนภาษี)`
                    : `ยอดเกินสิทธิ์ GV คงเหลือ ${remainingAmount.toFixed(2)} บาท`
            });
        }

        const insertResult = await client.query(
            `INSERT INTO lottery_reward_claims (lottery_guess_id, user_id, reward_type, claim_mode, amount, note, redeemed_by, redeemed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamp, NOW()))
             RETURNING id, redeemed_at`,
            [
                lotteryGuessId,
                guess.user_id,
                rewardType,
                claimMode,
                amount,
                note || null,
                req.adminUserId,
                redeemedAtInput ? `${redeemedAtInput} 12:00:00` : null
            ]
        );

        await client.query('COMMIT');

        const reward = await getRewardRowByGuessId(pool, lotteryGuessId);
        res.json({
            success: true,
            claim: {
                id: insertResult.rows[0].id,
                redeemed_at: insertResult.rows[0].redeemed_at
            },
            reward
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Reward claim create error:', err);
        res.status(500).json({ error: 'ไม่สามารถบันทึกการใช้สิทธิ์ได้' });
    } finally {
        client.release();
    }
});

app.delete('/api/admin/rewards/claims/:id', requireAuth, async (req, res) => {
    const claimId = parseInt(req.params.id, 10);
    if (isNaN(claimId)) {
        return res.status(400).json({ error: 'Invalid claim ID' });
    }

    try {
        const result = await pool.query(
            `DELETE FROM lottery_reward_claims
             WHERE id = $1
             RETURNING id, lottery_guess_id`,
            [claimId]
        );
        if (!result.rows.length) {
            return res.status(404).json({ error: 'ไม่พบรายการบันทึกที่ต้องการลบ' });
        }
        res.json({ success: true, lottery_guess_id: result.rows[0].lottery_guess_id });
    } catch (err) {
        console.error('Reward claim delete error:', err);
        res.status(500).json({ error: 'ไม่สามารถลบรายการใช้สิทธิ์ได้' });
    }
});

app.post('/api/admin/points/redeem', requireAuth, async (req, res) => {
    res.status(409).json({ error: 'พ้อยถูกใช้สำหรับทายเลขอัตโนมัติเท่านั้น ไม่รองรับการหักพ้อยจากแอดมินแล้ว' });
});

app.post('/api/admin/guess-points/reconcile', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (!(await tableExists(client, 'points'))) {
            await client.query('ROLLBACK');
            return res.status(500).json({ error: 'ยังไม่มีตาราง points สำหรับสะสมพ้อยทายเลข' });
        }

        const invalidApprovedPointResult = await client.query(
            `DELETE FROM points p
             WHERE p.activity_type = 'transaction_approved'
               AND NOT EXISTS (
                    SELECT 1
                    FROM transactions t
                    JOIN users u ON u.id = t.user_id
                    WHERE u.global_user_id = p.global_user_id
                      AND t.id::text = p.metadata->>'transaction_id'
                      AND t.status = 'approved'
               )`
        );

        const orphanSpendPointResult = await client.query(
            `DELETE FROM points p
             WHERE p.activity_type = 'lottery_guess_spend'
               AND NOT EXISTS (
                    SELECT 1
                    FROM lottery_guesses lg
                    JOIN users u ON u.id = lg.user_id
                    WHERE u.global_user_id = p.global_user_id
                      AND lg.id::text = p.metadata->>'lottery_guess_id'
               )`
        );

        const missingApprovedResult = await client.query(
            `SELECT t.id, t.user_id, t.staff_id, t.round_label, t.reviewed_at, t.created_at
             FROM transactions t
             JOIN users u ON u.id = t.user_id
             WHERE t.status = 'approved'
               AND u.global_user_id IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1
                    FROM points p
                    WHERE p.global_user_id = u.global_user_id
                      AND p.activity_type = 'transaction_approved'
                      AND p.metadata->>'transaction_id' = t.id::text
               )
             ORDER BY COALESCE(t.reviewed_at, t.created_at), t.id`
        );

        let insertedApprovedPoints = 0;
        for (const transaction of missingApprovedResult.rows) {
            const inserted = await addApprovedTransactionPoint(
                client,
                transaction,
                transaction.reviewed_at || transaction.created_at || null
            );
            if (inserted) insertedApprovedPoints += 1;
        }

        const usersToSyncResult = await client.query(
            `SELECT DISTINCT user_id
             FROM transactions
             WHERE round_label = $1

             UNION

             SELECT id AS user_id
             FROM users
             WHERE progress_count <> 0`,
            [getCurrentRoundLabel()]
        );

        for (const row of usersToSyncResult.rows) {
            await syncUserRoundState(client, row.user_id);
        }

        const cycle = await getGuessPointCycleConfig(client);

        await client.query('COMMIT');
        res.json({
            success: true,
            inserted_approved_points: insertedApprovedPoints,
            removed_invalid_approved_points: invalidApprovedPointResult.rowCount || 0,
            removed_orphan_spend_points: orphanSpendPointResult.rowCount || 0,
            synced_users: usersToSyncResult.rows.length,
            cycle_start_date: cycle.start_date,
            cycle_end_date: cycle.end_date
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Guess points reconcile error:', err);
        res.status(500).json({ error: 'ไม่สามารถรีเช็คพ้อยทายเลขได้' });
    } finally {
        client.release();
    }
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        authTokens.delete(authHeader.slice(7));
    }
    res.json({ success: true });
});

// ============ STAFFS API ============

// GET /api/staffs — list active staff for dropdown
app.get('/api/staffs', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, nickname, avatar_url FROM staffs WHERE is_active = TRUE ORDER BY name'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Staffs fetch error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดรายชื่อพนักงานได้' });
    }
});

// GET /api/staffs/all — list ALL staff (admin)
app.get('/api/staffs/all', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, nickname, avatar_url, is_active, created_at FROM staffs ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Staffs all fetch error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดรายชื่อพนักงานได้' });
    }
});

// POST /api/staffs — add new staff (admin, with photo upload)
app.post('/api/staffs', requireAuth, upload.single('avatar'), async (req, res) => {
    const { name, nickname } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'กรุณากรอกชื่อพนักงาน' });
    }
    try {
        let avatarUrl = null;
        if (req.file) {
            avatarUrl = await resolveSlipUrl(req.file);
        }
        const result = await pool.query(
            `INSERT INTO staffs (name, nickname, avatar_url, is_active)
             VALUES ($1, $2, $3, TRUE)
             RETURNING *`,
            [name.trim(), nickname ? nickname.trim() : null, avatarUrl]
        );
        res.json({ success: true, staff: result.rows[0] });
    } catch (err) {
        console.error('Staff create error:', err);
        res.status(500).json({ error: 'ไม่สามารถเพิ่มพนักงานได้' });
    }
});

// PUT /api/staffs/:id — update staff (admin)
app.put('/api/staffs/:id', requireAuth, upload.single('avatar'), async (req, res) => {
    const staffId = parseInt(req.params.id, 10);
    if (isNaN(staffId)) return res.status(400).json({ error: 'Invalid ID' });
    const { name, nickname, is_active } = req.body;
    try {
        let avatarUrl = undefined;
        if (req.file) {
            avatarUrl = await resolveSlipUrl(req.file);
        }
        const setClauses = [];
        const values = [];
        let idx = 1;
        if (name !== undefined) { setClauses.push(`name = $${idx++}`); values.push(name.trim()); }
        if (nickname !== undefined) { setClauses.push(`nickname = $${idx++}`); values.push(nickname.trim()); }
        if (is_active !== undefined) { setClauses.push(`is_active = $${idx++}`); values.push(is_active === 'true' || is_active === true); }
        if (avatarUrl !== undefined) { setClauses.push(`avatar_url = $${idx++}`); values.push(avatarUrl); }
        if (setClauses.length === 0) return res.status(400).json({ error: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
        values.push(staffId);
        const result = await pool.query(
            `UPDATE staffs SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
            values
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'ไม่พบพนักงาน' });
        res.json({ success: true, staff: result.rows[0] });
    } catch (err) {
        console.error('Staff update error:', err);
        res.status(500).json({ error: 'ไม่สามารถอัปเดตข้อมูลพนักงานได้' });
    }
});

// DELETE /api/staffs/:id — soft-delete (deactivate) staff (admin)
app.delete('/api/staffs/:id', requireAuth, async (req, res) => {
    const staffId = parseInt(req.params.id, 10);
    if (isNaN(staffId)) return res.status(400).json({ error: 'Invalid ID' });
    try {
        await pool.query('UPDATE staffs SET is_active = FALSE WHERE id = $1', [staffId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Staff delete error:', err);
        res.status(500).json({ error: 'ไม่สามารถลบพนักงานได้' });
    }
});

// DELETE /api/staffs/:id/permanent — hard delete staff (admin)
app.delete('/api/staffs/:id/permanent', requireAuth, async (req, res) => {
    const staffId = parseInt(req.params.id, 10);
    if (isNaN(staffId)) return res.status(400).json({ error: 'Invalid ID' });
    try {
        // Remove all transactions and ratings for this staff (optional: or set staff_id to NULL)
        await pool.query('DELETE FROM ratings WHERE transaction_id IN (SELECT id FROM transactions WHERE staff_id = $1)', [staffId]);
        await pool.query('DELETE FROM transactions WHERE staff_id = $1', [staffId]);
        await pool.query('DELETE FROM staffs WHERE id = $1', [staffId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Staff hard delete error:', err);
        res.status(500).json({ error: 'ไม่สามารถลบพนักงานถาวรได้' });
    }
});

// GET /api/staffs/reset-ranking — get ranking reset date (admin)
app.get('/api/staffs/reset-ranking', requireAuth, async (req, res) => {
    try {
        const date = await getRankingResetDate();
        res.json({ reset_date: date });
    } catch (err) {
        console.error('Get ranking reset date error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดวันที่รีอันดับได้' });
    }
});

// POST /api/staffs/reset-ranking — set ranking reset date (admin)
app.post('/api/staffs/reset-ranking', requireAuth, async (req, res) => {
    const { date } = req.body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'กรุณาระบุวันที่ (YYYY-MM-DD)' });
    }
    try {
        await pool.query(
            `INSERT INTO app_settings (key, value, updated_at)
             VALUES ('ranking_reset_date', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
            [date]
        );
        res.json({ success: true, reset_date: date });
    } catch (err) {
        console.error('Reset staff ranking error:', err);
        res.status(500).json({ error: 'ไม่สามารถรีอันดับได้' });
    }
});

// GET /api/admin/customers/reset-rank — get customer rank reset date (admin)
app.get('/api/admin/customers/reset-rank', requireAuth, async (req, res) => {
    try {
        const date = await getCustomerRankResetDate();
        res.json({ reset_date: date });
    } catch (err) {
        console.error('Get customer rank reset date error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดวันที่รีแรงค์ลูกค้าได้' });
    }
});

// POST /api/admin/customers/reset-rank — set customer rank reset date (admin)
app.post('/api/admin/customers/reset-rank', requireAuth, async (req, res) => {
    const { date } = req.body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'กรุณาระบุวันที่รีแรงค์ (YYYY-MM-DD)' });
    }
    try {
        await pool.query(
            `INSERT INTO app_settings (key, value, updated_at)
             VALUES ('customer_rank_reset_date', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
            [date]
        );
        res.json({ success: true, reset_date: date });
    } catch (err) {
        console.error('Reset customer rank error:', err);
        res.status(500).json({ error: 'ไม่สามารถรีแรงค์ลูกค้าได้' });
    }
});

// GET /api/ranking/staff — staff ranking by approved transaction count and rating averages
app.get('/api/ranking/staff', async (req, res) => {
    try {
        const resetDate = await getRankingResetDate();
        const result = await pool.query(`
            SELECT
                s.id, s.name, s.nickname, s.avatar_url,
                COUNT(t.id)::int AS total_votes,
                COALESCE(ROUND(AVG((r.looks_score + r.service_score + r.value_score) / 3.0)::numeric, 2), 0)::float AS avg_score,
                COALESCE(ROUND(AVG(r.looks_score)::numeric, 2), 0)::float AS avg_looks_score,
                COALESCE(ROUND(AVG(r.service_score)::numeric, 2), 0)::float AS avg_service_score,
                COALESCE(ROUND(AVG(r.value_score)::numeric, 2), 0)::float AS avg_value_score,
                MAX(COALESCE(t.service_date::timestamp, t.created_at)) AS last_service_at
            FROM staffs s
            LEFT JOIN transactions t ON t.staff_id = s.id
                AND t.status = 'approved'
                AND ($1::date IS NULL OR COALESCE(t.service_date, t.created_at::date) >= $1::date)
            LEFT JOIN ratings r ON r.transaction_id = t.id
            WHERE s.is_active = TRUE
            GROUP BY s.id, s.name, s.nickname, s.avatar_url
            ORDER BY total_votes DESC, avg_score DESC, MAX(COALESCE(t.service_date::timestamp, t.created_at)) DESC, s.id ASC
        `, [resetDate]);
        res.json(result.rows);
    } catch (err) {
        console.error('Staff ranking error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดอันดับพนักงานได้' });
    }
});

// GET /api/ranking/customers — customer ranking by approved service usage after customer rank reset date
app.get('/api/ranking/customers', async (req, res) => {
    try {
        const resetDate = await getCustomerRankResetDate();
        const result = await pool.query(`
            SELECT
                u.id, u.display_name, u.picture_url, u.platform,
                COUNT(t.id)::int AS total_approved,
                (
                    SELECT COUNT(*)::int
                    FROM transactions t_all
                    WHERE t_all.user_id = u.id
                      AND t_all.status = 'approved'
                ) AS total_lifetime_approved,
                MAX(COALESCE(t.service_date::timestamp, t.created_at)) AS last_service_at
            FROM users u
            LEFT JOIN transactions t ON t.user_id = u.id
                AND t.status = 'approved'
                AND ($1::date IS NULL OR COALESCE(t.service_date, t.created_at::date) >= $1::date)
            GROUP BY u.id, u.display_name, u.picture_url, u.platform
            HAVING COUNT(t.id) > 0
            ORDER BY COUNT(t.id) DESC, MAX(COALESCE(t.service_date::timestamp, t.created_at)) DESC, u.id ASC
        `, [resetDate]);
        res.json(result.rows.map((row) => ({
            ...row,
            rank_reset_date: resetDate
        })));
    } catch (err) {
        console.error('Customer ranking error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดอันดับลูกค้าได้' });
    }
});

// ============ CUSTOMER AUTH (LINE Login Only) ============

function toAuthenticatedUser(user) {
    return {
        id: user.id,
        platform: user.platform,
        platform_id: user.platform_id,
        display_name: user.display_name,
        picture_url: user.picture_url,
        progress_count: user.progress_count
    };
}

async function upsertCustomerUser({ platform, platformId, displayName, pictureUrl }) {
    const result = await pool.query(
        `INSERT INTO users (platform, platform_id, display_name, picture_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (platform, platform_id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            picture_url = EXCLUDED.picture_url,
            updated_at = NOW()
         RETURNING *`,
        [platform, platformId, displayName || '', pictureUrl || null]
    );

    return result.rows[0];
}

// GET /api/auth/telegram/config — login disabled
app.get('/api/auth/telegram/config', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.status(410).json({ enabled: false, botUsername: null, error: 'ปิดการเข้าสู่ระบบด้วย Telegram แล้ว กรุณาใช้ LINE เท่านั้น' });
});

// POST /api/auth/telegram — login disabled
app.post('/api/auth/telegram', async (req, res) => {
    return res.status(410).json({ error: 'ปิดการเข้าสู่ระบบด้วย Telegram แล้ว กรุณาใช้ LINE เท่านั้น' });
});

// POST /api/auth/login — customer login / register from LINE
// Body: { platform, platform_id, display_name, picture_url }
app.post('/api/auth/login', async (req, res) => {
    const { platform, platform_id, display_name, picture_url } = req.body;
    if (!platform_id) {
        return res.status(400).json({ error: 'platform_id is required' });
    }
    const plat = platform || 'line';
    if (plat !== 'line') {
        return res.status(400).json({ error: 'platform ต้องเป็น line เท่านั้น' });
    }
    try {
        const user = await upsertCustomerUser({
            platform: plat,
            platformId: platform_id,
            displayName: display_name,
            pictureUrl: picture_url
        });
        res.json({
            success: true,
            user: toAuthenticatedUser(user)
        });
    } catch (err) {
        console.error('Customer login error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
    }
});

// ============ USER & PROGRESS API ============

async function getCurrentRoundApprovedCount(userId, roundLabel = getCurrentRoundLabel()) {
    const progressResult = await pool.query(
        `SELECT COUNT(DISTINCT staff_id)::int AS approved_count
         FROM transactions
         WHERE user_id = $1 AND round_label = $2 AND status = 'approved'`,
        [userId, roundLabel]
    );

    return progressResult.rows[0]?.approved_count || 0;
}

async function getCurrentRoundApprovedCountForUsers(userIds, roundLabel = getCurrentRoundLabel()) {
    if (!Array.isArray(userIds) || userIds.length === 0) return 0;

    const progressResult = await pool.query(
        `SELECT COUNT(DISTINCT staff_id)::int AS approved_count
         FROM transactions
         WHERE user_id = ANY($1::int[]) AND round_label = $2 AND status = 'approved'`,
        [userIds, roundLabel]
    );

    return progressResult.rows[0]?.approved_count || 0;
}

async function getCurrentGuessCycle(queryable, userId, roundLabel = getCurrentRoundLabel()) {
    if (!userId) return 0;

    const guessCycleResult = await queryable.query(
        `SELECT COUNT(*)::int AS guess_count
         FROM lottery_guesses
         WHERE user_id = $1 AND round_label = $2`,
        [userId, roundLabel]
    );

    return guessCycleResult.rows[0]?.guess_count || 0;
}

async function syncUserRoundState(queryable, userId, affectedRoundLabel = getCurrentRoundLabel()) {
    const currentRoundLabel = getCurrentRoundLabel();

    const [affectedRoundResult, currentRoundResult] = await Promise.all([
        queryable.query(
            `SELECT COUNT(DISTINCT staff_id)::int AS approved_count
             FROM transactions
             WHERE user_id = $1 AND round_label = $2 AND status = 'approved'`,
            [userId, affectedRoundLabel]
        ),
        queryable.query(
            `SELECT COUNT(DISTINCT staff_id)::int AS approved_count
             FROM transactions
             WHERE user_id = $1 AND round_label = $2 AND status = 'approved'`,
            [userId, currentRoundLabel]
        )
    ]);

    const affectedApprovedCount = affectedRoundResult.rows[0]?.approved_count || 0;
    const currentApprovedCount = currentRoundResult.rows[0]?.approved_count || 0;

    await queryable.query(
        'UPDATE users SET progress_count = $1, updated_at = NOW() WHERE id = $2',
        [Math.min(currentApprovedCount, 5), userId]
    );

    return {
        affectedApprovedCount,
        currentApprovedCount,
        revokedGuessCount: 0
    };
}

// POST /api/users/upsert — create or update user from LINE profile
app.post('/api/users/upsert', async (req, res) => {
    const { platform_id, platform, display_name, picture_url } = req.body;
    // Also accept legacy field name 'line_uid' for backward compat
    const pid = platform_id || req.body.line_uid;
    const plat = platform || 'line';
    if (!pid) {
        return res.status(400).json({ error: 'platform_id is required' });
    }
    if (plat !== 'line') {
        return res.status(400).json({ error: 'platform ต้องเป็น line เท่านั้น' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO users (platform, platform_id, display_name, picture_url)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (platform, platform_id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                picture_url = EXCLUDED.picture_url,
                updated_at = NOW()
             RETURNING *`,
            [plat, pid, display_name || '', picture_url || null]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('User upsert error:', err);
        res.status(500).json({ error: 'ไม่สามารถบันทึกข้อมูลผู้ใช้ได้' });
    }
});

// GET /api/users/:platform_id/progress — get current round progress
// Optional query param: ?platform=line (default)
app.get('/api/users/:platform_id/progress', async (req, res) => {
    const { platform_id } = req.params;
    const platform = String(req.query.platform || 'line').trim().toLowerCase();
    if (platform !== 'line') {
        return res.status(400).json({ error: 'platform ต้องเป็น line เท่านั้น' });
    }
    const roundLabel = getCurrentRoundLabel();
    try {
        const userResult = await pool.query(
            'SELECT * FROM users WHERE platform = $1 AND platform_id = $2',
            [platform, platform_id]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
        }
        const user = userResult.rows[0];

        // Count approved unique staff in this round
        const approvedCount = await getCurrentRoundApprovedCount(user.id, roundLabel);
        const guessPointBalance = await getRoundPointsForGlobalUser(pool, user.global_user_id, roundLabel);
        const guessCreditsRemaining = getGuessCreditsFromPoints(guessPointBalance);
        const currentGuessCycle = await getCurrentGuessCycle(pool, user.id, roundLabel);
        const guessPointCycle = await getGuessPointCycleConfig(pool);

        const guessResult = await pool.query(
            'SELECT * FROM lottery_guesses WHERE user_id = $1 AND round_label = $2 ORDER BY created_at DESC, id DESC',
            [user.id, roundLabel]
        );

        // List which staffs already visited this round
        const visitedResult = await pool.query(
            `SELECT DISTINCT staff_id FROM transactions
             WHERE user_id = $1 AND round_label = $2 AND guess_cycle = $3 AND status <> 'rejected'`,
            [user.id, roundLabel, currentGuessCycle]
        );

        res.json({
            user_id: user.id,
            display_name: user.display_name,
            picture_url: user.picture_url,
            progress_count: approvedCount,
            round_label: roundLabel,
            guess_point_balance: guessPointBalance,
            guess_point_target: 5,
            guess_point_cycle_start_date: guessPointCycle.start_date,
            guess_point_cycle_end_date: guessPointCycle.end_date,
            guess_credits_remaining: guessCreditsRemaining,
            points_needed_for_next_guess: getPointsNeededForNextGuess(guessPointBalance),
            can_guess_lottery: isRoundOpen() && guessCreditsRemaining > 0,
            is_round_open: isRoundOpen(),
            lottery_guess: guessResult.rows[0] || null,
            lottery_guesses: guessResult.rows,
            guess_count: guessResult.rows.length,
            current_guess_cycle: currentGuessCycle,
            visited_staff_ids: visitedResult.rows.map(r => r.staff_id)
        });
    } catch (err) {
        console.error('Progress fetch error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลความคืบหน้าได้' });
    }
});

// GET /api/users/:platform_id/history — profile page: transaction & lottery history
// Optional query param: ?platform=line (default)
app.get('/api/users/:platform_id/history', async (req, res) => {
    const { platform_id } = req.params;
    const platform = String(req.query.platform || 'line').trim().toLowerCase();
    if (platform !== 'line') {
        return res.status(400).json({ error: 'platform ต้องเป็น line เท่านั้น' });
    }
    try {
        const roundLabel = getCurrentRoundLabel();
        // Find user
        const userResult = await pool.query(
            'SELECT id, display_name, picture_url, progress_count, global_user_id FROM users WHERE platform = $1 AND platform_id = $2',
            [platform, platform_id]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
        }
        const user = userResult.rows[0];
        const currentProgressCount = await getCurrentRoundApprovedCount(user.id, roundLabel);

        // Transaction history with staff name
        const txResult = await pool.query(
            `SELECT
                t.id,
                t.created_at,
                t.service_date,
                t.status,
                t.round_label,
                t.slip_image_url,
                t.reject_reason,
                s.name AS staff_name,
                s.nickname AS staff_nickname
             FROM transactions t
             JOIN staffs s ON s.id = t.staff_id
             WHERE t.user_id = $1
             ORDER BY t.created_at DESC`,
            [user.id]
        );

        // Lottery guess history
        const guessResult = await pool.query(
            `SELECT
                id,
                guess_number,
                round_label,
                result,
                reward_amount,
                created_at
             FROM lottery_guesses
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [user.id]
        );

        // Approved transactions used for customer rank, respecting the rank reset date.
        const customerRankResetDate = await getCustomerRankResetDate();
        const lifetimeResult = await pool.query(
            `SELECT
                COUNT(*) FILTER (
                    WHERE $2::date IS NULL
                       OR COALESCE(service_date, created_at::date) >= $2::date
                )::int AS total_approved,
                COUNT(*)::int AS total_lifetime_approved
             FROM transactions
             WHERE user_id = $1
               AND status = 'approved'`,
            [user.id, customerRankResetDate]
        );

        // Total points (if global_user_id exists)
        let totalPoints = 0;
        let currentRoundPoints = 0;
        if (user.global_user_id) {
            totalPoints = await getTotalPointsForGlobalUser(pool, user.global_user_id);
            currentRoundPoints = await getRoundPointsForGlobalUser(pool, user.global_user_id, roundLabel);
        }
        const guessPointCycle = await getGuessPointCycleConfig(pool);

        res.json({
            user: {
                id: user.id,
                display_name: user.display_name,
                picture_url: user.picture_url,
                progress_count: currentProgressCount,
                global_user_id: user.global_user_id
            },
            transactions: txResult.rows,
            guesses: guessResult.rows,
            lifetime_approved: lifetimeResult.rows[0].total_approved,
            total_lifetime_approved: lifetimeResult.rows[0].total_lifetime_approved,
            rank_reset_date: customerRankResetDate,
            total_points: totalPoints,
            current_round_label: roundLabel,
            current_round_progress: currentProgressCount,
            current_round_points: currentRoundPoints,
            guess_point_cycle_start_date: guessPointCycle.start_date,
            guess_point_cycle_end_date: guessPointCycle.end_date,
            current_round_guess_credits: getGuessCreditsFromPoints(currentRoundPoints),
            points_needed_for_next_guess: getPointsNeededForNextGuess(currentRoundPoints)
        });
    } catch (err) {
        console.error('User history fetch error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดประวัติได้' });
    }
});

app.post('/api/users/:platform_id/avatar', upload.single('avatar'), async (req, res) => {
    const { platform_id } = req.params;
    const platform = String(req.body.platform || req.query.platform || 'line').trim().toLowerCase();

    if (platform !== 'line') {
        return res.status(400).json({ error: 'platform ต้องเป็น line เท่านั้น' });
    }
    if (!req.file) {
        return res.status(400).json({ error: 'กรุณาเลือกไฟล์รูปโปรไฟล์' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const userResult = await client.query(
            'SELECT id, global_user_id FROM users WHERE platform = $1 AND platform_id = $2',
            [platform, platform_id]
        );
        const user = userResult.rows[0];
        if (!user) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
        }

        const avatarUrl = await resolveSlipUrl(req.file);
        const idsResult = user.global_user_id
            ? await client.query('SELECT id FROM users WHERE global_user_id = $1', [user.global_user_id])
            : { rows: [{ id: user.id }] };
        const targetIds = idsResult.rows.map((row) => row.id);

        await client.query(
            `UPDATE users
             SET picture_url = $1,
                 updated_at = NOW()
             WHERE id = ANY($2::int[])`,
            [avatarUrl, targetIds]
        );

        await client.query('COMMIT');
        res.json({ success: true, picture_url: avatarUrl, updated_count: targetIds.length });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('User avatar upload error:', err);
        res.status(500).json({ error: 'ไม่สามารถอัปโหลดรูปโปรไฟล์ได้' });
    } finally {
        client.release();
    }
});

// ============ TRANSACTION (SUBMIT BILL) API ============

// POST /api/transactions — customer submits a bill (slip + staff + ratings)
app.post('/api/transactions', upload.single('slip'), async (req, res) => {
    const { staff_id, looks_score, service_score, value_score, platform, service_date } = req.body;
    // Accept platform_id or legacy line_uid
    const platform_id = req.body.platform_id || req.body.line_uid;
    const plat = platform || 'line';

    if (!platform_id || !staff_id) {
        return res.status(400).json({ error: 'กรุณาระบุ platform_id และ staff_id' });
    }
    if (!req.file) {
        return res.status(400).json({ error: 'กรุณาแนบรูปสลิป' });
    }
    if (!service_date || !/^\d{4}-\d{2}-\d{2}$/.test(service_date)) {
        return res.status(400).json({ error: 'กรุณาระบุวันที่มาใช้บริการ' });
    }

    const staffIdNum = parseInt(staff_id, 10);
    const looks = parseInt(looks_score, 10) || 5;
    const service = parseInt(service_score, 10) || 5;
    const value = parseInt(value_score, 10) || 5;

    // Validate score ranges
    if (looks < 1 || looks > 10 || service < 1 || service > 10 || value < 1 || value > 10) {
        return res.status(400).json({ error: 'คะแนนต้องอยู่ระหว่าง 1-10' });
    }

    const roundLabel = getCurrentRoundLabel();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Upsert user
        const userResult = await client.query(
            `INSERT INTO users (platform, platform_id, display_name, picture_url)
             VALUES ($1, $2, '', NULL)
             ON CONFLICT (platform, platform_id) DO UPDATE SET updated_at = NOW()
             RETURNING id`,
            [plat, platform_id]
        );
        const userId = userResult.rows[0].id;

        // Validate staff exists and is active
        const staffResult = await client.query(
            'SELECT id FROM staffs WHERE id = $1 AND is_active = TRUE',
            [staffIdNum]
        );
        if (staffResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'พนักงานไม่ถูกต้องหรือไม่ได้เข้าร่วมกิจกรรม' });
        }

        const currentGuessCycle = await getCurrentGuessCycle(client, userId, roundLabel);

        // Check duplicate staff in the current vote cycle (only non-rejected)
        const dupCheck = await client.query(
            `SELECT id FROM transactions
             WHERE user_id = $1 AND staff_id = $2 AND round_label = $3 AND guess_cycle = $4 AND status <> 'rejected'`,
            [userId, staffIdNum, roundLabel, currentGuessCycle]
        );
        if (dupCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'คุณได้โหวตพนักงานคนนี้แล้วในชุดโหวตปัจจุบัน กรุณาทายเลขก่อนเพื่อเริ่มโหวตซ้ำรอบใหม่' });
        }

        // Upload slip image
        const slipUrl = await resolveSlipUrl(req.file);

        // Insert transaction
        const txResult = await client.query(
            `INSERT INTO transactions (user_id, staff_id, slip_image_url, round_label, status, service_date, guess_cycle)
             VALUES ($1, $2, $3, $4, 'pending', $5, $6)
             RETURNING id`,
            [userId, staffIdNum, slipUrl, roundLabel, service_date, currentGuessCycle]
        );
        const txId = txResult.rows[0].id;

        // Insert ratings (secret — admin cannot see)
        await client.query(
            `INSERT INTO ratings (transaction_id, looks_score, service_score, value_score)
             VALUES ($1, $2, $3, $4)`,
            [txId, looks, service, value]
        );

        await client.query('COMMIT');

        res.json({
            success: true,
            transaction_id: txId,
            round_label: roundLabel,
            message: 'ส่งข้อมูลสำเร็จ รอแอดมินตรวจสอบ'
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Transaction submit error:', err);
        // Handle unique constraint violation gracefully
        if (err.code === '23505') {
            return res.status(409).json({ error: 'คุณได้โหวตพนักงานคนนี้แล้วในชุดโหวตปัจจุบัน กรุณาทายเลขก่อนเพื่อเริ่มโหวตซ้ำรอบใหม่' });
        }
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    } finally {
        client.release();
    }
});

// ============ ADMIN: APPROVE / REJECT ============

// PUT /api/history/:id/approve — approve a pending transaction
app.put('/api/history/:id/approve', requireAuth, async (req, res) => {
    const txId = parseInt(req.params.id, 10);
    if (isNaN(txId)) return res.status(400).json({ error: 'Invalid ID' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lock the transaction row
        const txResult = await client.query(
            'SELECT * FROM transactions WHERE id = $1 FOR UPDATE',
            [txId]
        );
        if (txResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'ไม่พบรายการ' });
        }
        const tx = txResult.rows[0];
        if (tx.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'รายการนี้ได้รับการตรวจสอบแล้ว' });
        }

        // Update status to approved
        await client.query(
            `UPDATE transactions SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
             WHERE id = $2`,
            [req.adminUserId, txId]
        );

        await addApprovedTransactionPoint(client, tx);

        const syncResult = await syncUserRoundState(client, tx.user_id, tx.round_label);
        const approvedCount = syncResult.affectedApprovedCount;
        const userPointResult = await client.query('SELECT global_user_id FROM users WHERE id = $1', [tx.user_id]);
        const currentRoundPoints = await getRoundPointsForGlobalUser(client, userPointResult.rows[0]?.global_user_id, tx.round_label);

        await client.query('COMMIT');

        res.json({
            success: true,
            approved_count: approvedCount,
            current_round_points: currentRoundPoints,
            guess_credits_remaining: getGuessCreditsFromPoints(currentRoundPoints),
            can_guess_lottery: isRoundOpen() && getGuessCreditsFromPoints(currentRoundPoints) > 0,
            message: `อนุมัติสำเร็จ — ลูกค้าได้รับ 1 พ้อย ตอนนี้เหลือ ${currentRoundPoints} พ้อยในรอบนี้`
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Approve error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอนุมัติ' });
    } finally {
        client.release();
    }
});

// PUT /api/history/:id/reject — reject a pending transaction
app.put('/api/history/:id/reject', requireAuth, async (req, res) => {
    const txId = parseInt(req.params.id, 10);
    if (isNaN(txId)) return res.status(400).json({ error: 'Invalid ID' });

    const { reason } = req.body || {};
    try {
        const result = await pool.query(
            `UPDATE transactions SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), reject_reason = $2
             WHERE id = $3 AND status = 'pending'
             RETURNING *`,
            [req.adminUserId, reason || null, txId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'ไม่พบรายการหรือรายการถูกตรวจสอบแล้ว' });
        }
        res.json({ success: true, message: 'ปฏิเสธรายการเรียบร้อย' });
    } catch (err) {
        console.error('Reject error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการปฏิเสธ' });
    }
});

// ============ LOTTERY GUESS API ============

// POST /api/lottery/guess — customer guesses a 2-digit number
app.post('/api/lottery/guess', async (req, res) => {
    const { guess_number, platform } = req.body;
    // Accept platform_id or legacy line_uid
    const platform_id = req.body.platform_id || req.body.line_uid;
    const plat = platform || 'line';
    if (!platform_id || !guess_number) {
        return res.status(400).json({ error: 'กรุณาระบุ platform_id และ guess_number' });
    }
    if (!/^\d{2}$/.test(guess_number)) {
        return res.status(400).json({ error: 'เลขทายต้องเป็น 2 หลัก (00-99)' });
    }

    const roundLabel = getCurrentRoundLabel();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (!isRoundOpen()) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'รอบนี้ปิดรับทายเลขแล้ว กรุณารอรอบประกาศถัดไป' });
        }

        // Get user
        const userResult = await client.query(
            'SELECT id, global_user_id, platform, platform_id, display_name FROM users WHERE platform = $1 AND platform_id = $2',
            [plat, platform_id]
        );
        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
        }
        const user = userResult.rows[0];
        const userId = user.id;

        if (!user.global_user_id) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'ผู้ใช้นี้ยังไม่มี global_user_id จึงยังใช้พ้อยทายเลขไม่ได้' });
        }

        const availableGuessPoints = await getRoundPointsForGlobalUser(client, user.global_user_id, roundLabel);
        if (availableGuessPoints < 5) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                error: `พ้อยไม่พอสำหรับทายเลข ต้องใช้ 5 พ้อยต่อ 1 เลข ตอนนี้เหลือ ${Math.max(availableGuessPoints, 0)} พ้อย`
            });
        }

        const existingGuess = await client.query(
            'SELECT id FROM lottery_guesses WHERE user_id = $1 AND round_label = $2 AND guess_number = $3',
            [userId, roundLabel, guess_number]
        );
        if (existingGuess.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'คุณทายเลขนี้ในรอบนี้แล้ว กรุณาเลือกเลขอื่น' });
        }

        // Check if number is sold out
        const soldCheck = await client.query(
            'SELECT id FROM sold_out WHERE number = $1 AND round_label = $2',
            [parseInt(guess_number, 10), roundLabel]
        );
        if (soldCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'เลขนี้ถูกจองแล้ว กรุณาเลือกเลขอื่น' });
        }

        // Insert guess
        const guessResult = await client.query(
            `INSERT INTO lottery_guesses (user_id, guess_number, round_label)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [userId, guess_number, roundLabel]
        );

        await client.query(
            `INSERT INTO points (global_user_id, activity_type, points, source_platform, source_oa_id, metadata)
             VALUES ($1, 'lottery_guess_spend', -5, $2, NULL, $3)`,
            [
                user.global_user_id,
                user.platform || 'line',
                JSON.stringify({
                    lottery_guess_id: String(guessResult.rows[0].id),
                    guess_number,
                    round_label: roundLabel,
                    platform_id: user.platform_id,
                    display_name: user.display_name || null,
                    event_type: 'lottery_guess_spend'
                })
            ]
        );

        const remainingPoints = await getRoundPointsForGlobalUser(client, user.global_user_id, roundLabel);

        await client.query('COMMIT');

        res.json({
            success: true,
            guess: guessResult.rows[0],
            remaining_points: remainingPoints,
            guess_credits_remaining: getGuessCreditsFromPoints(remainingPoints),
            message: `ทายเลข ${guess_number} สำเร็จ ใช้ไป 5 พ้อย ตอนนี้เหลือ ${remainingPoints} พ้อย`
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Lottery guess error:', err);
        if (err.code === '23505') {
            return res.status(409).json({ error: 'คุณทายเลขนี้ในรอบนี้แล้ว กรุณาเลือกเลขอื่น' });
        }
        res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    } finally {
        client.release();
    }
});

// ============ ADMIN: ANNOUNCE DRAW RESULT ============

// POST /api/draw — announce winning number for a round
app.post('/api/draw', requireAuth, async (req, res) => {
    const { winningNumber, drawDateLabel } = req.body;
    if (!winningNumber || !/^\d{2}$/.test(winningNumber)) {
        return res.status(400).json({ error: 'กรุณากรอกเลข 2 หลัก (00-99)' });
    }

    const roundLabel = drawDateLabel ? drawDateLabelToRoundLabel(drawDateLabel) : getCurrentRoundLabel();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get all pending guesses for this round
        const guesses = await client.query(
            `SELECT lg.id, lg.user_id, lg.guess_number, u.display_name
             FROM lottery_guesses lg
             JOIN users u ON u.id = lg.user_id
             WHERE lg.round_label = $1 AND lg.result = 'pending'`,
            [roundLabel]
        );

        const winners = [];
        const losers = [];

        for (const g of guesses.rows) {
            if (g.guess_number === winningNumber) {
                await client.query(
                    `UPDATE lottery_guesses SET result = 'won', reward_amount = $1
                     WHERE id = $2`,
                    [CASHBACK_REWARD_AMOUNT, g.id]
                );
                winners.push(g.display_name);
            } else {
                await client.query(
                    `UPDATE lottery_guesses SET result = 'lost', reward_amount = $1
                     WHERE id = $2`,
                    [GV_REWARD_AMOUNT, g.id]
                );
                losers.push(g.display_name);
            }
        }

        await client.query('COMMIT');

        res.json({
            winningNumber,
            drawDateLabel: drawDateLabel || roundLabel,
            roundLabel,
            winners,
            losers,
            totalGuesses: guesses.rows.length,
            message: winners.length > 0
                ? `มีผู้ถูกรางวัล ${winners.length} คน!`
                : `ไม่มีผู้ถูกรางวัล — ทุกคนได้รับ GV ${GV_REWARD_AMOUNT} บาท`
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Draw announce error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการประกาศผล' });
    } finally {
        client.release();
    }
});

// Helper: convert Thai draw date label to round_label format
// e.g. "16 เมษายน 2569" → "2026-04-B", "1 พฤษภาคม 2569" → "2026-05-A"
function drawDateLabelToRoundLabel(label) {
    const thaiMonthsFull = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                             'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const parts = label.trim().split(/\s+/);
    if (parts.length < 3) return getCurrentRoundLabel();

    const day = parseInt(parts[0], 10);
    const monthIdx = thaiMonthsFull.indexOf(parts[1]);
    const thaiYear = parseInt(parts[2], 10);

    if (isNaN(day) || monthIdx === -1 || isNaN(thaiYear)) return getCurrentRoundLabel();

    const ceYear = thaiYear - 543;
    const monthStr = String(monthIdx + 1).padStart(2, '0');

    // Draw on 16th → results for Round A (days 1-14), Draw on 1st → results for Round B of prev month
    if (day === 16) {
        return `${ceYear}-${monthStr}-A`;
    } else if (day === 1) {
        // Round B of previous month
        const prevMonth = monthIdx === 0 ? 12 : monthIdx; // monthIdx is 0-based
        const prevYear = monthIdx === 0 ? ceYear - 1 : ceYear;
        return `${prevYear}-${String(prevMonth).padStart(2, '0')}-B`;
    }
    return getCurrentRoundLabel();
}

// ============ HISTORY API (for Admin Dashboard) ============

// GET /api/history — all transactions with user & staff info (for admin)
app.get('/api/history', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT *
             FROM (
                SELECT
                    'transaction'::text AS history_type,
                    t.id,
                    t.user_id,
                    t.created_at,
                    t.service_date,
                    t.status AS approved,
                    t.slip_image_url,
                    t.round_label,
                    t.reject_reason,
                    u.display_name AS customer_name,
                    u.platform,
                    u.platform_id,
                    s.name AS staff_name,
                    s.nickname AS staff_nickname,
                    NULL::text AS guess_number,
                    NULL::text AS lottery_result,
                    NULL::numeric(10,2) AS reward_amount
                FROM transactions t
                JOIN users u ON u.id = t.user_id
                JOIN staffs s ON s.id = t.staff_id

                UNION ALL

                SELECT
                    'guess'::text AS history_type,
                    lg.id,
                    lg.user_id,
                    lg.created_at,
                    NULL::date AS service_date,
                    'approved'::text AS approved,
                    NULL::text AS slip_image_url,
                    lg.round_label,
                    NULL::text AS reject_reason,
                    u.display_name AS customer_name,
                    u.platform,
                    u.platform_id,
                    NULL::text AS staff_name,
                    NULL::text AS staff_nickname,
                    lg.guess_number,
                    lg.result AS lottery_result,
                    lg.reward_amount
                FROM lottery_guesses lg
                JOIN users u ON u.id = lg.user_id
             ) history_rows
             ORDER BY created_at DESC, id DESC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error('History fetch error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดประวัติได้' });
    }
});

// DELETE /api/history/:id — delete a transaction (admin)
app.delete('/api/history/:id', requireAuth, async (req, res) => {
    const txId = parseInt(req.params.id, 10);
    if (isNaN(txId)) return res.status(400).json({ error: 'Invalid ID' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const txResult = await client.query(
            `SELECT id, user_id, round_label, staff_id, status
             FROM transactions
             WHERE id = $1
             FOR UPDATE`,
            [txId]
        );
        const tx = txResult.rows[0];
        if (!tx) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'ไม่พบรายการ' });
        }

        await client.query('DELETE FROM transactions WHERE id = $1', [txId]);
        if (tx.status === 'approved') {
            await removeApprovedTransactionPoint(client, tx.user_id, txId);
        }
        const syncResult = await syncUserRoundState(client, tx.user_id, tx.round_label);
        let revokedGuessCount = 0;

        if (tx.status === 'approved' && tx.round_label === getCurrentRoundLabel()) {
            const userResult = await client.query('SELECT global_user_id FROM users WHERE id = $1', [tx.user_id]);
            const reconcileResult = await reconcileRoundGuessBalance(client, tx.user_id, userResult.rows[0]?.global_user_id, tx.round_label);
            revokedGuessCount = reconcileResult.revokedGuessCount;
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            current_round_progress: syncResult.currentApprovedCount,
            affected_round_progress: syncResult.affectedApprovedCount,
            revoked_lottery_guess: revokedGuessCount > 0
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Delete history error:', err);
        res.status(500).json({ error: 'ไม่สามารถลบรายการได้' });
    } finally {
        client.release();
    }
});

// GET /api/history/pending/count
app.get('/api/history/pending/count', async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*)::int AS count FROM transactions WHERE status = 'pending'");
        res.json({ count: result.rows[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ SOLD OUT API ============

// GET /api/sold-out — list sold-out numbers for current round
app.get('/api/sold-out', async (req, res) => {
    const roundLabel = getCurrentRoundLabel();
    try {
        const result = await pool.query(
            'SELECT number FROM sold_out WHERE round_label = $1 ORDER BY number',
            [roundLabel]
        );
        res.json(result.rows.map(r => r.number));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sold-out — add sold-out number
app.post('/api/sold-out', requireAuth, async (req, res) => {
    const { number } = req.body;
    if (number == null || number < 0 || number > 99) {
        return res.status(400).json({ error: 'กรุณากรอกเลข 0-99' });
    }
    const roundLabel = getCurrentRoundLabel();
    try {
        await pool.query(
            'INSERT INTO sold_out (number, round_label) VALUES ($1, $2) ON CONFLICT (number, round_label) DO NOTHING',
            [number, roundLabel]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/sold-out/:number — remove sold-out number
app.delete('/api/sold-out/:number', requireAuth, async (req, res) => {
    const number = parseInt(req.params.number, 10);
    const roundLabel = getCurrentRoundLabel();
    try {
        await pool.query('DELETE FROM sold_out WHERE number = $1 AND round_label = $2', [number, roundLabel]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ ROUND INFO API ============

app.get('/api/round', (req, res) => {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth();
    const year = now.getFullYear();
    const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                         'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const thaiMonthsFull = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                             'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

    const roundLabel = getCurrentRoundLabel();
    const open = isRoundOpen();

    let round, drawDate;
    if (day >= 1 && day <= 14) {
        round = 'A'; // Round A
        drawDate = `16 ${thaiMonths[month]} ${year + 543}`;
    } else if (day >= 16 && day <= 29) {
        round = 'B'; // Round B
        const nm = (month + 1) % 12;
        const ny = month === 11 ? year + 1 : year;
        drawDate = `1 ${thaiMonths[nm]} ${ny + 543}`;
    } else {
        round = '—';
        drawDate = day === 15
            ? `16 ${thaiMonths[month]} ${year + 543}`
            : `1 ${thaiMonths[(month + 1) % 12]} ${(month === 11 ? year + 1 : year) + 543}`;
    }

    // Next draw date info
    let nextDrawDay, nextDrawMonth, nextDrawYear;
    if (day <= 15) {
        nextDrawDay = 16; nextDrawMonth = month; nextDrawYear = year;
    } else {
        const nm2 = (month + 1) % 12;
        nextDrawDay = 1; nextDrawMonth = nm2; nextDrawYear = month === 11 ? year + 1 : year;
    }
    const drawLabel = `งวดวันที่ ${nextDrawDay} ${thaiMonthsFull[nextDrawMonth]} ${nextDrawYear + 543}`;

    // Build 24 draw dates for พ.ศ. 2569 (2026)
    const drawDates = [];
    for (let m = 0; m < 12; m++) {
        drawDates.push({ day: 1, month: m + 1, year: 2569, label: `1 ${thaiMonthsFull[m]} 2569` });
        drawDates.push({ day: 16, month: m + 1, year: 2569, label: `16 ${thaiMonthsFull[m]} 2569` });
    }

    res.json({
        round,
        roundLabel,
        open,
        drawDate,
        drawLabel,
        drawDates,
        nextDraw: { day: nextDrawDay, month: nextDrawMonth + 1, year: nextDrawYear + 543 },
        day,
        month: month + 1,
        year
    });
});

// ============ GUESS CHART API ============

app.get('/api/stats/guesses-by-number', async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'กรุณาระบุ startDate และ endDate' });
    }
    try {
        const result = await pool.query(
            `SELECT guess_number AS number, COUNT(*)::int AS count
             FROM lottery_guesses
             WHERE created_at >= $1::date
               AND created_at < ($2::date + INTERVAL '1 day')
             GROUP BY guess_number
             ORDER BY count DESC, guess_number`,
            [startDate, endDate]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ STATS API ============

app.get('/api/stats', async (req, res) => {
    const roundLabel = getCurrentRoundLabel();
    try {
        const [soldOut, totalUsers, pending, totalTx] = await Promise.all([
            pool.query('SELECT COUNT(*)::int AS count FROM sold_out WHERE round_label = $1', [roundLabel]),
            pool.query('SELECT COUNT(*)::int AS count FROM users'),
            pool.query("SELECT COUNT(*)::int AS count FROM transactions WHERE status = 'pending'"),
            pool.query('SELECT COUNT(*)::int AS count FROM transactions')
        ]);
        res.json({
            totalSlots: 100,
            soldSlots: soldOut.rows[0].count,
            availableSlots: 100 - soldOut.rows[0].count,
            totalUsers: totalUsers.rows[0].count,
            pendingCount: pending.rows[0].count,
            totalTransactions: totalTx.rows[0].count
        });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดสถิติได้' });
    }
});

app.get('/api/admin/users', requireAuth, async (req, res) => {
    const search = String(req.query.search || '').trim();
    const platform = String(req.query.platform || 'all').trim().toLowerCase();
    if (!['all', 'line'].includes(platform)) {
        return res.status(400).json({ error: 'platform filter ต้องเป็น all หรือ line เท่านั้น' });
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;
    const like = `%${search}%`;
    const currentRoundLabel = getCurrentRoundLabel();

    try {
        const customerRankResetDate = await getCustomerRankResetDate();
        const [summaryResult, usersResult] = await Promise.all([
            pool.query(
                `SELECT
                    COUNT(*)::int AS total_accounts,
                    COUNT(*) FILTER (WHERE u.platform = 'line')::int AS line_accounts,
                    COUNT(*) FILTER (
                        WHERE EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = u.id)
                    )::int AS active_accounts
                 FROM users u
                 WHERE u.platform = 'line'
                   AND ($1 = '' OR u.display_name ILIKE $2 OR u.platform_id ILIKE $2 OR COALESCE(u.global_user_id::text, '') ILIKE $2)
                   AND ($3 = 'all' OR u.platform = $3)`,
                [search, like, platform]
            ),
            pool.query(
                `WITH reward_claim_totals AS (
                    SELECT
                        lottery_guess_id,
                        COALESCE(SUM(amount), 0)::numeric(10,2) AS redeemed_amount
                    FROM lottery_reward_claims
                    GROUP BY lottery_guess_id
                ),
                user_rows AS (
                    SELECT
                        u.id,
                        u.global_user_id,
                        u.platform,
                        u.platform_id,
                        u.display_name,
                        u.picture_url,
                        u.created_at,
                        u.updated_at,
                        COALESCE((
                            SELECT COUNT(DISTINCT t2.staff_id)::int
                            FROM transactions t2
                            WHERE t2.user_id = u.id AND t2.round_label = $6 AND t2.status = 'approved'
                        ), 0) AS current_round_progress,
                        COUNT(t.id)::int AS transaction_count,
                        COALESCE(SUM(CASE WHEN t.status = 'approved' THEN 1 ELSE 0 END), 0)::int AS approved_count,
                        COALESCE(SUM(CASE
                            WHEN t.status = 'approved'
                             AND ($7::date IS NULL OR COALESCE(t.service_date, t.created_at::date) >= $7::date)
                            THEN 1 ELSE 0
                        END), 0)::int AS rank_approved_count,
                        COALESCE(SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END), 0)::int AS pending_count,
                        COALESCE((
                            SELECT SUM(p.points)::int
                            FROM points p
                            WHERE p.global_user_id = u.global_user_id
                        ), 0) AS total_points,
                        COALESCE((
                            SELECT SUM(GREATEST(COALESCE(lg.reward_amount, 0) - COALESCE(rct.redeemed_amount, 0), 0))
                            FROM lottery_guesses lg
                            LEFT JOIN reward_claim_totals rct ON rct.lottery_guess_id = lg.id
                            WHERE lg.user_id = u.id AND lg.result = 'won'
                        ), 0)::numeric(10,2) AS cashback_remaining,
                        COALESCE((
                            SELECT SUM(GREATEST(COALESCE(lg.reward_amount, 0) - COALESCE(rct.redeemed_amount, 0), 0))
                            FROM lottery_guesses lg
                            LEFT JOIN reward_claim_totals rct ON rct.lottery_guess_id = lg.id
                            WHERE lg.user_id = u.id AND lg.result = 'lost'
                        ), 0)::numeric(10,2) AS gv_remaining,
                        MAX(COALESCE(t.service_date::timestamp, t.created_at)) AS last_activity_at
                                        FROM users u
                    LEFT JOIN transactions t ON t.user_id = u.id
                                        WHERE u.platform = 'line'
                                            AND ($1 = '' OR u.display_name ILIKE $2 OR u.platform_id ILIKE $2 OR COALESCE(u.global_user_id::text, '') ILIKE $2)
                      AND ($3 = 'all' OR u.platform = $3)
                    GROUP BY u.id, u.global_user_id, u.platform, u.platform_id, u.display_name, u.picture_url, u.created_at, u.updated_at
                )
                SELECT *
                FROM user_rows
                ORDER BY COALESCE(last_activity_at, created_at) DESC, created_at DESC
                LIMIT $4 OFFSET $5`,
                [search, like, platform, limit, offset, currentRoundLabel, customerRankResetDate]
            )
        ]);

        const usersWithGuessPoints = await Promise.all(
            usersResult.rows.map(async (row) => ({
                ...row,
                rank_reset_date: customerRankResetDate,
                current_round_points: await getRoundPointsForGlobalUser(pool, row.global_user_id)
            }))
        );

        const totalItems = summaryResult.rows[0]?.total_accounts || 0;
        const totalPages = totalItems > 0 ? Math.ceil(totalItems / limit) : 1;

        res.json({
            summary: summaryResult.rows[0],
            users: usersWithGuessPoints,
            pagination: {
                page,
                limit,
                total_items: totalItems,
                total_pages: totalPages,
                has_prev: page > 1,
                has_next: page < totalPages
            }
        });
    } catch (err) {
        console.error('Admin users list error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้' });
    }
});

app.get('/api/admin/users/:id', requireAuth, async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid ID' });

    const client = await pool.connect();
    try {
        const userResult = await client.query(
            `SELECT id, global_user_id, platform, platform_id, display_name, picture_url, progress_count, created_at, updated_at
             FROM users
             WHERE id = $1`,
            [userId]
        );
        const user = userResult.rows[0];
        if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

        let linkedAccounts = [user];
        if (user.global_user_id) {
            const linkedResult = await client.query(
                `SELECT id, global_user_id, platform, platform_id, display_name, picture_url, progress_count, created_at, updated_at
                 FROM users
                 WHERE global_user_id = $1
                   AND platform = 'line'
                 ORDER BY created_at ASC`,
                [user.global_user_id]
            );
            linkedAccounts = linkedResult.rows;
        }

        const linkedUserIds = linkedAccounts.map((account) => account.id);
        const customerRankResetDate = await getCustomerRankResetDate();
        const [statsResult, lotteryResult, recentTransactionsResult] = await Promise.all([
            client.query(
                `SELECT
                    COUNT(*)::int AS transaction_count,
                    COALESCE(SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END), 0)::int AS approved_count,
                    COALESCE(SUM(CASE
                        WHEN status = 'approved'
                         AND ($2::date IS NULL OR COALESCE(service_date, created_at::date) >= $2::date)
                        THEN 1 ELSE 0
                    END), 0)::int AS rank_approved_count,
                    COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0)::int AS pending_count,
                    COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0)::int AS rejected_count,
                    MAX(COALESCE(service_date::timestamp, created_at)) AS last_activity_at
                 FROM transactions
                 WHERE user_id = ANY($1::int[])`,
                [linkedUserIds, customerRankResetDate]
            ),
            client.query(
                `SELECT COUNT(*)::int AS lottery_guess_count
                 FROM lottery_guesses
                 WHERE user_id = ANY($1::int[])`,
                [linkedUserIds]
            ),
            client.query(
                `SELECT
                    t.id,
                    t.status,
                    t.service_date,
                    t.created_at,
                    COALESCE(s.nickname, s.name, '—') AS staff_name,
                    u.platform,
                    u.platform_id
                 FROM transactions t
                 JOIN users u ON u.id = t.user_id
                 LEFT JOIN staffs s ON s.id = t.staff_id
                 WHERE t.user_id = ANY($1::int[])
                 ORDER BY COALESCE(t.service_date::timestamp, t.created_at) DESC
                 LIMIT 10`,
                [linkedUserIds]
            )
        ]);

        const currentProgressCount = await getCurrentRoundApprovedCountForUsers(linkedUserIds);
        const rewardSnapshot = await getRewardManagementSnapshot(client, {
            userIds: linkedUserIds,
            onlyOutstanding: false,
            rewardLimit: 30,
            claimLimit: 20
        });
        const guessPointCycle = await getGuessPointCycleConfig(client);

        let totalPoints = 0;
        let recentPoints = [];
        let currentRoundPoints = 0;

        if (user.global_user_id && await tableExists(client, 'points')) {
            totalPoints = await getTotalPointsForGlobalUser(client, user.global_user_id);
            currentRoundPoints = await getRoundPointsForGlobalUser(client, user.global_user_id);
            recentPoints = await getRecentPointsForGlobalUser(client, user.global_user_id, 10);
        }

        res.json({
            user: {
                ...user,
                current_round_progress: currentProgressCount,
                linked_account_count: linkedAccounts.length
            },
            stats: {
                ...statsResult.rows[0],
                lottery_guess_count: lotteryResult.rows[0]?.lottery_guess_count || 0,
                total_points: totalPoints,
                rank_reset_date: customerRankResetDate,
                current_round_points: currentRoundPoints,
                guess_point_cycle_start_date: guessPointCycle.start_date,
                guess_point_cycle_end_date: guessPointCycle.end_date,
                current_round_guess_credits: getGuessCreditsFromPoints(currentRoundPoints),
                redeemable_points: currentRoundPoints,
                reward_open_count: rewardSnapshot.summary.open_rewards,
                reward_claim_count: rewardSnapshot.summary.claim_count,
                cashback_remaining: rewardSnapshot.summary.cashback_remaining,
                gv_remaining: rewardSnapshot.summary.gv_remaining
            },
            linkedAccounts,
            recentPoints,
            recentTransactions: recentTransactionsResult.rows,
            rewardSummary: rewardSnapshot.summary,
            rewardRows: rewardSnapshot.rewards,
            recentRewardClaims: rewardSnapshot.recentClaims
        });
    } catch (err) {
        console.error('Admin user detail error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดรายละเอียดผู้ใช้ได้' });
    } finally {
        client.release();
    }
});

app.get('/api/admin/guess-points/cycle', requireAuth, async (req, res) => {
    try {
        const cycle = await getGuessPointCycleConfig(pool);
        res.json(cycle);
    } catch (err) {
        console.error('Get guess point cycle error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดรอบสะสมแต้มทายเลขได้' });
    }
});

app.post('/api/admin/guess-points/cycle', requireAuth, async (req, res) => {
    const { start_date } = req.body || {};
    if (!start_date || !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
        return res.status(400).json({ error: 'กรุณาระบุวันที่เริ่มนับแต้ม (YYYY-MM-DD)' });
    }

    try {
        await pool.query(
            `INSERT INTO app_settings (key, value, updated_at)
             VALUES ('guess_points_cycle_start_date', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
            [start_date]
        );
        const cycle = await getGuessPointCycleConfig(pool);
        res.json({ success: true, ...cycle });
    } catch (err) {
        console.error('Save guess point cycle error:', err);
        res.status(500).json({ error: 'ไม่สามารถบันทึกรอบสะสมแต้มทายเลขได้' });
    }
});

app.put('/api/admin/users/:id', requireAuth, async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid ID' });

    const { display_name, picture_url } = req.body || {};
    if (display_name === undefined && picture_url === undefined) {
        return res.status(400).json({ error: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userResult = await client.query('SELECT id, global_user_id FROM users WHERE id = $1', [userId]);
        const user = userResult.rows[0];
        if (!user) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
        }

        const idsResult = user.global_user_id
            ? await client.query('SELECT id FROM users WHERE global_user_id = $1', [user.global_user_id])
            : { rows: [{ id: user.id }] };
        const targetIds = idsResult.rows.map((row) => row.id);

        const setClauses = [];
        const values = [];
        let index = 1;

        if (display_name !== undefined) {
            const trimmedName = String(display_name).trim();
            if (!trimmedName) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'ชื่อผู้ใช้ห้ามว่าง' });
            }
            setClauses.push(`display_name = $${index++}`);
            values.push(trimmedName);
        }

        if (picture_url !== undefined) {
            const trimmedUrl = String(picture_url).trim();
            setClauses.push(`picture_url = $${index++}`);
            values.push(trimmedUrl || null);
        }

        setClauses.push('updated_at = NOW()');
        values.push(targetIds);

        await client.query(
            `UPDATE users
             SET ${setClauses.join(', ')}
             WHERE id = ANY($${index}::int[])`,
            values
        );

        await client.query('COMMIT');
        res.json({ success: true, updated_count: targetIds.length });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Admin user update error:', err);
        res.status(500).json({ error: 'ไม่สามารถอัปเดตข้อมูลผู้ใช้ได้' });
    } finally {
        client.release();
    }
});

app.delete('/api/admin/users/:id', requireAuth, async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid ID' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const userResult = await client.query(
            'SELECT id, global_user_id, display_name FROM users WHERE id = $1',
            [userId]
        );
        const user = userResult.rows[0];
        if (!user) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
        }

        const linkedUsersResult = user.global_user_id
            ? await client.query('SELECT id FROM users WHERE global_user_id = $1', [user.global_user_id])
            : { rows: [{ id: user.id }] };
        const targetIds = linkedUsersResult.rows.map((row) => row.id);

        if (user.global_user_id && await tableExists(client, 'points')) {
            await client.query('DELETE FROM points WHERE global_user_id = $1', [user.global_user_id]);
        }

        if (targetIds.length) {
            await client.query('DELETE FROM lottery_reward_claims WHERE user_id = ANY($1::int[])', [targetIds]);
        }

        await client.query('DELETE FROM users WHERE id = ANY($1::int[])', [targetIds]);

        await client.query('COMMIT');
        res.json({
            success: true,
            deleted_count: targetIds.length,
            deleted_display_name: user.display_name
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Admin user delete error:', err);
        res.status(500).json({ error: 'ไม่สามารถลบผู้ใช้ได้' });
    } finally {
        client.release();
    }
});

// ============ UNIFIED IDENTITY HELPERS ============
// LINE Login OAuth helpers (สำหรับ LIFF callback / server-side OAuth)

const LINE_OAUTH_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';
const LINE_PROFILE_URL = 'https://api.line.me/v2/profile';

async function exchangeLineCodeForToken(code, redirectUri) {
    const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
    const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
    if (!channelId || !channelSecret) {
        throw new Error('LINE_LOGIN_CHANNEL_ID and LINE_LOGIN_CHANNEL_SECRET are required');
    }
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri || process.env.LINE_REDIRECT_URI || '',
        client_id: channelId,
        client_secret: channelSecret
    });
    const resp = await fetch(LINE_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });
    if (!resp.ok) throw new Error(`LINE token exchange failed: ${await resp.text()}`);
    return resp.json();
}

async function fetchLineProfile(accessToken) {
    const resp = await fetch(LINE_PROFILE_URL, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!resp.ok) throw new Error(`LINE profile fetch failed: ${await resp.text()}`);
    return resp.json();
}

// Upsert user by LINE login user id → returns row with global_user_id
async function upsertUserByLineLogin(client, profile) {
    const result = await client.query(
        `INSERT INTO users (platform, platform_id, display_name, picture_url)
         VALUES ('line', $1, $2, $3)
         ON CONFLICT (platform, platform_id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            picture_url = EXCLUDED.picture_url,
            updated_at = NOW()
         RETURNING *`,
        [profile.userId, profile.displayName || '', profile.pictureUrl || null]
    );
    return result.rows[0];
}

// ============ LINE OAUTH CALLBACK ============

// GET /auth/line/callback — OAuth2 callback from LINE Login
// LIFF usually handles this client-side, but this supports server-side flow too.
app.get('/auth/line/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    try {
        const tokenResult = await exchangeLineCodeForToken(code);
        const profile = await fetchLineProfile(tokenResult.access_token);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const user = await upsertUserByLineLogin(client, profile);
            await client.query('COMMIT');
            // Redirect back to app with state (or return JSON)
            if (state === 'json') {
                return res.json({ success: true, user });
            }
            res.redirect(`/?login=success&uid=${encodeURIComponent(profile.userId)}`);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('LINE OAuth callback error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ POINTS / ACTIVITY API ============

// POST /api/points/activity — บวกแต้มจากกิจกรรม + forward ไปบริษัท
app.post('/api/points/activity', async (req, res) => {
    const {
        platform_id, platform,
        display_name, picture_url,
        activityType, points: pointAmount, metadata
    } = req.body;

    const plat = platform || 'line';
    if (!platform_id || !activityType || !Number.isInteger(pointAmount)) {
        return res.status(400).json({
            error: 'platform_id, activityType and integer points are required'
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Upsert user (works with existing schema)
        const userResult = await client.query(
            `INSERT INTO users (platform, platform_id, display_name, picture_url)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (platform, platform_id) DO UPDATE SET
                display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), users.display_name),
                picture_url = COALESCE(EXCLUDED.picture_url, users.picture_url),
                updated_at = NOW()
             RETURNING *`,
            [plat, platform_id, display_name || '', picture_url || null]
        );
        const user = userResult.rows[0];

        // Insert points record
        const pointResult = await client.query(
            `INSERT INTO points (global_user_id, activity_type, points, source_platform, source_oa_id, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                user.global_user_id,
                activityType,
                pointAmount,
                plat,
                null,
                JSON.stringify({
                    ...(metadata || {}),
                    round_label: metadata?.round_label || getCurrentRoundLabel(),
                    event_type: metadata?.event_type || activityType
                })
            ]
        );

        await client.query('COMMIT');

        // Forward to company webhook (fire-and-forget)
        const companyWebhookUrl = process.env.COMPANY_WEBHOOK_URL;
        if (companyWebhookUrl) {
            const companyPayload = {
                eventType: 'POINTS_ADDED',
                globalUserId: user.global_user_id,
                platformId: user.platform_id,
                platform: user.platform,
                activityType,
                points: pointAmount,
                pointTxnId: pointResult.rows[0].id,
                timestamp: new Date().toISOString()
            };
            fetch(companyWebhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Token': process.env.COMPANY_WEBHOOK_TOKEN || ''
                },
                body: JSON.stringify(companyPayload)
            }).catch(err => console.error('Company webhook error:', err.message));
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                global_user_id: user.global_user_id,
                platform: user.platform,
                platform_id: user.platform_id,
                display_name: user.display_name
            },
            point: pointResult.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Points activity error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// GET /api/points/:global_user_id — ดูยอดคะแนนสะสม
app.get('/api/points/:global_user_id', async (req, res) => {
    const { global_user_id } = req.params;
    try {
        const result = await pool.query(
            `SELECT
                COALESCE(SUM(points), 0)::int AS total_points,
                COUNT(*)::int AS total_activities,
                MAX(created_at) AS last_activity
             FROM points
             WHERE global_user_id = $1`,
            [global_user_id]
        );
        const recent = await pool.query(
            `SELECT id, activity_type, points, source_platform, source_oa_id, created_at
             FROM points WHERE global_user_id = $1
             ORDER BY created_at DESC LIMIT 20`,
            [global_user_id]
        );
        res.json({
            global_user_id,
            ...result.rows[0],
            recent: recent.rows
        });
    } catch (err) {
        console.error('Points fetch error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดคะแนนได้' });
    }
});

// ============ COMPANY WEBHOOK RECEIVER ============

// POST /api/company/activity — บริษัทส่ง event กลับมาเพื่อ reply ลูกค้า
app.post('/api/company/activity', (req, res, next) => {
    // Verify webhook token
    const expected = process.env.COMPANY_WEBHOOK_TOKEN || '';
    if (expected) {
        const actual = req.headers['x-webhook-token'];
        if (actual !== expected) {
            return res.status(401).json({ error: 'Invalid webhook token' });
        }
    }
    next();
}, async (req, res) => {
    const event = req.body;
    try {
        res.json({
            success: true,
            channel: 'none',
            info: 'Customer push-back is disabled in the LINE-only workflow'
        });
    } catch (error) {
        console.error('Company activity error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ LEGACY TELEGRAM / UNIFIED ROUTES (DISABLED) ============

// POST /api/telegram/send — disabled in LINE-only workflow
app.post('/api/telegram/send', async (req, res) => {
    return res.status(410).json({ error: 'ปิดการทำงาน Telegram ในระบบ LINE-only แล้ว' });
});

// ============ UNIFIED PROFILE API ============

// GET /api/unified/profile — disabled in LINE-only workflow
app.get('/api/unified/profile', async (req, res) => {
    return res.status(410).json({ error: 'ปิด unified profile API ในระบบ LINE-only แล้ว' });
});

// ============ START SERVER ============

async function startServer() {
    await ensureDatabaseStructure();
    const migrationStartup = await migrateAssetsToR2OnStartup();

    if (!migrationStartup.skipped) {
        const movedRows = migrationStartup.migration?.migrated_rows || 0;
        const uploadedFiles = migrationStartup.migration?.uploaded_files || 0;
        const remainingLocal = migrationStartup.summary?.counts?.local_existing || 0;
        const missingLocal = migrationStartup.summary?.counts?.local_missing || 0;

        console.log(
            `R2 startup migration: migrated_rows=${movedRows}, uploaded_files=${uploadedFiles}, local_remaining=${remainingLocal}, local_missing=${missingLocal}`
        );
    }

    app.listen(PORT, () => {
        console.log(`Kiss Me Ranking server running at http://localhost:${PORT}`);
        console.log(`Admin login route: ${ADMIN_LOGIN_ROUTE} (panel: ${ADMIN_PANEL_ROUTE})`);
    });
}

startServer().catch(err => {
    console.error('Server startup failed:', err);
    process.exit(1);
});
