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

// Cloudflare R2 config
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'lotto-uploads';
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

// Multer config: use memory storage for R2, disk for local
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

// PostgreSQL Connection
const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: true })
    : new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'lotto_project',
        password: process.env.DB_PASSWORD || 'Dew5644534',
        port: parseInt(process.env.DB_PORT, 10) || 5432,
    });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(uploadsDir));

// ============ AUTH ============

// In-memory token store (token -> { username, createdAt })
const authTokens = new Map();
const TOKEN_EXPIRY_MS = 8 * 60 * 60 * 1000; // 8 hours

function cleanExpiredTokens() {
    const now = Date.now();
    for (const [token, data] of authTokens) {
        if (now - data.createdAt > TOKEN_EXPIRY_MS) authTokens.delete(token);
    }
}

// Middleware to protect admin routes
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
    next();
}

// POST login
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
        authTokens.set(token, { username: user.username, createdAt: Date.now() });
        res.json({ token, username: user.username });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET verify token
app.get('/api/auth/verify', requireAuth, (req, res) => {
    res.json({ valid: true, username: req.adminUser });
});

// POST logout
app.post('/api/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        authTokens.delete(authHeader.slice(7));
    }
    res.json({ success: true });
});

// ============ SOLD OUT API ============

// GET all sold out numbers
app.get('/api/sold-out', async (req, res) => {
    try {
        const result = await pool.query('SELECT number FROM sold_out ORDER BY number');
        res.json(result.rows.map(r => r.number));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST add sold out number
app.post('/api/sold-out', requireAuth, async (req, res) => {
    const { number } = req.body;
    if (number == null || number < 0 || number > 99) {
        return res.status(400).json({ error: 'กรุณากรอกเลข 0-99' });
    }
    try {
        await pool.query('INSERT INTO sold_out (number) VALUES ($1) ON CONFLICT (number) DO NOTHING', [number]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE remove sold out number
app.delete('/api/sold-out/:number', requireAuth, async (req, res) => {
    const number = parseInt(req.params.number, 10);
    try {
        await pool.query('DELETE FROM sold_out WHERE number = $1', [number]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ PERMISSIONS API ============

// GET all permissions
app.get('/api/permissions', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM permissions ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST grant permission
app.post('/api/permissions', requireAuth, async (req, res) => {
    const { name, slots } = req.body;
    if (!name || !slots) {
        return res.status(400).json({ error: 'กรุณากรอกชื่อและจำนวนสิทธิ์' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO permissions (name, slots) VALUES ($1, $2) RETURNING *',
            [name, slots]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT revoke permission
app.put('/api/permissions/:id/revoke', requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('UPDATE permissions SET revoked = TRUE WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ HISTORY API ============

// GET all history
app.get('/api/history', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM history ORDER BY date DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST submit a guess (with optional image)
app.post('/api/history', upload.single('proof'), async (req, res) => {
    const { name, number } = req.body;
    if (!name || number == null) {
        return res.status(400).json({ error: 'กรุณากรอกชื่อและเลขที่ทาย' });
    }

    let imagePath = null;
    if (req.file) {
        if (useR2) {
            // Upload to Cloudflare R2
            const ext = path.extname(req.file.originalname);
            const filename = Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
            imagePath = await uploadToR2(req.file.buffer, filename, req.file.mimetype);
        } else {
            // Local fallback
            imagePath = '/uploads/' + req.file.filename;
        }
    }

    try {
        const result = await pool.query(
            'INSERT INTO history (name, number, image_path) VALUES ($1, $2, $3) RETURNING *',
            [name, number, imagePath]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE history entry
app.delete('/api/history/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM history WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT approve submission
app.put('/api/history/:id/approve', requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('UPDATE history SET approved = $1 WHERE id = $2', ['approved', id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT reject submission
app.put('/api/history/:id/reject', requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('UPDATE history SET approved = $1 WHERE id = $2', ['rejected', id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET pending submissions count (for admin badge)
app.get('/api/history/pending/count', async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) FROM history WHERE approved = 'pending'");
        res.json({ count: parseInt(result.rows[0].count, 10) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST announce draw result
app.post('/api/draw', requireAuth, async (req, res) => {
    const { winningNumber, drawDateLabel } = req.body;
    if (!winningNumber || !/^[0-9]{2}$/.test(winningNumber)) {
        return res.status(400).json({ error: 'กรุณากรอกเลข 2 หลัก (00-99)' });
    }
    try {
        // Mark winners (only approved submissions)
        await pool.query(
            "UPDATE history SET won = (number = $1) WHERE won IS NULL AND approved = 'approved'",
            [winningNumber]
        );
        // Get winners
        const winners = await pool.query(
            'SELECT name FROM history WHERE number = $1 AND won = TRUE',
            [winningNumber]
        );
        res.json({
            winningNumber,
            drawDateLabel: drawDateLabel || '',
            winners: winners.rows.map(r => r.name)
        });
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

    let round, open, drawDate;
    if (day >= 2 && day <= 14) {
        round = 1; open = true;
        drawDate = `16 ${thaiMonths[month]} ${year + 543}`;
    } else if (day >= 17 && day <= 29) {
        round = 2; open = true;
        const nm = (month + 1) % 12;
        const ny = month === 11 ? year + 1 : year;
        drawDate = `1 ${thaiMonths[nm]} ${ny + 543}`;
    } else {
        round = 0; open = false;
        drawDate = day <= 1 || day >= 30
            ? `16 ${thaiMonths[day === 1 ? month : (month + 1) % 12]} ${(day === 1 ? year : (month === 11 ? year + 1 : year)) + 543}`
            : `วันที่ 17 – 29 ${thaiMonths[month]} ${year + 543}`;
    }

    // Build full draw label
    const thaiMonthsFull = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                             'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

    // Next draw date info
    let nextDrawDay, nextDrawMonth, nextDrawYear;
    if (day <= 1) {
        nextDrawDay = 1; nextDrawMonth = month; nextDrawYear = year;
    } else if (day <= 16) {
        nextDrawDay = 16; nextDrawMonth = month; nextDrawYear = year;
    } else {
        const nm2 = (month + 1) % 12;
        nextDrawDay = 1; nextDrawMonth = nm2; nextDrawYear = month === 11 ? year + 1 : year;
    }
    const drawLabel = `งวดวันที่ ${nextDrawDay} ${thaiMonthsFull[nextDrawMonth]} ${nextDrawYear + 543}`;

    // Build list of all 24 draw dates for 2569 (2026)
    const drawDates = [];
    for (let m = 0; m < 12; m++) {
        drawDates.push({ day: 1, month: m + 1, year: 2569, label: `1 ${thaiMonthsFull[m]} 2569` });
        drawDates.push({ day: 16, month: m + 1, year: 2569, label: `16 ${thaiMonthsFull[m]} 2569` });
    }

    res.json({ round, open, drawDate, drawLabel, drawDates, nextDraw: { day: nextDrawDay, month: nextDrawMonth + 1, year: nextDrawYear + 543 }, day, month: month + 1, year });
});

// ============ GUESS CHART API ============

app.get('/api/stats/guesses-by-number', async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'กรุณาระบุ startDate และ endDate' });
    }
    try {
        const result = await pool.query(
            `SELECT number, COUNT(*)::int AS count
             FROM history
             WHERE approved = 'approved'
               AND date >= $1::date
               AND date < ($2::date + INTERVAL '1 day')
             GROUP BY number
             ORDER BY count DESC, number`,
            [startDate, endDate]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ STATS API ============

app.get('/api/stats', async (req, res) => {
    try {
        const soldOut = await pool.query('SELECT COUNT(*) FROM sold_out');
        const totalUsers = await pool.query('SELECT COUNT(*) FROM permissions WHERE revoked = FALSE');
        const pending = await pool.query("SELECT COUNT(*) FROM history WHERE approved = 'pending'");
        res.json({
            totalSlots: 100,
            soldSlots: parseInt(soldOut.rows[0].count, 10),
            availableSlots: 100 - parseInt(soldOut.rows[0].count, 10),
            totalUsers: parseInt(totalUsers.rows[0].count, 10),
            pendingCount: parseInt(pending.rows[0].count, 10)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Lotto Server running at http://localhost:${PORT}`);
});
