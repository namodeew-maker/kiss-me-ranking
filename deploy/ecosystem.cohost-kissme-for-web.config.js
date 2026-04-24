// PM2 Ecosystem Config for Kiss Me Ranking
// Co-host profile: run alongside kissme-for-web on the same VPS.
//
// Usage:
//   pm2 start deploy/ecosystem.cohost-kissme-for-web.config.js
//
// Notes:
//   - kissme-for-web can stay on its current port
//   - Kiss Me Ranking runs on :3010
//   - This profile uses a distinct PM2 name to avoid confusion with older runs

const WEB_CONCURRENCY = 3;

module.exports = {
    apps: [{
        name: 'kiss-me-ranking-prod',
        script: 'server.js',
        cwd: '/var/www/kiss-me-ranking',
        instances: WEB_CONCURRENCY,
        exec_mode: 'cluster',
        env: {
            NODE_ENV: 'production',
            PORT: 3010,
            ADMIN_LOGIN_PATH: 'ranking-admin',
            WEB_CONCURRENCY,
        },
        max_restarts: 10,
        min_uptime: '10s',
        restart_delay: 5000,
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        error_file: '/var/log/kiss-me-ranking/error.log',
        out_file: '/var/log/kiss-me-ranking/app.log',
        merge_logs: true,
        max_memory_restart: '512M',
        listen_timeout: 10000,
        kill_timeout: 5000,
        watch: false,
    }]
};
