const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
  res.render('about', {
    title: 'About Us | Certified Mail Sender',
    description: 'Certified Mail Sender makes it easy to send USPS Certified Mail online. No trip to the post office. We print, certify, and mail your letter with tracking.',
    canonical: 'https://certifiedmailsender.com/about',
    currentPath: '/about'
  });
});

module.exports = router;
