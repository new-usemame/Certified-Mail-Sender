const express = require('express');
const rateLimit = require('express-rate-limit');
const { runAll } = require('../services/healthCheck');

const router = express.Router();

const statusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please try again later.',
});

router.get('/', statusLimiter, async (req, res, next) => {
  try {
    const { results, summary } = await runAll();
    res.render('status', { results, summary });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
