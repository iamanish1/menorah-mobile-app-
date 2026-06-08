module.exports = {
  apps: [
    {
      name: 'menorah-api',
      script: 'src/server.js',

      // Cluster mode — one worker per CPU core
      instances: 'max',
      exec_mode: 'cluster',

      // Never watch filesystem in production (slow + triggers restarts)
      watch: false,

      // Restart if a worker leaks past 1 GB
      max_memory_restart: '1G',

      // Log files (create logs/ dir before deploying)
      error_file: 'logs/err.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Keep workers alive — restart immediately on crash
      autorestart: true,
      min_uptime: '10s',     // must stay up 10s to count as a successful start
      max_restarts: 10,      // stop trying after 10 rapid crashes

      // No plain 'env' block — forces explicit --env production flag when starting.
      // Running 'pm2 start ecosystem.config.js' without '--env production' will now
      // fail to find a NODE_ENV, causing the server's startup validation to exit.
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
