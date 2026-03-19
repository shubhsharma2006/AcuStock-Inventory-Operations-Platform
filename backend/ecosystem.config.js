/**
 * PM2 Ecosystem Configuration for AcuStock
 * ==========================================
 * 
 * Usage:
 *   Development: npm run dev
 *   Production:  npm run pm2:start
 * 
 * PM2 Commands:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 stop acustock-api
 *   pm2 restart acustock-api
 *   pm2 logs acustock-api
 *   pm2 monit
 */
module.exports = {
  apps: [{
    name: 'acustock-api',
    script: 'index.js',
    
    // Cluster mode for load balancing (use 'max' for all CPUs)
    instances: process.env.PM2_INSTANCES || 'max',
    exec_mode: 'cluster',
    
    // Auto-restart configuration
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Environment variables
    env: {
      NODE_ENV: 'development',
      PORT: 5001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5001
    },
    
    // Logging
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_file: 'logs/pm2-combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Log rotation (requires pm2-logrotate module — install once per server):
    //   npx pm2 install pm2-logrotate
    //   npx pm2 set pm2-logrotate:max_size 10M
    //   npx pm2 set pm2-logrotate:retain 14
    //   npx pm2 set pm2-logrotate:compress true
    //   npx pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
    // Rotates at 10MB or daily, keeps 14 days of compressed archives.
    
    // Restart strategy
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    min_uptime: '5s'
  }]
};
