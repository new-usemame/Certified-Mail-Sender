const express = require('express');
const { runAll } = require('../services/healthCheck');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { results, summary } = await runAll();
    res.render('status', { results, summary });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
