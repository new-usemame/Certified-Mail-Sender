const express = require('express');
const fs = require('fs');
const path = require('path');
const { constructWebhookEvent, getPriceCents } = require('../services/stripe');
const { queuePrintItem } = require('../services/certifiedMail');
const { sendCustomerEmail, sendOwnerEmail, sendFailureAlert } = require('../services/email');
const db = require('../db/init');

const router = express.Router();

const insertOrder = db.prepare(`
  INSERT INTO orders (
    stripe_session_id, customer_email, sender_name, sender_address,
    recipient_name, recipient_address, letter_type, return_receipt,
    tracking_number, status, amount_cents
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateOrder = db.prepare(`
  UPDATE orders SET tracking_number = ?, status = ? WHERE stripe_session_id = ?
`);

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = constructWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true });
  }

  const session = event.data.object;
  const m = session.metadata;
  const returnReceipt = m.return_receipt === '1';
  const amountCents = getPriceCents(returnReceipt);

  const senderAddress = `${m.sender_street}, ${m.sender_city}, ${m.sender_state} ${m.sender_zip}`;
  const recipientAddress = `${m.recipient_street}, ${m.recipient_city}, ${m.recipient_state} ${m.recipient_zip}`;

  // Insert order as pending
  let orderId;
  try {
    const result = insertOrder.run(
      session.id, m.customer_email, m.sender_name, senderAddress,
      m.recipient_name, recipientAddress, m.letter_type, returnReceipt ? 1 : 0,
      null, 'pending', amountCents,
    );
    orderId = result.lastInsertRowid;
  } catch (dbErr) {
    console.error('DB insert error:', dbErr);
    return res.status(500).send('DB error');
  }

  // Read the stored PDF
  let pdfBase64;
  const pdfPath = path.join(__dirname, '..', 'uploads', `${m.pdf_id}.b64`);
  try {
    pdfBase64 = fs.readFileSync(pdfPath, 'utf8');
    fs.unlinkSync(pdfPath);
  } catch (fileErr) {
    console.error('Failed to read PDF file:', fileErr);
    updateOrder.run(null, 'failed', session.id);
    await sendFailureAlert({ orderId, error: `PDF file not found: ${m.pdf_id}` }).catch(console.error);
    return res.json({ received: true });
  }

  // Send to SimpleCertifiedMail
  let trackingNumber = null;
  try {
    const scmResult = await queuePrintItem({
      senderName: m.sender_name,
      senderStreet: m.sender_street,
      senderCity: m.sender_city,
      senderState: m.sender_state,
      senderZip: m.sender_zip,
      senderEmail: m.customer_email,
      recipientName: m.recipient_name,
      recipientStreet: m.recipient_street,
      recipientCity: m.recipient_city,
      recipientState: m.recipient_state,
      recipientZip: m.recipient_zip,
      pdfBase64,
      pageCount: parseInt(m.page_count, 10) || 1,
      returnReceipt,
      reference: `order-${orderId}`,
    });

    trackingNumber = scmResult.PIC || `Q${scmResult.QueueID}`;
    updateOrder.run(trackingNumber, 'sent', session.id);
  } catch (scmErr) {
    console.error('SCM API error:', scmErr);
    updateOrder.run(null, 'failed', session.id);
    await sendFailureAlert({ orderId, error: scmErr.message }).catch(console.error);
    return res.json({ received: true });
  }

  // Send notification emails
  try {
    await Promise.all([
      sendCustomerEmail({
        to: m.customer_email,
        trackingNumber,
        recipientName: m.recipient_name,
        recipientAddress,
        returnReceipt,
      }),
      sendOwnerEmail({
        customerEmail: m.customer_email,
        trackingNumber,
        senderName: m.sender_name,
        recipientName: m.recipient_name,
        recipientAddress,
        amountCents,
        orderId,
        returnReceipt,
      }),
    ]);
  } catch (emailErr) {
    console.error('Email send error:', emailErr);
  }

  res.json({ received: true });
});

module.exports = router;
