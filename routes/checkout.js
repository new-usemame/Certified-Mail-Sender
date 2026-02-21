const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createCheckoutSession, getPriceCents } = require('../services/stripe');
const { generateLetterPdf } = require('../services/pdf');

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
  if (!/^\d{5}(-?\d{4})?$/.test(body.sender_zip)) return 'Invalid sender ZIP code.';
  if (!/^\d{5}(-?\d{4})?$/.test(body.recipient_zip)) return 'Invalid recipient ZIP code.';
  return null;
}

router.post('/', upload.single('letter_pdf'), async (req, res, next) => {
  try {
    const err = validate(req.body);
    if (err) return res.render('index', { error: err });

    const isText = req.body.letter_mode === 'text';
    let pdfBase64;
    let pageCount = 1;

    if (isText) {
      if (!req.body.letter_text || !req.body.letter_text.trim()) {
        return res.render('index', { error: 'Please enter your letter text.' });
      }
      const result = await generateLetterPdf(req.body.letter_text);
      pdfBase64 = result.buffer.toString('base64');
      pageCount = result.pageCount;
    } else {
      if (!req.file) {
        return res.render('index', { error: 'Please upload a PDF file.' });
      }
      const fileBuffer = fs.readFileSync(req.file.path);
      pdfBase64 = fileBuffer.toString('base64');
      fs.unlinkSync(req.file.path);
    }

    const returnReceipt = req.body.return_receipt === '1';

    // Stripe metadata has a 500-char limit per value.
    // For large PDFs, save to disk and reference by filename.
    const pdfId = `pdf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const pdfPath = path.join(__dirname, '..', 'uploads', `${pdfId}.b64`);
    fs.writeFileSync(pdfPath, pdfBase64);

    const metadata = {
      sender_name: req.body.sender_name,
      sender_street: req.body.sender_street,
      sender_city: req.body.sender_city,
      sender_state: req.body.sender_state.toUpperCase(),
      sender_zip: req.body.sender_zip,
      customer_email: req.body.customer_email,
      recipient_name: req.body.recipient_name,
      recipient_street: req.body.recipient_street,
      recipient_city: req.body.recipient_city,
      recipient_state: req.body.recipient_state.toUpperCase(),
      recipient_zip: req.body.recipient_zip,
      letter_type: isText ? 'text' : 'pdf',
      return_receipt: returnReceipt ? '1' : '0',
      pdf_id: pdfId,
      page_count: String(pageCount),
    };

    const session = await createCheckoutSession({ metadata, returnReceipt });
    res.redirect(303, session.url);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
