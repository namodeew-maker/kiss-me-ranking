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

// ============ CLOUDFLARE R2 CONFIG ============

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'kissme-uploads';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

const useR2 = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY && R2_SECRET_KEY);

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

// Helper: resolve slip image path for local files
async function resolveSlipUrl(file) {
    if (!file) return null;
    if (useR2) {
        const ext = path.extname(file.originalname);
        const filename = Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
        return uploadToR2(file.buffer, filename, file.mimetype);
    }
    return file.filename; // local: just the filename, served via /uploads/:name
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

app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(uploadsDir));

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

// ============ AUTH ============

const authTokens = new Map();
const TOKEN_EXPIRY_MS = 8 * 60 * 60 * 1000; // 8 hours

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
    next();
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
        const token = crypto.randomBytes(32).toString('hex');
        authTokens.set(token, { username: user.username, userId: user.id, createdAt: Date.now() });
        res.json({ token, username: user.username });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
    }
});

// GET /api/auth/verify
app.get('/api/auth/verify', requireAuth, (req, res) => {
    res.json({ valid: true, username: req.adminUser });
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

// GET /api/ranking/staff — staff ranking by approved transaction count + avg scores
app.get('/api/ranking/staff', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                s.id, s.name, s.nickname, s.avatar_url,
                COUNT(t.id)::int AS total_votes,
                COALESCE(ROUND(AVG(r.looks_score), 1), 0) AS avg_looks,
                COALESCE(ROUND(AVG(r.service_score), 1), 0) AS avg_service,
                COALESCE(ROUND(AVG(r.value_score), 1), 0) AS avg_value,
                COALESCE(ROUND((AVG(r.looks_score) + AVG(r.service_score) + AVG(r.value_score)) / 3, 1), 0) AS avg_overall
            FROM staffs s
            LEFT JOIN transactions t ON t.staff_id = s.id AND t.status = 'approved'
            LEFT JOIN ratings r ON r.transaction_id = t.id
            WHERE s.is_active = TRUE
            GROUP BY s.id, s.name, s.nickname, s.avatar_url
            ORDER BY total_votes DESC, avg_overall DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Staff ranking error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดอันดับพนักงานได้' });
    }
});

// GET /api/ranking/customers — customer ranking by lifetime approved + points
app.get('/api/ranking/customers', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                u.id, u.display_name, u.picture_url, u.platform,
                COUNT(t.id)::int AS total_approved,
                COALESCE((SELECT SUM(p.points)::int FROM points p WHERE p.global_user_id = u.global_user_id), 0) AS total_points
            FROM users u
            LEFT JOIN transactions t ON t.user_id = u.id AND t.status = 'approved'
            GROUP BY u.id, u.display_name, u.picture_url, u.platform, u.global_user_id
            HAVING COUNT(t.id) > 0
            ORDER BY COUNT(t.id) DESC, COALESCE((SELECT SUM(p.points)::int FROM points p WHERE p.global_user_id = u.global_user_id), 0) DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Customer ranking error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดอันดับลูกค้าได้' });
    }
});

// ============ CUSTOMER AUTH (Multi-Platform Login) ============

// POST /api/auth/login — customer login / register from any platform
// Body: { platform, platform_id, display_name, picture_url }
app.post('/api/auth/login', async (req, res) => {
    const { platform, platform_id, display_name, picture_url } = req.body;
    if (!platform_id) {
        return res.status(400).json({ error: 'platform_id is required' });
    }
    const plat = platform || 'line';
    if (!['line', 'telegram'].includes(plat)) {
        return res.status(400).json({ error: 'platform ต้องเป็น line หรือ telegram' });
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
            [plat, platform_id, display_name || '', picture_url || null]
        );
        const user = result.rows[0];
        res.json({
            success: true,
            user: {
                id: user.id,
                platform: user.platform,
                platform_id: user.platform_id,
                display_name: user.display_name,
                picture_url: user.picture_url,
                progress_count: user.progress_count
            }
        });
    } catch (err) {
        console.error('Customer login error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
    }
});

