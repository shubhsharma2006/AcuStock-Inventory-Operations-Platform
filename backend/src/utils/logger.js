/**
 * Shared Winston logger singleton.
 * Import this instead of calling winston.createLogger() in each route file.
 * In a PM2 cluster every worker gets its own process, but they all write
 * to the same files — Node.js single-threaded I/O keeps the writes safe.
 */
const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Ensure logs directory exists (first-boot and PM2 cluster safety)
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_TEST = process.env.NODE_ENV === 'test';

const transports = [
  new winston.transports.Console({ silent: IS_TEST })
];

if (!IS_TEST) {
  if (IS_PRODUCTION) {
    transports.push(
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' })
    );
  } else {
    transports.push(new winston.transports.File({ filename: 'server.log' }));
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: IS_PRODUCTION
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    : winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
      ),
  transports
});

module.exports = logger;
