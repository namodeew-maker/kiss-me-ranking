const express = require('express');

const app = express();
app.use(express.json());

async function sendTelegramMessage(botToken, telegramUserId, text) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: telegramUserId,
            text
        })
    });

    if (!resp.ok) {
        throw new Error(`Telegram API error: ${await resp.text()}`);
    }

    return resp.json();
}

// Generic endpoint for app/company system to notify Telegram users.
app.post('/telegram/send', async (req, res) => {
    const { telegramUserId, text } = req.body;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
        return res.status(500).json({ error: 'Missing TELEGRAM_BOT_TOKEN' });
    }
    if (!telegramUserId || !text) {
        return res.status(400).json({ error: 'telegramUserId and text are required' });
    }

    try {
        const result = await sendTelegramMessage(botToken, telegramUserId, text);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const port = process.env.TELEGRAM_PORT || 3030;
app.listen(port, () => {
    console.log(`telegram-messaging listening on ${port}`);
});
