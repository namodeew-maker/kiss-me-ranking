// PM2 Ecosystem Config for Kiss Me Ranking
// Usage: pm2 start ecosystem.config.js

const WEB_CONCURRENCY = 3;

module.exports = {
    apps: [{
        name: 'kiss-me-ranking',
        script: 'server.js',
        cwd: '/var/www/kiss-me-ranking',
        instances: WEB_CONCURRENCY,
        exec_mode: 'cluster',
        env: {
            NODE_ENV: 'production',
            PORT: 3010,
            WEB_CONCURRENCY,
        },
        // Auto-restart on crash
        max_restarts: 10,
        min_uptime: '10s',
        restart_delay: 5000,
        // Logging
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        error_file: '/var/log/kiss-me-ranking/error.log',
        out_file: '/var/log/kiss-me-ranking/app.log',
        merge_logs: true,
        // Memory limit — restart if exceeds 512MB
        max_memory_restart: '512M',
        listen_timeout: 10000,
        kill_timeout: 5000,
        // Watch for file changes (disable in production)
        watch: false,
    }]
};
