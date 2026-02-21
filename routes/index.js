const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
  res.render('index', {
    currentPath: '/',
    title: 'Send USPS Certified Mail Online \u2014 No Account Needed | Certified Mail Sender',
    description: 'Send USPS Certified Mail online \u2014 no account needed. Fill out a form, pay, and we print, certify, and mail your letter through USPS. Track delivery with optional return receipt.',
  });
});

module.exports = router;