// ============ USER & PROGRESS API ============

// POST /api/users/upsert — create or update user from any platform profile
app.post('/api/users/upsert', async (req, res) => {
    const { platform_id, platform, display_name, picture_url } = req.body;
    // Also accept legacy field name 'line_uid' for backward compat
    const pid = platform_id || req.body.line_uid;
    const plat = platform || 'line';
    if (!pid) {
        return res.status(400).json({ error: 'platform_id is required' });
    }
    if (!['line', 'telegram'].includes(plat)) {
        return res.status(400).json({ error: 'platform ต้องเป็น line หรือ telegram' });
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
// Optional query param: ?platform=line (default) or ?platform=telegram
app.get('/api/users/:platform_id/progress', async (req, res) => {
    const { platform_id } = req.params;
    const platform = req.query.platform || 'line';
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
        const progressResult = await pool.query(
            `SELECT COUNT(DISTINCT staff_id)::int AS approved_count
             FROM transactions
             WHERE user_id = $1 AND round_label = $2 AND status = 'approved'`,
            [user.id, roundLabel]
        );
        const approvedCount = progressResult.rows[0].approved_count;

        // Check if already guessed lottery this round
        const guessResult = await pool.query(
            'SELECT * FROM lottery_guesses WHERE user_id = $1 AND round_label = $2',
            [user.id, roundLabel]
        );

        // List which staffs already visited this round
        const visitedResult = await pool.query(
            `SELECT DISTINCT staff_id FROM transactions
             WHERE user_id = $1 AND round_label = $2 AND status <> 'rejected'`,
            [user.id, roundLabel]
        );

        res.json({
            user_id: user.id,
            display_name: user.display_name,
            picture_url: user.picture_url,
            progress_count: approvedCount,
            round_label: roundLabel,
            can_guess_lottery: approvedCount >= 5,
            already_guessed: guessResult.rows.length > 0,
            lottery_guess: guessResult.rows[0] || null,
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
    const platform = req.query.platform || 'line';
    try {
        // Find user
        const userResult = await pool.query(
            'SELECT id, display_name, picture_url, progress_count, global_user_id FROM users WHERE platform = $1 AND platform_id = $2',
            [platform, platform_id]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
        }
        const user = userResult.rows[0];

        // Transaction history with staff name
        const txResult = await pool.query(
            `SELECT
                t.id,
                t.created_at,
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

        // Total lifetime approved transactions (for rank)
        const lifetimeResult = await pool.query(
            `SELECT COUNT(*)::int AS total_approved FROM transactions WHERE user_id = $1 AND status = 'approved'`,
            [user.id]
        );

        // Total points (if global_user_id exists)
        let totalPoints = 0;
        if (user.global_user_id) {
            const pointsResult = await pool.query(
                `SELECT COALESCE(SUM(points), 0)::int AS total_points FROM points WHERE global_user_id = $1`,
                [user.global_user_id]
            );
            totalPoints = pointsResult.rows[0].total_points;
        }

        res.json({
            user: {
                id: user.id,
                display_name: user.display_name,
                picture_url: user.picture_url,
                progress_count: user.progress_count,
                global_user_id: user.global_user_id
            },
            transactions: txResult.rows,
            guesses: guessResult.rows,
            lifetime_approved: lifetimeResult.rows[0].total_approved,
            total_points: totalPoints
        });
    } catch (err) {
        console.error('User history fetch error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดประวัติได้' });
    }
});

// ============ TRANSACTION (SUBMIT BILL) API ============

// POST /api/transactions — customer submits a bill (slip + staff + ratings)
app.post('/api/transactions', upload.single('slip'), async (req, res) => {
    const { staff_id, looks_score, service_score, value_score, platform } = req.body;
    // Accept platform_id or legacy line_uid
    const platform_id = req.body.platform_id || req.body.line_uid;
    const plat = platform || 'line';

    if (!platform_id || !staff_id) {
        return res.status(400).json({ error: 'กรุณาระบุ platform_id และ staff_id' });
    }
    if (!req.file) {
        return res.status(400).json({ error: 'กรุณาแนบรูปสลิป' });
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

        // Check duplicate staff in same round (only non-rejected)
        const dupCheck = await client.query(
            `SELECT id FROM transactions
             WHERE user_id = $1 AND staff_id = $2 AND round_label = $3 AND status <> 'rejected'`,
            [userId, staffIdNum, roundLabel]
        );
        if (dupCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'คุณเคยแจ้งใช้บริการพนักงานคนนี้ในรอบนี้แล้ว' });
        }

        // Upload slip image
        const slipUrl = await resolveSlipUrl(req.file);

        // Insert transaction
        const txResult = await client.query(
            `INSERT INTO transactions (user_id, staff_id, slip_image_url, round_label, status)
             VALUES ($1, $2, $3, $4, 'pending')
             RETURNING id`,
            [userId, staffIdNum, slipUrl, roundLabel]
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
            return res.status(409).json({ error: 'คุณเคยแจ้งใช้บริการพนักงานคนนี้ในรอบนี้แล้ว' });
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

        // Count approved unique staffs for this user in this round
        const progressResult = await client.query(
            `SELECT COUNT(DISTINCT staff_id)::int AS approved_count
             FROM transactions
             WHERE user_id = $1 AND round_label = $2 AND status = 'approved'`,
            [tx.user_id, tx.round_label]
        );
        const approvedCount = progressResult.rows[0].approved_count;

        // Update user's progress_count
        await client.query(
            'UPDATE users SET progress_count = $1, updated_at = NOW() WHERE id = $2',
            [Math.min(approvedCount, 5), tx.user_id]
        );

        await client.query('COMMIT');

        res.json({
            success: true,
            approved_count: approvedCount,
            can_guess_lottery: approvedCount >= 5,
            message: approvedCount >= 5
                ? 'อนุมัติสำเร็จ — ลูกค้าสะสมครบ 5 คน ปลดล็อกสิทธิ์ทายเลขแล้ว!'
                : `อนุมัติสำเร็จ — ลูกค้าสะสม ${approvedCount}/5 คน`
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

        // Get user
        const userResult = await client.query(
            'SELECT id FROM users WHERE platform = $1 AND platform_id = $2',
            [plat, platform_id]
        );
        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
        }
        const userId = userResult.rows[0].id;

        // Check they have 5 approved unique staffs
        const progressResult = await client.query(
            `SELECT COUNT(DISTINCT staff_id)::int AS approved_count
             FROM transactions
             WHERE user_id = $1 AND round_label = $2 AND status = 'approved'`,
            [userId, roundLabel]
        );
        if (progressResult.rows[0].approved_count < 5) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'ยังสะสมไม่ครบ 5 คน ไม่สามารถทายเลขได้' });
        }

        // Check not already guessed
        const existingGuess = await client.query(
            'SELECT id FROM lottery_guesses WHERE user_id = $1 AND round_label = $2',
            [userId, roundLabel]
        );
        if (existingGuess.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'คุณได้ทายเลขในรอบนี้แล้ว' });
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

        await client.query('COMMIT');

        res.json({
            success: true,
            guess: guessResult.rows[0],
            message: `ทายเลข ${guess_number} สำเร็จ — รอประกาศผล`
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Lottery guess error:', err);
        if (err.code === '23505') {
            return res.status(409).json({ error: 'คุณได้ทายเลขในรอบนี้แล้ว' });
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
                // WINNER: Calculate cashback
                // Sum spending from the 5 approved transactions in this round
                const spendResult = await client.query(
                    `SELECT COUNT(*)::int AS bill_count FROM transactions
                     WHERE user_id = $1 AND round_label = $2 AND status = 'approved'`,
                    [g.user_id, roundLabel]
                );
                // For now, reward_amount = cashback cap = 50,000 (actual spending
                // tracking would require an amount field on transactions).
                // Business rule: Cashback 100% capped at 50,000, then minus 7% tax.
                // We store the GROSS amount; tax is calculated on display.
                const CASHBACK_CAP = 50000;
                const grossReward = CASHBACK_CAP; // TODO: replace with actual sum when amount field is added

                await client.query(
                    `UPDATE lottery_guesses SET result = 'won', reward_amount = $1
                     WHERE id = $2`,
                    [grossReward, g.id]
                );
                winners.push(g.display_name);
            } else {
                // LOSER: Gets GV 500 baht
                const GV_AMOUNT = 500;
                await client.query(
                    `UPDATE lottery_guesses SET result = 'lost', reward_amount = $1
                     WHERE id = $2`,
                    [GV_AMOUNT, g.id]
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
                : 'ไม่มีผู้ถูกรางวัล — ทุกคนได้รับ GV 500 บาท'
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
            `SELECT
                t.id,
                t.created_at,
                t.status AS approved,
                t.slip_image_url,
                t.round_label,
                t.reject_reason,
                u.display_name AS customer_name,
                u.platform,
                u.platform_id,
                s.name AS staff_name,
                s.nickname AS staff_nickname,
                lg.guess_number,
                lg.result AS lottery_result,
                lg.reward_amount
             FROM transactions t
             JOIN users u ON u.id = t.user_id
             JOIN staffs s ON s.id = t.staff_id
             LEFT JOIN lottery_guesses lg ON lg.user_id = t.user_id AND lg.round_label = t.round_label
             ORDER BY t.created_at DESC`
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
    try {
        await pool.query('DELETE FROM transactions WHERE id = $1', [txId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete history error:', err);
        res.status(500).json({ error: 'ไม่สามารถลบรายการได้' });
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

// Ensure mapping between global_user_id and OA-specific user id
async function ensureUserOaMapping(client, globalUserId, oaId, oaUserId) {
    if (!oaId || !oaUserId) return;
    await client.query(
        `INSERT INTO user_oa_mapping (global_user_id, oa_id, oa_user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (oa_id, oa_user_id) DO UPDATE SET
            global_user_id = EXCLUDED.global_user_id,
            updated_at = NOW()`,
        [globalUserId, oaId, oaUserId]
    );
}

// Push a LINE message via a specific OA's token
async function pushLineMessageByOa(oaId, toOaUserId, messageText) {
    const result = await pool.query(
        'SELECT access_token FROM oa_accounts WHERE oa_id = $1 AND is_active = TRUE',
        [oaId]
    );
    if (!result.rowCount) throw new Error(`OA not found or inactive: ${oaId}`);
    const token = result.rows[0].access_token;
    const resp = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            to: toOaUserId,
            messages: [{ type: 'text', text: messageText }]
        })
    });
    if (!resp.ok) throw new Error(`LINE push failed: ${await resp.text()}`);
}

// Send a Telegram message
async function sendTelegramMessage(telegramUserId, text) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: telegramUserId, text })
    });
    if (!resp.ok) throw new Error(`Telegram send error: ${await resp.text()}`);
    return resp.json();
}

// ============ LINE OAUTH CALLBACK ============

// GET /auth/line/callback — OAuth2 callback from LINE Login
// LIFF usually handles this client-side, but this supports server-side flow too.
app.get('/auth/line/callback', async (req, res) => {
    const { code, state, oaId, oaUserId } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    try {
        const tokenResult = await exchangeLineCodeForToken(code);
        const profile = await fetchLineProfile(tokenResult.access_token);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const user = await upsertUserByLineLogin(client, profile);
            if (user.global_user_id) {
                await ensureUserOaMapping(client, user.global_user_id, oaId, oaUserId);
            }
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
        platform_id, platform, oaId, oaUserId,
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

        // Link OA mapping if available
        if (user.global_user_id && oaId && oaUserId) {
            await ensureUserOaMapping(client, user.global_user_id, oaId, oaUserId);
        }

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
                oaId || null,
                metadata ? JSON.stringify(metadata) : null
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
                oaId: oaId || null,
                oaUserId: oaUserId || null,
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

        // Push notification back via OA if applicable
        if (oaId && oaUserId) {
            pushLineMessageByOa(oaId, oaUserId, `คุณได้รับ +${pointAmount} แต้มจาก ${activityType}`)
                .catch(err => console.error('LINE OA push error:', err.message));
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
        // Try LINE OA first (if source OA info is provided)
        if (event.oaId && event.globalUserId) {
            const mapping = await pool.query(
                `SELECT m.oa_user_id, o.access_token
                 FROM user_oa_mapping m
                 JOIN oa_accounts o ON o.oa_id = m.oa_id
                 WHERE m.global_user_id = $1 AND m.oa_id = $2 AND o.is_active = TRUE
                 LIMIT 1`,
                [event.globalUserId, event.oaId]
            );
            if (mapping.rows.length > 0) {
                const { oa_user_id, access_token } = mapping.rows[0];
                const text = event.message || `Activity ${event.activityType}: +${event.points} แต้ม`;
                await fetch('https://api.line.me/v2/bot/message/push', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${access_token}`
                    },
                    body: JSON.stringify({
                        to: oa_user_id,
                        messages: [{ type: 'text', text }]
                    })
                });
                return res.json({ success: true, channel: 'line', oaId: event.oaId });
            }
        }

        // Fallback: Telegram
        if (event.globalUserId) {
            const userResult = await pool.query(
                `SELECT platform, platform_id FROM users
                 WHERE global_user_id = $1 AND platform = 'telegram'`,
                [event.globalUserId]
            );
            if (userResult.rows.length > 0 && process.env.TELEGRAM_BOT_TOKEN) {
                const telegramUserId = userResult.rows[0].platform_id;
                const text = event.message || `Activity ${event.activityType}: +${event.points} points`;
                await sendTelegramMessage(telegramUserId, text);
                return res.json({ success: true, channel: 'telegram' });
            }
        }

        res.json({ success: true, channel: 'none', info: 'No delivery target found' });
    } catch (error) {
        console.error('Company activity error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ TELEGRAM MESSAGING ============

// POST /api/telegram/send — ส่งข้อความผ่าน Telegram Bot API
app.post('/api/telegram/send', async (req, res) => {
    const { telegramUserId, text } = req.body;
    if (!telegramUserId || !text) {
        return res.status(400).json({ error: 'telegramUserId and text are required' });
    }
    try {
        const result = await sendTelegramMessage(telegramUserId, text);
        res.json({ success: true, result });
    } catch (error) {
        console.error('Telegram send error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ UNIFIED PROFILE API ============

// GET /api/unified/profile?by=line&id=xxx
// GET /api/unified/profile?by=telegram&id=xxx
// GET /api/unified/profile?by=oa&oaId=xxx&oaUserId=xxx
app.get('/api/unified/profile', async (req, res) => {
    const { by, id, oaId, oaUserId } = req.query;

    try {
        let userRow;

        if (by === 'line' && id) {
            const result = await pool.query(
                `SELECT * FROM users WHERE platform = 'line' AND platform_id = $1`, [id]
            );
            userRow = result.rows[0];
        } else if (by === 'telegram' && id) {
            const result = await pool.query(
                `SELECT * FROM users WHERE platform = 'telegram' AND platform_id = $1`, [id]
            );
            userRow = result.rows[0];
        } else if (by === 'oa' && oaId && oaUserId) {
            const result = await pool.query(
                `SELECT u.* FROM user_oa_mapping m
                 JOIN users u ON u.global_user_id = m.global_user_id
                 WHERE m.oa_id = $1 AND m.oa_user_id = $2
                 LIMIT 1`,
                [oaId, oaUserId]
            );
            userRow = result.rows[0];
        } else if (by === 'global' && id) {
            const result = await pool.query(
                `SELECT * FROM users WHERE global_user_id = $1`, [id]
            );
            userRow = result.rows[0];
        } else {
            return res.status(400).json({
                error: 'Specify by=line|telegram|oa|global with matching id params'
            });
        }

        if (!userRow) {
            return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
        }

        // Fetch OA bindings
        const oaMappings = await pool.query(
            `SELECT m.oa_id, m.oa_user_id, o.oa_name
             FROM user_oa_mapping m
             LEFT JOIN oa_accounts o ON o.oa_id = m.oa_id
             WHERE m.global_user_id = $1`,
            [userRow.global_user_id]
        );

        // Fetch total points
        const pointsResult = await pool.query(
            `SELECT COALESCE(SUM(points), 0)::int AS total_points
             FROM points WHERE global_user_id = $1`,
            [userRow.global_user_id]
        );

        // Check if this user has a Telegram identity linked
        let telegramId = null;
        if (userRow.platform !== 'telegram') {
            const tgResult = await pool.query(
                `SELECT platform_id FROM users
                 WHERE global_user_id = $1 AND platform = 'telegram'
                 LIMIT 1`,
                [userRow.global_user_id]
            );
            telegramId = tgResult.rows[0]?.platform_id || null;
        } else {
            telegramId = userRow.platform_id;
        }

        // Check if this user has a LINE identity linked
        let lineId = null;
        if (userRow.platform !== 'line') {
            const lineResult = await pool.query(
                `SELECT platform_id FROM users
                 WHERE global_user_id = $1 AND platform = 'line'
                 LIMIT 1`,
                [userRow.global_user_id]
            );
            lineId = lineResult.rows[0]?.platform_id || null;
        } else {
            lineId = userRow.platform_id;
        }

        res.json({
            global_user_id: userRow.global_user_id,
            display_name: userRow.display_name,
            picture_url: userRow.picture_url,
            line_login_user_id: lineId,
            telegram_user_id: telegramId,
            total_points: pointsResult.rows[0].total_points,
            progress_count: userRow.progress_count,
            oa_bindings: oaMappings.rows,
            created_at: userRow.created_at
        });
    } catch (err) {
        console.error('Unified profile error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดโปรไฟล์ได้' });
    }
});

// ============ OA MANAGEMENT API (Admin) ============

// GET /api/oa-accounts — list all OA accounts
app.get('/api/oa-accounts', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT oa_id, oa_name, channel_id, is_active, created_at FROM oa_accounts ORDER BY oa_name'
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/oa-accounts — register a new OA
app.post('/api/oa-accounts', requireAuth, async (req, res) => {
    const { oa_id, oa_name, channel_id, channel_secret, access_token } = req.body;
    if (!oa_id || !oa_name || !channel_id || !channel_secret || !access_token) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO oa_accounts (oa_id, oa_name, channel_id, channel_secret, access_token)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (oa_id) DO UPDATE SET
                oa_name = EXCLUDED.oa_name,
                channel_id = EXCLUDED.channel_id,
                channel_secret = EXCLUDED.channel_secret,
                access_token = EXCLUDED.access_token,
                updated_at = NOW()
             RETURNING oa_id, oa_name, channel_id, is_active`,
            [oa_id, oa_name, channel_id, channel_secret, access_token]
        );
        res.json({ success: true, oa: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ START SERVER ============

app.listen(PORT, () => {
    console.log(`Kiss Me Ranking server running at http://localhost:${PORT}`);
});
