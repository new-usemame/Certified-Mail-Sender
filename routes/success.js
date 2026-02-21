const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
  res.render('success');
});

module.exports = router;
