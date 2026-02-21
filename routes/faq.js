const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
  res.render('faq', {
    title: 'Certified Mail FAQ | Certified Mail Sender',
    description: 'Frequently asked questions about USPS Certified Mail: what it is, how long it takes, cost, tracking, return receipts, and how to send certified mail online.',
    canonical: 'https://certifiedmailsender.com/faq',
    currentPath: '/faq'
  });
});

module.exports = router;
