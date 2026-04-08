-- 1) Lookup unified profile by LINE Login user ID.
SELECT
    u.global_user_id,
    u.line_login_user_id,
    u.telegram_user_id,
    u.display_name,
    u.picture_url,
    COALESCE(SUM(p.points), 0) AS total_points
FROM users u
LEFT JOIN points p ON p.global_user_id = u.global_user_id
WHERE u.line_login_user_id = $1
GROUP BY u.global_user_id, u.line_login_user_id, u.telegram_user_id, u.display_name, u.picture_url;

-- 2) Lookup unified profile by Telegram user ID.
SELECT
    u.global_user_id,
    u.line_login_user_id,
    u.telegram_user_id,
    u.display_name,
    u.picture_url,
    COALESCE(SUM(p.points), 0) AS total_points
FROM users u
LEFT JOIN points p ON p.global_user_id = u.global_user_id
WHERE u.telegram_user_id = $1
GROUP BY u.global_user_id, u.line_login_user_id, u.telegram_user_id, u.display_name, u.picture_url;

-- 3) Lookup unified profile by global_user_id.
SELECT
    u.global_user_id,
    u.line_login_user_id,
    u.telegram_user_id,
    u.display_name,
    u.picture_url,
    COALESCE(SUM(p.points), 0) AS total_points
FROM users u
LEFT JOIN points p ON p.global_user_id = u.global_user_id
WHERE u.global_user_id = $1
GROUP BY u.global_user_id, u.line_login_user_id, u.telegram_user_id, u.display_name, u.picture_url;

-- 4) Recent points ledger for a user.
SELECT
    id,
    activity_type,
    points,
    source_platform,
    metadata,
    created_at
FROM points
WHERE global_user_id = $1
ORDER BY created_at DESC
LIMIT 20;
