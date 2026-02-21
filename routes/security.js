const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
  res.render('security', {
    title: 'Security | Certified Mail Sender',
    description: 'Learn how Certified Mail Sender protects your data with SSL encryption, PCI-compliant Stripe payments, and secure USPS delivery.',
    canonical: 'https://certifiedmailsender.com/security',
    currentPath: '/security'
  });
});

module.exports = router;
