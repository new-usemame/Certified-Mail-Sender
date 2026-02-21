const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
  res.render('pricing', {
    title: 'USPS Certified Mail Pricing | Certified Mail Sender',
    description: 'Send USPS Certified Mail for $10.00 or add a return receipt for $13.00. Price includes printing, envelope, certified postage, and tracking.',
    canonical: 'https://certifiedmailsender.com/pricing',
    currentPath: '/pricing'
  });
});

module.exports = router;
