const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: true });

const LINE_OAUTH_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';
const LINE_PROFILE_URL = 'https://api.line.me/v2/profile';

async function exchangeLineCodeForToken(code, redirectUri) {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: process.env.LINE_LOGIN_CHANNEL_ID,
        client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET
    });

    const resp = await fetch(LINE_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });

    if (!resp.ok) {
        const errorBody = await resp.text();
        throw new Error(`LINE token exchange failed: ${errorBody}`);
    }

    return resp.json();
}

async function fetchLineProfile(accessToken) {
    const resp = await fetch(LINE_PROFILE_URL, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!resp.ok) {
        const errorBody = await resp.text();
        throw new Error(`LINE profile fetch failed: ${errorBody}`);
    }

    return resp.json();
}

async function upsertUserByLineLogin(client, profile) {
    const sql = `
        INSERT INTO users (line_login_user_id, display_name, picture_url)
        VALUES ($1, $2, $3)
        ON CONFLICT (line_login_user_id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            picture_url = EXCLUDED.picture_url,
            updated_at = NOW()
        RETURNING *
    `;
    const result = await client.query(sql, [profile.userId, profile.displayName || '', profile.pictureUrl || null]);
    return result.rows[0];
}

async function ensureUserOaMapping(client, globalUserId, oaId, oaUserId) {
    if (!oaId || !oaUserId) return;

    const sql = `
        INSERT INTO user_oa_mapping (global_user_id, oa_id, oa_user_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (oa_id, oa_user_id) DO UPDATE SET
            global_user_id = EXCLUDED.global_user_id,
            updated_at = NOW()
    `;

    await client.query(sql, [globalUserId, oaId, oaUserId]);
}

async function addPointAndForwardActivity(payload) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const user = await upsertUserByLineLogin(client, {
            userId: payload.lineLoginUserId,
            displayName: payload.displayName,
            pictureUrl: payload.pictureUrl
        });

        await ensureUserOaMapping(client, user.global_user_id, payload.oaId, payload.oaUserId);

        const pointResult = await client.query(
            `INSERT INTO points (global_user_id, activity_type, points, source_platform, source_oa_id, metadata)
             VALUES ($1, $2, $3, 'line', $4, $5)
             RETURNING *`,
            [
                user.global_user_id,
                payload.activityType,
                payload.points,
                payload.oaId || null,
                payload.metadata || null
            ]
        );

        await client.query('COMMIT');

        const companyPayload = {
            eventType: 'POINTS_ADDED',
            globalUserId: user.global_user_id,
            lineLoginUserId: user.line_login_user_id,
            oaId: payload.oaId,
            oaUserId: payload.oaUserId,
            activityType: payload.activityType,
            points: payload.points,
            pointTxnId: pointResult.rows[0].id,
            timestamp: new Date().toISOString()
        };

        if (process.env.COMPANY_WEBHOOK_URL) {
            await fetch(process.env.COMPANY_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Token': process.env.COMPANY_WEBHOOK_TOKEN || ''
                },
                body: JSON.stringify(companyPayload)
            });
        }

        return { user, point: pointResult.rows[0] };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function pushLineMessageByOa(oaId, toOaUserId, messageText) {
    const result = await pool.query(
        'SELECT access_token FROM oa_accounts WHERE oa_id = $1 AND is_active = TRUE',
        [oaId]
    );

    if (!result.rowCount) {
        throw new Error(`OA not found or inactive: ${oaId}`);
    }

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

    if (!resp.ok) {
        throw new Error(`LINE push failed: ${await resp.text()}`);
    }
}

// OAuth callback from LINE Login.
app.get('/auth/line/callback', async (req, res) => {
    const { code, state, oaId, oaUserId } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    try {
        const tokenResult = await exchangeLineCodeForToken(code, process.env.LINE_REDIRECT_URI);
        const profile = await fetchLineProfile(tokenResult.access_token);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const user = await upsertUserByLineLogin(client, profile);
            await ensureUserOaMapping(client, user.global_user_id, oaId, oaUserId);
            await client.query('COMMIT');
            res.json({ success: true, state, user });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add points from app activity and forward to company system.
app.post('/api/points/activity', async (req, res) => {
    const { lineLoginUserId, oaId, oaUserId, displayName, pictureUrl, activityType, points, metadata } = req.body;

    if (!lineLoginUserId || !activityType || !Number.isInteger(points)) {
        return res.status(400).json({
            error: 'lineLoginUserId, activityType and integer points are required'
        });
    }

    try {
        const result = await addPointAndForwardActivity({
            lineLoginUserId,
            oaId,
            oaUserId,
            displayName,
            pictureUrl,
            activityType,
            points,
            metadata
        });

        if (oaId && oaUserId) {
            await pushLineMessageByOa(oaId, oaUserId, `Points +${points} from ${activityType}`);
        }

        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const port = process.env.GATEWAY_PORT || 3010;
app.listen(port, () => {
    console.log(`line-points-gateway listening on ${port}`);
});
