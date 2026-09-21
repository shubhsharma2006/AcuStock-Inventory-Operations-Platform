const crypto = require('crypto');

const CSRF_SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
const CSRF_SAFE_PATHS = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/register-tenant',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-reset-token',
  '/api/billing/webhook',
  '/api/setup'
];

function createCsrfMiddleware({ isProduction = false, safePaths = [] } = {}) {
  const allowedSafePaths = [...CSRF_SAFE_PATHS, ...safePaths];

  return (req, res, next) => {
    const isSafeMethod = CSRF_SAFE_METHODS.includes(req.method);
    const isSafePath = allowedSafePaths.some((path) => req.path.startsWith(path));

    let csrfToken = req.cookies?.csrfToken;
    if (!csrfToken) {
      csrfToken = crypto.randomBytes(32).toString('hex');
      res.cookie('csrfToken', csrfToken, {
        httpOnly: false,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/'
      });
    }

    if (!isSafeMethod && !isSafePath) {
      const submittedToken = req.headers['x-csrf-token'];
      if (!submittedToken || submittedToken !== csrfToken) {
        return res.status(403).json({
          success: false,
          error: 'CSRF token missing or invalid',
          code: 'CSRF_INVALID'
        });
      }
    }

    next();
  };
}

module.exports = {
  CSRF_SAFE_METHODS,
  CSRF_SAFE_PATHS,
  createCsrfMiddleware
};
