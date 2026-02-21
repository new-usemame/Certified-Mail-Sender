const crypto = require('crypto');
const { doubleCsrf } = require('csrf-csrf');

const CSRF_SECRET = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');
const isProduction = process.env.NODE_ENV === 'production';

const VISITOR_COOKIE = isProduction ? '__Host-visitor-id' : 'visitor-id';

function ensureVisitorId(req, res, next) {
  if (!req.cookies || !req.cookies[VISITOR_COOKIE]) {
    const id = crypto.randomUUID();
    res.cookie(VISITOR_COOKIE, id, {
      sameSite: 'strict',
      secure: isProduction,
      path: '/',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    });
    req.cookies = req.cookies || {};
    req.cookies[VISITOR_COOKIE] = id;
  }
  next();
}

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => CSRF_SECRET,
  getSessionIdentifier: (req) => (req.cookies && req.cookies[VISITOR_COOKIE]) || '',
  cookieName: isProduction ? '__Host-csrf-token' : 'csrf-token',
  cookieOptions: {
    sameSite: 'strict',
    secure: isProduction,
    path: '/',
    httpOnly: true,
  },
  getCsrfTokenFromRequest: (req) => req.body._csrf,
});

module.exports = { doubleCsrfProtection, generateCsrfToken, ensureVisitorId };
