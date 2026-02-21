const express = require('express');
const rateLimit = require('express-rate-limit');
const { sendContactEmail } = require('../services/email');

const router = express.Router();

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many messages. Please try again later.',
});

const PAGE_DATA = {
  title: 'Contact Us | Certified Mail Sender',
  description: 'Get in touch with Certified Mail Sender. Questions about USPS Certified Mail, your order, or our service? Send us a message.',
  canonical: 'https://certifiedmailsender.com/contact',
  currentPath: '/contact'
};

router.get('/', (_req, res) => {
  res.render('contact', { ...PAGE_DATA });
});

router.post('/', contactLimiter, async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !message) {
    return res.render('contact', {
      ...PAGE_DATA,
      error: 'Please fill out all required fields.',
      formData: { name, email, subject, message }
    });
  }

  try {
    await sendContactEmail({ name, email, subject: subject || 'General inquiry', message });
    res.render('contact', { ...PAGE_DATA, success: true });
  } catch (err) {
    console.error('Contact form error:', err);
    res.render('contact', {
      ...PAGE_DATA,
      error: 'Something went wrong sending your message. Please try again or email us directly.',
      formData: { name, email, subject, message }
    });
  }
});

module.exports = router;
