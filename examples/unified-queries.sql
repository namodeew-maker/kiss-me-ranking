-- 1) Find users linked to multiple OA accounts and Telegram.
SELECT
    u.global_user_id,
    u.line_login_user_id,
    u.telegram_user_id,
    u.display_name,
    COUNT(DISTINCT m.oa_id) AS oa_count,
    ARRAY_AGG(DISTINCT m.oa_id ORDER BY m.oa_id) AS oa_ids,
    ARRAY_AGG(DISTINCT m.oa_user_id ORDER BY m.oa_user_id) AS oa_user_ids
FROM users u
LEFT JOIN user_oa_mapping m ON m.global_user_id = u.global_user_id
GROUP BY u.global_user_id, u.line_login_user_id, u.telegram_user_id, u.display_name
HAVING COUNT(DISTINCT m.oa_id) >= 2
   AND u.telegram_user_id IS NOT NULL;

-- 2) Unified UserProfile lookup by LINE login user id.
SELECT
    u.global_user_id,
    u.display_name,
    u.picture_url,
    u.line_login_user_id,
    u.telegram_user_id,
    COALESCE(SUM(p.points), 0) AS total_points,
    JSON_AGG(
        DISTINCT JSONB_BUILD_OBJECT(
            'oaId', m.oa_id,
            'oaUserId', m.oa_user_id
        )
    ) FILTER (WHERE m.oa_id IS NOT NULL) AS line_oa_bindings
FROM users u
LEFT JOIN user_oa_mapping m ON m.global_user_id = u.global_user_id
LEFT JOIN points p ON p.global_user_id = u.global_user_id
WHERE u.line_login_user_id = $1
GROUP BY u.global_user_id, u.display_name, u.picture_url, u.line_login_user_id, u.telegram_user_id;

-- 3) Unified UserProfile lookup by Telegram user id.
SELECT
    u.global_user_id,
    u.display_name,
    u.picture_url,
    u.line_login_user_id,
    u.telegram_user_id,
    COALESCE(SUM(p.points), 0) AS total_points,
    JSON_AGG(
        DISTINCT JSONB_BUILD_OBJECT(
            'oaId', m.oa_id,
            'oaUserId', m.oa_user_id
        )
    ) FILTER (WHERE m.oa_id IS NOT NULL) AS line_oa_bindings
FROM users u
LEFT JOIN user_oa_mapping m ON m.global_user_id = u.global_user_id
LEFT JOIN points p ON p.global_user_id = u.global_user_id
WHERE u.telegram_user_id = $1
GROUP BY u.global_user_id, u.display_name, u.picture_url, u.line_login_user_id, u.telegram_user_id;

-- 4) Unified UserProfile lookup by (oa_id, oa_user_id).
SELECT
    u.global_user_id,
    u.display_name,
    u.picture_url,
    u.line_login_user_id,
    u.telegram_user_id,
    COALESCE(SUM(p.points), 0) AS total_points,
    JSON_AGG(
        DISTINCT JSONB_BUILD_OBJECT(
            'oaId', m2.oa_id,
            'oaUserId', m2.oa_user_id
        )
    ) FILTER (WHERE m2.oa_id IS NOT NULL) AS line_oa_bindings
FROM user_oa_mapping src
JOIN users u ON u.global_user_id = src.global_user_id
LEFT JOIN user_oa_mapping m2 ON m2.global_user_id = u.global_user_id
LEFT JOIN points p ON p.global_user_id = u.global_user_id
WHERE src.oa_id = $1
  AND src.oa_user_id = $2
GROUP BY u.global_user_id, u.display_name, u.picture_url, u.line_login_user_id, u.telegram_user_id;
