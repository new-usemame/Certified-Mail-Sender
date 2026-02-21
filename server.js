require('dotenv').config();

if (!process.env.NODE_ENV) {
  console.warn('WARNING: NODE_ENV is not set. Defaulting to development. Set NODE_ENV=production for live deployments.');
} else if (process.env.NODE_ENV === 'production' && !process.env.CSRF_SECRET) {
  console.warn('WARNING: CSRF_SECRET is not set in production. CSRF tokens will not survive server restarts.');
}

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { doubleCsrfProtection, ensureVisitorId } = require('./middleware/csrf');
const db = require('./db/init');
const { startRetryJob, stopRetryJob } = require('./services/retryFailedOrders');
const { getPriceCents } = require('./services/stripe');

const app = express();
const PORT = process.env.PORT || 3000;

const priceCert = getPriceCents(false);
const priceRR = getPriceCents(true);
app.locals.priceCertified = (priceCert / 100).toFixed(2);
app.locals.priceCertifiedRR = (priceRR / 100).toFixed(2);
app.locals.priceRRAddon = ((priceRR - priceCert) / 100).toFixed(2);

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet());
app.use(express.static(path.join(__dirname, 'public')));

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please try again in a moment.',
});
app.use(globalLimiter);

// Stripe webhook needs raw body — mount before body parsers and CSRF
const webhookRoute = require('./routes/webhook');
app.use('/webhook', webhookRoute);

app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '1mb' }));

app.use(cookieParser());
app.use(ensureVisitorId);

// Apply CSRF to all routes except /checkout (multipart; checked after multer in route)
app.use((req, res, next) => {
  if (req.path === '/checkout' && req.method === 'POST') return next();
  doubleCsrfProtection(req, res, next);
});

app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken ? req.csrfToken() : '';
  next();
});

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please try again later.',
});
app.use('/checkout', checkoutLimiter);

app.use('/', require('./routes/index'));
app.use('/checkout', require('./routes/checkout'));
app.use('/success', require('./routes/success'));
app.use('/cancel', require('./routes/cancel'));
app.use('/order', require('./routes/order'));
app.use('/how-it-works', require('./routes/how-it-works'));
app.use('/pricing', require('./routes/pricing'));
app.use('/faq', require('./routes/faq'));
app.use('/about', require('./routes/about'));
app.use('/contact', require('./routes/contact'));
app.use('/security', require('./routes/security'));

if (process.env.ENABLE_STATUS_PAGE === 'true') {
  app.use('/status', require('./routes/status'));
}

app.use((err, _req, res, _next) => {
  if (err.code === 'EBADCSRFTOKEN' || err.message === 'invalid csrf token') {
    return res.status(403).send('Invalid or missing CSRF token.');
  }
  console.error(err.stack);
  res.status(500).render('error');
});

const ORPHAN_MAX_AGE_HOURS = 4;
const cleanStaleStmt = db.prepare(
  `DELETE FROM pending_pdfs WHERE created_at < datetime('now', '-' || ? || ' hours')`,
);

function cleanStalePendingPdfs() {
  try {
    cleanStaleStmt.run(ORPHAN_MAX_AGE_HOURS);
  } catch (e) {
    console.error('Failed to clean stale pending PDFs:', e.message);
  }
}

const cleanupInterval = setInterval(cleanStalePendingPdfs, 30 * 60 * 1000);
cleanStalePendingPdfs();

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  startRetryJob();

  function shutdown() {
    console.log('Shutting down gracefully...');
    clearInterval(cleanupInterval);
    stopRetryJob();
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = app;
