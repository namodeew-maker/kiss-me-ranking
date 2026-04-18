// PM2 Ecosystem Config for Kiss Me Ranking
// Usage: pm2 start ecosystem.config.js

module.exports = {
    apps: [{
        name: 'kiss-me-ranking',
        script: 'server.js',
        cwd: '/var/www/kiss-me-ranking',
        instances: 1,                  // Keep single process while admin auth uses in-memory tokens
        exec_mode: 'fork',
        env: {
            NODE_ENV: 'production',
            PORT: 3010,
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
        // Watch for file changes (disable in production)
        watch: false,
    }]
};
