const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const { createCheckoutSession, getPriceCents } = require('../services/stripe');
const { generateLetterPdf, countPdfPages } = require('../services/pdf');
const db = require('../db/init');

const router = express.Router();

const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  },
});

function validate(body) {
  const required = [
    'sender_name', 'sender_street', 'sender_city', 'sender_state', 'sender_zip',
    'customer_email',
    'recipient_name', 'recipient_street', 'recipient_city', 'recipient_state', 'recipient_zip',
  ];
  for (const field of required) {
    if (!body[field] || !body[field].trim()) {
      return `Missing required field: ${field.replace(/_/g, ' ')}`;
    }
  }
  if (!/^[A-Z]{2}$/i.test(body.sender_state)) return 'Sender state must be a 2-letter code.';
  if (!/^[A-Z]{2}$/i.test(body.recipient_state)) return 'Recipient state must be a 2-letter code.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customer_email)) return 'Please enter a valid email address.';
  if (body.backup_email && body.backup_email.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.backup_email)) return 'Please enter a valid backup email address.';
    if (body.backup_email.trim().toLowerCase() === body.customer_email.trim().toLowerCase()) {
      return 'Backup email must be different from your primary email.';
    }
  }
  if (!/^\d{5}(-?\d{4})?$/.test(body.sender_zip)) return 'Invalid sender ZIP code.';
  if (!/^\d{5}(-?\d{4})?$/.test(body.recipient_zip)) return 'Invalid recipient ZIP code.';
  if (body.letter_mode === 'text' && body.letter_text && body.letter_text.length > 50000) {
    return 'Letter text is too long. Please keep it under 50,000 characters.';
  }
  const maxLens = { sender_name: 200, sender_street: 200, sender_street2: 200, sender_city: 100, recipient_name: 200, recipient_street: 200, recipient_street2: 200, recipient_city: 100, customer_email: 254, backup_email: 254 };
  for (const [field, max] of Object.entries(maxLens)) {
    if (body[field] && body[field].length > max) {
      return `${field.replace(/_/g, ' ')} is too long (max ${max} characters).`;
    }
  }
  return null;
}

const { doubleCsrfProtection } = require('../middleware/csrf');

function csrfAfterMulter(req, res, next) {
  doubleCsrfProtection(req, res, (err) => {
    if (err) return next(err);
    res.locals.csrfToken = req.csrfToken ? req.csrfToken() : '';
    next();
  });
}

router.post('/', upload.single('letter_pdf'), csrfAfterMulter, async (req, res, next) => {
  try {
    const trimFields = [
      'sender_name', 'sender_street', 'sender_street2', 'sender_city', 'sender_state', 'sender_zip',
      'customer_email', 'backup_email',
      'recipient_name', 'recipient_street', 'recipient_street2', 'recipient_city', 'recipient_state', 'recipient_zip',
    ];
    for (const field of trimFields) {
      if (typeof req.body[field] === 'string') req.body[field] = req.body[field].trim();
    }

    const err = validate(req.body);
    if (err) return res.render('index', { error: err, form: req.body });

    const isText = req.body.letter_mode === 'text';
    let pdfBase64;
    let pageCount = 1;

    if (isText) {
      if (!req.body.letter_text || !req.body.letter_text.trim()) {
        return res.render('index', { error: 'Please enter your letter text.', form: req.body });
      }
      const result = await generateLetterPdf(req.body.letter_text);
      pdfBase64 = result.buffer.toString('base64');
      pageCount = result.pageCount;
    } else {
      if (!req.file) {
        return res.render('index', { error: 'Please upload a PDF file.', form: req.body });
      }
      const fileBuffer = await fs.readFile(req.file.path);
      pdfBase64 = fileBuffer.toString('base64');
      pageCount = countPdfPages(fileBuffer);
      await fs.unlink(req.file.path);
    }

    const returnReceipt = req.body.return_receipt === '1';

    const pdfId = `pdf_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const insertPdf = db.prepare(
      'INSERT INTO pending_pdfs (pdf_id, pdf_base64, page_count) VALUES (?, ?, ?)',
    );
    insertPdf.run(pdfId, pdfBase64, pageCount);

    const metadata = {
      sender_name: req.body.sender_name,
      sender_street: req.body.sender_street,
      sender_street2: req.body.sender_street2 || '',
      sender_city: req.body.sender_city,
      sender_state: req.body.sender_state.toUpperCase(),
      sender_zip: req.body.sender_zip,
      customer_email: req.body.customer_email,
      backup_email: req.body.backup_email || '',
      recipient_name: req.body.recipient_name,
      recipient_street: req.body.recipient_street,
      recipient_street2: req.body.recipient_street2 || '',
      recipient_city: req.body.recipient_city,
      recipient_state: req.body.recipient_state.toUpperCase(),
      recipient_zip: req.body.recipient_zip,
      letter_type: isText ? 'text' : 'pdf',
      return_receipt: returnReceipt ? '1' : '0',
      pdf_id: pdfId,
      page_count: String(pageCount),
    };

    const useSenderAsBilling = req.body.use_sender_as_billing === '1';

    const sessionOpts = { metadata, returnReceipt };
    if (useSenderAsBilling) {
      sessionOpts.billingAddress = {
        name: req.body.sender_name,
        line1: req.body.sender_street,
        line2: req.body.sender_street2 || undefined,
        city: req.body.sender_city,
        state: req.body.sender_state.toUpperCase(),
        postal_code: req.body.sender_zip,
        country: 'US',
      };
    }

    const session = await createCheckoutSession(sessionOpts);
    res.redirect(303, session.url);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
