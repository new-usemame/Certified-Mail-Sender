const crypto = require('crypto');
const { doubleCsrf } = require('csrf-csrf');

const CSRF_SECRET = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');
const isProduction = process.env.NODE_ENV === 'production';

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => CSRF_SECRET,
  getSessionIdentifier: () => '',
  cookieName: isProduction ? '__Host-csrf-token' : 'csrf-token',
  cookieOptions: {
    sameSite: 'strict',
    secure: isProduction,
    path: '/',
    httpOnly: true,
  },
  getCsrfTokenFromRequest: (req) => req.body._csrf,
});

module.exports = { doubleCsrfProtection, generateCsrfToken };
