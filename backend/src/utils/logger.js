/**
 * Shared Winston logger singleton.
 * Import this instead of calling winston.createLogger() in each route file.
 * In a PM2 cluster every worker gets its own process, but they all write
 * to the same files — Node.js single-threaded I/O keeps the writes safe.
 */
const winston = require('winston');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

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
  transports: [
    new winston.transports.Console(),
    ...(IS_PRODUCTION
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' })
        ]
      : [new winston.transports.File({ filename: 'server.log' })])
  ]
});

module.exports = logger;
