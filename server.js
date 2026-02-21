require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { doubleCsrfProtection } = require('./middleware/csrf');
const db = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3000;

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

if (process.env.ENABLE_STATUS_PAGE === 'true') {
  app.use('/status', require('./routes/status'));
}

app.use((err, _req, res, _next) => {
  if (err.code === 'EBADCSRFTOKEN' || err.message === 'invalid csrf token') {
    return res.status(403).send('Invalid or missing CSRF token.');
  }
  console.error(err.stack);
  res.status(500).send('Something went wrong. Please try again.');
});

// Periodic cleanup of orphaned PDF files from abandoned checkouts
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const ORPHAN_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function cleanOrphanedUploads() {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) return;
    const now = Date.now();
    for (const file of files) {
      if (!file.endsWith('.b64')) continue;
      const filePath = path.join(UPLOAD_DIR, file);
      fs.stat(filePath, (statErr, stats) => {
        if (!statErr && now - stats.mtimeMs > ORPHAN_MAX_AGE_MS) {
          fs.unlink(filePath, () => {});
        }
      });
    }
  });
}

setInterval(cleanOrphanedUploads, 30 * 60 * 1000);
cleanOrphanedUploads();

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
