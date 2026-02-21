const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
  res.render('how-it-works', {
    title: 'How to Send Certified Mail Online | Certified Mail Sender',
    description: 'Send USPS Certified Mail in 3 easy steps. Fill out a form, pay securely, and we print, certify, and mail your letter through USPS with tracking.',
    canonical: 'https://certifiedmailsender.com/how-it-works',
    currentPath: '/how-it-works'
  });
});

module.exports = router;
