require('dotenv').config();

const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const db = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

// Stripe webhook needs raw body — mount before express.urlencoded
const webhookRoute = require('./routes/webhook');
app.use('/webhook', webhookRoute);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many requests. Please try again later.',
});
app.use('/checkout', limiter);

app.use('/', require('./routes/index'));
app.use('/checkout', require('./routes/checkout'));
app.use('/success', require('./routes/success'));
app.use('/cancel', require('./routes/cancel'));
app.use('/how-it-works', require('./routes/how-it-works'));
app.use('/pricing', require('./routes/pricing'));
app.use('/faq', require('./routes/faq'));
app.use('/about', require('./routes/about'));
app.use('/contact', require('./routes/contact'));

if (process.env.ENABLE_STATUS_PAGE === 'true') {
  app.use('/status', require('./routes/status'));
}

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong. Please try again.');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
