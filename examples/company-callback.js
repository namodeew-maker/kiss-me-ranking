const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: true });

function verifyWebhook(req, res, next) {
    const expected = process.env.COMPANY_WEBHOOK_TOKEN || '';
    if (!expected) return next();

    const actual = req.headers['x-webhook-token'];
    if (actual !== expected) {
        return res.status(401).json({ error: 'Invalid webhook token' });
    }
    next();
}

async function sendTelegram(botToken, telegramUserId, text) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: telegramUserId, text })
    });

    if (!resp.ok) {
        throw new Error(`Telegram send error: ${await resp.text()}`);
    }
}

// Receive activity from gateway.
app.post('/company/activity', verifyWebhook, async (req, res) => {
    const event = req.body;

    try {
        // Reply through Telegram if this global user has a Telegram identity linked.
        const userResult = await pool.query(
            'SELECT telegram_user_id FROM users WHERE global_user_id = $1',
            [event.globalUserId]
        );

        const telegramUserId = userResult.rows[0]?.telegram_user_id;
        if (telegramUserId && process.env.TELEGRAM_BOT_TOKEN) {
            await sendTelegram(
                process.env.TELEGRAM_BOT_TOKEN,
                telegramUserId,
                `Company received activity: ${event.activityType} (+${event.points})`
            );
            return res.json({ success: true, channel: 'telegram' });
        }

        res.json({ success: true, channel: 'none', info: 'No delivery target found' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const port = process.env.COMPANY_PORT || 3020;
app.listen(port, () => {
    console.log(`company-callback listening on ${port}`);
});
