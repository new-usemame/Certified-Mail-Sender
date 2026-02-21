const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
  res.render('index', { currentPath: '/' });
});

module.exports = router;
