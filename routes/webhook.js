const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { constructWebhookEvent, getPriceCents } = require('../services/stripe');
const { queuePrintItem } = require('../services/certifiedMail');
const { sendCustomerEmail, sendOwnerEmail, sendFailureAlert, sendCustomerFailureEmail } = require('../services/email');
const db = require('../db/init');

const router = express.Router();

const insertOrder = db.prepare(`
  INSERT INTO orders (
    stripe_session_id, customer_email, sender_name, sender_address,
    recipient_name, recipient_address, letter_type, return_receipt,
    tracking_number, status, amount_cents, order_token, delivery_status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateOrderSuccess = db.prepare(`
  UPDATE orders SET tracking_number = ?, status = ?, scm_queue_id = ?,
  delivery_status = ?, delivery_status_updated_at = datetime('now')
  WHERE stripe_session_id = ?
`);

const updateOrderFailed = db.prepare(`
  UPDATE orders SET status = ?, delivery_status = ?,
  delivery_status_detail = ?, delivery_status_updated_at = datetime('now')
  WHERE stripe_session_id = ?
`);

const getOrderToken = db.prepare(`
  SELECT order_token FROM orders WHERE stripe_session_id = ?
`);

const findExistingOrder = db.prepare(`
  SELECT id FROM orders WHERE stripe_session_id = ?
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

  // Idempotency: if this session was already processed, acknowledge and skip
  const existingOrder = findExistingOrder.get(session.id);
  if (existingOrder) {
    return res.json({ received: true });
  }

  const m = session.metadata;
  const returnReceipt = m.return_receipt === '1';

  const expectedCents = getPriceCents(returnReceipt);
  const actualCents = session.amount_total;
  if (actualCents != null && actualCents !== expectedCents) {
    console.error(`Amount mismatch: expected ${expectedCents}, Stripe charged ${actualCents}, session ${session.id}`);
  }
  const amountCents = actualCents || expectedCents;

  const senderAddress = `${m.sender_street}, ${m.sender_city}, ${m.sender_state} ${m.sender_zip}`;
  const recipientAddress = `${m.recipient_street}, ${m.recipient_city}, ${m.recipient_state} ${m.recipient_zip}`;

  const orderToken = crypto.randomUUID();

  let orderId;
  try {
    const result = insertOrder.run(
      session.id, m.customer_email, m.sender_name, senderAddress,
      m.recipient_name, recipientAddress, m.letter_type, returnReceipt ? 1 : 0,
      null, 'pending', amountCents, orderToken, 'processing',
    );
    orderId = result.lastInsertRowid;
  } catch (dbErr) {
    console.error('DB insert error:', dbErr);
    return res.status(500).send('DB error');
  }

  let pdfBase64;
  const pdfPath = path.join(__dirname, '..', 'uploads', `${m.pdf_id}.b64`);
  try {
    pdfBase64 = fs.readFileSync(pdfPath, 'utf8');
    fs.unlinkSync(pdfPath);
  } catch (fileErr) {
    console.error('Failed to read PDF file:', fileErr);
    updateOrderFailed.run('failed', 'failed', 'PDF file not found during processing', session.id);
    await Promise.all([
      sendFailureAlert({ orderId, error: `PDF file not found: ${m.pdf_id}` }),
      sendCustomerFailureEmail({ to: m.customer_email, orderToken }),
    ]).catch(console.error);
    return res.json({ received: true });
  }

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
    updateOrderSuccess.run(trackingNumber, 'sent', String(scmResult.QueueID), 'queued', session.id);
  } catch (scmErr) {
    console.error('SCM API error:', scmErr);
    updateOrderFailed.run('failed', 'failed', scmErr.message, session.id);
    await Promise.all([
      sendFailureAlert({ orderId, error: scmErr.message }),
      sendCustomerFailureEmail({ to: m.customer_email, orderToken }),
    ]).catch(console.error);
    return res.json({ received: true });
  }

  try {
    await Promise.all([
      sendCustomerEmail({
        to: m.customer_email,
        trackingNumber,
        recipientName: m.recipient_name,
        recipientAddress,
        returnReceipt,
        orderToken,
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
